const express = require("express");
const cors = require("cors");
const path = require("path");

const satelliteRoute = require("./satelliteRoute");
const { checkConnection, initializeDatabase } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());



app.get("/", (req, res) => {
  res.send("Satellite Tracker API running 🚀");
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "satellite-backend" });
});

app.use("/api/satellite", satelliteRoute);

async function bootstrap() {
  try {
    await checkConnection();
    await initializeDatabase();
  } catch (error) {
    console.error("Failed to initialize:", error.message);
  }
}

bootstrap();

if (require.main === module) {
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

module.exports = app;