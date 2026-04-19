export async function fetchTLE(norad) {

  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${norad}&FORMAT=TLE`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Failed to fetch TLE");
  }

  const text = await res.text();
  const lines = text.trim().split("\n");

  if (lines.length < 3) {
    throw new Error("No TLE found for NORAD " + norad);
  }

  return {
    name: lines[0].trim(),
    tle1: lines[1].trim(),
    tle2: lines[2].trim()
  };
}