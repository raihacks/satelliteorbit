const TYPE_COLORS = {
  starlink:  { default: 0x60a5fa, hover: 0x93c5fd, selected: 0xffffff },
  oneweb:    { default: 0x34d399, hover: 0x6ee7b7, selected: 0xffffff },
  iridium:   { default: 0xfb923c, hover: 0xfdba74, selected: 0xffffff },
  planet:    { default: 0xf472b6, hover: 0xf9a8d4, selected: 0xffffff },
  geo:       { default: 0xa78bfa, hover: 0xc4b5fd, selected: 0xffffff },
  intelsat:  { default: 0xf87171, hover: 0xfca5a5, selected: 0xffffff },
  stations:  { default: 0xfbbf24, hover: 0xfde68a, selected: 0xffffff },
  active:    { default: 0x2dd4bf, hover: 0x5eead4, selected: 0xffffff },
  unknown:   { default: 0x94a3b8, hover: 0xcbd5e1, selected: 0xffffff },
};
 
export function getSatelliteColors(nameOrGroup = '') {
  const n = nameOrGroup.toLowerCase();
  if (n === 'starlink'  || n.startsWith('starlink'))   return TYPE_COLORS.starlink;
  if (n === 'oneweb'    || n.startsWith('oneweb'))      return TYPE_COLORS.oneweb;
  if (n === 'iridium'   || n.startsWith('iridium'))     return TYPE_COLORS.iridium;
  if (n === 'planet'    || n.startsWith('flock') || n.startsWith('skysat')) return TYPE_COLORS.planet;
  if (n === 'intelsat'  || n.startsWith('intelsat'))    return TYPE_COLORS.intelsat;
  if (n === 'stations'  || n.includes('station') || n.includes('iss') || n.includes('tiangong')) return TYPE_COLORS.stations;
  if (n === 'geo')                                      return TYPE_COLORS.geo;
  if (n === 'active')                                   return TYPE_COLORS.active;
  return TYPE_COLORS.unknown;
}
 
export function createSatelliteMarker(nameOrGroup = '') {
  const colors = getSatelliteColors(nameOrGroup);
 
  const geometry = new THREE.SphereGeometry(0.012, 8, 8);
  const material = new THREE.MeshBasicMaterial({ color: colors.default });
  const marker = new THREE.Mesh(geometry, material);
  marker.visible = false;
 
  return {
    marker,
    defaultColor:  colors.default,
    hoverColor:    colors.hover,
    selectedColor: colors.selected,
    targetPosition: new THREE.Vector3(),
    orbitLine: null,
    altitudeLine: null,
    groundLine: null,
    groundTrackPoints: [],
    latestData: null,
    norad: null,
    name: null,
    satrec: null,
  };
}
 