const express = require("express");
const satellite = require("satellite.js");
const { db } = require("./db");

const router = express.Router();
const EARTH_RADIUS_KM = 6371;

function deg(rad) {
  return (rad * 180) / Math.PI;
}

function parseNorad(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function getTleByNorad(noradId) {
  const [rows] = await db.query(
    "SELECT tle_line1, tle_line2 FROM tle_data WHERE norad_id = ? LIMIT 1",
    [noradId]
  );

  return rows?.[0] ?? null;
}

function computeGeoPoint(satrec, time) {
  const positionAndVelocity = satellite.propagate(satrec, time);

  if (!positionAndVelocity.position) return null;

  const gmst = satellite.gstime(time);
  const geo = satellite.eciToGeodetic(positionAndVelocity.position, gmst);

  return {
    latitude: deg(geo.latitude),
    longitude: deg(geo.longitude),
    altitude_km: geo.height
  };
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
    res.status(500).json({ error: "Database error" });
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
    console.error("Satellite lookup failed:", error.message);
    res.status(500).json({ error: "Database error" });
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
    console.error("Orbit lookup failed:", error.message);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;