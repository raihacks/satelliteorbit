export async function fetchTLECatalog(group = "active") {
  const normalizedGroup = String(group || "active").trim().toLowerCase();
  
  // Pointing to your Express backend /catalog route
  const url = `/api/satellite/catalog/${encodeURIComponent(normalizedGroup)}`;
  
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch ${normalizedGroup} satellite catalog from cache`);
  }

  /**
   * Your backend already formats this as an array of objects:
   * [{ norad, name, tle1, tle2 }, ...]
   * So no manual parsing of raw TLE text is needed here anymore!
   */
  const satellites = await res.json();

  if (!satellites || satellites.length === 0) {
    throw new Error(`No satellites were found in the ${normalizedGroup} cache`);
  }

  return satellites;
}