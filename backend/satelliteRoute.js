const express = require("express");
const satellite = require("satellite.js");
const { db } = require("./db");

const router = express.Router();
const EARTH_RADIUS_KM = 6371;

function deg(rad) {
  return rad * 180 / Math.PI;
}

function parseNorad(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getTleByNorad(noradId) {
  return new Promise((resolve, reject) => {
    db.query(
      "SELECT tle_line1, tle_line2 FROM tle_data WHERE norad_id = ? LIMIT 1",
      [noradId],
      (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows?.[0] ?? null);
      }
    );
  });
}

function computeGeoPoint(satrec, time) {
  const positionAndVelocity = satellite.propagate(satrec, time);
  if (!positionAndVelocity.position) {
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

    return res.json({
      noradId,
      timestamp: now.toISOString(),
      ...point
    });
  } catch (error) {
    console.error("Satellite lookup failed:", error.message);
    return res.status(500).json({ error: "Database error" });
  }
});

// Orbit track points for chart/path drawing (default: next 90 minutes)
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
    for (let i = 0; i < samples; i += 1) {
      const time = new Date(start + i * stepMinutes * 60 * 1000);
      const point = computeGeoPoint(satrec, time);
      if (!point) {
        continue;
      }
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
  } catch (error) {
    console.error("Orbit lookup failed:", error.message);
    return res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;
