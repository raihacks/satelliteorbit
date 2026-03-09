const express = require("express");
const cors = require("cors");
const path = require("path");

const satelliteRoute = require("./satelliteRoute");
const { checkConnection, initializeDatabase } = require("./db");

/* CREATE APP FIRST */
const app = express();

const PORT = process.env.PORT || 8080;

/* MIDDLEWARE */
app.use(cors());
app.use(express.json());

/* STATIC FRONTEND */
app.use(express.static(path.join(__dirname, "..", "frontend")));

/* ROUTES */
app.get("/", (req, res) => {
  res.send("Satellite Tracker API running 🚀");
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/* SATELLITE API */
app.use("/api/satellites", satelliteRoute);

/* SPA fallback */
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

/* START SERVER */
async function bootstrap() {
  try {
    await checkConnection();
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`Backend running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

bootstrap();
