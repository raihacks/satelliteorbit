function createSatelliteMarker(color = 0x7df4ff) {

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 14, 14),
    new THREE.MeshBasicMaterial({ color })
  );

  marker.visible = false;
  const altitudeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
const altitudeGeometry = new THREE.BufferGeometry();

const altitudeLine = new THREE.Line(altitudeGeometry, altitudeMaterial);
earthSystem.add(altitudeLine);
  earthSystem.add(marker);

return {
  marker,
  targetPosition: new THREE.Vector3(),
  orbitLine: null,
  groundLine: null,
  groundPoints: [],
  altitudeLine,
  norad: null,
  latestData: null,
  satrec: null,
  pillEl: null
};
}

async function addSatellite(norad) {

  const cleaned = `${norad}`.trim();
  if (!cleaned) return;

  const existing = satellites.find((sat) => sat.norad === cleaned);
  if (existing) {
    selectSatellite(existing);
    setStatus(`NORAD ${cleaned} is already in view.`);
    return;
  }

  const sat = createSatelliteMarker();
  sat.norad = cleaned;
  satellites.push(sat);

  // ✅ CREATE GROUND TRACK LINE HERE
  const geom = new THREE.BufferGeometry();
  const mat = new THREE.LineBasicMaterial({ color: 0x66dbff });

  sat.groundLine = new THREE.Line(geom, mat);
  earthSystem.add(sat.groundLine);

  // fetch TLE once when satellite is added
  try {

    const tle = await fetchTLE(cleaned);

    sat.satrec = satellite.twoline2satrec(
      tle.tle1,
      tle.tle2
    );

    drawPredictedOrbit(sat);

  } catch (err) {
    console.warn("TLE fetch failed", err);
  }

  if (!sat.satrec) {
    setStatus("Could not load TLE for " + cleaned, true);
    return;
  }

  try {

    await updateSatellite(sat);
    selectSatellite(sat);
    renderSatellitePills();

  } catch (error) {

    const satIndex = satellites.indexOf(sat);
    if (satIndex >= 0) {
      satellites.splice(satIndex, 1);
    }

    earthSystem.remove(sat.marker);
    setStatus(error.message, true);
  }
}