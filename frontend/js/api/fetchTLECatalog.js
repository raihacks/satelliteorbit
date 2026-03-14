function parseNorad(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function fetchTLECatalog() {
  const url = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Failed to fetch active satellite catalog");
  }

  const text = await res.text();
  const lines = text.split("\n");
  const satellites = [];

  for (let i = 0; i < lines.length; i += 3) {
    const name = lines[i]?.trim();
    const tle1 = lines[i + 1]?.trim();
    const tle2 = lines[i + 2]?.trim();

    if (!name || !tle1 || !tle2 || !tle1.startsWith("1 ") || !tle2.startsWith("2 ")) {
      continue;
    }

    const norad = parseNorad(tle1.substring(2, 7));

    if (!norad) {
      continue;
    }

    satellites.push({ norad: String(norad), name, tle1, tle2 });
  }

  if (!satellites.length) {
    throw new Error("No active satellites were found in the catalog");
  }

  return satellites;
}