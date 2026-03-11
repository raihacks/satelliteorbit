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

const stars = new THREE.Mesh(
  new THREE.SphereGeometry(200, 64, 64),
  new THREE.MeshBasicMaterial({
    map: textureLoader.load("https://threejs.org/examples/textures/galaxy_starfield.png"),
    side: THREE.BackSide
  })
);
scene.add(stars);

function createSatelliteMarker(color = 0x7df4ff) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 14, 14),
    new THREE.MeshBasicMaterial({ color })
  );
  marker.visible = false;
  earthSystem.add(marker);

  return {
    marker,
    targetPosition: new THREE.Vector3(),
    groundTrack: [],
    norad: null,
    latestData: null,
    groundLine: null,
    pillEl: null
  };
}

function latLonToVector3(lat, lon, altitudeKm = 0) {
  const radius = EARTH_RADIUS + (altitudeKm / 6371) * EARTH_RADIUS;
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
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

async function updateSatellite(sat) {
  const data = await fetchSatellitePosition(sat.norad);
  sat.latestData = data;

  const pos = latLonToVector3(data.latitude, data.longitude, data.altitude_km);
  sat.targetPosition.copy(pos);
  sat.marker.visible = true;

  const surfacePoint = latLonToVector3(data.latitude, data.longitude, 0);
  sat.groundTrack.push(surfacePoint);
  if (sat.groundTrack.length > 420) sat.groundTrack.shift();

  if (sat.groundLine) earthSystem.remove(sat.groundLine);
  const geometry = new THREE.BufferGeometry().setFromPoints(sat.groundTrack);
  const material = new THREE.LineBasicMaterial({ color: 0x66dbff });
  sat.groundLine = new THREE.Line(geometry, material);
  earthSystem.add(sat.groundLine);

  if (selectedSatellite === sat) {
    updateTelemetry();
  }
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
}, 3000);

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
    sat.marker.position.lerp(sat.targetPosition, 0.18);
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