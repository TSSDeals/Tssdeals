import type { InsertDeal } from "@shared/schema";
import { reclassifyBattingGloves } from "./ebay-api";
import { classifyDealAttributes } from "./sub-filter-classifier";

const NOTG_STORE_URL = "https://www.nameofthegame.com";
const NOTG_SOURCE_ID = "name-of-the-game";
const NOTG_API_BASE = `${NOTG_STORE_URL}/wp-json/wc/store/v1/products`;

interface WCImage {
  id: number;
  src: string;
  thumbnail: string;
  name: string;
  alt: string;
}

interface WCCategory {
  id: number;
  name: string;
  slug: string;
}

interface WCTag {
  id: number;
  name: string;
  slug: string;
}

interface WCPrices {
  price: string;
  regular_price: string;
  sale_price: string;
  currency_code: string;
  currency_minor_unit: number;
}

interface WCProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: string;
  on_sale: boolean;
  prices: WCPrices;
  images: WCImage[];
  categories: WCCategory[];
  tags: WCTag[];
  is_in_stock: boolean;
  is_purchasable: boolean;
}

const KNOWN_BRANDS = [
  "Rawlings", "Wilson", "Easton", "Marucci", "Louisville Slugger",
  "DeMarini", "Mizuno", "Under Armour", "Nike", "Adidas",
  "All-Star", "Franklin", "Nokona", "Victus", "Warstic",
  "Stinger", "Combat", "Combat MFG", "Axe", "Baum",
  "Demarini", "Worth", "Miken", "Anderson", "Boombah",
  "Evoshield", "EvoShield", "Lizard Skins", "Yardley",
];

const CATEGORY_SLUG_TO_EQUIPMENT: Record<string, { sportId: string; equipmentTypeId: string }> = {
  "all-bbcor-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "rawlings-bbbcor-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "slugger-bbcor": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "easton-bbcor": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "demarini-bbcor": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "marucci-bbcor": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "victus-bbcor": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "combat-mfg-bbcor": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "all-usssa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "easton-usssa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "demarini-usssa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "marucci-usssa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "slugger-usssa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "rawlings-usssa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "victus-usssa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "all-usa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "easton-usa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "demarini-usa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "marucci-usa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "slugger-usa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "rawlings-usa-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "all-youth-bats": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "all-fastpitch-bats": { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  "easton-fastpitch": { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  "demarini-fastpitch": { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  "slugger-fastpitch": { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  "marucci-fastpitch": { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  "rawlings-fastpitch": { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  "all-slowpitch-bats": { sportId: "slowpitch-softball", equipmentTypeId: "sp-bats" },
  "gloves-mitts": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  "bats-on-sale": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "seasonal-bat-deals": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "closeout-buys": { sportId: "baseball", equipmentTypeId: "bb-bats" },
  "gloves-on-sale": { sportId: "baseball", equipmentTypeId: "bb-gloves" },
};

function extractBrand(product: WCProduct): string | null {
  for (const tag of product.tags) {
    const brandMatch = KNOWN_BRANDS.find(
      (b) => b.toLowerCase() === tag.name.toLowerCase()
    );
    if (brandMatch) return brandMatch;
  }

  const text = product.name.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (text.includes(brand.toLowerCase())) return brand;
  }

  return null;
}

function classifyProduct(product: WCProduct): { sportId: string; equipmentTypeId: string } {
  for (const cat of product.categories) {
    const match = CATEGORY_SLUG_TO_EQUIPMENT[cat.slug];
    if (match) return match;
  }

  const name = product.name.toLowerCase();
  const tagSlugs = product.tags.map((t) => t.slug);
  const catSlugs = product.categories.map((c) => c.slug);
  const allText = `${name} ${tagSlugs.join(" ")} ${catSlugs.join(" ")}`;

  if (allText.includes("fastpitch") || allText.includes("fp-")) {
    if (allText.includes("glove") || allText.includes("mitt")) {
      return { sportId: "fastpitch-softball", equipmentTypeId: "fp-gloves" };
    }
    return { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" };
  }

  if (allText.includes("slowpitch") || allText.includes("sp-")) {
    if (allText.includes("glove") || allText.includes("mitt")) {
      return { sportId: "slowpitch-softball", equipmentTypeId: "sp-gloves" };
    }
    return { sportId: "slowpitch-softball", equipmentTypeId: "sp-bats" };
  }

  if (allText.includes("glove") || allText.includes("mitt")) {
    return { sportId: "baseball", equipmentTypeId: "bb-gloves" };
  }

  if (allText.includes("bat") || allText.includes("bbcor") || allText.includes("usssa") || allText.includes("usa-bat")) {
    return { sportId: "baseball", equipmentTypeId: "bb-bats" };
  }

  if (allText.includes("helmet") || allText.includes("protective") || allText.includes("guard")) {
    return { sportId: "baseball", equipmentTypeId: "bb-protective" };
  }

  if (allText.includes("cleat") || allText.includes("shoe") || allText.includes("apparel")) {
    return { sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" };
  }

  if (allText.includes("bag")) {
    return { sportId: "baseball", equipmentTypeId: "bb-bags" };
  }

  return { sportId: "baseball", equipmentTypeId: "bb-other" };
}

export function wcProductToDeal(product: WCProduct): InsertDeal | null {
  const priceCents = parseInt(product.prices.price, 10);
  if (isNaN(priceCents) || priceCents <= 0) return null;

  const regularPriceCents = parseInt(product.prices.regular_price, 10);
  let msrpCents: number | null = null;
  let percentOff: number | null = null;

  if (!isNaN(regularPriceCents) && regularPriceCents > priceCents) {
    msrpCents = regularPriceCents;
    percentOff = ((regularPriceCents - priceCents) / regularPriceCents) * 100;
  }

  const imageUrl = product.images?.[0]?.src ?? null;
  const { sportId, equipmentTypeId } = classifyProduct(product);

  let cleanName = product.name
    .replace(/\| ON SALE$/i, "")
    .replace(/\| Launch[^|]*$/i, "")
    .trim();

  const finalEquipmentTypeId = reclassifyBattingGloves(cleanName, sportId, equipmentTypeId);
  const { subFilterId, dropWeight, sizeNumber } = classifyDealAttributes(cleanName, finalEquipmentTypeId);

  return {
    sourceId: NOTG_SOURCE_ID,
    title: cleanName.slice(0, 200),
    brand: extractBrand(product),
    url: product.permalink,
    imageUrl,
    sportId,
    equipmentTypeId: finalEquipmentTypeId,
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
      wcProductId: product.id,
      wcSlug: product.slug,
      wcCategories: product.categories.map((c) => c.slug),
      wcTags: product.tags.map((t) => t.name),
      wcOnSale: product.on_sale,
      wcInStock: product.is_in_stock,
    },
  };
}

async function fetchWCProducts(maxPages: number = 20): Promise<WCProduct[]> {
  const allProducts: WCProduct[] = [];
  let page = 1;
  const perPage = 100;

  while (page <= maxPages) {
    const url = `${NOTG_API_BASE}?per_page=${perPage}&page=${page}&orderby=date&order=desc`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

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
      if (response.status === 400 || response.status === 404) break;
      throw new Error(`WC Store API error ${response.status}: ${await response.text()}`);
    }

    const products: WCProduct[] = await response.json();
    if (!Array.isArray(products) || products.length === 0) break;

    allProducts.push(...products);

    if (products.length < perPage) break;
    page++;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return allProducts;
}

export interface WCSyncResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  log: string[];
}

export async function syncNameOfTheGame(
  bulkUpsertDeals: (deals: InsertDeal[]) => Promise<{ created: number; updated: number }>,
  maxPages: number = 20,
): Promise<WCSyncResult> {
  const logMessages: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  logMessages.push(`Fetching products from ${NOTG_STORE_URL}...`);

  const products = await fetchWCProducts(maxPages);
  logMessages.push(`Fetched ${products.length} products`);

  const dealsToInsert: InsertDeal[] = [];

  for (const product of products) {
    const deal = wcProductToDeal(product);
    if (deal) {
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
