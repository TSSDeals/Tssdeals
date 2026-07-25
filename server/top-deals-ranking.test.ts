import assert from "node:assert/strict";
import test from "node:test";
import type { Deal } from "@shared/schema";
import { rankTopDeals } from "./top-deals-ranking";

const now = new Date("2026-07-24T12:00:00Z");

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: crypto.randomUUID(),
    sourceId: "quality-sports",
    title: 'Wilson A2000 1786 11.5" Baseball Glove',
    brand: "Wilson",
    url: "https://example.com/wilson-a2000",
    imageUrl: "https://example.com/a2000.jpg",
    sportId: "baseball",
    equipmentTypeId: "bb-gloves",
    condition: "new",
    currency: "USD",
    msrpCents: 29999,
    manufacturerMsrpCents: 29999,
    msrpSource: "manufacturer",
    msrpVerified: true,
    priceCents: 19999,
    percentOff: "33.34",
    isBuyItNow: true,
    foundAt: now,
    lastSeenAt: now,
    lastPriceConfirmedAt: now,
    subFilterId: null,
    dropWeight: null,
    sizeNumber: null,
    autoIncluded: false,
    autoIncludeRuleId: null,
    raw: {},
    originalPriceCents: 24999,
    highestPriceCents: 24999,
    priceDropPercent: "20",
    hasPriceDrop: true,
    isFeatured: false,
    isLow30d: true,
    isLow60d: true,
    isLow90d: true,
    isLow180d: false,
    isLow365d: false,
    promoCode: null,
    promoDescription: null,
    classificationSource: "source",
    classificationConfidence: "high",
    ...overrides,
  } as Deal;
}

test("credible equipment outranks an inflated retailer anchor and hides its savings claim", () => {
  const credible = deal({ id: "credible" });
  const inflated = deal({
    id: "inflated",
    title: "Generic Baseball Training Net",
    msrpVerified: false,
    manufacturerMsrpCents: null,
    msrpCents: 99999,
    percentOff: "95",
    priceCents: 4999,
    hasPriceDrop: false,
    isLow30d: false,
    isLow60d: false,
    isLow90d: false,
  });
  const ranked = rankTopDeals([inflated, credible], { now });
  assert.equal(ranked[0].id, "credible");
  assert.equal(ranked.some((item) => item.id === "inflated"), false);
});

test("broad feed rejects cheap accessories, parts, collectibles, stale, unavailable, and malformed rows", () => {
  const garbage = [
    deal({ id: "cheap", title: "Baseball Glove Wristband Accessory", priceCents: 100 }),
    deal({ id: "part", title: "Replacement Bat End Cap Only" }),
    deal({ id: "signed", title: "Signed Baseball Collectible" }),
    deal({ id: "stale", lastSeenAt: new Date("2026-06-01"), lastPriceConfirmedAt: null }),
    deal({ id: "ended", raw: { availability: "out of stock" } }),
    deal({ id: "bad-title", title: "Bat" }),
    deal({ id: "bad-url", url: "" }),
  ];
  assert.deepEqual(rankTopDeals(garbage, { now }), []);
});

test("explicit accessory categories can rank useful accessories", () => {
  const accessory = deal({
    id: "accessory",
    title: "Premium Baseball Bat Grip Tape Accessory",
    equipmentTypeId: "bb-accessories",
    priceCents: 899,
  });
  const ranked = rankTopDeals([accessory], {
    now,
    category: { sportId: "baseball", equipmentTypeId: "bb-accessories", searchQuery: "accessories" },
  });
  assert.equal(ranked[0]?.id, "accessory");
});

test("shipping distortion cannot turn a low sticker price into a top deal", () => {
  const distorted = deal({
    id: "shipping",
    priceCents: 1999,
    raw: { shippingCostCents: 4999 },
  });
  assert.equal(rankTopDeals([distorted], { now }).length, 0);
});

test("missing images reduce quality without fabricating or discarding otherwise verified value", () => {
  const complete = deal({ id: "complete" });
  const missingImage = deal({
    id: "missing-image",
    title: "Rawlings Heart of the Hide 11.75 Baseball Glove",
    brand: "Rawlings",
    imageUrl: null,
    url: "https://example.com/rawlings-hoh",
  });
  const ranked = rankTopDeals([missingImage, complete], { now });
  assert.equal(ranked[0].id, "complete");
  assert.ok(ranked.some((item) => item.id === "missing-image"));
});

test("equivalent variants collapse to the best representative", () => {
  const lesser = deal({
    id: "lesser",
    title: 'Wilson A2000 1786 11.5" Baseball Glove 2026',
    hasPriceDrop: false,
    isLow30d: false,
    isLow60d: false,
    isLow90d: false,
    sourceId: "seller-a",
  });
  const best = deal({
    id: "best",
    title: 'Wilson A2000 1786 12" Baseball Glove 2026',
    sourceId: "seller-b",
  });
  const ranked = rankTopDeals([lesser, best], { now });
  assert.deepEqual(ranked.map((item) => item.id), ["best"]);
});

test("diversity prevents one retailer from dominating and engagement is bounded", () => {
  const oneSource = Array.from({ length: 8 }, (_, index) =>
    deal({
      id: `same-${index}`,
      sourceId: "mega-retailer",
      title: `Wilson A2000 Model ${index} Baseball Glove`,
      url: `https://example.com/${index}`,
    }),
  );
  const alternatives = Array.from({ length: 4 }, (_, index) =>
    deal({
      id: `alt-${index}`,
      sourceId: `retailer-${index}`,
      title: `Rawlings Heart of the Hide Model ${index} Baseball Glove`,
      brand: "Rawlings",
      url: `https://other.example/${index}`,
    }),
  );
  const clicks = new Map([["alt-0", 32]]);
  const ranked = rankTopDeals([...oneSource, ...alternatives], { now, limit: 8, clickCounts: clicks });
  assert.ok(ranked.filter((item) => item.sourceId === "mega-retailer").length <= 2);
  assert.ok(ranked.some((item) => item.id === "alt-0" && item.topDealClickCount === 32));
});
