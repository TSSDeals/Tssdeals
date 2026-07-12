import type { InsertDeal } from "@shared/schema";

const RAKUTEN_API_URL = "https://productsearch.linksynergy.com/productsearch";

interface RakutenProduct {
  mid: string;
  merchantName: string;
  linkId: string;
  createdon: string;
  sku: string;
  productName: string;
  category: { primary: string; secondary: string };
  price: { retail: string; sale: string; currency: string };
  upc: string;
  description: { short: string; long: string };
  url: { product: string; image: string; offer: string };
  keywords: string;
  impressionUrl: string;
}

interface RakutenSyncOptions {
  keyword: string;
  sportId: string;
  equipmentTypeId: string;
  mid?: string;
  maxResults?: number;
  page?: number;
}

export interface RakutenMerchantConfig {
  mid: string;
  name: string;
  brand: string;
  sourceId: string;
  keywords: string[];
  sportIds: string[];
  equipmentTypeId: string;
}

export const RAKUTEN_MERCHANTS: RakutenMerchantConfig[] = [
  {
    mid: "43729",
    name: "Hoka",
    brand: "HOKA",
    sourceId: "rak-hoka",
    keywords: [
      "running shoes",
      "trail running shoes",
      "walking shoes",
      "hiking shoes",
      "recovery shoes",
      "sneakers",
      "athletic shoes",
    ],
    sportIds: ["running"],
    equipmentTypeId: "shoes",
  },
  {
    mid: "38663",
    name: "Orvis",
    brand: "Orvis",
    sourceId: "rak-orvis",
    keywords: [
      "fly fishing rod",
      "fly fishing reel",
      "fishing waders",
      "fly line",
      "fishing vest",
      "fishing pack",
      "fishing net",
      "fly tying",
      "fishing accessories",
    ],
    sportIds: ["fishing"],
    equipmentTypeId: "fishing-other",
  },
];

function parseRakutenXML(xml: string): RakutenProduct[] {
  const products: RakutenProduct[] = [];
  const itemBlocks = xml.split(/<item>/i).slice(1);

  for (const block of itemBlocks) {
    const get = (tag: string): string => {
      const match = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i"))
        || block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
      return match?.[1]?.trim() ?? "";
    };

    const getAttr = (tag: string, attr: string): string => {
      const match = block.match(new RegExp(`<${tag}[^>]*?${attr}="([^"]*?)"`, "i"));
      return match?.[1] ?? "";
    };

    products.push({
      mid: get("mid"),
      merchantName: get("merchantname"),
      linkId: get("linkid"),
      createdon: get("createdon"),
      sku: get("sku"),
      productName: get("productname"),
      category: {
        primary: get("primary") || getAttr("category", "primary"),
        secondary: get("secondary") || getAttr("category", "secondary"),
      },
      price: {
        retail: get("retail") || getAttr("price", "retail"),
        sale: get("sale") || getAttr("price", "sale"),
        currency: get("currency") || getAttr("price", "currency") || "USD",
      },
      upc: get("upc"),
      description: {
        short: get("short") || get("description\\.short"),
        long: get("long") || get("description\\.long"),
      },
      url: {
        product: get("producturl") || get("url"),
        image: get("imageurl"),
        offer: get("offerurl") || get("linkurl"),
      },
      keywords: get("keywords"),
      impressionUrl: get("impressionurl"),
    });
  }

  return products;
}

export async function searchRakutenProducts(
  apiToken: string,
  options: RakutenSyncOptions,
): Promise<RakutenProduct[]> {
  const params = new URLSearchParams({
    token: apiToken,
    keyword: options.keyword,
  });

  if (options.mid) {
    params.set("mid", options.mid);
  }

  if (options.maxResults) {
    params.set("max", String(Math.min(options.maxResults, 50)));
  }

  if (options.page) {
    params.set("pagenumber", String(options.page));
  }

  const url = `${RAKUTEN_API_URL}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/xml",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Rakuten API authentication failed. Check your web service token.");
    }
    throw new Error(`Rakuten API error ${response.status}: ${text.slice(0, 300)}`);
  }

  return parseRakutenXML(text);
}

function parsePriceCents(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^0-9.]/g, "");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

export function rakutenProductToDeal(
  product: RakutenProduct,
  sportId: string,
  equipmentTypeId: string,
  brandOverride?: string,
): InsertDeal | null {
  const salePriceCents = parsePriceCents(product.price.sale);
  const retailPriceCents = parsePriceCents(product.price.retail);

  const effectivePrice = salePriceCents > 0 ? salePriceCents : retailPriceCents;
  if (effectivePrice <= 0) return null;

  const msrp = retailPriceCents > 0 ? retailPriceCents : effectivePrice;
  let percentOff: string | null = null;

  if (retailPriceCents > 0 && effectivePrice < retailPriceCents) {
    percentOff = (((retailPriceCents - effectivePrice) / retailPriceCents) * 100).toFixed(3);
  }

  const merchantSlug = (product.merchantName || "rakuten")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const url = product.url.offer || product.url.product;
  if (!url) return null;

  return {
    sourceId: `rak-${merchantSlug}`,
    title: (product.productName || "").slice(0, 200),
    brand: brandOverride || null,
    url,
    imageUrl: product.url.image || null,
    sportId,
    equipmentTypeId,
    condition: "new" as const,
    currency: product.price.currency || "USD",
    msrpCents: msrp,
    manufacturerMsrpCents: null,
    msrpSource: "retailer" as const,
    msrpVerified: false,
    priceCents: effectivePrice,
    percentOff,
    isBuyItNow: true,
    autoIncluded: false,
    autoIncludeRuleId: null,
    raw: {
      rakutenMid: product.mid,
      rakutenMerchant: product.merchantName,
      rakutenLinkId: product.linkId,
      rakutenSku: product.sku,
      rakutenUpc: product.upc,
    },
  };
}

export function getRakutenSportKeywords(): Record<string, string[]> {
  return {
    baseball: ["baseball bat", "baseball glove", "batting gloves"],
    "fastpitch-softball": ["fastpitch bat", "softball glove"],
    "slowpitch-softball": ["slowpitch bat"],
    golf: ["golf clubs", "golf balls", "golf bag"],
    basketball: ["basketball shoes", "basketball"],
    lacrosse: ["lacrosse stick", "lacrosse helmet"],
    soccer: ["soccer cleats", "soccer ball"],
    football: ["football helmet", "football cleats"],
    fishing: ["fishing rod", "fishing reel"],
    volleyball: ["volleyball shoes"],
    wrestling: ["wrestling shoes"],
    hockey: ["hockey stick", "hockey skates"],
    cycling: ["bicycle", "cycling helmet"],
    gymnastics: ["gymnastics leotard"],
    cheerleading: ["cheerleading shoes"],
    rugby: ["rugby ball"],
    swimming: ["swim goggles"],
    running: ["running shoes", "trail shoes"],
  };
}

export async function syncRakutenMerchant(
  apiToken: string,
  merchant: RakutenMerchantConfig,
): Promise<{ products: RakutenProduct[]; deals: (InsertDeal | null)[] }> {
  const allProducts: RakutenProduct[] = [];

  for (const keyword of merchant.keywords) {
    for (let page = 1; page <= 5; page++) {
      try {
        const products = await searchRakutenProducts(apiToken, {
          keyword,
          sportId: merchant.sportIds[0] || "running",
          equipmentTypeId: merchant.equipmentTypeId,
          mid: merchant.mid,
          maxResults: 50,
          page,
        });

        allProducts.push(...products);

        if (products.length < 50) break;
      } catch (err: any) {
        console.error(`Rakuten merchant sync error for "${keyword}" page ${page}: ${err.message}`);
        break;
      }
    }
  }

  const deals = allProducts.map((p) =>
    rakutenProductToDeal(p, merchant.sportIds[0] || "running", merchant.equipmentTypeId, merchant.brand)
  );

  return { products: allProducts, deals };
}
