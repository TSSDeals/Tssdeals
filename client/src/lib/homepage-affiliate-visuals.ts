import { shopperResultEquipmentTypeId } from "@shared/equipment-groups";

export type HomepageVisualDeal = {
  id?: string | null;
  title?: string | null;
  sourceId?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  equipmentTypeId?: string | null;
  sportId?: string | null;
  lastSeenAt?: string | Date | null;
  raw?: unknown;
};

export type HomepageVisual = {
  imageUrl: string;
  destinationUrl: string;
  sourceId: string;
  provenance: "owned" | "direct-affiliate" | "affiliate-product-feed" | "product-feed";
};

const REJECTED_IMAGE_HINTS = [
  "1x1",
  "beacon",
  "impression",
  "pixel",
  "spacer",
  "tracking",
];

const UNAVAILABLE_VALUES = new Set([
  "false",
  "inactive",
  "no",
  "out of stock",
  "out-of-stock",
  "sold out",
  "unavailable",
]);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function validHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function rawValue(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  }
  return undefined;
}

function isUnavailable(raw: Record<string, unknown>): boolean {
  const value = rawValue(raw, [
    "available",
    "availability",
    "availabilityStatus",
    "inStock",
    "isActive",
    "stockAvailability",
    "stockStatus",
  ]);
  if (typeof value === "boolean") return !value;
  return typeof value === "string" && UNAVAILABLE_VALUES.has(value.trim().toLowerCase());
}

function feedProvenance(
  deal: HomepageVisualDeal,
  raw: Record<string, unknown>,
): HomepageVisual["provenance"] | null {
  const sourceId = String(deal.sourceId || "").toLowerCase();
  if (sourceId === "twin-seam-sports") return "owned";
  if (sourceId === "baseline-sports") return "direct-affiliate";
  if (
    raw.impactCatalogItemId
    || raw.cjProductId
    || (raw.cjCatalogId && raw.cjAdId)
  ) {
    return "affiliate-product-feed";
  }
  if (
    raw.shopifyProductId
    || raw.amazonAsin
    || raw.amazonItemId
  ) {
    return "product-feed";
  }
  return null;
}

function visualScore(visual: HomepageVisual): number {
  if (visual.provenance === "owned") return 500;
  if (visual.provenance === "direct-affiliate") return 450;
  if (visual.provenance === "affiliate-product-feed") return 400;
  return 300;
}

export function affiliateProductVisual(deal: HomepageVisualDeal): HomepageVisual | null {
  if (!validHttpUrl(deal.imageUrl) || !validHttpUrl(deal.url)) return null;

  const normalizedImage = deal.imageUrl.toLowerCase();
  if (REJECTED_IMAGE_HINTS.some((hint) => normalizedImage.includes(hint))) return null;

  const raw = asRecord(deal.raw);
  if (isUnavailable(raw)) return null;
  const explicitAssetType = String(raw.assetType || raw.adType || "").trim().toLowerCase();
  if (
    ["banner", "creative", "promotion", "promotional"].includes(explicitAssetType)
    && !raw.impactCatalogItemId
    && !raw.cjProductId
  ) {
    return null;
  }

  const provenance = feedProvenance(deal, raw);
  if (!provenance) return null;

  return {
    imageUrl: deal.imageUrl,
    destinationUrl: deal.url,
    sourceId: String(deal.sourceId || "unknown"),
    provenance,
  };
}

export function chooseCategoryVisuals(
  deals: HomepageVisualDeal[],
): Record<string, HomepageVisual> {
  const candidates = deals
    .map((deal) => ({ deal, visual: affiliateProductVisual(deal) }))
    .filter((candidate): candidate is { deal: HomepageVisualDeal; visual: HomepageVisual } =>
      Boolean(candidate.visual)
    )
    .sort((a, b) => {
      const scoreDifference = visualScore(b.visual) - visualScore(a.visual);
      if (scoreDifference) return scoreDifference;
      return String(a.deal.id || a.deal.title || "").localeCompare(
        String(b.deal.id || b.deal.title || ""),
      );
    });

  const selected: Record<string, HomepageVisual> = {};
  for (const candidate of candidates) {
    const categoryId = shopperResultEquipmentTypeId(candidate.deal as any);
    if (!selected[categoryId]) selected[categoryId] = candidate.visual;
  }
  return selected;
}

export function chooseStarterVisuals(
  deals: HomepageVisualDeal[],
  starterQueries: string[],
): Record<string, HomepageVisual> {
  const candidates = deals
    .map((deal) => ({
      deal,
      visual: affiliateProductVisual(deal),
      normalizedTitle: String(deal.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " "),
    }))
    .filter((candidate): candidate is {
      deal: HomepageVisualDeal;
      visual: HomepageVisual;
      normalizedTitle: string;
    } => Boolean(candidate.visual))
    .sort((a, b) => {
      const scoreDifference = visualScore(b.visual) - visualScore(a.visual);
      if (scoreDifference) return scoreDifference;
      return String(a.deal.id || a.deal.title || "").localeCompare(
        String(b.deal.id || b.deal.title || ""),
      );
    });

  const selected: Record<string, HomepageVisual> = {};
  for (const query of starterQueries) {
    const terms = query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((term) => term.length >= 3);
    const match = candidates.find((candidate) =>
      terms.every((term) => candidate.normalizedTitle.includes(term))
    );
    if (match) selected[query] = match.visual;
  }
  return selected;
}
