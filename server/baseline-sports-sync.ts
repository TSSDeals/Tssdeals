import type { InsertDeal } from "@shared/schema";
import {
  applyOutboundAffiliateUrl,
  BASELINE_SPORTS_NAME,
  BASELINE_SPORTS_SOURCE_ID,
  BASELINE_SPORTS_URL,
} from "@shared/retailer-programs";
import {
  fetchShopifyProducts,
  shopifyProductToDeal,
  type ShopifyProduct,
  type ShopifyVariant,
} from "./shopify-sync";
import { classifyDeterministicProduct } from "./deterministic-product-classifier";

export const BASELINE_SYNC_FEATURE_FLAG = "ENABLE_BASELINE_SPORTS_SYNC";

export type BaselineSyncDiagnostics = {
  sourceId: string;
  storefront: string;
  catalogEndpoint: string;
  enabled: boolean;
  mode: "disabled" | "dry-run" | "write";
};

export type BaselineSyncResult = {
  created: number;
  updated: number;
  fetchedProducts: number;
  acceptedVariants: number;
  skippedProducts: number;
  dryRun: boolean;
};

const CATEGORY_RULES: Array<{
  pattern: RegExp;
  sportId: string;
  equipmentTypeId: string;
}> = [
  { pattern: /\bfastpitch\b[\s\S]*\bbats?\b|\bbats?\b[\s\S]*\bfastpitch\b/i, sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
  { pattern: /\b(?:baseball|usssa|bbcor|usa baseball|wood)\b[\s\S]*\bbats?\b|\bbats?\b[\s\S]*\b(?:baseball|usssa|bbcor|usa baseball)\b/i, sportId: "baseball", equipmentTypeId: "bb-bats" },
  { pattern: /\b(?:baseball|softball|infield|outfield|pitcher|catcher|first base|fielding)\b[\s\S]*\b(?:glove|mitt)\b|\b(?:glove|mitt)\b[\s\S]*\b(?:baseball|softball|infield|outfield|pitcher|catcher|first base|fielding)\b/i, sportId: "baseball", equipmentTypeId: "bb-gloves" },
  { pattern: /\bbatting helmets?\b|\bcatcher'?s gear\b|\bprotective gear\b/i, sportId: "baseball", equipmentTypeId: "bb-protective" },
  { pattern: /\b(?:baseball|softball)\b[\s\S]*\bcleats?\b|\bcleats?\b[\s\S]*\b(?:baseball|softball)\b/i, sportId: "baseball", equipmentTypeId: "bb-cleats" },
  { pattern: /\b(?:baseballs?|practice balls?|training balls?)\b/i, sportId: "baseball", equipmentTypeId: "bb-balls" },
  { pattern: /\b(?:batting tees?|pitching machines?|training equipment)\b/i, sportId: "baseball", equipmentTypeId: "bb-training" },
  { pattern: /\b(?:batting gloves?|bags?|apparel|shirts?|hoodies?|hats?|accessories)\b/i, sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
];

const NON_PRODUCT_PATTERN =
  /\b(?:gift cards?|display cases?|autograph|signed|memorabilia|replacement parts?)\b/i;

function productText(product: ShopifyProduct): string {
  return [
    product.title,
    product.product_type,
    product.vendor,
    ...(product.tags ?? []),
  ].join(" ");
}
function categoryFor(product: ShopifyProduct): { sportId: string; equipmentTypeId: string } | null {
  const text = productText(product);
  if (NON_PRODUCT_PATTERN.test(text)) return null;
  const deterministic = classifyDeterministicProduct(text);
  if (deterministic) {
    return {
      sportId: deterministic.sportId,
      equipmentTypeId: deterministic.equipmentTypeId,
    };
  }
  return CATEGORY_RULES.find((rule) => rule.pattern.test(text)) ?? null;
}

function trustworthyCompareAt(variant: ShopifyVariant): boolean {
  const price = Number(variant.price);
  const compareAt = Number(variant.compare_at_price);
  return (
    Number.isFinite(price) &&
    Number.isFinite(compareAt) &&
    price > 0 &&
    compareAt > price &&
    compareAt <= price * 2
  );
}

function variantProduct(product: ShopifyProduct, variant: ShopifyVariant): ShopifyProduct {
  const variantLabel = variant.title?.trim();
  const hasUsefulVariantLabel = variantLabel && !/^default title$/i.test(variantLabel);
  return {
    ...product,
    title: hasUsefulVariantLabel ? `${product.title} — ${variantLabel}` : product.title,
    variants: [{
      ...variant,
      compare_at_price: trustworthyCompareAt(variant) ? variant.compare_at_price : null,
    }],
  };
}

export function baselineProductToDeals(product: ShopifyProduct): InsertDeal[] {
  const category = categoryFor(product);
  if (!category) return [];

  return (product.variants ?? [])
    .filter((variant) => variant.available)
    .map((variant) => {
      const deal = shopifyProductToDeal(
        variantProduct(product, variant),
        category.sportId,
        category.equipmentTypeId,
        BASELINE_SPORTS_URL,
        BASELINE_SPORTS_SOURCE_ID,
      );
      if (!deal) return null;
      deal.url = applyOutboundAffiliateUrl(
        `${BASELINE_SPORTS_URL}/products/${product.handle}?variant=${variant.id}`,
      );
      deal.raw = {
        ...(deal.raw as Record<string, unknown>),
        catalogAdapter: BASELINE_SPORTS_SOURCE_ID,
        baselineCouponEligibility: "unknown",
        baselineCouponRulesVersion: 1,
        shopifyProductStatus: "active",
        shopifyVariantAvailable: true,
        shopifyVariantTitle: variant.title,
        shopifySku: variant.sku,
      };
      return deal;
    })
    .filter((deal): deal is InsertDeal => deal !== null);
}

export function baselineSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[BASELINE_SYNC_FEATURE_FLAG] === "true";
}

export function baselineSyncDiagnostics(
  env: NodeJS.ProcessEnv = process.env,
  dryRun = true,
): BaselineSyncDiagnostics {
  const enabled = baselineSyncEnabled(env);
  return {
    sourceId: BASELINE_SPORTS_SOURCE_ID,
    storefront: BASELINE_SPORTS_URL,
    catalogEndpoint: `${BASELINE_SPORTS_URL}/products.json`,
    enabled,
    mode: !enabled ? "disabled" : dryRun ? "dry-run" : "write",
  };
}

export async function syncBaselineSports(options: {
  dryRun: boolean;
  bulkUpsertDeals: (deals: InsertDeal[]) => Promise<{ created: number; updated: number }>;
  ensureSource: (id: string, name: string, url: string) => Promise<void>;
  fetchProducts?: (url: string, maxPages: number, pageDelayMs: number) => Promise<ShopifyProduct[]>;
  env?: NodeJS.ProcessEnv;
}): Promise<BaselineSyncResult> {
  const env = options.env ?? process.env;
  if (!baselineSyncEnabled(env)) {
    throw new Error(`${BASELINE_SYNC_FEATURE_FLAG} is not enabled`);
  }

  const fetchProducts = options.fetchProducts ?? fetchShopifyProducts;
  const products = await fetchProducts(BASELINE_SPORTS_URL, 10, 750);
  const deals = products.flatMap(baselineProductToDeals);
  const acceptedProductIds = new Set(
    deals.map((deal) => (deal.raw as Record<string, unknown>)?.shopifyProductId),
  );

  if (options.dryRun) {
    return {
      created: 0,
      updated: 0,
      fetchedProducts: products.length,
      acceptedVariants: deals.length,
      skippedProducts: products.length - acceptedProductIds.size,
      dryRun: true,
    };
  }

  await options.ensureSource(
    BASELINE_SPORTS_SOURCE_ID,
    BASELINE_SPORTS_NAME,
    BASELINE_SPORTS_URL,
  );
  const result = deals.length
    ? await options.bulkUpsertDeals(deals)
    : { created: 0, updated: 0 };
  return {
    ...result,
    fetchedProducts: products.length,
    acceptedVariants: deals.length,
    skippedProducts: products.length - acceptedProductIds.size,
    dryRun: false,
  };
}
