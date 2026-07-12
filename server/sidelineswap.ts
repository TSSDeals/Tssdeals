import type { InsertDeal } from "@shared/schema";
import { reclassifyBattingGloves } from "./ebay-api";
import { classifyDealAttributes } from "./sub-filter-classifier";

const BASE_URL = "https://api.sidelineswap.com/v1/items";
const USER_AGENT = "Mozilla/5.0 (compatible; TwinSeamDeals/1.0)";

interface SidelineSwapItem {
  id: number;
  state: string;
  name: string;
  category_1: string;
  category_2: string | null;
  price: number;
  list_price: number;
  price_retail: number | null;
  condition_detail: {
    id: number;
    type: string;
    title_name: string;
    slug: string;
    name: string;
  } | null;
  url: string;
  created_at: string;
  seller: {
    id: number;
    username: string;
  } | null;
  primary_image: {
    edge_url: string;
    large_url: string;
    thumb_url: string;
  } | null;
}

interface SidelineSwapResponse {
  data: SidelineSwapItem[];
  meta: {
    paging: {
      total_pages: number;
      total_count: number;
      page_size: number;
      page: number;
      has_next_page: boolean;
    };
  };
}

export interface SidelineSwapSyncOptions {
  sportId?: string;
  minPrice?: number;
  maxPages?: number;
  condition?: "new" | "preowned" | "all";
}

const CATEGORY_MAP: Record<string, { category_1: string; searches: { category_2: string; equipmentTypeId: string }[] }> = {
  baseball: {
    category_1: "baseball",
    searches: [
      { category_2: "baseball-gloves", equipmentTypeId: "bb-gloves" },
      { category_2: "bats", equipmentTypeId: "bb-bats" },
      { category_2: "baseball-protective-gear", equipmentTypeId: "bb-protective" },
      { category_2: "cleats", equipmentTypeId: "bb-cleats" },
    ],
  },
  "fastpitch-softball": {
    category_1: "softball",
    searches: [
      { category_2: "softball-gloves", equipmentTypeId: "fp-gloves" },
      { category_2: "bats", equipmentTypeId: "fp-bats" },
    ],
  },
  "slowpitch-softball": {
    category_1: "softball",
    searches: [
      { category_2: "softball-gloves", equipmentTypeId: "sp-gloves" },
      { category_2: "bats", equipmentTypeId: "sp-bats" },
    ],
  },
  golf: {
    category_1: "golf",
    searches: [
      { category_2: "clubs", equipmentTypeId: "golf-drivers" },
      { category_2: "golf-bags", equipmentTypeId: "golf-bags" },
    ],
  },
  lacrosse: {
    category_1: "lacrosse",
    searches: [
      { category_2: "lacrosse-heads", equipmentTypeId: "lax-sticks" },
      { category_2: "lacrosse-gloves", equipmentTypeId: "lax-protective" },
      { category_2: "lacrosse-helmets", equipmentTypeId: "lax-protective" },
    ],
  },
  hockey: {
    category_1: "hockey",
    searches: [
      { category_2: "sticks", equipmentTypeId: "hk-sticks" },
      { category_2: "skates", equipmentTypeId: "hk-skates" },
      { category_2: "hockey-helmets", equipmentTypeId: "hk-protective" },
      { category_2: "hockey-gloves", equipmentTypeId: "hk-protective" },
    ],
  },
  football: {
    category_1: "football",
    searches: [
      { category_2: "football-helmets", equipmentTypeId: "fb-protective" },
      { category_2: "shoulder-pads", equipmentTypeId: "fb-protective" },
      { category_2: "cleats", equipmentTypeId: "fb-shoes-apparel" },
    ],
  },
  soccer: {
    category_1: "soccer",
    searches: [
      { category_2: "cleats", equipmentTypeId: "soc-shoes-apparel" },
    ],
  },
};

const KNOWN_BRANDS = [
  "Rawlings", "Wilson", "Mizuno", "Easton", "Louisville Slugger", "Marucci",
  "DeMarini", "Nokona", "Akadema", "44 Pro", "Soto", "Ryu",
  "Nike", "Adidas", "Under Armour", "New Balance", "Puma", "Reebok", "ASICS",
  "TaylorMade", "Callaway", "Titleist", "Ping", "Cobra", "Cleveland", "Bridgestone", "Srixon",
  "CCM", "Bauer", "Warrior", "STX", "Maverik",
  "Shimano", "Daiwa", "Penn", "Ugly Stik", "Abu Garcia",
  "Franklin", "Riddell", "Schutt", "Xenith",
  "Leggera", "Junkei", "Kubota Slugger", "JB Wagyu", "Emery",
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

function sidelineSwapItemToDeal(
  item: SidelineSwapItem,
  sportId: string,
  equipmentTypeId: string,
): InsertDeal | null {
  if (item.state !== "available") return null;

  const priceCents = Math.round(item.price * 100);
  if (priceCents <= 0) return null;

  let msrpCents: number | null = null;
  let percentOff: number | null = null;

  if (item.price_retail && item.price_retail > 0) {
    msrpCents = Math.round(item.price_retail * 100);
    if (msrpCents > priceCents) {
      percentOff = ((msrpCents - priceCents) / msrpCents) * 100;
    }
  }

  const conditionSlug = item.condition_detail?.slug || "used";
  const condition: "new" | "preowned" =
    conditionSlug === "new" ? "new" : "preowned";

  const imageUrl = item.primary_image?.edge_url || item.primary_image?.large_url || null;

  const finalEquipmentTypeId = reclassifyBattingGloves(item.name, sportId, equipmentTypeId);
  const { subFilterId, dropWeight, sizeNumber } = classifyDealAttributes(item.name, finalEquipmentTypeId);

  return {
    sourceId: "sidelineswap",
    title: item.name.slice(0, 200),
    brand: extractBrand(item.name),
    url: item.url,
    imageUrl,
    sportId,
    equipmentTypeId: finalEquipmentTypeId,
    subFilterId,
    dropWeight,
    sizeNumber,
    condition,
    currency: "USD",
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
      sidelineSwapId: item.id,
      sidelineSwapSeller: item.seller?.username,
      sidelineSwapCondition: item.condition_detail?.name,
    },
  };
}

async function fetchPage(
  category1: string,
  category2: string,
  page: number,
  perPage: number = 20,
): Promise<SidelineSwapResponse> {
  const params = new URLSearchParams({
    category_1: category1,
    category_2: category2,
    sort: "newest",
    per_page: String(perPage),
    page: String(page),
  });

  const url = `${BASE_URL}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`SidelineSwap API error ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as SidelineSwapResponse;
}

export async function syncSidelineSwap(
  options: SidelineSwapSyncOptions,
): Promise<{ deals: InsertDeal[]; log: string[] }> {
  const log: string[] = [];
  const allDeals: InsertDeal[] = [];
  const minPrice = options.minPrice ?? 0;
  const maxPages = options.maxPages ?? 3;

  const sportsToSync = options.sportId
    ? { [options.sportId]: CATEGORY_MAP[options.sportId] }
    : CATEGORY_MAP;

  for (const [sportId, config] of Object.entries(sportsToSync)) {
    if (!config) {
      log.push(`No SidelineSwap category mapping for sport: ${sportId}`);
      continue;
    }

    for (const search of config.searches) {
      log.push(`Searching ${config.category_1}/${search.category_2} -> ${sportId}/${search.equipmentTypeId}...`);
      let pagesFetched = 0;
      let itemsFound = 0;

      try {
        for (let page = 1; page <= maxPages; page++) {
          const data = await fetchPage(config.category_1, search.category_2, page);
          pagesFetched++;

          if (!data.data || data.data.length === 0) break;

          for (const item of data.data) {
            if (item.price < minPrice) continue;

            if (options.condition && options.condition !== "all") {
              const slug = item.condition_detail?.slug || "used";
              if (options.condition === "new" && slug !== "new") continue;
              if (options.condition === "preowned" && slug === "new") continue;
            }

            const deal = sidelineSwapItemToDeal(item, sportId, search.equipmentTypeId);
            if (deal) {
              allDeals.push(deal);
              itemsFound++;
            }
          }

          if (!data.meta.paging.has_next_page) break;

          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        log.push(`  Found ${itemsFound} items across ${pagesFetched} pages`);
      } catch (err: any) {
        log.push(`  Error: ${err.message}`);
      }
    }
  }

  log.push(`Total: ${allDeals.length} deals ready to import`);
  return { deals: allDeals, log };
}

export function getSidelineSwapSports(): string[] {
  return Object.keys(CATEGORY_MAP);
}
