import type { InsertDeal } from "@shared/schema";
import { fetchShopifyProducts, shopifyProductToDeal } from "./shopify-sync";

export interface ShopifyStoreConfig {
  sourceId: string;
  name: string;
  url: string;
  defaultSportId: string;
  defaultEquipmentTypeId: string;
  maxPages?: number;
}

const TITLE_CLASSIFICATION: { pattern: RegExp; sportId: string; equipmentTypeId: string }[] = [
  { pattern: /\b(bbcor|usssa|usa bat|wood bat|maple bat|ash bat|birch bat|composite bat|alloy bat|hybrid bat|baseball bat|slowpitch bat|fastpitch bat|softball bat|training bat|fungo)\b/i, sportId: "baseball", equipmentTypeId: "bb-bats" },
  { pattern: /\b(baseball glove|softball glove|infield glove|outfield glove|pitcher.?s? glove|catcher.?s? mitt|first base mitt|fielding glove|infielder|outfielder)\b/i, sportId: "baseball", equipmentTypeId: "bb-gloves" },
  { pattern: /\b(batting glove|batting gloves|bat grip|grip tape|lizard skin)\b/i, sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  { pattern: /\b(necklace|chain|pendant|rope chain|sunglasses|shades|oakley|sliding mitt|sliding glove|arm sleeve|compression sleeve|wristband|headband|eye black|phiten|titanium necklace)\b/i, sportId: "baseball", equipmentTypeId: "bb-drip" },
  { pattern: /\b(batting helmet|catcher.?s? gear|catcher.?s? set|chest protector|leg guard|shin guard|face mask|face guard|jaw guard|elbow guard|protective)\b/i, sportId: "baseball", equipmentTypeId: "bb-protective" },
  { pattern: /\b(bat bag|equipment bag|backpack|duffle|duffel|wheeled bag|catcher.?s? bag)\b/i, sportId: "baseball", equipmentTypeId: "bb-other" },
  { pattern: /\b(baseball|softball|training ball|pitching machine|batting cage|batting tee|pitch.*trainer|hitting.*trainer|training aid)\b/i, sportId: "baseball", equipmentTypeId: "bb-training" },
  { pattern: /\b(baseball cleat|softball cleat|turf shoe|metal cleat|molded cleat)\b/i, sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  { pattern: /\b(fastpitch)\b/i, sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  { pattern: /\b(football helmet|shoulder pad|football glove|football cleat|girdle|visor)\b/i, sportId: "football", equipmentTypeId: "fb-protective" },
  { pattern: /\b(hockey stick|hockey skate|hockey helmet|hockey glove|hockey pad)\b/i, sportId: "hockey", equipmentTypeId: "hk-sticks" },
  { pattern: /\b(lacrosse head|lacrosse stick|lacrosse shaft|lacrosse glove|lacrosse pad)\b/i, sportId: "lacrosse", equipmentTypeId: "lax-sticks" },
  { pattern: /\b(soccer cleat|soccer ball|soccer shin|soccer jersey)\b/i, sportId: "soccer", equipmentTypeId: "soc-shoes-apparel" },
  { pattern: /\b(golf club|driver|fairway wood|iron set|putter|wedge|golf bag|golf glove|golf ball|golf shoe)\b/i, sportId: "golf", equipmentTypeId: "golf-other" },
  { pattern: /\b(fishing rod|reel|tackle|lure|fly rod|spinning rod|baitcast)\b/i, sportId: "fishing", equipmentTypeId: "fish-rods" },
  { pattern: /\b(basketball shoe|basketball|hoop)\b/i, sportId: "basketball", equipmentTypeId: "bk-shoes-apparel" },
  { pattern: /\b(tennis racket|tennis racquet|tennis ball|tennis shoe)\b/i, sportId: "tennis", equipmentTypeId: "ten-rackets" },
];

const PRODUCT_TYPE_CLASSIFICATION: Record<string, { sportId: string; equipmentTypeId: string }> = {
  "bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "bbcor bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "usssa bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "wood bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "metal bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "slowpitch": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "slowpitch bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "fastpitch bats": { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  "softball bats": { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  "top bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "bat": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "fielding gloves": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "gloves": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "glove": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "baseball gloves": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "baseball & softball gloves & mitts": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "catchers mitt": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "infield/outfield": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "catchers mitts": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "catchers gear": { sportId: "baseball", equipmentTypeId: "bb-protective" },
  "catcher's gear": { sportId: "baseball", equipmentTypeId: "bb-protective" },
  "batting helmets": { sportId: "baseball", equipmentTypeId: "bb-protective" },
  "protective gear": { sportId: "baseball", equipmentTypeId: "bb-protective" },
  "batting gloves": { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  "baseball & softball batting gloves": { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  "equipment bags": { sportId: "baseball", equipmentTypeId: "bb-other" },
  "bags": { sportId: "baseball", equipmentTypeId: "bb-other" },
  "accessories": { sportId: "baseball", equipmentTypeId: "bb-drip" },
  "necklaces": { sportId: "baseball", equipmentTypeId: "bb-drip" },
  "chains": { sportId: "baseball", equipmentTypeId: "bb-drip" },
  "sunglasses": { sportId: "baseball", equipmentTypeId: "bb-drip" },
  "arm sleeves": { sportId: "baseball", equipmentTypeId: "bb-drip" },
  "sliding mitts": { sportId: "baseball", equipmentTypeId: "bb-drip" },
  "wristbands": { sportId: "baseball", equipmentTypeId: "bb-drip" },
  "headbands": { sportId: "baseball", equipmentTypeId: "bb-drip" },
  "eye black": { sportId: "baseball", equipmentTypeId: "bb-drip" },
  "baseballs": { sportId: "baseball", equipmentTypeId: "bb-training" },
  "softballs": { sportId: "fastpitch-softball", equipmentTypeId: "fp-training" },
  "slowpitch softballs": { sportId: "fastpitch-softball", equipmentTypeId: "fp-training" },
  "training": { sportId: "baseball", equipmentTypeId: "bb-training" },
  "trainer": { sportId: "baseball", equipmentTypeId: "bb-training" },
  "footwear": { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  "cleats": { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  "apparel": { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  "hockey skates": { sportId: "hockey", equipmentTypeId: "hk-skates" },
  "hockey sticks": { sportId: "hockey", equipmentTypeId: "hk-sticks" },
  "hockey equipment": { sportId: "hockey", equipmentTypeId: "hk-protective" },
  "football helmets": { sportId: "football", equipmentTypeId: "fb-protective" },
  "football helmet replacement parts": { sportId: "football", equipmentTypeId: "fb-protective" },
  "football sp accessories": { sportId: "football", equipmentTypeId: "fb-protective" },
  "traditional defender": { sportId: "baseball", equipmentTypeId: "bb-protective" },
};

function classifyProduct(
  title: string,
  productType: string,
  tags: string[],
  defaultSportId: string,
  defaultEquipmentTypeId: string,
): { sportId: string; equipmentTypeId: string } {
  // Cricket bats are not baseball/softball bats — never let any rule (including
  // store defaults) classify a cricket product as a bat type.
  const isCricket = /\bcricket\b/i.test(`${title} ${productType} ${tags.join(" ")}`);
  const BAT_EQ_IDS = ["bb-bats", "fp-bats", "sp-bats"];
  const guard = (r: { sportId: string; equipmentTypeId: string }) =>
    isCricket && BAT_EQ_IDS.includes(r.equipmentTypeId)
      ? { sportId: r.sportId, equipmentTypeId: "bb-other" }
      : r;

  const ptLower = productType.toLowerCase().trim();
  if (!isCricket && ptLower && PRODUCT_TYPE_CLASSIFICATION[ptLower]) {
    return PRODUCT_TYPE_CLASSIFICATION[ptLower];
  }

  const fullText = `${title} ${productType}`;
  for (const rule of TITLE_CLASSIFICATION) {
    if (rule.pattern.test(fullText)) {
      return guard({ sportId: rule.sportId, equipmentTypeId: rule.equipmentTypeId });
    }
  }

  const tagText = tags.join(" ").toLowerCase();
  for (const rule of TITLE_CLASSIFICATION) {
    if (rule.pattern.test(tagText)) {
      return guard({ sportId: rule.sportId, equipmentTypeId: rule.equipmentTypeId });
    }
  }

  return guard({ sportId: defaultSportId, equipmentTypeId: defaultEquipmentTypeId });
}

const SKIP_TYPES = new Set([
  "extend service contract",
  "return,package_protection",
  "insurance",
  "gift card",
  "gift cards",
  "snap cart drawer - shipping protection",
  "snap cart drawer - gift wrapping",
  "test",
]);

export const SHOPIFY_STORES: ShopifyStoreConfig[] = [
  { sourceId: "headbanger-sports", name: "Headbanger Sports", url: "https://www.headbangersports.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-other", maxPages: 30 },
  { sourceId: "tater-baseball", name: "Tater Baseball", url: "https://www.taterbaseball.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-bats" },
  { sourceId: "chandler-bats", name: "Chandler Bats", url: "https://www.chandlerbats.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-bats" },
  { sourceId: "axe-bat", name: "Axe Bat", url: "https://www.axebat.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-bats" },
  { sourceId: "hit-a-double", name: "Hit A Double", url: "https://www.hitadouble.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-other", maxPages: 8 },
  { sourceId: "cheapbats", name: "CheapBats", url: "https://www.cheapbats.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-bats", maxPages: 8 },
  { sourceId: "force3-pro-gear", name: "Force3 Pro Gear", url: "https://www.force3progear.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-protective" },
  { sourceId: "diamond-sport-gear", name: "Diamond Sport Gear", url: "https://www.diamondsportgear.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-other", maxPages: 8 },
  { sourceId: "flatbill-baseball", name: "Flatbill Baseball", url: "https://www.flatbillbaseball.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-other" },
  { sourceId: "baseballism", name: "Baseballism", url: "https://www.baseballism.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-shoes-apparel", maxPages: 8 },
  { sourceId: "baseball-bargains", name: "Baseball Bargains", url: "https://www.baseballbargains.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-other" },
  { sourceId: "direct-sports", name: "Direct Sports", url: "https://www.directsports.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-other" },
  { sourceId: "smash-it-sports", name: "Smash It Sports", url: "https://www.smashitsports.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-bats", maxPages: 8 },
  { sourceId: "warstic", name: "Warstic", url: "https://www.warstic.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-bats" },
  { sourceId: "bruce-bolt", name: "Bruce Bolt", url: "https://www.brucebolt.us", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-shoes-apparel" },
  { sourceId: "resilient-gloves", name: "Resilient Gloves", url: "https://www.resilientgloves.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-gloves" },
  { sourceId: "guardian-baseball", name: "Guardian Baseball", url: "https://www.guardianbaseball.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-other" },
  { sourceId: "bamboobat", name: "BamBooBat", url: "https://www.bamboobat.com", defaultSportId: "baseball", defaultEquipmentTypeId: "bb-bats" },
];

const EXTRA_BRANDS = [
  "Tater", "Chandler", "Axe", "BamBooBat", "Headbanger",
  "Force3", "Bruce Bolt", "Resilient", "Guardian", "Smash It",
  "Flatbill", "Baseballism", "Hit A Double", "Diamond Sport",
  "Miken", "Worth", "Anderson", "Anarchy", "Monsta", "Dirty South",
  "Nunn",
];

function log(message: string, prefix: string = "shopify-multi") {
  const time = new Date().toLocaleTimeString("en-US", { hour12: true });
  console.log(`${time} [${prefix}] ${message}`);
}

export interface MultiStoreSyncResult {
  totalCreated: number;
  totalUpdated: number;
  totalErrors: number;
  breakdown: Record<string, { created: number; updated: number; products: number; errors: number }>;
}

export async function syncMultipleShopifyStores(
  bulkUpsertDeals: (deals: InsertDeal[]) => Promise<{ created: number; updated: number }>,
  ensureSource: (id: string, name: string, url: string) => Promise<void>,
): Promise<MultiStoreSyncResult> {
  const breakdown: MultiStoreSyncResult["breakdown"] = {};
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const store of SHOPIFY_STORES) {
    try {
      await ensureSource(store.sourceId, store.name, store.url);

      log(`Syncing ${store.name} (${store.url})...`);
      const products = await fetchShopifyProducts(store.url, store.maxPages ?? 10);
      log(`  Fetched ${products.length} products from ${store.name}`);

      const dealsToInsert: InsertDeal[] = [];
      let skipped = 0;

      for (const product of products) {
        const ptLower = (product.product_type || "").toLowerCase().trim();
        if (SKIP_TYPES.has(ptLower)) {
          skipped++;
          continue;
        }

        const { sportId, equipmentTypeId } = classifyProduct(
          product.title,
          product.product_type,
          product.tags,
          store.defaultSportId,
          store.defaultEquipmentTypeId,
        );

        const deal = shopifyProductToDeal(
          product,
          sportId,
          equipmentTypeId,
          store.url,
          store.sourceId,
        );

        if (deal) {
          if (store.autoIncluded) deal.autoIncluded = true;
          dealsToInsert.push(deal);
        } else {
          skipped++;
        }
      }

      if (dealsToInsert.length > 0) {
        const result = await bulkUpsertDeals(dealsToInsert);
        breakdown[store.sourceId] = { created: result.created, updated: result.updated, products: products.length, errors: 0 };
        totalCreated += result.created;
        totalUpdated += result.updated;
        log(`  ${store.name}: ${result.created} new, ${result.updated} updated, ${skipped} skipped`);
      } else {
        breakdown[store.sourceId] = { created: 0, updated: 0, products: products.length, errors: 0 };
        log(`  ${store.name}: no deals to insert (${skipped} skipped)`);
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch (err: any) {
      log(`  ${store.name} error: ${err.message}`);
      breakdown[store.sourceId] = { created: 0, updated: 0, products: 0, errors: 1 };
      totalErrors++;
    }
  }

  log(`Multi-store sync complete: ${totalCreated} created, ${totalUpdated} updated across ${SHOPIFY_STORES.length} stores`);

  return { totalCreated, totalUpdated, totalErrors, breakdown };
}
