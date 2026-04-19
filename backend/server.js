const express = require("express");
const cors = require("cors");
const satelliteRoute = require("./satelliteRoute");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "satellite-backend" });
});

app.use("/api/satellite", satelliteRoute);

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

module.exports = app;