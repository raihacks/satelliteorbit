import { EARTH_RADIUS } from "../earth/earthConstants.js";

export function latLonToVector3(lat,lon,altitudeKm){

 const radius = EARTH_RADIUS + (altitudeKm/6371)*EARTH_RADIUS;

 const phi = (90-lat)*Math.PI/180;
 const theta = (lon+180)*Math.PI/180;

 return new THREE.Vector3(
   -radius*Math.sin(phi)*Math.cos(theta),
   radius*Math.cos(phi),
   radius*Math.sin(phi)*Math.sin(theta)
 );
}