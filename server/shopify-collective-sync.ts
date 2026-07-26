import type { InsertDeal } from "@shared/schema";
import { shopifyProductToDeal, type ShopifyProduct, type ShopifyVariant } from "./shopify-sync";

export const SHOPIFY_COLLECTIVE_SOURCE_ID = "shopify-collective";
export const SHOPIFY_COLLECTIVE_SOURCE_NAME = "Twin Seam Collective";
export const SHOPIFY_COLLECTIVE_FEATURE_FLAG = "ENABLE_SHOPIFY_COLLECTIVE_SYNC";
export const SHOPIFY_COLLECTIVE_STORE_DOMAIN = "twinseamsports.myshopify.com";
export const SHOPIFY_COLLECTIVE_STOREFRONT = "https://www.twinseamsports.com";

const OWN_VENDOR = /\btwin\s*seam\s*sports\b/i;
const EXCLUDED = /\b(?:work gloves?|winter gloves?|golf gloves?|batting gloves?|sliding mitts?|oven mitts?|costume|furniture|display case|gift card|signed|autograph|memorabilia)\b/i;

const CATEGORY_RULES: Array<{ pattern: RegExp; sportId: string; equipmentTypeId: string }> = [
  { pattern: /\bbaseball\s*(?:&|and)\s*softball fielding gloves?\b|\b(?:baseball|softball|fielding|infield|outfield|pitcher'?s?|catcher'?s?|first base)\b[\s\S]*\b(?:glove|mitt)s?\b/i, sportId: "baseball", equipmentTypeId: "bb-gloves" },
  { pattern: /\bfastpitch\b[\s\S]*\bbats?\b|\bbats?\b[\s\S]*\bfastpitch\b/i, sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  { pattern: /\b(?:baseball|usssa|bbcor|usa baseball|wood)\b[\s\S]*\bbats?\b|\bbats?\b[\s\S]*\b(?:baseball|usssa|bbcor|usa baseball)\b/i, sportId: "baseball", equipmentTypeId: "bb-bats" },
  { pattern: /\bbatting helmets?\b|\bcatcher'?s gear\b|\bchest protectors?\b|\bleg guards?\b/i, sportId: "baseball", equipmentTypeId: "bb-protective" },
  { pattern: /\b(?:baseball|softball)\b[\s\S]*\bcleats?\b|\bcleats?\b[\s\S]*\b(?:baseball|softball)\b/i, sportId: "baseball", equipmentTypeId: "bb-cleats" },
  { pattern: /\b(?:baseballs?|softballs?|practice balls?|training balls?)\b/i, sportId: "baseball", equipmentTypeId: "bb-balls" },
  { pattern: /\b(?:batting tees?|pitching machines?|baseball training equipment|softball training equipment)\b/i, sportId: "baseball", equipmentTypeId: "bb-training" },
  { pattern: /\b(?:baseball|softball)\b[\s\S]*\b(?:bags?|apparel|shirts?|hoodies?|hats?|accessories)\b/i, sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  { pattern: /\b(?:running shoes?|road running shoes?|trail running shoes?)\b/i, sportId: "running", equipmentTypeId: "run-shoes" },
  { pattern: /\b(?:golf clubs?|drivers?|fairway woods?|iron sets?|putters?|wedges?)\b/i, sportId: "golf", equipmentTypeId: "golf-other" },
];

export type CollectiveVariant = {
  id: string;
  legacyResourceId: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  availableForSale: boolean;
};

export type CollectiveProduct = {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  onlineStoreUrl: string | null;
  category: { fullName: string } | null;
  featuredMedia: { preview: { image: { url: string; width: number; height: number } | null } | null } | null;
  variants: { nodes: CollectiveVariant[] };
};

type AdminProductsPage = {
  data?: {
    products: {
      nodes: CollectiveProduct[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
  extensions?: {
    cost?: {
      throttleStatus?: {
        currentlyAvailable?: number;
        restoreRate?: number;
      };
    };
  };
};

type ShopifyClientTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

let cachedClientToken: { value: string; expiresAt: number } | null = null;

export async function getShopifyAdminAccessToken(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}): Promise<string> {
  const env = options.env ?? process.env;
  const staticToken = env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  if (staticToken) return staticToken;

  const clientId = env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = env.SHOPIFY_CLIENT_SECRET?.trim();
  const domain = env.SHOPIFY_STORE_DOMAIN?.trim() || SHOPIFY_COLLECTIVE_STORE_DOMAIN;
  if (!clientId || !clientSecret) {
    throw new Error("SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are not configured");
  }

  const now = options.now ?? Date.now;
  if (cachedClientToken && cachedClientToken.expiresAt > now() + 60_000) {
    return cachedClientToken.value;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const payload = await response.json() as ShopifyClientTokenResponse;
  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`Shopify client authentication failed: ${detail}`);
  }

  const lifetimeSeconds = Number.isFinite(payload.expires_in) ? Number(payload.expires_in) : 86_400;
  cachedClientToken = {
    value: payload.access_token,
    expiresAt: now() + lifetimeSeconds * 1000,
  };
  return payload.access_token;
}

export function clearShopifyClientTokenCache(): void {
  cachedClientToken = null;
}

function productText(product: CollectiveProduct): string {
  return [
    product.category?.fullName ?? "",
    product.productType,
    product.title,
    ...(product.tags ?? []),
  ].join(" ");
}

export function collectiveCategory(product: CollectiveProduct): { sportId: string; equipmentTypeId: string } | null {
  const text = productText(product);
  if (EXCLUDED.test(text)) return null;
  return CATEGORY_RULES.find((rule) => rule.pattern.test(text)) ?? null;
}

function shopifyVariant(variant: CollectiveVariant): ShopifyVariant {
  return {
    id: Number(variant.legacyResourceId),
    title: variant.title,
    price: variant.price,
    compare_at_price: variant.compareAtPrice,
    available: variant.availableForSale,
    sku: variant.sku ?? "",
    option1: null,
    option2: null,
    option3: null,
  };
}

function variantUrl(product: CollectiveProduct, variant: CollectiveVariant): string {
  if (product.onlineStoreUrl) {
    const url = new URL(product.onlineStoreUrl);
    url.searchParams.set("variant", variant.legacyResourceId);
    return url.toString();
  }
  return `https://shop.app/products/${product.legacyResourceId}?variantId=${variant.legacyResourceId}`;
}

export function collectiveProductToDeals(product: CollectiveProduct): InsertDeal[] {
  if (product.status !== "ACTIVE" || OWN_VENDOR.test(product.vendor)) return [];
  const category = collectiveCategory(product);
  if (!category) return [];
  const image = product.featuredMedia?.preview?.image;

  return product.variants.nodes
    .filter((variant) => variant.availableForSale && Number(variant.price) > 0)
    .map((variant) => {
      const publicProduct: ShopifyProduct = {
        id: Number(product.legacyResourceId),
        title: /^default title$/i.test(variant.title)
          ? product.title
          : `${product.title} — ${variant.title}`,
        handle: product.handle,
        vendor: product.vendor,
        product_type: product.productType,
        tags: product.tags,
        variants: [shopifyVariant(variant)],
        images: image ? [{ id: 0, src: image.url, width: image.width, height: image.height }] : [],
        created_at: "",
        updated_at: "",
      };
      const deal = shopifyProductToDeal(
        publicProduct,
        category.sportId,
        category.equipmentTypeId,
        SHOPIFY_COLLECTIVE_STOREFRONT,
        SHOPIFY_COLLECTIVE_SOURCE_ID,
      );
      if (!deal) return null;
      deal.url = variantUrl(product, variant);
      deal.raw = {
        ...(deal.raw as Record<string, unknown>),
        catalogAdapter: SHOPIFY_COLLECTIVE_SOURCE_ID,
        shopifyCollective: true,
        shopifySupplier: product.vendor,
        shopifyProductGid: product.id,
        shopifyVariantGid: variant.id,
        shopifyProductStatus: product.status,
        shopifyTaxonomyCategory: product.category?.fullName ?? null,
        shopifySalesChannel: product.onlineStoreUrl ? "online-store" : "shop",
      };
      return deal;
    })
    .filter((deal): deal is InsertDeal => deal !== null);
}

export function collectiveSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SHOPIFY_COLLECTIVE_FEATURE_FLAG] === "true";
}

export async function fetchCollectiveProducts(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
} = {}): Promise<CollectiveProduct[]> {
  const env = options.env ?? process.env;
  const domain = env.SHOPIFY_STORE_DOMAIN?.trim() || SHOPIFY_COLLECTIVE_STORE_DOMAIN;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const token = await getShopifyAdminAccessToken({ env, fetchImpl });
  const products: CollectiveProduct[] = [];
  let cursor: string | null = null;
  let throttleAttempts = 0;
  while (true) {
    const response = await fetchImpl(`https://${domain}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: `query CollectiveProducts($cursor: String) {
          products(first: 25, after: $cursor, query: "status:active") {
            nodes {
              id legacyResourceId title handle status vendor productType tags onlineStoreUrl
              category { fullName }
              featuredMedia { preview { image { url width height } } }
              variants(first: 20) {
                nodes { id legacyResourceId title sku price compareAtPrice availableForSale }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        variables: { cursor },
      }),
    });
    const payload = await response.json() as AdminProductsPage;
    const throttled = payload.errors?.some((error) =>
      error.extensions?.code === "THROTTLED" || /throttled/i.test(error.message ?? ""));
    if (throttled && throttleAttempts < 8) {
      throttleAttempts++;
      const throttle = payload.extensions?.cost?.throttleStatus;
      const available = throttle?.currentlyAvailable ?? 0;
      const restoreRate = Math.max(1, throttle?.restoreRate ?? 50);
      const waitMs = Math.min(10_000, Math.max(1_000, Math.ceil((500 - available) / restoreRate * 1000)));
      await sleep(waitMs);
      continue;
    }
    if (!response.ok || payload.errors?.length || !payload.data) {
      const detail = payload.errors?.map((error) => error.message).filter(Boolean).join("; ");
      throw new Error(`Shopify Admin catalog fetch failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    throttleAttempts = 0;
    products.push(...payload.data.products.nodes);
    if (!payload.data.products.pageInfo.hasNextPage) break;
    cursor = payload.data.products.pageInfo.endCursor;
    if (!cursor) break;
    await sleep(200);
  }
  return products;
}

export async function syncShopifyCollective(options: {
  dryRun: boolean;
  bulkUpsertDeals: (deals: InsertDeal[]) => Promise<{ created: number; updated: number }>;
  ensureSource: (id: string, name: string, url: string) => Promise<void>;
  fetchProducts?: () => Promise<CollectiveProduct[]>;
  env?: NodeJS.ProcessEnv;
}) {
  const env = options.env ?? process.env;
  if (!collectiveSyncEnabled(env)) {
    throw new Error(`${SHOPIFY_COLLECTIVE_FEATURE_FLAG} is not enabled`);
  }
  const products = await (options.fetchProducts ?? (() => fetchCollectiveProducts({ env })))();
  const deals = products.flatMap(collectiveProductToDeals);
  const acceptedProductIds = new Set(deals.map((deal) => (deal.raw as any).shopifyProductGid));
  if (options.dryRun) {
    return { created: 0, updated: 0, fetchedProducts: products.length, acceptedVariants: deals.length, skippedProducts: products.length - acceptedProductIds.size, dryRun: true };
  }
  await options.ensureSource(SHOPIFY_COLLECTIVE_SOURCE_ID, SHOPIFY_COLLECTIVE_SOURCE_NAME, SHOPIFY_COLLECTIVE_STOREFRONT);
  const result = deals.length ? await options.bulkUpsertDeals(deals) : { created: 0, updated: 0 };
  return { ...result, fetchedProducts: products.length, acceptedVariants: deals.length, skippedProducts: products.length - acceptedProductIds.size, dryRun: false };
}
