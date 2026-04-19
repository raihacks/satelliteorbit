export async function fetchTLE(norad) {
  const url = `/api/satellite/${norad}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch TLE for NORAD ${norad} from cache/database`);
  }

  const data = await res.json();

  return {
    name: data.name || `NORAD ${norad}`,
    tle1: data.tle_line1,
    tle2: data.tle_line2
  };
}