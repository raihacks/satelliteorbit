const viewer = document.getElementById("viewer");
const noradInput = document.getElementById("norad");
const trackBtn = document.getElementById("track-btn");
const satListEl = document.getElementById("sat-list");

const statusEl = document.getElementById("status");
const selectedNoradEl = document.getElementById("selected-norad");
const latEl = document.getElementById("latitude");
const lonEl = document.getElementById("longitude");
const altEl = document.getElementById("altitude");

const EARTH_RADIUS = 4;
const API_BASE = "https://satelliteorbit-production.up.railway.app/api/satellite";

const satellites = [];
let selectedSatellite = null;

const scene = new THREE.Scene();
const earthSystem = new THREE.Group();
scene.add(earthSystem);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 1.3, 11);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
viewer.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 6;
controls.maxDistance = 32;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const textureLoader = new THREE.TextureLoader();
const earthTexture = textureLoader.load("https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg");
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 64, 64),
  new THREE.MeshPhongMaterial({ map: earthTexture, shininess: 8 })
);
earthSystem.add(earth);

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

function latLonToVector3(lat, lon, altitudeKm = 0) {
  const radius = EARTH_RADIUS + (altitudeKm / 6371) * EARTH_RADIUS;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180); // Adjusted for standard texture wrapping

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

async function fetchSatellitePosition(norad) {
  const res = await fetch(`${API_BASE}/${norad}`);
  if (!res.ok) {
    throw new Error(`Satellite ${norad} not found`);
  }
  return res.json();
}

function renderSatellitePills() {
  satListEl.innerHTML = "";

  satellites.forEach((sat) => {
    const pill = document.createElement("button");
    pill.className = `sat-pill${selectedSatellite === sat ? " active" : ""}`;
    pill.textContent = sat.norad;
    pill.addEventListener("click", () => selectSatellite(sat));
    sat.pillEl = pill;
    satListEl.appendChild(pill);
  });
}

function selectSatellite(sat) {
  selectedSatellite = sat;
  renderSatellitePills();
  updateTelemetry();

  if (sat.latestData) {
    setStatus(`Tracking NORAD ${sat.norad}`);
  }
}

function updateTelemetry() {
  if (!selectedSatellite || !selectedSatellite.latestData) {
    selectedNoradEl.textContent = "—";
    latEl.textContent = "—";
    lonEl.textContent = "—";
    altEl.textContent = "—";
    return;
  }

  const data = selectedSatellite.latestData;
  selectedNoradEl.textContent = `${selectedSatellite.norad}`;
  latEl.textContent = `${Number(data.latitude).toFixed(2)}°`;
  lonEl.textContent = `${Number(data.longitude).toFixed(2)}°`;
  altEl.textContent = `${Number(data.altitude_km).toFixed(2)} km`;
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
function buildPredictedOrbit(sat) {
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

function drawPredictedOrbit(sat) {
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

async function fetchTLE(norad) {

  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${norad}&FORMAT=TLE`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Failed to fetch TLE");
  }

  const text = await res.text();

  const lines = text.trim().split("\n");

  if (lines.length < 3) {
    throw new Error("No TLE found for NORAD " + norad);
  }

  const tle = {
    name: lines[0].trim(),
    tle1: lines[1].trim(),
    tle2: lines[2].trim()
  };

  console.log("Loaded TLE:", tle);

  return tle;
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#ff9e9e" : "#d0dcf6";
}

setInterval(() => {
  satellites.forEach((sat) => {
    updateSatellite(sat).catch((error) => {
      if (selectedSatellite === sat) {
        setStatus(`Update failed for ${sat.norad}: ${error.message}`, true);
      }
    });
  });
}, 1000);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener("click", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const hit = raycaster.intersectObjects(satellites.map((sat) => sat.marker));
  if (hit.length > 0) {
    const sat = satellites.find((item) => item.marker === hit[0].object);
    if (sat) {
      selectSatellite(sat);
    }
  }
});

function animate() {
  satellites.forEach((sat) => {
    sat.marker.position.lerp(sat.targetPosition, 0.15);
  });

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

trackBtn.addEventListener("click", () => {
  const ids = noradInput.value.split(",").map((item) => item.trim()).filter(Boolean);
  ids.forEach((id) => addSatellite(id));
});

noradInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    trackBtn.click();
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const params = new URLSearchParams(window.location.search);
const prefillNorad = params.get("norad-id") || params.get("norad");
if (prefillNorad) {
  noradInput.value = prefillNorad;
  addSatellite(prefillNorad);
}