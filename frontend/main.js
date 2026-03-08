const viewer = document.getElementById("viewer");
const noradInput = document.getElementById("norad");
const trackBtn = document.getElementById("track-btn");

const statusEl = document.getElementById("status");
const latEl = document.getElementById("latitude");
const lonEl = document.getElementById("longitude");
const altEl = document.getElementById("altitude");

const EARTH_RADIUS = 4;

/* Railway backend API */
const API_BASE =
  "https://satelliteorbit-production.up.railway.app/api/satellite";

/* Scene */

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1200
);

camera.position.set(0, 0, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

viewer.appendChild(renderer.domElement);

/* Lighting */

const ambient = new THREE.AmbientLight(0x88a8ff, 0.55);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(7, 4, 8);

scene.add(ambient);
scene.add(sun);

/* Earth */

const earthTexture = new THREE.TextureLoader().load(
  "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg"
);

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 64, 64),
  new THREE.MeshStandardMaterial({ map: earthTexture })
);

scene.add(earth);

/* Stars */

const starPositions = [];

for (let i = 0; i < 2600; i++) {
  starPositions.push(THREE.MathUtils.randFloatSpread(800));
  starPositions.push(THREE.MathUtils.randFloatSpread(800));
  starPositions.push(THREE.MathUtils.randFloatSpread(800));
}

const starsGeometry = new THREE.BufferGeometry();

starsGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(starPositions, 3)
);

const stars = new THREE.Points(
  starsGeometry,
  new THREE.PointsMaterial({
    color: 0x8ab4ff,
    size: 0.9
  })
);

scene.add(stars);

/* Satellite marker */

const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.12, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xff4d6d })
);

marker.visible = false;

scene.add(marker);

/* Halo */

const halo = new THREE.Mesh(
  new THREE.RingGeometry(0.2, 0.28, 36),
  new THREE.MeshBasicMaterial({
    color: 0x9ddbff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  })
);

halo.visible = false;

scene.add(halo);

/* Convert lat/lon to 3D */

function latLonToVector3(lat, lon, altitudeKm = 0) {
  const altitudeScale = Math.max(altitudeKm / 6371, 0);

  const radius = EARTH_RADIUS * (1 + altitudeScale * 0.15);

  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/* Mouse rotation */

let dragging = false;
let previous = { x: 0, y: 0 };

window.addEventListener("mousedown", e => {
  dragging = true;
  previous = { x: e.clientX, y: e.clientY };
});

window.addEventListener("mouseup", () => {
  dragging = false;
});

window.addEventListener("mousemove", e => {
  if (!dragging) return;

  const dx = e.clientX - previous.x;
  const dy = e.clientY - previous.y;

  earth.rotation.y += dx * 0.005;
  earth.rotation.x += dy * 0.003;

  marker.rotation.copy(earth.rotation);
  halo.rotation.copy(earth.rotation);

  previous = { x: e.clientX, y: e.clientY };
});

/* Zoom */

window.addEventListener("wheel", e => {
  camera.position.z = THREE.MathUtils.clamp(
    camera.position.z + e.deltaY * 0.008,
    6.5,
    24
  );
});

/* Resize */

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* UI helpers */

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ff8d93" : "#d0dcf6";
}

function updateTelemetry(lat, lon, alt) {
  latEl.textContent = `${lat.toFixed(2)}°`;
  lonEl.textContent = `${lon.toFixed(2)}°`;
  altEl.textContent = `${alt.toFixed(1)} km`;
}

/* API call */

async function fetchSatellitePosition(norad) {
  const res = await fetch(`${API_BASE}/${norad}`);

  if (!res.ok) {
    throw new Error("Satellite not found");
  }

  return res.json();
}

/* Render satellite */

async function renderSatellitePosition(norad) {
  const data = await fetchSatellitePosition(norad);

  updateTelemetry(data.latitude, data.longitude, data.altitude_km);

  const pos = latLonToVector3(
    data.latitude,
    data.longitude,
    data.altitude_km
  );

  marker.position.copy(pos);
  halo.position.copy(pos);

  halo.lookAt(new THREE.Vector3(0, 0, 0));

  marker.visible = true;
  halo.visible = true;
}

/* Tracking */

let trackingInterval = null;

async function trackSatellite() {
  const norad = noradInput.value.trim();

  if (!/^\d+$/.test(norad)) {
    setStatus("Enter a valid NORAD ID", true);
    return;
  }

  if (trackingInterval) {
    clearInterval(trackingInterval);
  }

  setStatus(`Tracking NORAD ${norad}`);

  try {
    await renderSatellitePosition(norad);

    trackingInterval = setInterval(() => {
      renderSatellitePosition(norad).catch(err =>
        setStatus(err.message, true)
      );
    }, 3000);

    setStatus(`Now tracking ${norad}`);
  } catch (err) {
    setStatus(err.message, true);
  }
}

/* Button */

trackBtn.addEventListener("click", trackSatellite);

noradInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    trackSatellite();
  }
});

/* Animation */

// function animate() {
//   earth.rotation.y += 0.0015;
//   halo.rotation.z += 0.03;

//   renderer.render(scene, camera);

//   requestAnimationFrame(animate);
// }

// animate();