export function dealsQueryFromSearch(search: string): string {
  return new URLSearchParams(search).get("q")?.trim() ?? "";
}

export function searchWithDealsQuery(search: string, query: string): string {
  const params = new URLSearchParams(search);
  const normalized = query.trim();
  if (normalized) params.set("q", normalized);
  else params.delete("q");
  const value = params.toString();
  return value ? `?${value}` : "";
}
