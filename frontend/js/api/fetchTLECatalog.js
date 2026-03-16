function parseNorad(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function fetchTLECatalog(group = "active") {
  const normalizedGroup = String(group || "active").trim().toLowerCase();

  // Call our backend proxy — it fetches from Celestrak server-side (no CORS issue)
  const res = await fetch(`/api/satellite/catalog/${encodeURIComponent(normalizedGroup)}`);

  if (!res.ok) {
    throw new Error(`Failed to fetch ${normalizedGroup} satellite catalog (${res.status})`);
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No satellites found for ${normalizedGroup}`);
  }

  return data; // already [{ norad, name, tle1, tle2 }, ...]
}