import assert from "node:assert/strict";
import test from "node:test";
import type { ShopifyProduct } from "./shopify-sync";
import {
  BALL_GLOVE_BLUEPRINT_SOURCE_ID,
  ballGloveBlueprintProductToDeal,
  syncBallGloveBlueprint,
} from "./ball-glove-blueprint-sync";

function product(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: 101,
    title: '11.5" Emery Infield Glove I-Web RHT Japanese Kip Leather',
    handle: "emery-11-5-infield-rht",
    vendor: "Emery",
    product_type: "Baseball Glove",
    tags: ["11.5", "baseball", "emery", "infield", "RHT"],
    variants: [{
      id: 201,
      title: "Default Title",
      price: "349.00",
      compare_at_price: "399.00",
      available: true,
      sku: "EM-115-RHT",
      option1: "Default Title",
      option2: null,
      option3: null,
    }],
    images: [{ id: 301, src: "https://cdn.shopify.com/glove.jpg", width: 1200, height: 1200 }],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

test("maps an in-stock premium fielding glove with structured attributes", () => {
  const deal = ballGloveBlueprintProductToDeal(product());
  assert.ok(deal);
  assert.equal(deal.sourceId, BALL_GLOVE_BLUEPRINT_SOURCE_ID);
  assert.equal(deal.equipmentTypeId, "bb-gloves");
  assert.equal(deal.brand, "Emery");
  assert.equal(deal.sizeNumber, "11.5");
  assert.deepEqual(
    {
      position: (deal.raw as any).glovePosition,
      hand: (deal.raw as any).throwHand,
      premium: (deal.raw as any).premiumGloveSource,
      inStock: (deal.raw as any).inStock,
    },
    { position: "infield", hand: "RHT", premium: true, inStock: true },
  );
});

test("keeps trainer gloves out of ordinary playable fielding gloves", () => {
  const deal = ballGloveBlueprintProductToDeal(product({
    title: '9.5" Emery Infield Trainer I-Web RHT Japanese Kip Leather',
    tags: ["9.5", "baseball", "emery", "trainer", "RHT"],
  }));
  assert.ok(deal);
  assert.equal(deal.equipmentTypeId, "bb-training");
  assert.equal((deal.raw as any).glovePosition, "trainer");
});

test("accepts every available playable Ball Glove Blueprint maker and rejects non-fielding forms", () => {
  assert.equal(ballGloveBlueprintProductToDeal(product({
    variants: [{ ...product().variants[0], available: false }],
  })), null);
  const newMaker = ballGloveBlueprintProductToDeal(product({ vendor: "New Japanese Maker", tags: ["baseball"] }));
  assert.ok(newMaker);
  assert.equal(newMaker.brand, "New Japanese Maker");
  assert.equal((newMaker.raw as any).premiumGloveSource, true);
  assert.equal(ballGloveBlueprintProductToDeal(product({
    title: "Emery Premium Batting Gloves",
    product_type: "",
    tags: ["emery", "batting gloves"],
  })), null);
  assert.equal(ballGloveBlueprintProductToDeal(product({
    title: "Signed Emery Baseball Glove Display",
    tags: ["emery", "signed", "collectible"],
  })), null);
});

test("sync is bounded, fixture-driven, and upserts only accepted products", async () => {
  const fetched = [
    product(),
    product({ id: 102, variants: [{ ...product().variants[0], available: false }] }),
  ];
  const calls: string[] = [];
  let inserted = 0;

  const result = await syncBallGloveBlueprint(
    async (deals) => {
      inserted = deals.length;
      return { created: deals.length, updated: 0 };
    },
    async (id, name, url) => {
      calls.push(id, name, url);
    },
    async (url, maxPages, pageDelayMs) => {
      assert.equal(url, "https://ballgloveblueprint.com");
      assert.equal(maxPages, 2);
      assert.equal(pageDelayMs, 750);
      return fetched;
    },
  );

  assert.equal(inserted, 1);
  assert.equal(result.fetched, 2);
  assert.equal(result.accepted, 1);
  assert.equal(result.skipped, 1);
  assert.equal(calls[0], BALL_GLOVE_BLUEPRINT_SOURCE_ID);
});
