import assert from "node:assert/strict";
import test from "node:test";
import {
  collectiveProductToDeals,
  syncShopifyCollective,
  type CollectiveProduct,
} from "./shopify-collective-sync";

const glove: CollectiveProduct = {
  id: "gid://shopify/Product/100",
  legacyResourceId: "100",
  title: "Wilson A2000 1786 11.5 Baseball Glove",
  handle: "wilson-a2000-1786",
  status: "ACTIVE",
  vendor: "Harder Sporting Goods",
  productType: "Fielding Gloves",
  tags: ["Baseball", "Infield"],
  onlineStoreUrl: null,
  category: { fullName: "Sporting Goods > Team Sports > Baseball & Softball > Baseball & Softball Fielding Gloves" },
  featuredMedia: { preview: { image: { url: "https://cdn.shopify.com/glove.jpg", width: 800, height: 800 } } },
  variants: { nodes: [
    { id: "gid://shopify/ProductVariant/101", legacyResourceId: "101", title: "RHT", sku: "A2000-RHT", price: "299.99", compareAtPrice: "329.99", availableForSale: true },
    { id: "gid://shopify/ProductVariant/102", legacyResourceId: "102", title: "LHT", sku: "A2000-LHT", price: "299.99", compareAtPrice: null, availableForSale: false },
  ] },
};

test("Collective adapter accepts available sporting variants and uses a Shop route", () => {
  const deals = collectiveProductToDeals(glove);
  assert.equal(deals.length, 1);
  assert.equal(deals[0].sourceId, "shopify-collective");
  assert.equal(deals[0].equipmentTypeId, "bb-gloves");
  assert.equal(deals[0].url, "https://shop.app/products/100?variantId=101");
  assert.equal((deals[0].raw as any).shopifySupplier, "Harder Sporting Goods");
  assert.equal((deals[0].raw as any).shopifySalesChannel, "shop");
});

test("Collective adapter excludes own inventory, unavailable rows, and misleading gloves", () => {
  assert.deepEqual(collectiveProductToDeals({ ...glove, vendor: "Twin Seam Sports" }), []);
  assert.deepEqual(collectiveProductToDeals({ ...glove, status: "DRAFT" }), []);
  assert.deepEqual(collectiveProductToDeals({
    ...glove,
    title: "Premium Leather Work Glove",
    productType: "Work Gloves",
    category: { fullName: "Hardware > Work Safety Protective Gear > Safety Gloves" },
  }), []);
  assert.deepEqual(collectiveProductToDeals({
    ...glove,
    title: "Franklin Sliding Mitt",
    productType: "Sliding Mitts",
    category: null,
  }), []);
});

test("Collective adapter keeps batting gloves separate from fielding gloves", () => {
  assert.deepEqual(collectiveProductToDeals({
    ...glove,
    title: "Jax Athletics Baseball Batting Gloves",
    productType: "Batting Gloves",
    category: { fullName: "Sporting Goods > Team Sports > Baseball & Softball > Batting Gloves" },
  }), []);
});

test("Collective sync is explicit opt-in and dry-run never writes", async () => {
  let writes = 0;
  const result = await syncShopifyCollective({
    dryRun: true,
    env: { ENABLE_SHOPIFY_COLLECTIVE_SYNC: "true" },
    fetchProducts: async () => [glove],
    bulkUpsertDeals: async () => { writes++; return { created: 1, updated: 0 }; },
    ensureSource: async () => { writes++; },
  });
  assert.equal(writes, 0);
  assert.equal(result.acceptedVariants, 1);
  assert.equal(result.dryRun, true);
});

test("Collective write mode cannot run without the feature flag", async () => {
  await assert.rejects(
    syncShopifyCollective({
      dryRun: false,
      env: {},
      fetchProducts: async () => [glove],
      bulkUpsertDeals: async () => ({ created: 0, updated: 0 }),
      ensureSource: async () => undefined,
    }),
    /ENABLE_SHOPIFY_COLLECTIVE_SYNC/,
  );
});
