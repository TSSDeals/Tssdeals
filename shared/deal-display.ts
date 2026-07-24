/**
 * Returns shipping text only when a source supplied a trustworthy amount.
 * Missing or invalid values remain unlabeled instead of being estimated.
 */
export function formatKnownShipping(deal: any): string | null {
  const candidate =
    deal?.raw?.shippingOptions?.[0]?.shippingCost ??
    deal?.raw?.shippingCost ??
    deal?.raw?.shipping?.cost;
  const rawValue = typeof candidate === "object" && candidate !== null ? candidate.value : candidate;
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value === 0) return "Free shipping";
  const currency = typeof candidate === "object" && candidate !== null
    ? candidate.currency ?? candidate.currencyCode ?? deal?.currency
    : deal?.currency;
  try {
    return `${new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(value)} shipping`;
  } catch {
    return `$${value.toFixed(2)} shipping`;
  }
}
