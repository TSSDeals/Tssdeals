import type { InsertDeal } from "@shared/schema";
import { shopifyProductToDeal, type ShopifyProduct, type ShopifyVariant } from "./shopify-sync";
import { classifyDeterministicProduct } from "./deterministic-product-classifier";

export const SHOPIFY_COLLECTIVE_SOURCE_ID = "shopify-collective";
export const SHOPIFY_COLLECTIVE_SOURCE_NAME = "Twin Seam Collective";
export const SHOPIFY_COLLECTIVE_FEATURE_FLAG = "ENABLE_SHOPIFY_COLLECTIVE_SYNC";
export const SHOPIFY_COLLECTIVE_STORE_DOMAIN = "twinseamsports.myshopify.com";
export const SHOPIFY_COLLECTIVE_STOREFRONT = "https://www.twinseamsports.com";

const OWN_VENDOR = /\btwin\s*seam\s*sports\b/i;
const EXCLUDED = /\b(?:work gloves?|winter gloves?|golf gloves?|batting gloves?|sliding mitts?|oven mitts?|costume|furniture|display case|gift card|signed|autograph|memorabilia)\b/i;

const CATEGORY_RULES: Array<{ pattern: RegExp; sportId: string; equipmentTypeId: string }> = [
  { pattern: /\b(?:baseball|softball|fielding|infield|outfield|pitcher'?s?|catcher'?s?|first base)\b[\s\S]*\b(?:glove|mitt)s?\b|\b(?:glove|mitt)s?\b[\s\S]*\b(?:baseball|softball|fielding|infield|outfield|pitcher'?s?|catcher'?s?|first base)\b/i, sportId: "baseball", equipmentTypeId: "bb-gloves" },
  { pattern: /\bfastpitch\b[\s\S]*\bbats?\b|\bbats?\b[\s\S]*\bfastpitch\b/i, sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  { pattern: /\b(?:baseball|usssa|bbcor|usa baseball|wood)\b[\s\S]*\bbats?\b|\bbats?\b[\s\S]*\b(?:baseball|usssa|bbcor|usa baseball)\b/i, sportId: "baseball", equipmentTypeId: "bb-bats" },
  { pattern: /\b(?:baseball|softball|catcher'?s?)\b[\s\S]*\b(?:batting helmets?|catcher'?s gear|chest protectors?|leg guards?)\b|\b(?:batting helmets?|catcher'?s gear|chest protectors?|leg guards?)\b[\s\S]*\b(?:baseball|softball|catcher'?s?)\b/i, sportId: "baseball", equipmentTypeId: "bb-protective" },
  { pattern: /\b(?:baseball|softball)\b[\s\S]*\bcleats?\b|\bcleats?\b[\s\S]*\b(?:baseball|softball)\b/i, sportId: "baseball", equipmentTypeId: "bb-cleats" },
  { pattern: /\b(?:running shoes?|road running shoes?|trail running shoes?)\b/i, sportId: "running", equipmentTypeId: "run-shoes" },
  { pattern: /\bgolf\b[\s\S]*\b(?:clubs?|drivers?|fairway woods?|iron sets?|putters?|wedges?)\b|\b(?:golf clubs?|golf drivers?|golf putters?|golf wedges?)\b/i, sportId: "golf", equipmentTypeId: "golf-other" },
];

const SHOPIFY_TAXONOMY_RULES: Array<{ pattern: RegExp; sportId: string; equipmentTypeId: string }> = [
  { pattern: /\bbaseball\s*&\s*softball\b[\s\S]*\bfielding gloves?\s*$/i, sportId: "baseball", equipmentTypeId: "bb-gloves" },
  { pattern: /\bbaseball\b[\s\S]*\bbats?\s*$/i, sportId: "baseball", equipmentTypeId: "bb-bats" },
  { pattern: /\bsoftball\b[\s\S]*\bbats?\s*$/i, sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  { pattern: /\bbaseball\s*&\s*softball\b[\s\S]*\bcleats?\s*$/i, sportId: "baseball", equipmentTypeId: "bb-cleats" },
  { pattern: /\bbaseball\s*&\s*softball\b[\s\S]*\bprotective gear\s*$/i, sportId: "baseball", equipmentTypeId: "bb-protective" },
  { pattern: /\brunning\b[\s\S]*\bshoes?\s*$/i, sportId: "running", equipmentTypeId: "run-shoes" },
  { pattern: /\bgolf\b[\s\S]*\bgolf clubs?\s*$/i, sportId: "golf", equipmentTypeId: "golf-other" },
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
  const category = product.category?.fullName?.toLowerCase() ?? "";
  const taxonomyRule = SHOPIFY_TAXONOMY_RULES.find((rule) => rule.pattern.test(category));
  if (taxonomyRule) {
    const text = productText(product);
    if (EXCLUDED.test(text)) return null;
    const deterministic = classifyDeterministicProduct(text);
    if (deterministic) {
      return {
        sportId: deterministic.sportId,
        equipmentTypeId: deterministic.equipmentTypeId,
      };
    }
    return { sportId: taxonomyRule.sportId, equipmentTypeId: taxonomyRule.equipmentTypeId };
  }
  // A populated Shopify category is stronger evidence than merchant wording.
  // If it is outside the launch allowlist, do not reinterpret the product from
  // a sports phrase in its title (for example, "baseball bat necklace").
  if (category) return null;
  const text = [product.title, product.productType, ...(product.tags ?? [])].join(" ");
  if (EXCLUDED.test(text)) return null;
  const deterministic = classifyDeterministicProduct(text);
  if (deterministic) {
    return {
      sportId: deterministic.sportId,
      equipmentTypeId: deterministic.equipmentTypeId,
    };
  }
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
      // The Collective gate is deliberately stricter than the legacy Shopify
      // importer. Do not let a broad merchant product-type refinement undo the
      // category decision that was just verified above.
      deal.sportId = category.sportId;
      deal.equipmentTypeId = category.equipmentTypeId;
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

type BulkProductLine = Omit<CollectiveProduct, "featuredMedia" | "variants"> & {
  featuredImage?: { url: string; width: number; height: number } | null;
  __parentId?: string;
};

type BulkVariantLine = CollectiveVariant & { __parentId: string };

export async function fetchCollectiveProductsBulk(options: {
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
  const endpoint = `https://${domain}/admin/api/2026-07/graphql.json`;

  const graphql = async (query: string) => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query }),
    });
    const payload = await response.json() as any;
    if (!response.ok || payload.errors?.length) {
      const detail = payload.errors?.map((error: any) => error.message).filter(Boolean).join("; ");
      throw new Error(`Shopify bulk catalog request failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    return payload.data;
  };

  const bulkQuery = `{
    products(query: "status:active") {
      edges {
        node {
          id legacyResourceId title handle status vendor productType tags onlineStoreUrl
          category { fullName }
          featuredImage { url width height }
          variants {
            edges {
              node { id legacyResourceId title sku price compareAtPrice availableForSale }
            }
          }
        }
      }
    }
  }`;
  const started = await graphql(`mutation {
    bulkOperationRunQuery(query: ${JSON.stringify(bulkQuery)}) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }`);
  const userErrors = started?.bulkOperationRunQuery?.userErrors ?? [];
  if (userErrors.length || !started?.bulkOperationRunQuery?.bulkOperation?.id) {
    const detail = userErrors.map((error: any) => error.message).filter(Boolean).join("; ");
    throw new Error(`Shopify bulk catalog could not start${detail ? `: ${detail}` : ""}`);
  }
  const operationId = started.bulkOperationRunQuery.bulkOperation.id;

  let downloadUrl: string | null = null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const statusData = await graphql(`query {
      currentBulkOperation(type: QUERY) { id status errorCode objectCount url }
    }`);
    const operation = statusData?.currentBulkOperation;
    if (!operation || operation.id !== operationId) {
      throw new Error("Shopify bulk catalog operation was replaced before completion");
    }
    if (operation.status === "COMPLETED") {
      downloadUrl = operation.url;
      break;
    }
    if (["FAILED", "CANCELED", "EXPIRED"].includes(operation.status)) {
      throw new Error(`Shopify bulk catalog operation ${String(operation.status).toLowerCase()}${operation.errorCode ? `: ${operation.errorCode}` : ""}`);
    }
    await sleep(2_000);
  }
  if (!downloadUrl) throw new Error("Shopify bulk catalog operation timed out");

  const download = await fetchImpl(downloadUrl);
  if (!download.ok) throw new Error(`Shopify bulk catalog download failed (${download.status})`);
  const lines = (await download.text()).split(/\r?\n/).filter(Boolean);
  const products = new Map<string, CollectiveProduct>();
  const pendingVariants = new Map<string, CollectiveVariant[]>();

  for (const line of lines) {
    const row = JSON.parse(line) as BulkProductLine | BulkVariantLine;
    if (String(row.id).startsWith("gid://shopify/ProductVariant/")) {
      const variant = row as BulkVariantLine;
      const variants = pendingVariants.get(variant.__parentId) ?? [];
      variants.push({
        id: variant.id,
        legacyResourceId: String(variant.legacyResourceId),
        title: variant.title,
        sku: variant.sku,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        availableForSale: variant.availableForSale,
      });
      pendingVariants.set(variant.__parentId, variants);
      continue;
    }
    const product = row as BulkProductLine;
    const image = product.featuredImage;
    products.set(product.id, {
      ...product,
      legacyResourceId: String(product.legacyResourceId),
      featuredMedia: image ? { preview: { image } } : null,
      variants: { nodes: pendingVariants.get(product.id) ?? [] },
    });
  }
  for (const [productId, variants] of pendingVariants) {
    const product = products.get(productId);
    if (product) product.variants.nodes = variants;
  }
  return [...products.values()];
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
  const products = await (options.fetchProducts ?? (() => fetchCollectiveProductsBulk({ env })))();
  const deals = products.flatMap(collectiveProductToDeals);
  const acceptedProductIds = new Set(deals.map((deal) => (deal.raw as any).shopifyProductGid));
  if (options.dryRun) {
    return { created: 0, updated: 0, fetchedProducts: products.length, acceptedVariants: deals.length, skippedProducts: products.length - acceptedProductIds.size, dryRun: true };
  }
  await options.ensureSource(SHOPIFY_COLLECTIVE_SOURCE_ID, SHOPIFY_COLLECTIVE_SOURCE_NAME, SHOPIFY_COLLECTIVE_STOREFRONT);
  const result = deals.length ? await options.bulkUpsertDeals(deals) : { created: 0, updated: 0 };
  return { ...result, fetchedProducts: products.length, acceptedVariants: deals.length, skippedProducts: products.length - acceptedProductIds.size, dryRun: false };
}
