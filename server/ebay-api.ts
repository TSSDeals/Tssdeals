import type { InsertDeal } from "@shared/schema";
import { classifyDealAttributes } from "./sub-filter-classifier";
import { ebayErrorFromResponse, logEbayError } from "./ebay-errors";

const EBAY_AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

interface EbayTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface EbayItemSummary {
  itemId: string;
  title: string;
  price: { value: string; currency: string };
  condition: string;
  conditionId: string;
  itemWebUrl: string;
  image?: { imageUrl: string };
  thumbnailImages?: Array<{ imageUrl: string }>;
  seller?: { username: string; feedbackPercentage: string; feedbackScore: number };
  buyingOptions?: string[];
  categories?: Array<{ categoryId: string; categoryName: string }>;
  itemLocation?: { postalCode: string; country: string };
  marketingPrice?: {
    originalPrice: { value: string; currency: string };
    discountPercentage: string;
    discountAmount: { value: string; currency: string };
    priceTreatment: string;
  };
}

interface EbaySearchResponse {
  total: number;
  limit: number;
  offset: number;
  itemSummaries?: EbayItemSummary[];
  warnings?: Array<{ message: string }>;
  errors?: Array<{ message: string; errorId: number }>;
}

interface EbaySyncOptions {
  keywords: string;
  sportId: string;
  equipmentTypeId: string;
  maxResults?: number;
  condition?: "new" | "preowned" | "all";
  maxPrice?: number;
  sellerUsername?: string;
  categoryId?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getEbayToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(EBAY_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });

  if (!response.ok) {
    const error = await ebayErrorFromResponse(response, "application token request");
    logEbayError(error);
    throw error;
  }

  const data = (await response.json()) as EbayTokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

export async function searchEbayProducts(
  clientId: string,
  clientSecret: string,
  options: EbaySyncOptions,
): Promise<EbayItemSummary[]> {
  const token = await getEbayToken(clientId, clientSecret);
  const pageSize = 200;
  const maxTotal = options.maxResults || 10000;
  const maxPages = Math.ceil(maxTotal / pageSize);

  const baseParams = new URLSearchParams({
    category_ids: options.categoryId || "888",
    limit: String(pageSize),
    fieldgroups: "EXTENDED",
  });

  if (options.keywords) {
    baseParams.set("q", options.keywords);
  }

  const filters: string[] = [];
  filters.push("buyingOptions:{FIXED_PRICE}");
  filters.push("deliveryCountry:US");

  if (options.condition === "new") {
    filters.push("conditions:{NEW}");
  } else if (options.condition === "preowned") {
    filters.push("conditions:{USED|VERY_GOOD|GOOD|ACCEPTABLE}");
  }

  if (options.maxPrice) {
    filters.push(`price:[..${options.maxPrice}],priceCurrency:USD`);
  }

  if (options.sellerUsername) {
    filters.push(`sellers:{${options.sellerUsername}}`);
  }

  if (filters.length > 0) {
    baseParams.set("filter", filters.join(","));
  }

  baseParams.set("sort", "newlyListed");

  const allItems: EbayItemSummary[] = [];

  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    if (offset >= 10000) break;

    const params = new URLSearchParams(baseParams);
    if (offset > 0) {
      params.set("offset", String(offset));
    }

    const url = `${EBAY_BROWSE_URL}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        cachedToken = null;
      }
      const error = await ebayErrorFromResponse(response, "public deal search");
      logEbayError(error);
      throw error;
    }

    const data = (await response.json()) as EbaySearchResponse;

    if (data.errors?.length) {
      throw new Error(`eBay API errors: ${data.errors.map((e) => e.message).join(", ")}`);
    }

    const items = data.itemSummaries ?? [];
    allItems.push(...items);

    if (items.length < pageSize || allItems.length >= maxTotal) {
      break;
    }
  }

  return allItems.slice(0, maxTotal);
}

const COLLECTIBLE_BLOCKLIST = [
  "trading card", "baseball card", "football card", "basketball card", "hockey card",
  "rookie card", "sports card", "card lot", "card collection", "card set",
  "autograph card", "auto card", "patch card", "relic card", "insert card",
  "refractor", "prizm", "topps", "panini", "upper deck", "bowman",
  "bobblehead", "figurine", "action figure",
  "memorabilia", "collectible", "collectable",
  "signed photo", "autographed photo", "signed ball", "autographed ball",
  "pennant", "plaque", "trophy", "medal",
  "ticket stub", "game ticket", "program booklet",
  "poster", "lithograph", "print art",
  "funko pop",
];

function isCollectible(title: string): boolean {
  const lower = title.toLowerCase();
  return COLLECTIBLE_BLOCKLIST.some((term) => lower.includes(term));
}

const GLOVES_TO_BATTING_MAP: Record<string, string> = {
  "bb-gloves": "bb-batting-gloves",
  "fp-gloves": "fp-batting-gloves",
  "sp-gloves": "sp-batting-gloves",
};

export function reclassifyBattingGloves(title: string, sportId: string, equipmentTypeId: string): string {
  if (!GLOVES_TO_BATTING_MAP[equipmentTypeId]) return equipmentTypeId;
  const lower = title.toLowerCase();
  if (lower.includes("batting glove") || lower.includes("batting gloves")) {
    return GLOVES_TO_BATTING_MAP[equipmentTypeId];
  }
  return equipmentTypeId;
}

export function ebayItemToDeal(
  item: EbayItemSummary,
  sportId: string,
  equipmentTypeId: string,
): InsertDeal | null {
  if (isCollectible(item.title)) return null;

  const priceCents = Math.round(parseFloat(item.price.value) * 100);
  if (priceCents <= 0) return null;

  let msrpCents: number | null = null;
  let percentOff: number | null = null;

  if (item.marketingPrice?.originalPrice) {
    msrpCents = Math.round(parseFloat(item.marketingPrice.originalPrice.value) * 100);
    if (msrpCents > priceCents) {
      percentOff = ((msrpCents - priceCents) / msrpCents) * 100;
    }
  }

  const conditionStr = (item.condition || "").toLowerCase();
  const condition: "new" | "preowned" =
    conditionStr.includes("new") ? "new" : "preowned";

  const imageUrl =
    item.image?.imageUrl ||
    (item.thumbnailImages?.[0]?.imageUrl) ||
    null;

  const isBuyItNow = item.buyingOptions?.includes("FIXED_PRICE") ?? true;

  const finalEquipmentTypeId = reclassifyBattingGloves(item.title, sportId, equipmentTypeId);
  const { subFilterId, dropWeight, sizeNumber } = classifyDealAttributes(item.title, finalEquipmentTypeId);

  return {
    sourceId: "ebay",
    title: item.title.slice(0, 200),
    brand: extractBrand(item.title),
    url: item.itemWebUrl,
    imageUrl,
    sportId,
    equipmentTypeId: finalEquipmentTypeId,
    subFilterId,
    dropWeight,
    sizeNumber,
    condition,
    currency: item.price.currency || "USD",
    msrpCents,
    manufacturerMsrpCents: null,
    msrpSource: msrpCents ? "retailer" : undefined,
    msrpVerified: false,
    priceCents,
    percentOff: percentOff ? percentOff.toFixed(3) : null,
    isBuyItNow,
    autoIncluded: false,
    autoIncludeRuleId: null,
    raw: {
      ebayItemId: item.itemId,
      ebayCondition: item.condition,
      ebayConditionId: item.conditionId,
      ebaySeller: item.seller?.username,
      ebaySellerFeedback: item.seller?.feedbackPercentage,
    },
  };
}

const KNOWN_BRANDS = [
  "Rawlings", "Wilson", "Mizuno", "Easton", "Louisville Slugger", "Marucci",
  "DeMarini", "Nokona", "Akadema", "44 Pro", "Soto", "Ryu",
  "Nike", "Adidas", "Under Armour", "New Balance", "Puma", "Reebok", "ASICS",
  "TaylorMade", "Callaway", "Titleist", "Ping", "Cobra", "Cleveland", "Bridgestone", "Srixon",
  "CCM", "Bauer", "Warrior", "STX", "Maverik",
  "Shimano", "Daiwa", "Penn", "Ugly Stik", "Abu Garcia",
  "Mikasa", "Molten", "Spalding",
  "Trek", "Specialized", "Giant", "Cannondale",
  "Speedo", "TYR", "Arena",
  "Franklin", "Riddell", "Schutt", "Xenith",
  "Leggera", "Junkei", "Kubota Slugger", "JB Wagyu", "Emery",
  "Innova", "Discraft", "MVP", "Axiom", "Streamline", "Dynamic Discs", "Latitude 64",
  "Westside Discs", "Kastaplast", "Discmania", "Prodigy", "Thought Space Athletics",
];

function extractBrand(title: string): string | null {
  const titleLower = title.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (titleLower.includes(brand.toLowerCase())) {
      return brand;
    }
  }
  return null;
}

interface EbayDealItem {
  itemId: string;
  title: string;
  itemWebUrl: string;
  image?: { imageUrl: string };
  price: { value: string; currency: string };
  marketingPrice?: {
    originalPrice: { value: string; currency: string };
    discountPercentage: string;
    discountAmount: { value: string; currency: string };
    priceTreatment: string;
  };
  categoryId?: string;
  categoryAncestorIds?: string[];
  commissionable?: boolean;
}

interface EbayDealItemsResponse {
  dealItems?: EbayDealItem[];
  total: number;
  limit: number;
  offset: number;
  errors?: Array<{ message: string; errorId: number }>;
}

export async function searchEbayDealItems(
  clientId: string,
  clientSecret: string,
  options: {
    categoryIds?: string;
    limit?: number;
    maxResults?: number;
  } = {},
): Promise<EbayDealItem[]> {
  const token = await getEbayToken(clientId, clientSecret);
  const pageSize = Math.min(options.limit || 200, 200);
  const maxTotal = options.maxResults || 1000;
  const allItems: EbayDealItem[] = [];
  let offset = 0;

  while (allItems.length < maxTotal) {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (options.categoryIds) {
      params.set("category_ids", options.categoryIds);
    }

    const url = `https://api.ebay.com/buy/deal/v1/deal_item?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401) {
        cachedToken = null;
        throw new Error("eBay token expired or invalid. Will retry with fresh token on next request.");
      }
      if (response.status === 403 || response.status === 404) {
        throw new Error(`eBay Deal Item API not available (${response.status}). You may need to request access to the buy.deal scope from eBay. Details: ${text.slice(0, 300)}`);
      }
      throw new Error(`eBay Deal API error ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = (await response.json()) as EbayDealItemsResponse;

    if (data.errors?.length) {
      throw new Error(`eBay Deal API errors: ${data.errors.map((e) => e.message).join(", ")}`);
    }

    const items = data.dealItems ?? [];
    allItems.push(...items);
    offset += pageSize;

    if (items.length === 0 || offset >= data.total || allItems.length >= maxTotal) {
      break;
    }
  }

  return allItems.slice(0, maxTotal);
}

export function ebayDealItemToDeal(
  item: EbayDealItem,
  sportId: string,
  equipmentTypeId: string,
): InsertDeal | null {
  if (isCollectible(item.title)) return null;

  const priceCents = Math.round(parseFloat(item.price.value) * 100);
  if (priceCents <= 0) return null;

  let msrpCents: number | null = null;
  let percentOff: number | null = null;

  if (item.marketingPrice?.originalPrice) {
    msrpCents = Math.round(parseFloat(item.marketingPrice.originalPrice.value) * 100);
    if (msrpCents > priceCents) {
      percentOff = ((msrpCents - priceCents) / msrpCents) * 100;
    }
  }

  const { subFilterId: subFilterId2, dropWeight: dropWeight2, sizeNumber: sizeNumber2 } = classifyDealAttributes(item.title, equipmentTypeId);

  return {
    sourceId: "ebay",
    title: item.title.slice(0, 200),
    brand: extractBrand(item.title),
    url: item.itemWebUrl,
    imageUrl: item.image?.imageUrl || null,
    sportId,
    equipmentTypeId,
    subFilterId: subFilterId2,
    dropWeight: dropWeight2,
    sizeNumber: sizeNumber2,
    condition: "new" as const,
    currency: item.price.currency || "USD",
    msrpCents,
    manufacturerMsrpCents: null,
    msrpSource: msrpCents ? "retailer" : undefined,
    msrpVerified: false,
    priceCents,
    percentOff: percentOff ? percentOff.toFixed(3) : null,
    isBuyItNow: true,
    autoIncluded: false,
    autoIncludeRuleId: null,
    raw: {
      ebayItemId: item.itemId,
      ebayDealItem: true,
      ebayCategoryId: item.categoryId,
      ebayDiscountPct: item.marketingPrice?.discountPercentage,
    },
  };
}

export interface EbayDealCategorySync {
  ebayCategoryId: string;
  categoryName: string;
  sportId: string;
  equipmentTypeId: string;
}

export function getEbayDealCategorySyncs(): EbayDealCategorySync[] {
  return [
    { ebayCategoryId: "16030", categoryName: "Gloves & Mitts", sportId: "baseball", equipmentTypeId: "bb-gloves" },
    { ebayCategoryId: "181315", categoryName: "Baseball Bats - Adult", sportId: "baseball", equipmentTypeId: "bb-bats" },
    { ebayCategoryId: "73897", categoryName: "Baseball Bats - Youth", sportId: "baseball", equipmentTypeId: "bb-bats" },
    { ebayCategoryId: "71089", categoryName: "Fastpitch Bats", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
    { ebayCategoryId: "50797", categoryName: "Slowpitch Bats", sportId: "slowpitch-softball", equipmentTypeId: "sp-bats" },
    { ebayCategoryId: "181351", categoryName: "Batting Gloves", sportId: "baseball", equipmentTypeId: "bb-batting-gloves" },
    { ebayCategoryId: "115280", categoryName: "Golf Clubs", sportId: "golf", equipmentTypeId: "golf-drivers" },
    { ebayCategoryId: "18924", categoryName: "Golf Balls", sportId: "golf", equipmentTypeId: "golf-balls" },
    { ebayCategoryId: "21194", categoryName: "Basketball", sportId: "basketball", equipmentTypeId: "bk-balls" },
    { ebayCategoryId: "21220", categoryName: "Footballs", sportId: "football", equipmentTypeId: "fb-balls" },
    { ebayCategoryId: "20863", categoryName: "Soccer Balls", sportId: "soccer", equipmentTypeId: "soc-balls" },
    { ebayCategoryId: "1492", categoryName: "Fishing", sportId: "fishing", equipmentTypeId: "fish-rods" },
    { ebayCategoryId: "261249", categoryName: "Lacrosse", sportId: "lacrosse", equipmentTypeId: "lax-sticks" },
    { ebayCategoryId: "261245", categoryName: "Hockey", sportId: "hockey", equipmentTypeId: "hk-sticks" },
    { ebayCategoryId: "159043", categoryName: "Disc Golf", sportId: "disc-golf", equipmentTypeId: "dg-other" },
    { ebayCategoryId: "95672", categoryName: "Running Shoes", sportId: "running", equipmentTypeId: "run-shoes" },
    { ebayCategoryId: "137084", categoryName: "Running Clothing", sportId: "running", equipmentTypeId: "run-apparel" },
  ];
}

const SPORT_SEARCH_TERMS: Record<string, string[]> = {
  baseball: ["baseball bat", "baseball glove", "baseball helmet", "baseball cleats", "batting gloves", "baseball"],
  "fastpitch-softball": ["fastpitch bat", "fastpitch glove", "fastpitch softball"],
  "slowpitch-softball": ["slowpitch bat", "slowpitch glove", "slowpitch softball"],
  golf: ["golf driver", "golf irons", "golf putter", "golf wedge", "golf balls", "golf bag", "golf shoes"],
  basketball: ["basketball shoes", "basketball", "basketball hoop"],
  lacrosse: ["lacrosse stick", "lacrosse helmet", "lacrosse gloves", "lacrosse head"],
  soccer: ["soccer cleats", "soccer ball", "shin guards"],
  football: ["football helmet", "football cleats", "football gloves", "football pads"],
  fishing: ["fishing rod", "fishing reel", "fishing lure", "tackle box"],
  volleyball: ["volleyball", "volleyball shoes", "volleyball knee pads"],
  wrestling: ["wrestling shoes", "wrestling singlet", "wrestling headgear"],
  hockey: ["hockey stick", "hockey skates", "hockey helmet", "hockey gloves", "hockey pads"],
  cycling: ["bicycle", "cycling helmet", "cycling shoes", "bike"],
  gymnastics: ["gymnastics leotard", "gymnastics grips", "balance beam"],
  cheerleading: ["cheerleading shoes", "cheer shoes"],
  rugby: ["rugby ball", "rugby cleats", "rugby headgear"],
  swimming: ["swim goggles", "swim cap", "competitive swimsuit", "jammer"],
  "disc-golf": ["disc golf driver", "disc golf midrange", "disc golf putter", "disc golf bag", "disc golf basket", "disc golf disc"],
  running: ["running shoes", "trail running shoes", "running shorts", "running socks", "running watch"],
};

export function getEbaySportKeywords(): Record<string, string[]> {
  return SPORT_SEARCH_TERMS;
}

export interface EbayCategorySync {
  categoryId: string;
  categoryName: string;
  sportId: string;
  equipmentTypeId: string;
  keywords?: string;
}

export function getEbayCategorySyncs(): EbayCategorySync[] {
  return [
    // === BASEBALL & SOFTBALL (16021) ===
    { categoryId: "16030", categoryName: "Gloves & Mitts - Baseball", sportId: "baseball", equipmentTypeId: "bb-gloves", keywords: "baseball" },
    { categoryId: "16030", categoryName: "Gloves & Mitts - Fastpitch", sportId: "fastpitch-softball", equipmentTypeId: "fp-gloves", keywords: "fastpitch softball" },
    { categoryId: "16030", categoryName: "Gloves & Mitts - Slowpitch", sportId: "slowpitch-softball", equipmentTypeId: "sp-gloves", keywords: "slowpitch softball" },
    { categoryId: "181315", categoryName: "Baseball Bats - Adult/HS", sportId: "baseball", equipmentTypeId: "bb-bats" },
    { categoryId: "73897", categoryName: "Baseball Bats - Youth", sportId: "baseball", equipmentTypeId: "bb-bats" },
    { categoryId: "71089", categoryName: "Fastpitch Softball Bats", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
    { categoryId: "50797", categoryName: "Slowpitch Softball Bats", sportId: "slowpitch-softball", equipmentTypeId: "sp-bats" },
    { categoryId: "181316", categoryName: "Other Bats", sportId: "baseball", equipmentTypeId: "bb-bats" },
    { categoryId: "181351", categoryName: "Batting Gloves - Baseball", sportId: "baseball", equipmentTypeId: "bb-batting-gloves", keywords: "baseball" },
    { categoryId: "181351", categoryName: "Batting Gloves - Fastpitch", sportId: "fastpitch-softball", equipmentTypeId: "fp-batting-gloves", keywords: "fastpitch softball" },
    { categoryId: "181351", categoryName: "Batting Gloves - Slowpitch", sportId: "slowpitch-softball", equipmentTypeId: "sp-batting-gloves", keywords: "slowpitch softball" },
    { categoryId: "181313", categoryName: "Balls - Baseball", sportId: "baseball", equipmentTypeId: "bb-balls", keywords: "baseball" },
    { categoryId: "181313", categoryName: "Balls - Fastpitch Softball", sportId: "fastpitch-softball", equipmentTypeId: "fp-balls", keywords: "fastpitch softball" },
    { categoryId: "181313", categoryName: "Balls - Slowpitch Softball", sportId: "slowpitch-softball", equipmentTypeId: "sp-balls", keywords: "slowpitch softball" },
    { categoryId: "73910", categoryName: "Protective Gear - Baseball", sportId: "baseball", equipmentTypeId: "bb-protective", keywords: "baseball" },
    { categoryId: "73910", categoryName: "Protective Gear - Fastpitch", sportId: "fastpitch-softball", equipmentTypeId: "fp-protective", keywords: "fastpitch softball" },
    { categoryId: "73910", categoryName: "Protective Gear - Slowpitch", sportId: "slowpitch-softball", equipmentTypeId: "sp-protective", keywords: "slowpitch softball" },
    { categoryId: "159058", categoryName: "Shoes & Cleats - Baseball", sportId: "baseball", equipmentTypeId: "bb-cleats", keywords: "baseball" },
    { categoryId: "159058", categoryName: "Shoes & Cleats - Fastpitch", sportId: "fastpitch-softball", equipmentTypeId: "fp-cleats", keywords: "fastpitch softball" },
    { categoryId: "159058", categoryName: "Shoes & Cleats - Slowpitch", sportId: "slowpitch-softball", equipmentTypeId: "sp-cleats", keywords: "slowpitch softball" },
    { categoryId: "181330", categoryName: "Training Aids - Baseball", sportId: "baseball", equipmentTypeId: "bb-training", keywords: "baseball" },
    { categoryId: "181330", categoryName: "Training Aids - Fastpitch", sportId: "fastpitch-softball", equipmentTypeId: "fp-training", keywords: "fastpitch softball" },
    { categoryId: "181330", categoryName: "Training Aids - Slowpitch", sportId: "slowpitch-softball", equipmentTypeId: "sp-training", keywords: "slowpitch softball" },
    { categoryId: "159052", categoryName: "Clothing & Shoes - Baseball", sportId: "baseball", equipmentTypeId: "bb-shoes-apparel", keywords: "baseball" },
    { categoryId: "159052", categoryName: "Clothing & Shoes - Fastpitch", sportId: "fastpitch-softball", equipmentTypeId: "fp-shoes-apparel", keywords: "fastpitch softball" },
    { categoryId: "159052", categoryName: "Clothing & Shoes - Slowpitch", sportId: "slowpitch-softball", equipmentTypeId: "sp-shoes-apparel", keywords: "slowpitch softball" },
    { categoryId: "181324", categoryName: "Equipment Care - Baseball", sportId: "baseball", equipmentTypeId: "bb-care-accessories" },
    { categoryId: "181324", categoryName: "Equipment Care - Fastpitch", sportId: "fastpitch-softball", equipmentTypeId: "fp-care-accessories", keywords: "softball" },
    { categoryId: "181324", categoryName: "Equipment Care - Slowpitch", sportId: "slowpitch-softball", equipmentTypeId: "sp-care-accessories", keywords: "softball" },
    { categoryId: "181318", categoryName: "Field Equipment - Baseball", sportId: "baseball", equipmentTypeId: "bb-field-equipment" },
    { categoryId: "181318", categoryName: "Field Equipment - Fastpitch", sportId: "fastpitch-softball", equipmentTypeId: "fp-field-equipment", keywords: "softball" },
    { categoryId: "181318", categoryName: "Field Equipment - Slowpitch", sportId: "slowpitch-softball", equipmentTypeId: "sp-field-equipment", keywords: "softball" },
    { categoryId: "181355", categoryName: "Other Baseball & Softball", sportId: "baseball", equipmentTypeId: "bb-other" },

    // === GOLF (1513) ===
    { categoryId: "115280", categoryName: "Golf Clubs", sportId: "golf", equipmentTypeId: "golf-drivers", keywords: "driver" },
    { categoryId: "115280", categoryName: "Golf Irons", sportId: "golf", equipmentTypeId: "golf-irons", keywords: "iron" },
    { categoryId: "115280", categoryName: "Golf Iron Sets", sportId: "golf", equipmentTypeId: "golf-iron-sets", keywords: "iron set" },
    { categoryId: "115280", categoryName: "Golf Wedges", sportId: "golf", equipmentTypeId: "golf-wedges", keywords: "wedge" },
    { categoryId: "115280", categoryName: "Golf Putters", sportId: "golf", equipmentTypeId: "golf-putters", keywords: "putter" },
    { categoryId: "18924", categoryName: "Golf Balls", sportId: "golf", equipmentTypeId: "golf-balls" },
    { categoryId: "30109", categoryName: "Golf Bags", sportId: "golf", equipmentTypeId: "golf-bags" },
    { categoryId: "181131", categoryName: "Golf Clothing & Shoes - Men", sportId: "golf", equipmentTypeId: "golf-shoes-apparel" },
    { categoryId: "181142", categoryName: "Golf Clothing & Shoes - Women", sportId: "golf", equipmentTypeId: "golf-shoes-apparel" },
    { categoryId: "1513", categoryName: "Golf Training & Other", sportId: "golf", equipmentTypeId: "golf-training", keywords: "training aid" },

    // === BASKETBALL (21194) ===
    { categoryId: "21194", categoryName: "Basketball Equipment", sportId: "basketball", equipmentTypeId: "bk-balls", keywords: "basketball" },
    { categoryId: "21194", categoryName: "Basketball Shoes", sportId: "basketball", equipmentTypeId: "bk-shoes-apparel", keywords: "basketball shoe" },
    { categoryId: "21194", categoryName: "Basketball Hoops", sportId: "basketball", equipmentTypeId: "bk-hoops-nets", keywords: "hoop backboard" },
    { categoryId: "21194", categoryName: "Basketball Training", sportId: "basketball", equipmentTypeId: "bk-training", keywords: "training" },

    // === FOOTBALL (261242) ===
    { categoryId: "21220", categoryName: "Footballs", sportId: "football", equipmentTypeId: "fb-balls" },
    { categoryId: "159114", categoryName: "Football Gloves", sportId: "football", equipmentTypeId: "fb-other" },
    { categoryId: "21222", categoryName: "Football Helmets & Hats", sportId: "football", equipmentTypeId: "fb-protective" },
    { categoryId: "21224", categoryName: "Football Protective Gear", sportId: "football", equipmentTypeId: "fb-protective" },
    { categoryId: "159115", categoryName: "Football Shoes & Cleats", sportId: "football", equipmentTypeId: "fb-shoes-apparel" },
    { categoryId: "159119", categoryName: "Football Training Aids", sportId: "football", equipmentTypeId: "fb-training" },
    { categoryId: "21218", categoryName: "Football Clothing", sportId: "football", equipmentTypeId: "fb-shoes-apparel" },

    // === SOCCER (20862) ===
    { categoryId: "20863", categoryName: "Soccer Balls", sportId: "soccer", equipmentTypeId: "soc-balls" },
    { categoryId: "57277", categoryName: "Soccer Gloves", sportId: "soccer", equipmentTypeId: "soc-other" },
    { categoryId: "159180", categoryName: "Soccer Goals & Nets", sportId: "soccer", equipmentTypeId: "soc-nets" },
    { categoryId: "20864", categoryName: "Soccer Protective Gear", sportId: "soccer", equipmentTypeId: "soc-protective" },
    { categoryId: "19298", categoryName: "Soccer Shoes & Cleats", sportId: "soccer", equipmentTypeId: "soc-shoes-apparel" },
    { categoryId: "159181", categoryName: "Soccer Training Aids", sportId: "soccer", equipmentTypeId: "soc-training" },

    // === LACROSSE (261249) ===
    { categoryId: "261249", categoryName: "Lacrosse Sticks", sportId: "lacrosse", equipmentTypeId: "lax-sticks", keywords: "stick shaft head" },
    { categoryId: "62164", categoryName: "Lacrosse Protective Gear", sportId: "lacrosse", equipmentTypeId: "lax-protective" },
    { categoryId: "261249", categoryName: "Lacrosse Balls", sportId: "lacrosse", equipmentTypeId: "lax-balls", keywords: "ball" },
    { categoryId: "159153", categoryName: "Lacrosse Bags", sportId: "lacrosse", equipmentTypeId: "lax-bags" },

    // === HOCKEY (261245) ===
    { categoryId: "261245", categoryName: "Hockey Sticks", sportId: "hockey", equipmentTypeId: "hk-sticks", keywords: "stick" },
    { categoryId: "261245", categoryName: "Hockey Skates", sportId: "hockey", equipmentTypeId: "hk-skates", keywords: "skate" },
    { categoryId: "261245", categoryName: "Hockey Protective", sportId: "hockey", equipmentTypeId: "hk-protective", keywords: "helmet glove pad shin shoulder" },
    { categoryId: "79761", categoryName: "Hockey Goalie Equipment", sportId: "hockey", equipmentTypeId: "hk-other" },

    // === FISHING (1492) ===
    { categoryId: "1492", categoryName: "Fishing Rods", sportId: "fishing", equipmentTypeId: "fish-rods", keywords: "rod pole" },
    { categoryId: "1492", categoryName: "Fishing Reels", sportId: "fishing", equipmentTypeId: "fish-reels", keywords: "reel" },
    { categoryId: "1492", categoryName: "Fishing Lures & Line", sportId: "fishing", equipmentTypeId: "fish-lures-line", keywords: "lure bait line" },
    { categoryId: "1492", categoryName: "Fishing Bags & Tackle", sportId: "fishing", equipmentTypeId: "fish-bags", keywords: "tackle box bag" },

    // === VOLLEYBALL (261246) ===
    { categoryId: "261246", categoryName: "Volleyball Equipment", sportId: "volleyball", equipmentTypeId: "vb-balls" },

    // === WRESTLING (261247) ===
    { categoryId: "261247", categoryName: "Wrestling Gear", sportId: "wrestling", equipmentTypeId: "wrest-shoes-apparel" },

    // === CYCLING (7294) ===
    { categoryId: "7294", categoryName: "Cycling Equipment", sportId: "cycling", equipmentTypeId: "cyc-other", keywords: "bicycle bike helmet" },

    // === GYMNASTICS (79792) ===
    { categoryId: "79792", categoryName: "Gymnastics Equipment", sportId: "gymnastics", equipmentTypeId: "gym-other" },

    // === CHEERLEADING (261250) ===
    { categoryId: "261250", categoryName: "Cheerleading Gear", sportId: "cheerleading", equipmentTypeId: "cheer-shoes-apparel" },

    // === RUGBY (261243) ===
    { categoryId: "261243", categoryName: "Rugby Gear", sportId: "rugby", equipmentTypeId: "rug-other" },

    // === SWIMMING (Water Sports 159136 - swim subset) ===
    { categoryId: "159136", categoryName: "Swimming Gear", sportId: "swimming", equipmentTypeId: "swim-other", keywords: "swim goggle cap swimsuit" },

    // === DISC GOLF (subset of Outdoor Sports) ===
    { categoryId: "159043", categoryName: "Disc Golf", sportId: "disc-golf", equipmentTypeId: "dg-other", keywords: "disc golf" },
  ];
}
