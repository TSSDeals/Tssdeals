import assert from "node:assert/strict";
import test from "node:test";
import {
  baselineProductToDeals,
  baselineSyncDiagnostics,
  syncBaselineSports,
} from "./baseline-sports-sync";
import type { ShopifyProduct } from "./shopify-sync";

const glove: ShopifyProduct = {
  id: 10,
  title: "Wilson A2000 1786 Baseball Glove",
  handle: "wilson-a2000-1786",
  vendor: "Wilson",
  product_type: "Baseball Glove",
  tags: ["Baseball", "Infield", "11.5"],
  variants: [
    { id: 101, title: "RHT", price: "299.99", compare_at_price: "399.99", available: true, sku: "WBW-RHT", option1: "RHT", option2: null, option3: null },
    { id: 102, title: "LHT", price: "299.99", compare_at_price: "999.99", available: true, sku: "WBW-LHT", option1: "LHT", option2: null, option3: null },
    { id: 103, title: "Sold out", price: "249.99", compare_at_price: null, available: false, sku: "SOLD", option1: null, option2: null, option3: null },
  ],
  images: [{ id: 1, src: "https://cdn.shopify.com/glove.jpg", width: 800, height: 800 }],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-07-24T00:00:00Z",
};

test("Baseline adapter emits active variants, structured metadata, and tagged URLs", () => {
  const deals = baselineProductToDeals(glove);
  assert.equal(deals.length, 2);
  assert.equal(deals[0].sourceId, "baseline-sports");
  assert.equal(deals[0].equipmentTypeId, "bb-gloves");
  assert.equal(deals[0].url, "https://www.baselinesports.us/products/wilson-a2000-1786?variant=101&aff=380");
  assert.equal((deals[0].raw as any).shopifySku, "WBW-RHT");
  assert.equal((deals[0].raw as any).baselineCouponEligibility, "unknown");
  assert.equal(deals[0].msrpCents, 39_999);
  assert.equal(deals[1].msrpCents, null, "implausible compare-at price must not be trusted");
});

test("Baseline adapter rejects non-products and unknown taxonomy instead of polluting deals", () => {
  assert.deepEqual(baselineProductToDeals({ ...glove, title: "Signed Baseball Glove", product_type: "Collectible" }), []);
  assert.deepEqual(baselineProductToDeals({ ...glove, title: "Mystery Lifestyle Product", product_type: "" , tags: [] }), []);
});

test("Baseline source is disabled by default and dry-run never writes", async () => {
  assert.deepEqual(baselineSyncDiagnostics({}, true), {
    sourceId: "baseline-sports",
    storefront: "https://www.baselinesports.us",
    catalogEndpoint: "https://www.baselinesports.us/products.json",
    enabled: false,
    mode: "disabled",
  });

  let writes = 0;
  const result = await syncBaselineSports({
    dryRun: true,
    env: { ENABLE_BASELINE_SPORTS_SYNC: "true" },
    fetchProducts: async () => [glove],
    bulkUpsertDeals: async () => { writes++; return { created: 2, updated: 0 }; },
    ensureSource: async () => { writes++; },
  });
  assert.equal(writes, 0);
  assert.equal(result.acceptedVariants, 2);
  assert.equal(result.dryRun, true);
});

test("Baseline write mode cannot run without the explicit feature flag", async () => {
  await assert.rejects(
    syncBaselineSports({
      dryRun: false,
      env: {},
      fetchProducts: async () => [glove],
      bulkUpsertDeals: async () => ({ created: 0, updated: 0 }),
      ensureSource: async () => undefined,
    }),
    /ENABLE_BASELINE_SPORTS_SYNC is not enabled/,
  );
});
