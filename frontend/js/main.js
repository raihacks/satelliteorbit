import { createScene } from "./core/scene.js";
import { createRenderer } from "./core/renderer.js";
import { createControls } from "./core/controls.js";
import { createEarth } from "./earth/earth.js";
import { SatelliteManager } from "./satellite/satelliteManager.js";

const viewer = document.getElementById("viewer");
const noradInput = document.getElementById("norad");
const trackButton = document.getElementById("track-btn");
const statusEl = document.getElementById("status");
const satListEl = document.getElementById("sat-list");

const selectedNoradEl = document.getElementById("selected-norad");
const latEl = document.getElementById("latitude");
const lonEl = document.getElementById("longitude");
const altEl = document.getElementById("altitude");

const scene = createScene();
const renderer = createRenderer(viewer);
const camera = renderer.camera;
const controls = createControls(camera, renderer.renderer.domElement);

const earthSystem = new THREE.Group();
scene.add(earthSystem);
createEarth(earthSystem);

const satellites = new SatelliteManager(earthSystem);
let selectedSatellite = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function setTelemetry(sat) {
  if (!sat || !sat.latestData) {
    selectedNoradEl.textContent = "—";
    latEl.textContent = "—";
    lonEl.textContent = "—";
    altEl.textContent = "—";
    return;
  }

  selectedNoradEl.textContent = sat.norad;
  latEl.textContent = `${sat.latestData.latitude.toFixed(2)}°`;
  lonEl.textContent = `${sat.latestData.longitude.toFixed(2)}°`;
  altEl.textContent = `${sat.latestData.altitude_km.toFixed(2)} km`;
}

function renderSatPills() {
  satListEl.innerHTML = "";

  satellites.satellites.forEach((sat) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "sat-pill";
    if (selectedSatellite?.norad === sat.norad) {
      pill.classList.add("active");
    }

    pill.textContent = sat.name ? `${sat.norad} · ${sat.name}` : `${sat.norad}`;
    pill.addEventListener("click", () => {
      selectedSatellite = sat;
      satellites.setSelectedNorad(sat.norad);
      setStatus(`Tracking NORAD ${sat.norad}.`);
      renderSatPills();
      setTelemetry(selectedSatellite);
    });

    satListEl.appendChild(pill);
  });
}

async function handleTrackSatellite() {
  const norad = noradInput.value.trim();

  if (!/^\d+$/.test(norad)) {
    setStatus("Please enter a valid numeric NORAD ID.");
    return;
  }

  trackButton.disabled = true;
  setStatus(`Loading NORAD ${norad}...`);

  try {
    const sat = await satellites.addSatellite(norad);
    selectedSatellite = sat;
    satellites.setSelectedNorad(sat.norad);
    setStatus(`Tracking NORAD ${norad}.`);
    renderSatPills();
  } catch (error) {
    setStatus(error.message || `Unable to load NORAD ${norad}.`);
  } finally {
    trackButton.disabled = false;
  }
}

trackButton.addEventListener("click", handleTrackSatellite);
noradInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleTrackSatellite();
  }
});

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.camera.aspect = width / height;
  renderer.camera.updateProjectionMatrix();
  renderer.renderer.setSize(width, height);
});

function animate() {
  satellites.update();
  setTelemetry(selectedSatellite);

  controls.update();
  renderer.renderer.render(scene, camera);

  requestAnimationFrame(animate);
}

setTelemetry(null);
animate();