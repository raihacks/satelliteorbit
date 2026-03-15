// satelliteManager.js — frontend/js/satellite/satelliteManager.js

import { createSatelliteMarker } from "./satelliteMarker.js";
import { fetchTLE } from "../api/fetchTLE.js";
import { latLonToVector3 } from "../math/latLonToVector3.js";

const ORBIT_SAMPLE_POINTS = 280;
const MIN_GROUND_STEP = 0.02;
const MAX_GROUND_POINTS = 600;

export class SatelliteManager {
  constructor(group) {
    this.group = group;
    this.satellites = [];
    this.selectedNorad = null;
    this.hoveredNorad = null;
    this.currentCatalogGroup = 'active';
  }

  setSelectedNorad(norad) {
    this.selectedNorad = norad;
    this.satellites.forEach((sat) => {
      this.applyMarkerStyle(sat);
      this.applyLineVisibility(sat);
    });
  }

  setHoveredNorad(norad) {
    this.hoveredNorad = norad;
    this.satellites.forEach((sat) => {
      this.applyMarkerStyle(sat);
    });
  }

  applyMarkerStyle(sat) {
    const isSelected = sat.norad === this.selectedNorad;
    const isHovered  = sat.norad === this.hoveredNorad;

    if (isSelected) {
      sat.marker.material.color.setHex(sat.selectedColor);
      sat.marker.scale.setScalar(1.6);
      return;
    }
    if (isHovered) {
      sat.marker.material.color.setHex(sat.hoverColor);
      sat.marker.scale.setScalar(1.3);
      return;
    }
    sat.marker.material.color.setHex(sat.defaultColor);
    sat.marker.scale.setScalar(1);
  }

  applyLineVisibility(sat) {
    const isSelected = sat.norad === this.selectedNorad;
    if (sat.orbitLine)    sat.orbitLine.visible    = isSelected;
    if (sat.altitudeLine) sat.altitudeLine.visible = isSelected;
    if (sat.groundLine)   sat.groundLine.visible   = isSelected;
  }

  hasSatellite(norad) {
    return this.satellites.some((sat) => sat.norad === norad);
  }

  _resolveTypeKey(name = '', catalogGroup = '') {
    // Always derive color from satellite name first for accurate mixed-type coloring
    const n = name.toLowerCase();
    if (n.startsWith('starlink'))                        return 'starlink';
    if (n.startsWith('oneweb'))                          return 'oneweb';
    if (n.startsWith('iridium'))                         return 'iridium';
    if (n.startsWith('flock') || n.startsWith('skysat')) return 'planet';
    if (n.startsWith('intelsat'))                        return 'intelsat';
    if (n.includes('station') || n.includes('iss') || n.includes('tiangong')) return 'stations';
    // Fall back to catalog group for unknown names (but not 'active')
    if (catalogGroup && catalogGroup !== 'active') return catalogGroup;
    return 'active';
  }

  addSatelliteFromTle({ norad, name, tle1, tle2 }, catalogGroup = '') {
    const noradText = String(norad);

    if (this.hasSatellite(noradText)) {
      return this.satellites.find((sat) => sat.norad === noradText);
    }

    const typeKey = this._resolveTypeKey(name, catalogGroup);
    const sat = createSatelliteMarker(typeKey);

    sat.norad = noradText;
    sat.name  = name;
    sat.marker.userData.norad = noradText;
    sat.satrec = satellite.twoline2satrec(tle1, tle2);

    this.applyMarkerStyle(sat);
    this.group.add(sat.marker);
    this.satellites.push(sat);

    return sat;
  }

  async addSatellite(norad) {
    const noradText = String(norad);
    if (this.hasSatellite(noradText)) {
      return this.satellites.find((sat) => sat.norad === noradText);
    }
    const tle = await fetchTLE(noradText);
    return this.addSatelliteFromTle({ norad: noradText, ...tle }, '');
  }

  addSatellitesFromCatalog(catalog, catalogGroup = '') {
    const group = catalogGroup || this.currentCatalogGroup;
    const added = [];
    catalog.forEach((entry) => {
      const sat = this.addSatelliteFromTle(entry, group);
      added.push(sat);
    });
    return added;
  }

  update() {
    const now = new Date();

    this.satellites.forEach((sat) => {
      if (!sat.satrec) return;

      const posVel = satellite.propagate(sat.satrec, now);
      if (!posVel.position) return;

      const gmst      = satellite.gstime(now);
      const geo       = satellite.eciToGeodetic(posVel.position, gmst);
      const latitude  = satellite.degreesLat(geo.latitude);
      const longitude = satellite.degreesLong(geo.longitude);
      const altitudeKm = geo.height;

      const satellitePoint = latLonToVector3(latitude, longitude, altitudeKm);
      const groundPoint    = latLonToVector3(latitude, longitude, 0);

      sat.targetPosition.copy(satellitePoint);
      sat.marker.position.lerp(sat.targetPosition, 0.2);
      sat.marker.visible = true;

      const isSelected = sat.norad === this.selectedNorad;

      if (isSelected) {
        if (!sat.orbitLine) this.createConstantOrbitLine(sat, now);
        this.updateAltitudeLine(sat, groundPoint, satellitePoint);
        this.updateGroundLine(sat, groundPoint);
      }
      this.applyLineVisibility(sat);

      sat.latestData = { latitude, longitude, altitude_km: altitudeKm };
    });
  }

  createConstantOrbitLine(sat, startTime) {
    const meanMotion = sat.satrec.no;
    if (!meanMotion || !Number.isFinite(meanMotion)) return;

    const orbitPeriodMinutes = (2 * Math.PI) / meanMotion;
    const orbitPeriodMs      = orbitPeriodMinutes * 60 * 1000;
    const orbitPoints        = [];

    for (let i = 0; i <= ORBIT_SAMPLE_POINTS; i++) {
      const progress = i / ORBIT_SAMPLE_POINTS;
      const time     = new Date(startTime.getTime() + progress * orbitPeriodMs);
      const posVel   = satellite.propagate(sat.satrec, time);
      if (!posVel.position) continue;

      const gmst = satellite.gstime(time);
      const geo  = satellite.eciToGeodetic(posVel.position, gmst);
      orbitPoints.push(latLonToVector3(
        satellite.degreesLat(geo.latitude),
        satellite.degreesLong(geo.longitude),
        geo.height
      ));
    }

    if (orbitPoints.length < 2) return;
    this.replaceLine(sat, 'orbitLine', orbitPoints, sat.defaultColor, false, true);
  }

  updateAltitudeLine(sat, groundPoint, satellitePoint) {
    const points = [groundPoint, satellitePoint];
    if (!sat.altitudeLine) {
      this.replaceLine(sat, 'altitudeLine', points, sat.defaultColor, false, false);
      return;
    }
    sat.altitudeLine.geometry.setFromPoints(points);
  }

  updateGroundLine(sat, groundPoint) {
    const previousPoint = sat.groundTrackPoints[sat.groundTrackPoints.length - 1];

    if (!previousPoint || previousPoint.distanceTo(groundPoint) >= MIN_GROUND_STEP) {
      sat.groundTrackPoints.push(groundPoint.clone());
    }
    if (sat.groundTrackPoints.length > MAX_GROUND_POINTS) {
      sat.groundTrackPoints.shift();
    }
    if (sat.groundTrackPoints.length < 2) return;

    if (!sat.groundLine) {
      this.replaceLine(sat, 'groundLine', sat.groundTrackPoints, sat.defaultColor, false, false);
      return;
    }
    sat.groundLine.geometry.setFromPoints(sat.groundTrackPoints);
  }

  replaceLine(sat, key, points, color, segments = false, closed = false) {
    if (sat[key]) {
      this.group.remove(sat[key]);
      sat[key].geometry.dispose();
      sat[key].material.dispose();
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });

    if (segments) {
      sat[key] = new THREE.LineSegments(geometry, material);
    } else {
      sat[key] = new THREE.Line(geometry, material);
      if (closed) {
        sat[key].geometry.setFromPoints([...points, points[0]]);
      }
    }

    this.applyLineVisibility(sat);
    this.group.add(sat[key]);
  }
}
