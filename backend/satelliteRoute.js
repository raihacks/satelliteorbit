const express = require("express");
const axios = require("axios");
const satellite = require("satellite.js");
const { db, getDatabaseErrorResponse } = require("./db");

const router = express.Router();
const EARTH_RADIUS_KM = 6371;
const TLE_SOURCE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
const TLE_CACHE_TTL_MS = 60 * 1000;

let tleCache = {
  expiresAt: 0,
  byNorad: new Map()
};

function deg(rad) {
  return (rad * 180) / Math.PI;
}

function parseNorad(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isDbUnavailable(error) {
  const transientCodes = new Set(["ENETUNREACH", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH"]);
  return (
    transientCodes.has(error?.code) ||
    (typeof error?.message === "string" && error.message.startsWith("Database is not configured."))
  );
}

async function getTleByNorad(noradId) {
  const [rows] = await db.query(
    "SELECT tle_line1, tle_line2 FROM tle_data WHERE norad_id = ? LIMIT 1",
    [noradId]
  );

  return rows?.[0] ?? null;
}

function parseTleCatalog(text) {
  const lines = text.split("\n");
  const byNorad = new Map();

  for (let i = 0; i < lines.length; i += 3) {
    const name = lines[i]?.trim();
    const line1 = lines[i + 1]?.trim();
    const line2 = lines[i + 2]?.trim();

    if (!name || !line1 || !line2 || !line1.startsWith("1 ") || !line2.startsWith("2 ")) {
      continue;
    }

    const noradId = parseNorad(line1.substring(2, 7));

    if (!noradId) {
      continue;
    }

    byNorad.set(noradId, { name, tle_line1: line1, tle_line2: line2 });
  }

  return byNorad;
}

async function getCachedTleCatalog() {
  if (Date.now() < tleCache.expiresAt && tleCache.byNorad.size > 0) {
    return tleCache.byNorad;
  }

  const response = await axios.get(TLE_SOURCE_URL, {
    timeout: 20000,
    headers: {
      "User-Agent": "SatelliteOrbit/1.0 (+https://github.com)",
      Accept: "text/plain"
    }
  });
  tleCache = {
    expiresAt: Date.now() + TLE_CACHE_TTL_MS,
    byNorad: parseTleCatalog(response.data)
  };

  return tleCache.byNorad;
}

function computeGeoPoint(satrec, time) {
  const positionAndVelocity = satellite.propagate(satrec, time);

  if (!positionAndVelocity || !positionAndVelocity.position) {
    return null;
  }

  const gmst = satellite.gstime(time);
  const geo = satellite.eciToGeodetic(positionAndVelocity.position, gmst);

  return {
    latitude: deg(geo.latitude),
    longitude: deg(geo.longitude),
    altitude_km: geo.height
  };
}

function createPointPayload(row, now) {
  const satrec = satellite.twoline2satrec(row.tle_line1, row.tle_line2);
  const point = computeGeoPoint(satrec, now);

  if (!point) {
    return null;
  }

  return {
    name: row.name,
    noradId: row.norad_id,
    timestamp: now.toISOString(),
    ...point
  };
}

async function getSatellitesFromExternalCatalog() {
  const byNorad = await getCachedTleCatalog();
  const now = new Date();
  const satellites = [];

  for (const [noradId, tle] of byNorad.entries()) {
    const payload = createPointPayload(
      { name: tle.name, norad_id: noradId, tle_line1: tle.tle_line1, tle_line2: tle.tle_line2 },
      now
    );

    if (payload) {
      satellites.push(payload);
    }
  }

  return satellites;
}

router.post("/", async (req, res) => {
  const { name, norad_id, orbit_type, inclination, period } = req.body;

  try {
    const [result] = await db.query(
      `
      INSERT INTO satellites (name, norad_id, orbit_type, inclination, period)
      VALUES (?, ?, ?, ?, ?)
    `,
      [name, norad_id, orbit_type, inclination, period]
    );

    res.json({ message: "Satellite added", id: result.insertId });
  } catch (err) {
    console.error(err);
    const { status, body } = getDatabaseErrorResponse(err);
    res.status(status).json(body);
  }
});

router.get("/", async (_req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT s.name, s.norad_id, t.tle_line1, t.tle_line2
      FROM satellites s
      INNER JOIN tle_data t ON s.norad_id = t.norad_id
      ORDER BY s.norad_id ASC
    `
    );

    const now = new Date();
    const satellites = rows
      .map((row) => createPointPayload(row, now))
      .filter(Boolean);

    res.json(satellites);
  } catch (error) {
    if (!isDbUnavailable(error)) {
      console.error("Satellite list lookup failed:", error.message);
      const { status, body } = getDatabaseErrorResponse(error);
      return res.status(status).json(body);
    }

    try {
      const fallbackSatellites = await getSatellitesFromExternalCatalog();
      return res.json(fallbackSatellites);
    } catch (fallbackError) {
      console.error("Satellite list fallback failed:", fallbackError.message);
      return res.json([]);
    }
  }
});

router.get("/:norad", async (req, res) => {
  const noradId = parseNorad(req.params.norad);

  if (!noradId) {
    return res.status(400).json({ error: "Invalid NORAD ID" });
  }

  try {
    const tle = await getTleByNorad(noradId);

    if (!tle) {
      return res.status(404).json({ error: "Satellite not found" });
    }

    const satrec = satellite.twoline2satrec(tle.tle_line1, tle.tle_line2);
    const now = new Date();
    const point = computeGeoPoint(satrec, now);

    if (!point) {
      return res.status(500).json({ error: "Unable to compute satellite position" });
    }

    res.json({
      noradId,
      timestamp: now.toISOString(),
      ...point
    });
  } catch (error) {
    if (!isDbUnavailable(error)) {
      console.error("Satellite lookup failed:", error.message);
      const { status, body } = getDatabaseErrorResponse(error);
      return res.status(status).json(body);
    }

    try {
      const catalog = await getCachedTleCatalog();
      const tle = catalog.get(noradId);

      if (!tle) {
        return res.status(404).json({ error: "Satellite not found" });
      }

      const satrec = satellite.twoline2satrec(tle.tle_line1, tle.tle_line2);
      const now = new Date();
      const point = computeGeoPoint(satrec, now);

      if (!point) {
        return res.status(500).json({ error: "Unable to compute satellite position" });
      }

      return res.json({
        name: tle.name,
        noradId,
        timestamp: now.toISOString(),
        ...point
      });
    } catch (fallbackError) {
      console.error("Satellite lookup fallback failed:", fallbackError.message);
      return res.status(503).json({ error: "Satellite data unavailable" });
    }
  }
});

router.get("/:norad/orbit", async (req, res) => {
  const noradId = parseNorad(req.params.norad);

  const samples = Math.min(Math.max(Number.parseInt(req.query.samples, 10) || 90, 10), 720);
  const stepMinutes = Math.min(Math.max(Number.parseInt(req.query.stepMinutes, 10) || 1, 1), 30);

  if (!noradId) {
    return res.status(400).json({ error: "Invalid NORAD ID" });
  }

  try {
    const tle = await getTleByNorad(noradId);

    if (!tle) {
      return res.status(404).json({ error: "Satellite not found" });
    }

    const satrec = satellite.twoline2satrec(tle.tle_line1, tle.tle_line2);
    const start = Date.now();

    const points = [];

    for (let i = 0; i < samples; i++) {
      const time = new Date(start + i * stepMinutes * 60 * 1000);
      const point = computeGeoPoint(satrec, time);

      if (!point) continue;

      points.push({
        timestamp: time.toISOString(),
        ...point,
        altitude_ratio: point.altitude_km / EARTH_RADIUS_KM
      });
    }

    res.json({
      noradId,
      samples: points.length,
      stepMinutes,
      points
    });
  } catch (error) {
    if (!isDbUnavailable(error)) {
      console.error("Orbit lookup failed:", error.message);
      const { status, body } = getDatabaseErrorResponse(error);
      return res.status(status).json(body);
    }

    try {
      const catalog = await getCachedTleCatalog();
      const tle = catalog.get(noradId);

      if (!tle) {
        return res.status(404).json({ error: "Satellite not found" });
      }

      const satrec = satellite.twoline2satrec(tle.tle_line1, tle.tle_line2);
      const start = Date.now();
      const points = [];

      for (let i = 0; i < samples; i++) {
        const time = new Date(start + i * stepMinutes * 60 * 1000);
        const point = computeGeoPoint(satrec, time);

        if (!point) continue;

        points.push({
          timestamp: time.toISOString(),
          ...point,
          altitude_ratio: point.altitude_km / EARTH_RADIUS_KM
        });
      }

      return res.json({
        noradId,
        samples: points.length,
        stepMinutes,
        points
      });
    } catch (fallbackError) {
      console.error("Orbit fallback failed:", fallbackError.message);
      return res.status(503).json({ error: "Satellite data unavailable" });
    }
  }
});

module.exports = router;
