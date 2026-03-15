export function createControls(camera, rendererOrDomElement) {
  const domElement = rendererOrDomElement?.domElement ?? rendererOrDomElement;
  const controls = new THREE.OrbitControls(camera, domElement);

  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  controls.minDistance = 0.1;
  controls.maxDistance = 160;
  controls.zoomSpeed = 1.6;

  return controls;
}
