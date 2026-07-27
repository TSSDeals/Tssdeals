export type WholesaleSuggestion = {
  value: string;
  label: string;
};

export function buildWholesaleSuggestions(rows: any[], query: string, limit = 12): WholesaleSuggestion[] {
  if (query.trim().length < 2) return [];
  const seen = new Set<string>();
  const suggestions: WholesaleSuggestion[] = [];
  for (const row of rows) {
    const value = String(row.retail_name || row.name || "").trim();
    const normalized = value.toLowerCase();
    if (!value || seen.has(normalized)) continue;
    seen.add(normalized);
    const details = [
      row.retail_brand || row.manufacturer,
      row.retail_model,
      row.sku && `SKU ${row.sku}`,
      row.size,
    ].filter(Boolean);
    suggestions.push({
      value,
      label: details.length ? `${value} — ${details.join(" · ")}` : value,
    });
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}
