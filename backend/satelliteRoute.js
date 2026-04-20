const express = require("express");
const axios = require("axios");
const satellite = require("satellite.js");
const { Redis } = require("@upstash/redis"); //

const router = express.Router();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

const EARTH_RADIUS_KM = 6371;
const TLE_CACHE_TTL_SECONDS = 3600; 

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
  const cacheKey = `tle:${noradId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
  } catch (err) {
    console.warn("KV Get Error:", err.message);
  }

  // Fallback to Celestrak
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=tle`;
  const response = await axios.get(url, { timeout: 10000 });
  const lines = response.data.trim().split("\n");
  if (lines.length < 3) return null;

  const result = { tle_line1: lines[1].trim(), tle_line2: lines[2].trim() };

  try {
    await redis.set(cacheKey, result, { ex: TLE_CACHE_TTL_SECONDS });
  } catch (err) {
    console.warn("KV Set Error:", err.message);
  }

  return result;
}

function parseTleCatalog(text) {
  const lines = text.split("\n");
  const byNorad = new Map();

  for (let i = 0; i < lines.length; i += 3) {
    const name = lines[i]?.trim();
    const line1 = lines[i + 1]?.trim();
    const line2 = lines[i + 2]?.trim();

    if (!name || !line1 || !line2 || !line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;

    const noradId = parseNorad(line1.substring(2, 7));
    if (!noradId) continue;

    byNorad.set(noradId, { name, tle_line1: line1, tle_line2: line2 });
  }

  return byNorad;
}

async function fetchGroupFromCelestrak(group) {
  const cacheKey = `catalog:${group}`;

  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return new Map(Object.entries(cachedData));
    }
  } catch (err) {
    console.warn("KV Catalog Get Error:", err.message);
  }

  const sources = [
    `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`,
    `https://celestrak.com/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`,
  ];

  let lastError = null;
  for (const url of sources) {
    try {
      const response = await axios.get(url, {
        timeout: 20000,
        headers: { "User-Agent": "SatelliteTracker/1.0", Accept: "text/plain" }
      });
      const byNorad = parseTleCatalog(response.data);
      
      if (byNorad.size > 0) {
        try {
          const plainObj = Object.fromEntries(byNorad);
          await redis.set(cacheKey, plainObj, { ex: TLE_CACHE_TTL_SECONDS });
        } catch (err) {
          console.warn("KV Catalog Set Error:", err.message);
        }
        return byNorad;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`All sources failed for group: ${group}`);
}

function computeGeoPoint(satrec, time) {
  const positionAndVelocity = satellite.propagate(satrec, time);
  if (!positionAndVelocity || !positionAndVelocity.position) return null;

  const gmst = satellite.gstime(time);
  const geo = satellite.eciToGeodetic(positionAndVelocity.position, gmst);

  return {
    latitude: deg(geo.latitude),
    longitude: deg(geo.longitude),
    altitude_km: geo.height
  };
}

function createPointPayload(row, now) {
  const satrec = satellite.twoline2satrec(row.tle_line1 || row.tle1, row.tle_line2 || row.tle2);
  const point = computeGeoPoint(satrec, now);
  if (!point) return null;

  return {
    name: row.name,
    noradId: row.norad_id || row.noradId,
    timestamp: now.toISOString(),
    ...point
  };
}

router.get("/catalog/:group", async (req, res) => {
  const group = String(req.params.group || "active").trim().toLowerCase();
  try {
    const byNorad = await fetchGroupFromCelestrak(group);
    const result = Array.from(byNorad.entries()).map(([noradId, tle]) => ({
      norad: String(noradId),
      name: tle.name,
      tle1: tle.tle_line1,
      tle2: tle.tle_line2
    }));
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch catalog" });
  }
});

router.get("/:norad", async (req, res) => {
  const noradId = parseNorad(req.params.norad);
  if (!noradId) return res.status(400).json({ error: "Invalid NORAD ID" });

  try {
    // 1. Try cache/DB first
    let tle = await getTleByNorad(noradId).catch(() => null);

    // 2. Fallback to Celestrak if not found
    if (!tle || !tle.tle_line1 || !tle.tle_line2) {
      const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=tle`;
      const response = await axios.get(url, { timeout: 10000 });
      const lines = response.data.trim().split("\n");
      if (lines.length < 3) return res.status(404).json({ error: "Satellite not found" });
      tle = { tle_line1: lines[1].trim(), tle_line2: lines[2].trim() };
    }

    const satrec = satellite.twoline2satrec(tle.tle_line1, tle.tle_line2);
    const now = new Date();
    const point = computeGeoPoint(satrec, now);

    res.json({ noradId, tle_line1: tle.tle_line1, tle_line2: tle.tle_line2, timestamp: now.toISOString(), ...point });
  } catch (error) {
    console.error("Track error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/", async (_req, res) => {
  try {
    const byNorad = await fetchGroupFromCelestrak("active");
    const now = new Date();
    const result = Array.from(byNorad.entries()).map(([id, tle]) =>
      createPointPayload({ name: tle.name, norad_id: id, ...tle }, now)
    ).filter(Boolean);
    res.json(result);
  } catch (err) {
    res.json([]);
  }
});

module.exports = router;
