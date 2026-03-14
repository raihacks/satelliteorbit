const EARTH_RADIUS = 5;

export function createEarth(group) {

  const loader = new THREE.TextureLoader();

  const texture = loader.load(
    "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg"
  );

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 64, 64),
    new THREE.MeshPhongMaterial({
      map: texture,
      shininess: 8
    })
  );

  group.add(earth);
}