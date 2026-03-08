const viewer = document.getElementById("viewer");
const noradInput = document.getElementById("norad");
const trackBtn = document.getElementById("track-btn");
const statusEl = document.getElementById("status");
const latEl = document.getElementById("latitude");
const lonEl = document.getElementById("longitude");
const altEl = document.getElementById("altitude");

const EARTH_RADIUS = 4;
const runtimeApiBase = window.__API_BASE__ || document.querySelector("meta[name=api-base]")?.content;
const API_BASE = (runtimeApiBase || `${window.location.origin}/api`).replace(/\/$/, "") + "/satellite";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 0, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
viewer.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x88a8ff, 0.55);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(7, 4, 8);
scene.add(ambient, sun);

const stars = new THREE.Points(
  new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      Array.from({ length: 2600 * 3 }, () => THREE.MathUtils.randFloatSpread(800)),
      3
    )
  ),
  new THREE.PointsMaterial({ color: 0x8ab4ff, size: 0.9 })
);
scene.add(marker);
marker.visible = false;

const halo = new THREE.Mesh(
  new THREE.RingGeometry(0.2, 0.28, 36),
  new THREE.MeshBasicMaterial({ color: 0x9ddbff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
);
halo.visible = false;
scene.add(halo);

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

let dragging = false;
let previous = { x: 0, y: 0 };
let trackingIntervalId = null;
let activeNorad = null;

window.addEventListener("mousedown", event => {
  dragging = true;
  previous = { x: event.clientX, y: event.clientY };
});

window.addEventListener("mouseup", () => {
  dragging = false;
});

window.addEventListener("mousemove", event => {
  if (!dragging) {
    return;
  }
  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  earth.rotation.y += dx * 0.005;
  earth.rotation.x += dy * 0.003;
  marker.rotation.copy(earth.rotation);
  halo.rotation.copy(earth.rotation);
  previous = { x: event.clientX, y: event.clientY };
});

window.addEventListener("wheel", event => {
  camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.008, 6.5, 24);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ff8d93" : "#d0dcf6";
}

function updateTelemetry(lat, lon, alt) {
  latEl.textContent = `${lat.toFixed(2)}°`;
  lonEl.textContent = `${lon.toFixed(2)}°`;
  altEl.textContent = `${alt.toFixed(1)} km`;
}

async function fetchSatellitePosition(norad) {
  const response = await fetch(`${API_BASE}/${norad}`);
  if (!response.ok) {
    throw new Error(response.status === 404 ? "Satellite not found in database." : `API error (${response.status}).`);
  }

  return response.json();
}

async function renderSatellitePosition(norad) {
  const data = await fetchSatellitePosition(norad);
  updateTelemetry(data.latitude, data.longitude, data.altitude_km);

  const position = latLonToVector3(data.latitude, data.longitude, data.altitude_km);
  marker.position.copy(position);
  halo.position.copy(position);
  halo.lookAt(new THREE.Vector3(0, 0, 0));

  marker.visible = true;
  halo.visible = true;
}

async function trackSatellite() {
  const norad = noradInput.value.trim();
  if (!/^\d+$/.test(norad)) {
    setStatus("Please enter a valid numeric NORAD ID.", true);
    return;
  }

  if (trackingIntervalId) {
    clearInterval(trackingIntervalId);
    trackingIntervalId = null;
  }

  activeNorad = norad;
  setStatus(`Tracking NORAD ${norad}...`);

  try {
    await renderSatellitePosition(norad);

    trackingIntervalId = window.setInterval(async () => {
      if (activeNorad !== norad) {
        return;
      }

      try {
        await renderSatellitePosition(norad);
      } catch (error) {
        setStatus(error.message, true);
      }
    }, 3000);

    const params = new URLSearchParams(window.location.search);
    params.set("norad-id", norad);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);

    setStatus(`Now showing NORAD ${norad}. Drag to rotate, scroll to zoom.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

trackBtn.addEventListener("click", trackSatellite);
noradInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    trackSatellite();
  }
});

const preselectedNorad = new URLSearchParams(window.location.search).get("norad-id");
if (preselectedNorad) {
  noradInput.value = preselectedNorad;
  trackSatellite();
}

function animate() {
  earth.rotation.y += 0.0015;
  halo.rotation.z += 0.03;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();