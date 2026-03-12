async function updateSatellite(sat) {

  if (!sat.satrec) return;

  const now = new Date();

  const posVel = satellite.propagate(sat.satrec, now);
  if (!posVel.position) return;

  const gmst = satellite.gstime(now);

  const scale = EARTH_RADIUS / 6371;

  const x = posVel.position.x * scale;
  const y = posVel.position.y * scale;
  const z = posVel.position.z * scale;

  sat.targetPosition.set(x, y, z);
  sat.marker.visible = true;

  // --- Convert to lat/lon
// Inside updateSatellite(sat)
const geo = satellite.eciToGeodetic(posVel.position, gmst);
const lat = satellite.degreesLat(geo.latitude);
const lon = satellite.degreesLong(geo.longitude);
const alt = geo.height;

// 1. Position the marker using Lat/Lon/Alt (This keeps it in the Earth-Fixed frame)
const satVector = latLonToVector3(lat, lon, alt);
sat.targetPosition.copy(satVector); 

// 3. Update Altitude Line - Now they will align perfectly
sat.altitudeLine.geometry.setFromPoints([groundPoint, satVector]);

sat.latestData = {
  latitude: lat,
  longitude: lon,
  altitude_km: alt
};

// --- Ground point
const groundPoint = latLonToVector3(lat, lon, 0);

// altitude line (ground → satellite)
sat.altitudeLine.geometry.setFromPoints([
  groundPoint,
  sat.targetPosition.clone()
]);

// --- Ground track trail
sat.groundPoints.push(groundPoint);

if (sat.groundPoints.length > 300) {
  sat.groundPoints.shift();
}

const cleanPoints = sat.groundPoints.filter(p => p !== null);

if (cleanPoints.length > 1) {
  sat.groundLine.geometry.setFromPoints(cleanPoints);
}
}