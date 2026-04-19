export async function fetchTLE(norad) {
  // Pointing to your Express backend instead of Celestrak
  const url = `/api/satellite/${norad}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch TLE for NORAD ${norad} from cache/database`);
  }

  const data = await res.json();

  /**
   * NOTE: Your backend (satelliteRoute.js) returns 'tle_line1' and 'tle_line2'.
   * We map them back to 'tle1' and 'tle2' to match your SatelliteManager's expectations.
   */
  return {
    name: data.name || `NORAD ${norad}`,
    tle1: data.tle_line1,
    tle2: data.tle_line2
  };
}