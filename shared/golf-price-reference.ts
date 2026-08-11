const IRON_SET_PATTERN =
  /\b(?:iron\s+sets?|complete\s+(?:golf\s+)?sets?|sets?\s+of\s+\d+\s+irons?|[3-9]\s*[-–]\s*(?:pw|aw|gw|sw)|[4-9]\s*,?\s*(?:pw|aw|gw|sw))\b/i;

const INDIVIDUAL_IRON_PATTERN =
  /\b(?:[2-9]|pw|aw|gw|sw|lw)\s*(?:iron|wedge)?\b|\b(?:pitching|approach|gap|sand|lob)\s+wedge\b/i;

export function isPlausibleGolfPriceReference(input: {
  title?: string | null;
  priceCents?: number | null;
  referenceCents?: number | null;
  sportId?: string | null;
  equipmentTypeId?: string | null;
}): boolean {
  const price = Number(input.priceCents);
  const reference = Number(input.referenceCents);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(reference) || reference <= price) return false;

  const title = input.title ?? "";
  const isGolf = input.sportId === "golf" || /^golf-/.test(input.equipmentTypeId ?? "");
  if (!isGolf || IRON_SET_PATTERN.test(title)) return true;

  const isIndividualIron = INDIVIDUAL_IRON_PATTERN.test(title)
    || input.equipmentTypeId === "golf-irons"
    || input.equipmentTypeId === "golf-wedges";

  // A single iron or wedge must never inherit the four-figure MSRP of its
  // model's complete set. The thresholds are deliberately conservative so
  // premium putters, drivers, and genuine sets are not suppressed.
  if (isIndividualIron && reference >= 60_000 && reference >= price * 2.5) return false;
  return true;
}
