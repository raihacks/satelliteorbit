import { createScene } from "./core/scene.js";
import { createRenderer } from "./core/renderer.js";
import { createControls } from "./core/controls.js";
import { createEarth } from "./earth/earth.js";
import { SatelliteManager } from "./satellite/satelliteManager.js";
import { fetchTLECatalog } from "./api/fetchTLECatalog.js";
 
const viewer        = document.getElementById("viewer");
const noradInput    = document.getElementById("norad");
const trackButton   = document.getElementById("track-btn");
const loadAllButton = document.getElementById("load-all-btn");
const statusEl      = document.getElementById("status");
const catalogGroupEl = document.getElementById("catalog-group");
const satListEl     = document.getElementById("sat-list");
 
const selectedNoradEl = document.getElementById("selected-norad");
const latEl  = document.getElementById("latitude");
const lonEl  = document.getElementById("longitude");
const altEl  = document.getElementById("altitude");
 
const scene    = createScene();
const renderer = createRenderer(viewer);
const camera   = renderer.camera;
const controls = createControls(camera, renderer.renderer.domElement);
 
const earthSystem = new THREE.Group();
scene.add(earthSystem);
createEarth(earthSystem);
 
const satellites = new SatelliteManager(earthSystem);
let selectedSatellite = null;
let hoveredSatellite  = null;
const raycaster = new THREE.Raycaster();
const pointer   = new THREE.Vector2();
const CAMERA_FOCUS_OFFSET = 2.6;
 
const hoverLabelEl = document.createElement("div");
hoverLabelEl.className = "marker-hover-label";
hoverLabelEl.hidden = true;
document.body.appendChild(hoverLabelEl);
 
function focusCameraOnSatellite(sat) {
  if (!sat) return;
  const markerPosition = sat.marker.position.clone();
  if (!Number.isFinite(markerPosition.length()) || markerPosition.length() === 0) return;
  const direction = markerPosition.clone().normalize();
  const nextCameraPosition = markerPosition.clone().add(direction.multiplyScalar(CAMERA_FOCUS_OFFSET));
  camera.position.copy(nextCameraPosition);
  controls.target.copy(markerPosition);
  controls.update();
}
 
function setStatus(message) {
  statusEl.textContent = message;
}
 
function selectSatellite(sat, statusMessage = null) {
  if (!sat) return;
  selectedSatellite = sat;
  satellites.setSelectedNorad(sat.norad);
  if (statusMessage) setStatus(statusMessage);
  renderSatPills();
  setTelemetry(selectedSatellite);
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
 
const MAX_VISIBLE_PILLS = 200;
 
function renderSatPills() {
  satListEl.innerHTML = "";
  const pillsToRender = satellites.satellites.slice(0, MAX_VISIBLE_PILLS);
 
  pillsToRender.forEach((sat) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "sat-pill";
    if (selectedSatellite?.norad === sat.norad) pill.classList.add("active");
 
    // Color the pill border to match the satellite type color
    const hex = '#' + sat.defaultColor.toString(16).padStart(6, '0');
    pill.style.borderColor = hex;
    pill.style.color = hex;
 
    pill.textContent = sat.name ? `${sat.norad} · ${sat.name}` : `${sat.norad}`;
    pill.addEventListener("click", () => {
      selectSatellite(sat, `Tracking NORAD ${sat.norad}.`);
    });
    satListEl.appendChild(pill);
  });
 
  if (satellites.satellites.length > MAX_VISIBLE_PILLS) {
    const overflow = document.createElement("div");
    overflow.className = "sat-list-overflow";
    overflow.textContent = `Showing ${MAX_VISIBLE_PILLS} of ${satellites.satellites.length} satellites`;
    satListEl.appendChild(overflow);
  }
}
 
function updatePointerFromEvent(event) {
  const rect = renderer.renderer.domElement.getBoundingClientRect();
  pointer.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
  pointer.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
}
 
function getPickedSatelliteFromEvent(event) {
  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const markers = satellites.satellites.map((sat) => sat.marker).filter((m) => m.visible);
  const intersections = raycaster.intersectObjects(markers, false);
  if (!intersections.length) return null;
  const pickedNorad = intersections[0].object.userData?.norad;
  return satellites.satellites.find((sat) => sat.norad === pickedNorad) || null;
}
 
function showHoverLabel(event, text) {
  hoverLabelEl.textContent = text;
  hoverLabelEl.style.left = `${event.clientX + 12}px`;
  hoverLabelEl.style.top  = `${event.clientY + 12}px`;
  hoverLabelEl.hidden = false;
}
 
function hideHoverLabel() {
  hoverLabelEl.hidden = true;
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
    selectSatellite(sat, `Tracking NORAD ${norad}.`);
    satellites.update();
    focusCameraOnSatellite(sat);
  } catch (error) {
    setStatus(error.message || `Unable to load NORAD ${norad}.`);
  } finally {
    trackButton.disabled = false;
  }
}
 
async function handleLoadAllSatellites() {
  const catalogGroup = catalogGroupEl?.value || "active";
 
  // Store current group in the manager so addSatelliteFromTle can use it
  satellites.currentCatalogGroup = catalogGroup;
 
  loadAllButton.disabled = true;
  trackButton.disabled   = true;
  setStatus(`Loading ${catalogGroup} satellites catalog... this may take a few seconds.`);
 
  try {
    const catalog = await fetchTLECatalog(catalogGroup);
 
    // ← KEY CHANGE: pass catalogGroup so every satellite gets the right color
    satellites.addSatellitesFromCatalog(catalog, catalogGroup);
 
    if (!selectedSatellite && satellites.satellites.length > 0) {
      selectSatellite(satellites.satellites[0]);
    }
 
    renderSatPills();
    setTelemetry(selectedSatellite);
    setStatus(`Loaded ${catalog.length} satellites from ${catalogGroup}.`);
  } catch (error) {
    setStatus(error.message || `Unable to load ${catalogGroup} satellite catalog.`);
  } finally {
    loadAllButton.disabled = false;
    trackButton.disabled   = false;
  }
}
 
trackButton.addEventListener("click", handleTrackSatellite);
loadAllButton.addEventListener("click", handleLoadAllSatellites);
noradInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleTrackSatellite();
});
 
renderer.renderer.domElement.addEventListener("mousemove", (event) => {
  const pickedSatellite = getPickedSatelliteFromEvent(event);
  if (!pickedSatellite) {
    hoveredSatellite = null;
    satellites.setHoveredNorad(null);
    hideHoverLabel();
    renderer.renderer.domElement.style.cursor = "default";
    return;
  }
  hoveredSatellite = pickedSatellite;
  satellites.setHoveredNorad(pickedSatellite.norad);
  showHoverLabel(event, pickedSatellite.name || `NORAD ${pickedSatellite.norad}`);
  renderer.renderer.domElement.style.cursor = "pointer";
});
 
renderer.renderer.domElement.addEventListener("mouseleave", () => {
  hoveredSatellite = null;
  satellites.setHoveredNorad(null);
  hideHoverLabel();
  renderer.renderer.domElement.style.cursor = "default";
});
 
renderer.renderer.domElement.addEventListener("click", (event) => {
  const pickedSatellite = getPickedSatelliteFromEvent(event);
  if (!pickedSatellite) return;
  selectSatellite(pickedSatellite, `Selected NORAD ${pickedSatellite.norad} from map.`);
});
 
window.addEventListener("resize", () => {
  const width  = window.innerWidth;
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