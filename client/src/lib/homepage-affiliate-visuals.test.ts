import assert from "node:assert/strict";
import test from "node:test";
import {
  affiliateProductVisual,
  chooseCategoryVisuals,
  chooseStarterVisuals,
} from "./homepage-affiliate-visuals";

const product = (overrides: Record<string, unknown> = {}) => ({
  id: "product-1",
  title: "Wilson A2000 1786 11.5 Baseball Glove",
  sourceId: "impact-wilson-family-of-brands",
  url: "https://wilson.example/products/a2000?irclickid=tracked",
  imageUrl: "https://cdn.example/products/a2000.jpg",
  sportId: "baseball",
  equipmentTypeId: "bb-gloves",
  raw: { impactCatalogItemId: "impact-1" },
  ...overrides,
});

test("affiliate visuals require a real product-feed record and tracked destination", () => {
  assert.equal(affiliateProductVisual(product())?.provenance, "affiliate-product-feed");
  assert.equal(affiliateProductVisual(product({ url: "" })), null);
  assert.equal(affiliateProductVisual(product({ raw: {} })), null);
  assert.equal(affiliateProductVisual(product({ raw: { assetType: "banner" } })), null);
});

test("tracking pixels and unavailable products never become category artwork", () => {
  assert.equal(
    affiliateProductVisual(product({ imageUrl: "https://cdn.example/pixel-1x1.gif" })),
    null,
  );
  assert.equal(
    affiliateProductVisual(product({ raw: { impactCatalogItemId: "impact-1", availability: "out of stock" } })),
    null,
  );
});

test("owned and direct-partner product imagery outrank network feed images", () => {
  const selected = chooseCategoryVisuals([
    product({ id: "impact", imageUrl: "https://cdn.example/impact.jpg" }),
    product({
      id: "baseline",
      sourceId: "baseline-sports",
      imageUrl: "https://cdn.example/baseline.jpg",
      raw: { shopifyProductId: "baseline-1" },
    }),
    product({
      id: "owned",
      sourceId: "twin-seam-sports",
      imageUrl: "https://cdn.example/owned.jpg",
      raw: { shopifyProductId: "owned-1" },
    }),
  ]);

  assert.equal(selected["bb-gloves"]?.imageUrl, "https://cdn.example/owned.jpg");
  assert.equal(selected["bb-gloves"]?.destinationUrl.includes("irclickid=tracked"), true);
});

test("starter imagery uses the same guarded product pool", () => {
  const selected = chooseStarterVisuals([
    product(),
    product({
      id: "promo",
      title: "27/17 Louisville Supra",
      imageUrl: "https://cdn.example/supra.jpg",
      raw: { assetType: "promotion" },
    }),
  ], ["A2000 1786 11.5", "27/17 Louisville Supra"]);

  assert.equal(selected["A2000 1786 11.5"]?.imageUrl, "https://cdn.example/products/a2000.jpg");
  assert.equal(selected["27/17 Louisville Supra"], undefined);
});
