import { createSatelliteMarker } from "./satelliteMarker.js";
import { fetchTLE } from "../api/fetchTLE.js";
import { latLonToVector3 } from "../math/latLonToVector3.js";

const PREDICTION_MINUTES_AHEAD = 100;
const PREDICTION_STEP_SECONDS = 0.02;
const PREDICTION_REFRESH_MS = 360;
const ORBIT_SAMPLE_POINTS = 240;
const MIN_GROUND_STEP = 0.02;
const MAX_GROUND_POINTS = 600;

export class SatelliteManager {
  constructor(group) {
    this.group = group;
    this.satellites = [];
  }

  hasSatellite(norad) {
    return this.satellites.some((sat) => sat.norad === norad);
  }

  async addSatellite(norad) {
    if (this.hasSatellite(norad)) {
      return this.satellites.find((sat) => sat.norad === norad);
    }

    const sat = createSatelliteMarker();
    sat.norad = norad;

    this.group.add(sat.marker);

    try {
      const tle = await fetchTLE(norad);
      sat.name = tle.name;
      sat.satrec = satellite.twoline2satrec(tle.tle1, tle.tle2);
      this.satellites.push(sat);

      return sat;
    } catch (error) {
      this.group.remove(sat.marker);
      throw error;
    }
  }

  update() {
    const now = new Date();

    this.satellites.forEach((sat) => {
      if (!sat.satrec) {
        return;
      }

      if (!sat.orbitLine) {
        this.createConstantOrbitLine(sat, now);
      }

      const posVel = satellite.propagate(sat.satrec, now);

      if (!posVel.position) {
        return;
      }

      const gmst = satellite.gstime(now);
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      const latitude = satellite.degreesLat(geo.latitude);
      const longitude = satellite.degreesLong(geo.longitude);
      const altitudeKm = geo.height;

      const satellitePoint = latLonToVector3(latitude, longitude, altitudeKm);
      const groundPoint = latLonToVector3(latitude, longitude, 0);
      sat.targetPosition.copy(satellitePoint);
      sat.marker.position.lerp(sat.targetPosition, 0.2);
      sat.marker.visible = true;

      this.updateAltitudeLine(sat, groundPoint, satellitePoint);
      this.updateGroundLine(sat, groundPoint);

      sat.latestData = {
        latitude,
        longitude,
        altitude_km: altitudeKm
      };
      if (!sat.orbitLine || now.getTime() - sat.lastPredictionAt > PREDICTION_REFRESH_MS) {
        this.updatePredictionLines(sat, now);
        sat.lastPredictionAt = now.getTime();
      }
    });
  }
  createConstantOrbitLine(sat, startTime) {
    const meanMotion = sat.satrec.no;
    if (!meanMotion || !Number.isFinite(meanMotion)) {
      return;
    }

    const orbitPeriodMinutes = (2 * Math.PI) / meanMotion;
    const orbitPeriodMs = orbitPeriodMinutes * 60 * 1000;
    const orbitPoints = [];

    for (let i = 0; i <= ORBIT_SAMPLE_POINTS; i += 1) {
      const progress = i / ORBIT_SAMPLE_POINTS;
      const time = new Date(startTime.getTime() + progress * orbitPeriodMs);
      const posVel = satellite.propagate(sat.satrec, time);

      if (!posVel.position) {
        continue;
      }

      const gmst = satellite.gstime(time);
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      orbitPoints.push(
        latLonToVector3(
          satellite.degreesLat(geo.latitude),
          satellite.degreesLong(geo.longitude),
          geo.height
        )
      );
    }

    if (orbitPoints.length < 2) {
      return;
    }

    this.replaceLine(sat, "orbitLine", orbitPoints, 0xffb86a, false, true);
  }

  updateAltitudeLine(sat, groundPoint, satellitePoint) {
    const points = [groundPoint, satellitePoint];

    if (!sat.altitudeLine) {
      this.replaceLine(sat, "altitudeLine", points, 0x98ffa7, false, false);
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

    if (sat.groundTrackPoints.length < 2) {
      return;
    }

    if (!sat.groundLine) {
      this.replaceLine(sat, "groundLine", sat.groundTrackPoints, 0x66dbff, false, false);
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

    this.group.add(sat[key]);
  }
}