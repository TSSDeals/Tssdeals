import assert from "node:assert/strict";
import test from "node:test";
import {
  clearShopifyClientTokenCache,
  collectiveProductToDeals,
  getShopifyAdminAccessToken,
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

test("Shopify client credentials produce and cache a short-lived Admin token", async () => {
  clearShopifyClientTokenCache();
  let calls = 0;
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.equal(String(input), "https://twinseamsports.myshopify.com/admin/oauth/access_token");
    assert.equal(init?.method, "POST");
    const body = String(init?.body);
    assert.match(body, /grant_type=client_credentials/);
    assert.match(body, /client_id=client-id/);
    assert.match(body, /client_secret=client-secret/);
    return new Response(JSON.stringify({
      access_token: "short-lived-token",
      expires_in: 86_400,
      scope: "read_products",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const env = {
    SHOPIFY_CLIENT_ID: "client-id",
    SHOPIFY_CLIENT_SECRET: "client-secret",
    SHOPIFY_STORE_DOMAIN: "twinseamsports.myshopify.com",
  };
  assert.equal(await getShopifyAdminAccessToken({ env, fetchImpl, now: () => 1_000 }), "short-lived-token");
  assert.equal(await getShopifyAdminAccessToken({ env, fetchImpl, now: () => 2_000 }), "short-lived-token");
  assert.equal(calls, 1);
});

test("legacy static Admin token remains supported without a network exchange", async () => {
  clearShopifyClientTokenCache();
  assert.equal(
    await getShopifyAdminAccessToken({
      env: { SHOPIFY_ADMIN_ACCESS_TOKEN: "existing-token" },
      fetchImpl: async () => { throw new Error("must not fetch"); },
    }),
    "existing-token",
  );
});

test("Shopify client authentication errors never include credential values", async () => {
  clearShopifyClientTokenCache();
  await assert.rejects(
    getShopifyAdminAccessToken({
      env: {
        SHOPIFY_CLIENT_ID: "sensitive-id",
        SHOPIFY_CLIENT_SECRET: "sensitive-secret",
      },
      fetchImpl: async () => new Response(JSON.stringify({
        error: "invalid_client",
        error_description: "Client credentials are invalid",
      }), { status: 401, headers: { "Content-Type": "application/json" } }),
    }),
    (error: any) => {
      assert.match(error.message, /client credentials are invalid/i);
      assert.doesNotMatch(error.message, /sensitive-id|sensitive-secret/);
      return true;
    },
  );
});

test("Collective catalog retries a throttled page without losing its cursor", async () => {
  clearShopifyClientTokenCache();
  let graphqlCalls = 0;
  const waits: number[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    if (String(input).endsWith("/admin/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    graphqlCalls++;
    if (graphqlCalls === 1) {
      return new Response(JSON.stringify({
        errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        extensions: { cost: { throttleStatus: { currentlyAvailable: 0, restoreRate: 100 } } },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      data: {
        products: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const products = await (await import("./shopify-collective-sync")).fetchCollectiveProducts({
    env: { SHOPIFY_CLIENT_ID: "id", SHOPIFY_CLIENT_SECRET: "secret" },
    fetchImpl,
    sleep: async (milliseconds) => { waits.push(milliseconds); },
  });
  assert.deepEqual(products, []);
  assert.equal(graphqlCalls, 2);
  assert.deepEqual(waits, [5000]);
});
