export function createSatelliteMarker(){

 const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.06,14,14),
  new THREE.MeshBasicMaterial({color:0x7df4ff})
 );

 return {
   marker,
   orbitLine:null,
   groundLine:null,
   altitudeLine:null,
   satrec:null,
   groundPoints:[],
   targetPosition:new THREE.Vector3()
 };

}