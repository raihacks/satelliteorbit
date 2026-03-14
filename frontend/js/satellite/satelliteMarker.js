export function createSatelliteMarker(color = 0x7df4ff) {

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 14, 14),
    new THREE.MeshBasicMaterial({ color })
  );

  marker.visible = false;

  return {
    marker,
    targetPosition: new THREE.Vector3(),
    norad: null,
    latestData: null,
    orbitLine: null,
    altitudeLine: null,
    groundLine: null,
    groundTrackPoints: []
  };
}