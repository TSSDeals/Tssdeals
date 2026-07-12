import type { InsertDeal } from "@shared/schema";
import { fetchShopifyProducts, shopifyProductToDeal } from "./shopify-sync";

const BASEBALL_RESALE_URL = "https://nunnbaseball.shop";
const BASEBALL_RESALE_SOURCE_ID = "baseball-resale";

const TAG_TO_EQUIPMENT: Record<string, { sportId: string; equipmentTypeId: string }> = {
  "gloves": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "infield": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "outfield": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "first base": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "catchers": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "batting gloves": { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  "cleats": { sportId: "baseball", equipmentTypeId: "bb-cleats" },
  "bags": { sportId: "baseball", equipmentTypeId: "bb-bags" },
};

function classifyByTags(tags: string[]): { sportId: string; equipmentTypeId: string } {
  const lowerTags = tags.map((t) => t.toLowerCase());
  for (const tag of lowerTags) {
    const match = TAG_TO_EQUIPMENT[tag];
    if (match) return match;
  }
  return { sportId: "baseball", equipmentTypeId: "bb-other" };
}

export interface BaseballResaleSyncResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  log: string[];
}

export async function syncBaseballResale(
  bulkUpsertDeals: (deals: InsertDeal[]) => Promise<{ created: number; updated: number }>,
  maxPages: number = 20,
): Promise<BaseballResaleSyncResult> {
  const logMessages: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  logMessages.push(`Fetching products from Baseball Resale (${BASEBALL_RESALE_URL})...`);

  const products = await fetchShopifyProducts(BASEBALL_RESALE_URL, maxPages);
  logMessages.push(`Fetched ${products.length} products`);

  const dealsToInsert: InsertDeal[] = [];

  for (const product of products) {
    const { sportId, equipmentTypeId } = classifyByTags(product.tags);

    const titleLower = product.title.toLowerCase();
    let condition: "new" | "used" | "refurbished" = "used";
    const bodyText = ((product as any).body_html || "").toLowerCase();
    if (bodyText.includes("condition - new") || bodyText.includes("condition: new")) {
      condition = "new";
    } else if (titleLower.includes("new")) {
      condition = "new";
    }

    const deal = shopifyProductToDeal(
      product,
      sportId,
      equipmentTypeId,
      BASEBALL_RESALE_URL,
      BASEBALL_RESALE_SOURCE_ID,
    );

    if (deal) {
      deal.condition = condition;
      deal.autoIncluded = true;
      dealsToInsert.push(deal);
    } else {
      skipped++;
    }
  }

  logMessages.push(`Converted ${dealsToInsert.length} deals (${skipped} skipped)`);

  if (dealsToInsert.length > 0) {
    const result = await bulkUpsertDeals(dealsToInsert);
    created = result.created;
    updated = result.updated;
    logMessages.push(`Upserted: ${created} new, ${updated} updated`);
  }

  logMessages.push(`Summary: ${products.length} products, ${dealsToInsert.length} deals, ${skipped} skipped`);

  return { created, updated, skipped, total: products.length, log: logMessages };
}
