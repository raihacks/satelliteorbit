import { earthSystem } from "../core/scene.js";
import { EARTH_RADIUS } from "./earthConstants.js";

const textureLoader = new THREE.TextureLoader();

const earthTexture = textureLoader.load(
  "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg"
);

export const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS,64,64),
  new THREE.MeshPhongMaterial({ map: earthTexture })
);

earthSystem.add(earth);