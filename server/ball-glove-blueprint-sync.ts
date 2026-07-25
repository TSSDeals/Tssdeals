import type { InsertDeal } from "@shared/schema";
import {
  fetchShopifyProducts,
  shopifyProductToDeal,
  type ShopifyProduct,
} from "./shopify-sync";

export const BALL_GLOVE_BLUEPRINT_SOURCE_ID = "ball-glove-blueprint";
export const BALL_GLOVE_BLUEPRINT_SOURCE_NAME = "Ball Glove Blueprint";
export const BALL_GLOVE_BLUEPRINT_URL = "https://ballgloveblueprint.com";

const PREMIUM_MAKERS = new Map([
  ["atoms", "Atoms"],
  ["david", "David"],
  ["d-quest", "D-Quest"],
  ["emery", "Emery"],
  ["inaba", "Inaba"],
  ["ip select", "IP Select"],
  ["leggera", "Leggera-Diamante"],
  ["leggera taka", "Leggera-Diamante"],
  ["diamante", "Leggera-Diamante"],
  ["mack provisions", "Mack Provisions"],
  ["wagyu jb", "Wagyu-JB"],
  ["wagyu-jb", "Wagyu-JB"],
  ["zett", "Zett"],
]);

const FIELDING_GLOVE_PATTERN =
  /\b(?:baseball|softball|infield|outfield|pitcher|catcher|first\s*base|fielding|trainer)\b[\s\S]*\b(?:glove|mitt)\b|\b(?:glove|mitt)\b[\s\S]*\b(?:baseball|softball|infield|outfield|pitcher|catcher|first\s*base|fielding|trainer)\b/i;
const EXCLUDED_FORM_PATTERN =
  /\b(?:batting\s+gloves?|sliding\s+mitts?|oven\s+mitts?|glove\s+(?:care|conditioner|lace|laces|mallet|wrap)|display|autograph|signed|collectible|keychain|shirt|hat)\b/i;

export type BallGlovePosition =
  | "infield"
  | "outfield"
  | "pitcher"
  | "catcher"
  | "first-base"
  | "trainer"
  | null;

export interface BallGloveBlueprintSyncResult {
  created: number;
  updated: number;
  fetched: number;
  accepted: number;
  skipped: number;
}

function normalizedText(product: ShopifyProduct): string {
  return `${product.title} ${product.product_type} ${product.vendor} ${(product.tags ?? []).join(" ")}`
    .toLowerCase()
    .replace(/[–—]/g, "-");
}

export function premiumMakerFor(product: ShopifyProduct): string | null {
  const candidates = [product.vendor, ...(product.tags ?? [])]
    .map((value) => value?.toLowerCase().trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const exact = PREMIUM_MAKERS.get(candidate);
    if (exact) return exact;
    for (const [alias, maker] of PREMIUM_MAKERS) {
      if (candidate.includes(alias)) return maker;
    }
  }
  return null;
}

export function ballGlovePosition(product: ShopifyProduct): BallGlovePosition {
  const text = normalizedText(product);
  if (/\btrainer\b/.test(text)) return "trainer";
  if (/\b(?:catcher|catchers|catcher's|catching)\b/.test(text)) return "catcher";
  if (/\b(?:first\s*base|first-base|1b)\b/.test(text)) return "first-base";
  if (/\boutfield\b/.test(text)) return "outfield";
  if (/\bpitcher\b/.test(text)) return "pitcher";
  if (/\binfield\b/.test(text)) return "infield";
  return null;
}

export function ballGloveThrowHand(product: ShopifyProduct): "LHT" | "RHT" | null {
  const text = normalizedText(product);
  if (/\b(?:lht|left\s+hand(?:ed)?\s+throw)\b/.test(text)) return "LHT";
  if (/\b(?:rht|right\s+hand(?:ed)?\s+throw)\b/.test(text)) return "RHT";
  return null;
}

export function ballGloveSize(product: ShopifyProduct): string | null {
  const tagSize = (product.tags ?? []).find((tag) => /^\d{1,2}(?:\.\d{1,2})?$/.test(tag.trim()));
  if (tagSize) return tagSize.trim();
  return product.title.match(/\b(\d{1,2}(?:\.\d{1,2})?)\s*(?:"|inch(?:es)?)\b/i)?.[1] ?? null;
}

export function ballGloveBlueprintProductToDeal(product: ShopifyProduct): InsertDeal | null {
  const text = normalizedText(product);
  const maker = premiumMakerFor(product);
  const hasAvailableVariant = product.variants?.some((variant) => variant.available);

  if (!maker || !hasAvailableVariant) return null;
  if (EXCLUDED_FORM_PATTERN.test(text)) return null;
  if (
    product.product_type.toLowerCase().trim() !== "baseball glove" &&
    !FIELDING_GLOVE_PATTERN.test(text)
  ) return null;

  const position = ballGlovePosition(product);
  const equipmentTypeId = position === "trainer" ? "bb-training" : "bb-gloves";
  const deal = shopifyProductToDeal(
    product,
    "baseball",
    equipmentTypeId,
    BALL_GLOVE_BLUEPRINT_URL,
    BALL_GLOVE_BLUEPRINT_SOURCE_ID,
  );
  if (!deal) return null;

  deal.brand = maker;
  // The shared Shopify refinement treats every "Baseball Glove" product type as
  // playable. Restore the adapter's explicit trainer boundary after conversion.
  if (position === "trainer") {
    deal.equipmentTypeId = "bb-training";
    deal.subFilterId = null;
  }
  deal.raw = {
    ...(deal.raw as Record<string, unknown>),
    catalogAdapter: BALL_GLOVE_BLUEPRINT_SOURCE_ID,
    premiumGloveSource: true,
    premiumMaker: maker,
    glovePosition: position,
    gloveSize: ballGloveSize(product),
    throwHand: ballGloveThrowHand(product),
    inStock: true,
  };
  return deal;
}

export async function syncBallGloveBlueprint(
  bulkUpsertDeals: (deals: InsertDeal[]) => Promise<{ created: number; updated: number }>,
  ensureSource: (id: string, name: string, url: string) => Promise<void>,
  fetchProducts: (url: string, maxPages: number, pageDelayMs: number) => Promise<ShopifyProduct[]> = fetchShopifyProducts,
): Promise<BallGloveBlueprintSyncResult> {
  const products = await fetchProducts(BALL_GLOVE_BLUEPRINT_URL, 2, 750);
  const deals = products
    .map(ballGloveBlueprintProductToDeal)
    .filter((deal): deal is InsertDeal => deal !== null);

  await ensureSource(
    BALL_GLOVE_BLUEPRINT_SOURCE_ID,
    BALL_GLOVE_BLUEPRINT_SOURCE_NAME,
    BALL_GLOVE_BLUEPRINT_URL,
  );
  const result = deals.length > 0
    ? await bulkUpsertDeals(deals)
    : { created: 0, updated: 0 };

  return {
    ...result,
    fetched: products.length,
    accepted: deals.length,
    skipped: products.length - deals.length,
  };
}
