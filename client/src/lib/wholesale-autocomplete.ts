export type WholesaleSuggestion = {
  value: string;
  label: string;
};

export function buildWholesaleSuggestions(rows: any[], query: string, limit = 12): WholesaleSuggestion[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const seen = new Set<string>();
  const suggestions: Array<WholesaleSuggestion & { score: number }> = [];
  for (const row of rows) {
    const value = String(row.retail_name || row.name || "").trim();
    const normalized = value.toLowerCase();
    if (!value || seen.has(normalized)) continue;
    const details = [
      row.retail_brand || row.manufacturer,
      row.retail_model,
      row.sku && `SKU ${row.sku}`,
      row.size,
    ].filter(Boolean);
    const searchable = [value, ...details].join(" ").toLowerCase();
    if (!searchable.includes(needle)) continue;
    seen.add(normalized);
    const brand = String(row.retail_brand || row.manufacturer || "").toLowerCase();
    const model = String(row.retail_model || "").toLowerCase();
    const sku = String(row.sku || "").toLowerCase();
    const score = brand.startsWith(needle) ? 0
      : model.startsWith(needle) || sku.startsWith(needle) ? 1
      : normalized.startsWith(needle) ? 2
      : normalized.split(/\s+/).some((word) => word.startsWith(needle)) ? 3
      : 4;
    suggestions.push({
      value,
      label: details.length ? `${value} — ${details.join(" · ")}` : value,
      score,
    });
  }
  return suggestions
    .sort((a, b) => a.score - b.score || a.value.localeCompare(b.value))
    .slice(0, limit)
    .map(({ value, label }) => ({ value, label }));
}
