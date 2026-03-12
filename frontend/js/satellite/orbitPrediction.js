export function buildPredictedOrbit(sat) {
    if (!sat.satrec) return null;

  const orbitPoints = [];
  const groundPoints = [];
  const now = new Date();
  const minutesAhead = 100; // Roughly one full orbit
  const stepSeconds = 30;

  for (let t = 0; t <= minutesAhead * 60; t += stepSeconds) {
    const time = new Date(now.getTime() + t * 1000);
    const pv = satellite.propagate(sat.satrec, time);
    
    if (!pv.position) continue;

    const gmst = satellite.gstime(time);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    const lat = satellite.degreesLat(geo.latitude);
    const lon = satellite.degreesLong(geo.longitude);
    const alt = geo.height;

    // Convert to 3D vectors in the Earth-Fixed frame
    const oPoint = latLonToVector3(lat, lon, alt);
    const gPoint = latLonToVector3(lat, lon, 0);

    // To prevent lines jumping across the screen at the International Date Line
    if (orbitPoints.length > 0) {
      const prev = orbitPoints[orbitPoints.length - 1];
      if (oPoint.distanceTo(prev) > EARTH_RADIUS * 1.5) {
        // We skip this segment to create a "gap" at the wrap-around point
        continue; 
      }
    }

    orbitPoints.push(oPoint);
    groundPoints.push(gPoint);
  }

  return { orbitPoints, groundPoints };
}

export function drawPredictedOrbit(sat) {
   const result = buildPredictedOrbit(sat);
  if (!result || !result.orbitPoints.length) return;

  // 1. Remove old objects to prevent ghost lines
  if (sat.orbitLine) earthSystem.remove(sat.orbitLine);
  if (sat.groundLine) earthSystem.remove(sat.groundLine);

  // 2. Helper to format points for LineSegments (Pairs: 0-1, 1-2, 2-3...)
  const formatSegments = (points) => {
    const segmentPairs = [];
    for (let i = 0; i < points.length - 1; i++) {
      segmentPairs.push(points[i], points[i + 1]);
    }
    return segmentPairs;
  };

  // 3. Create Orbit Line (The higher orange one)
  const orbitGeom = new THREE.BufferGeometry().setFromPoints(formatSegments(result.orbitPoints));
  const orbitMat = new THREE.LineBasicMaterial({ color: 0xffb86a });
  sat.orbitLine = new THREE.LineSegments(orbitGeom, orbitMat);

  // 4. Create Ground Line (The blue one on the surface)
  const groundGeom = new THREE.BufferGeometry().setFromPoints(formatSegments(result.groundPoints));
  const groundMat = new THREE.LineBasicMaterial({ color: 0x66dbff });
  sat.groundLine = new THREE.LineSegments(groundGeom, groundMat);

  // 5. Add them back to the system
  earthSystem.add(sat.orbitLine);
  earthSystem.add(sat.groundLine);
}