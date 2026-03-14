export function createControls(camera, rendererOrDomElement) {
  const domElement = rendererOrDomElement?.domElement ?? rendererOrDomElement;
  const controls = new THREE.OrbitControls(camera, domElement);

  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  controls.minDistance = 10;
  controls.maxDistance = 60;

  return controls;
}
