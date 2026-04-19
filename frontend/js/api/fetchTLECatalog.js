export async function fetchTLECatalog(group = "active") {
  const normalizedGroup = String(group || "active").trim().toLowerCase();
  
  const url = `/api/satellite/catalog/${encodeURIComponent(normalizedGroup)}`;
  
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch ${normalizedGroup} satellite catalog from cache`);
  }

  const satellites = await res.json();

  if (!satellites || satellites.length === 0) {
    throw new Error(`No satellites were found in the ${normalizedGroup} cache`);
  }

  return satellites;
}