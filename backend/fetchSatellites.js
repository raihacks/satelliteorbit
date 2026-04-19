const axios = require("axios");
const { db, initializeDatabase } = require("./db");

async function loadSatellites() {
  try {
    await initializeDatabase();

    const response = await axios.get(
      "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
      { timeout: 20000 }
    );

    const lines = response.data.split("\n");

    const satellites = [];
    const tleData = [];

    for (let i = 0; i < lines.length; i += 3) {
      const name = lines[i]?.trim();
      const line1 = lines[i + 1]?.trim();
      const line2 = lines[i + 2]?.trim();

      if (!name || !line1 || !line2) continue;

      const norad_id = parseInt(line1.substring(2, 7).trim(), 10);
      const inclination = parseFloat(line2.substring(8, 16));

      if (!Number.isInteger(norad_id)) continue;

      satellites.push([
        name,
        norad_id,
        Number.isFinite(inclination) ? inclination : null,
      ]);

      tleData.push([norad_id, line1, line2]);
    }

    await db.query(
      `
      INSERT INTO satellites (name, norad_id, inclination)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        inclination = VALUES(inclination)
      `,
      [satellites]
    );

    await db.query(
      `
      INSERT INTO tle_data (norad_id, tle_line1, tle_line2)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        tle_line1 = VALUES(tle_line1),
        tle_line2 = VALUES(tle_line2)
      `,
      [tleData]
    );

    console.log(`Loaded ${satellites.length} satellites 🚀`);
  } catch (error) {
    console.error("Error loading satellites:", error.message || error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

loadSatellites();