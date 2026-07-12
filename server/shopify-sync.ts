import type { InsertDeal } from "@shared/schema";
import { reclassifyBattingGloves } from "./ebay-api";
import { classifyDealAttributes } from "./sub-filter-classifier";

const TWIN_SEAM_STORE_URL = "https://www.twinseamsports.com";
const TWIN_SEAM_SOURCE_ID = "twin-seam-sports";

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  available: boolean;
  sku: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

interface ShopifyImage {
  id: number;
  src: string;
  width: number;
  height: number;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  created_at: string;
  updated_at: string;
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

interface CollectionMapping {
  handle: string;
  sportId: string;
  equipmentTypeId: string;
  label: string;
}

const COLLECTION_MAP: CollectionMapping[] = [
  { handle: "baseball-softball-gloves-mitts", sportId: "baseball", equipmentTypeId: "bb-gloves", label: "Baseball Gloves & Mitts" },
  { handle: "baseball-softball-gloves", sportId: "baseball", equipmentTypeId: "bb-gloves", label: "Baseball Gloves" },
  { handle: "baseball-infielder-gloves", sportId: "baseball", equipmentTypeId: "bb-gloves", label: "Infielder Gloves" },
  { handle: "outfielder-gloves", sportId: "baseball", equipmentTypeId: "bb-gloves", label: "Outfielder Gloves" },
  { handle: "pitchers-gloves", sportId: "baseball", equipmentTypeId: "bb-gloves", label: "Pitcher's Gloves" },
  { handle: "baseball-softball-bats", sportId: "baseball", equipmentTypeId: "bb-bats", label: "Baseball & Softball Bats" },
  { handle: "baseball-bats", sportId: "baseball", equipmentTypeId: "bb-bats", label: "Baseball Bats" },
  { handle: "batting-helmets", sportId: "baseball", equipmentTypeId: "bb-protective", label: "Batting Helmets" },
  { handle: "baseballs-training-items-other-equipment", sportId: "baseball", equipmentTypeId: "bb-training", label: "Baseballs & Training" },
  { handle: "baseball-and-softball-batting-gloves", sportId: "baseball", equipmentTypeId: "bb-shoes-apparel", label: "Batting Gloves" },
  { handle: "softball-bats", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats", label: "Softball Bats" },
  { handle: "golf-clubs", sportId: "golf", equipmentTypeId: "golf-drivers", label: "Golf Clubs" },
  { handle: "golf-gear", sportId: "golf", equipmentTypeId: "golf-other", label: "Golf Gear" },
  { handle: "fishing", sportId: "fishing", equipmentTypeId: "fish-rods", label: "Fishing" },
  { handle: "fly-fishing", sportId: "fishing", equipmentTypeId: "fish-lures-line", label: "Fly Fishing" },
  { handle: "football", sportId: "football", equipmentTypeId: "fb-protective", label: "Football" },
  { handle: "soccer", sportId: "soccer", equipmentTypeId: "soc-shoes-apparel", label: "Soccer" },
  { handle: "basketball-1", sportId: "basketball", equipmentTypeId: "bk-balls", label: "Basketball" },
  { handle: "bicycles-e-bikes-scooters-accessories", sportId: "cycling", equipmentTypeId: "cyc-bikes", label: "Cycling" },
  { handle: "twin-seam-stock", sportId: "baseball", equipmentTypeId: "bb-other", label: "Twin Seam Stock" },
  { handle: "tss-picks", sportId: "baseball", equipmentTypeId: "bb-other", label: "Twin Seam Top Picks" },
];

const PRODUCT_TYPE_REFINEMENTS: Record<string, { sportId: string; equipmentTypeId: string }> = {
  "baseball & softball gloves & mitts": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "baseball & softball gloves": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "baseball glove": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "wood baseball bat": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "usssa bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "baseballs & bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "fastpitch helmet": { sportId: "fastpitch-softball", equipmentTypeId: "fp-protective" },
  "baseball helmet": { sportId: "baseball", equipmentTypeId: "bb-protective" },
  "jaw flap": { sportId: "baseball", equipmentTypeId: "bb-protective" },
  "mask": { sportId: "baseball", equipmentTypeId: "bb-protective" },
  "catcher's equipment": { sportId: "baseball", equipmentTypeId: "bb-protective" },
  "fastpitch catcher's equip.": { sportId: "fastpitch-softball", equipmentTypeId: "fp-protective" },
  "training bat": { sportId: "baseball", equipmentTypeId: "bb-training" },
  "training baseball": { sportId: "baseball", equipmentTypeId: "bb-training" },
  "batting gloves": { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  "batting glove": { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  "men's batting glove": { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  "women's batting glove": { sportId: "fastpitch-softball", equipmentTypeId: "fp-shoes-apparel" },
  "youth batting glove": { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  "bags": { sportId: "baseball", equipmentTypeId: "bb-other" },
  "pad": { sportId: "baseball", equipmentTypeId: "bb-protective" },
  "golf fairway woods": { sportId: "golf", equipmentTypeId: "golf-drivers" },
  "golf clubs": { sportId: "golf", equipmentTypeId: "golf-drivers" },
  "used clubs": { sportId: "golf", equipmentTypeId: "golf-other" },
  "protective gear": { sportId: "football", equipmentTypeId: "fb-protective" },
  "basketballs": { sportId: "basketball", equipmentTypeId: "bk-balls" },
  "basketball hoops": { sportId: "basketball", equipmentTypeId: "bk-hoops-nets" },
  "soccer shin guards": { sportId: "soccer", equipmentTypeId: "soc-shoes-apparel" },
  "size 5": { sportId: "soccer", equipmentTypeId: "soc-balls" },
  "size 4": { sportId: "soccer", equipmentTypeId: "soc-balls" },
  "ball": { sportId: "soccer", equipmentTypeId: "soc-balls" },
  "men's boots": { sportId: "soccer", equipmentTypeId: "soc-shoes-apparel" },
  "flies": { sportId: "fishing", equipmentTypeId: "fish-lures-line" },
  "hooks": { sportId: "fishing", equipmentTypeId: "fish-lures-line" },
};

async function fetchCollectionProducts(
  storeUrl: string,
  collectionHandle: string,
  maxPages: number = 30,
): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let page = 1;
  const limit = 250;

  while (page <= maxPages) {
    const url = `${storeUrl}/collections/${collectionHandle}/products.json?limit=${limit}&page=${page}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (response.status === 404) return allProducts;
      throw new Error(`Shopify collection fetch error ${response.status}`);
    }

    const data = (await response.json()) as ShopifyProductsResponse;
    if (!data.products || data.products.length === 0) break;

    allProducts.push(...data.products);

    if (data.products.length < limit) break;
    page++;
  }

  return allProducts;
}

export async function fetchShopifyProducts(
  storeUrl: string = TWIN_SEAM_STORE_URL,
  maxPages: number = 20,
): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let page = 1;
  const limit = 250;

  while (page <= maxPages) {
    const url = `${storeUrl}/products.json?limit=${limit}&page=${page}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Shopify fetch error ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as ShopifyProductsResponse;
    if (!data.products || data.products.length === 0) break;

    allProducts.push(...data.products);

    if (data.products.length < limit) break;
    page++;
  }

  return allProducts;
}

const KNOWN_BRANDS = [
  "Rawlings", "Wilson", "Mizuno", "Easton", "Louisville Slugger", "Marucci",
  "DeMarini", "Nokona", "Akadema", "44 Pro", "Soto", "Ryu",
  "Nike", "Adidas", "Under Armour", "New Balance", "Puma", "Reebok", "ASICS",
  "TaylorMade", "Callaway", "Titleist", "Ping", "Cobra", "Cleveland",
  "CCM", "Bauer", "Warrior", "STX", "Maverik",
  "Shimano", "Daiwa",
  "Leggera", "Junkei", "Kubota Slugger", "JB Wagyu", "Emery",
  "Franklin", "Riddell", "Schutt",
  "Warstic", "Stinger", "Victus", "Demarini",
  "GOAT Athletics", "Peligro", "VukGripz", "ThumbPRO",
  "Tater", "Chandler", "Axe", "BamBooBat", "Headbanger",
  "Force3", "Bruce Bolt", "Resilient", "Guardian", "Smash It",
  "Miken", "Worth", "Anderson", "Anarchy", "Monsta", "Dirty South",
  "Boombah", "True Temper", "Old Hickory", "Sam Bat", "Dove Tail",
];

function extractBrand(product: ShopifyProduct): string | null {
  const text = `${product.title} ${product.vendor}`.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (text.includes(brand.toLowerCase())) {
      return brand;
    }
  }
  if (product.vendor && product.vendor !== "LuxuryLifeWay Online Store" && product.vendor !== "Shopify Collective") {
    return product.vendor;
  }
  return null;
}

export function shopifyProductToDeal(
  product: ShopifyProduct,
  sportId: string,
  equipmentTypeId: string,
  storeUrl: string = TWIN_SEAM_STORE_URL,
  sourceId: string = TWIN_SEAM_SOURCE_ID,
): InsertDeal | null {
  const bestVariant = product.variants.find((v) => v.available) ?? product.variants[0];
  if (!bestVariant) return null;

  const priceCents = Math.round(parseFloat(bestVariant.price) * 100);
  if (priceCents <= 0) return null;

  let msrpCents: number | null = null;
  let percentOff: number | null = null;

  if (bestVariant.compare_at_price) {
    msrpCents = Math.round(parseFloat(bestVariant.compare_at_price) * 100);
    if (msrpCents > priceCents) {
      percentOff = ((msrpCents - priceCents) / msrpCents) * 100;
    }
  }

  const imageUrl = product.images?.[0]?.src ?? null;
  const productUrl = `${storeUrl}/products/${product.handle}`;

  let finalSportId = sportId;
  let finalEquipmentTypeId = equipmentTypeId;
  const productTypeLower = (product.product_type || "").toLowerCase();
  if (PRODUCT_TYPE_REFINEMENTS[productTypeLower]) {
    finalSportId = PRODUCT_TYPE_REFINEMENTS[productTypeLower].sportId;
    finalEquipmentTypeId = PRODUCT_TYPE_REFINEMENTS[productTypeLower].equipmentTypeId;
  }

  const reclassifiedTypeId = reclassifyBattingGloves(product.title, finalSportId, finalEquipmentTypeId);
  const { subFilterId, dropWeight, sizeNumber } = classifyDealAttributes(product.title, reclassifiedTypeId);

  return {
    sourceId,
    title: product.title.slice(0, 200),
    brand: extractBrand(product),
    url: productUrl,
    imageUrl,
    sportId: finalSportId,
    equipmentTypeId: reclassifiedTypeId,
    subFilterId,
    dropWeight,
    sizeNumber,
    condition: "new" as const,
    currency: "USD",
    msrpCents,
    manufacturerMsrpCents: null,
    msrpSource: msrpCents ? "retailer" : null,
    msrpVerified: false,
    priceCents,
    percentOff: percentOff ? percentOff.toFixed(3) : null,
    isBuyItNow: true,
    autoIncluded: false,
    autoIncludeRuleId: null,
    raw: {
      shopifyProductId: product.id,
      shopifyVariantId: bestVariant.id,
      shopifyHandle: product.handle,
      shopifyProductType: product.product_type,
      shopifyTags: product.tags,
      shopifySku: bestVariant.sku,
      shopifyVendor: product.vendor,
    },
  };
}

export interface ShopifySyncResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  log: string[];
}

export async function syncShopifyStore(
  storeUrl: string = TWIN_SEAM_STORE_URL,
  bulkUpsertDeals: (deals: InsertDeal[]) => Promise<{ created: number; updated: number }>,
  filterSportId?: string,
  maxPages: number = 30,
): Promise<ShopifySyncResult> {
  const log: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let totalProducts = 0;
  const seenProductIds = new Set<number>();
  const dealsToInsert: InsertDeal[] = [];

  const collectionsToSync = filterSportId
    ? COLLECTION_MAP.filter((c) => c.sportId === filterSportId)
    : COLLECTION_MAP;

  log.push(`Syncing ${collectionsToSync.length} collections from ${storeUrl}...`);

  for (const col of collectionsToSync) {
    try {
      log.push(`Fetching collection: ${col.label} (${col.handle})...`);
      const products = await fetchCollectionProducts(storeUrl, col.handle, maxPages);

      let colDeals = 0;
      for (const product of products) {
        if (seenProductIds.has(product.id)) continue;
        seenProductIds.add(product.id);
        totalProducts++;

        const deal = shopifyProductToDeal(product, col.sportId, col.equipmentTypeId, storeUrl);
        if (deal) {
          dealsToInsert.push(deal);
          colDeals++;
        } else {
          skipped++;
        }
      }

      log.push(`  ${products.length} products fetched, ${colDeals} deals (${products.length - colDeals} skipped/dupes)`);

      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err: any) {
      log.push(`  Error on ${col.handle}: ${err.message}`);
    }
  }

  if (dealsToInsert.length > 0) {
    log.push(`Upserting ${dealsToInsert.length} sporting goods deals...`);
    const result = await bulkUpsertDeals(dealsToInsert);
    created = result.created;
    updated = result.updated;
    log.push(`Done: ${result.created} new, ${result.updated} updated`);
  } else {
    log.push(`No sporting goods products found in collections`);
  }

  log.push(`Summary: ${totalProducts} unique products across ${collectionsToSync.length} collections, ${dealsToInsert.length} deals, ${skipped} skipped`);

  return { created, updated, skipped, total: totalProducts, log };
}
