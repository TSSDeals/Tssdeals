import assert from "node:assert/strict";
import test from "node:test";
import type { Deal } from "@shared/schema";
import { matchesTopDealCategoryBoundary, rankTopDeals } from "./top-deals-ranking";

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

test("fielding-glove categories keep position gloves and exclude adjacent gear", () => {
  const context = {
    now,
    category: {
      name: "Elite Baseball Glove Deals",
      slug: "elite-baseball-gloves",
      sportId: "baseball",
      equipmentTypeId: null,
      searchQuery: "glove mitt",
    },
  };
  const fixtures = [
    deal({ id: "fielding", title: 'Wilson A2000 1786 11.5" Baseball Fielding Glove' }),
    deal({ id: "catcher", title: "Rawlings Heart of the Hide Catcher's Mitt" }),
    deal({ id: "first-base", title: "Wilson A2000 First Base Mitt" }),
    deal({ id: "batting", title: "Franklin CFX Pro Baseball Batting Gloves", equipmentTypeId: "bb-gloves" }),
    deal({ id: "sliding", title: "Evoshield Sliding Mitt", equipmentTypeId: "bb-gloves" }),
    deal({ id: "helmet", title: "Rawlings Mach AI Batting Helmet", equipmentTypeId: "bb-gloves" }),
    deal({ id: "oven", title: "Baseball Training Oven Mitt Accessory", equipmentTypeId: "bb-gloves" }),
    deal({ id: "care", title: "Premium Baseball Glove Care and Lace Kit", equipmentTypeId: "bb-gloves" }),
    deal({ id: "signed", title: "Mookie Betts Signed Baseball Glove Memorabilia", equipmentTypeId: "bb-gloves" }),
    deal({ id: "staff-golf", title: "Staff Model® Glove", equipmentTypeId: "bb-gloves" }),
    deal({ id: "rain-golf", title: "Rain Gloves", equipmentTypeId: "bb-gloves" }),
    deal({ id: "conform-golf", title: "Wilson Men's Conform Glove", equipmentTypeId: "bb-gloves" }),
    deal({ id: "football", title: "Wilson GST Football Receiver Gloves", equipmentTypeId: "bb-gloves" }),
    deal({ id: "work", title: "Cold Weather Work Gloves", equipmentTypeId: "bb-gloves" }),
  ];

  assert.deepEqual(
    fixtures.filter((item) => matchesTopDealCategoryBoundary(item, context)).map((item) => item.id),
    ["fielding", "catcher", "first-base"],
  );
  assert.deepEqual(
    rankTopDeals(fixtures, context).map((item) => item.id).sort(),
    ["catcher", "fielding", "first-base"],
  );
});

test("elite glove categories require trusted premium family or source evidence", () => {
  const context = {
    now,
    category: {
      name: "Elite Baseball Glove Deals",
      slug: "elite-baseball-gloves",
      sportId: "baseball",
      equipmentTypeId: null,
      searchQuery: "glove",
    },
  };
  const fixtures = [
    deal({ id: "a2k", sourceId: "source-a2k", title: 'Wilson A2K 1786 11.5" Baseball Glove', brand: "Wilson", raw: { sellerUsername: "seller-a2k" } }),
    deal({ id: "a2000", sourceId: "source-a2000", title: 'Wilson A2000 1786 11.5" Baseball Glove', brand: "Wilson", raw: { sellerUsername: "seller-a2000" } }),
    deal({ id: "hoh", sourceId: "source-hoh", title: 'Rawlings Heart of the Hide 11.75" Infield Glove', brand: "Rawlings", raw: { sellerUsername: "seller-hoh" } }),
    deal({ id: "pro-preferred", sourceId: "source-pro-preferred", title: 'Rawlings Pro Preferred 12.75" Outfield Glove', brand: "Rawlings", raw: { sellerUsername: "seller-pro-preferred" } }),
    deal({ id: "mizuno-pro", sourceId: "source-mizuno-pro", title: 'Mizuno Pro 11.5" Baseball Glove', brand: "Mizuno", raw: { sellerUsername: "seller-mizuno-pro" } }),
    deal({
      id: "premium-source",
      sourceId: "ball-glove-blueprint",
      title: '11.5" Inaba Infield Baseball Glove',
      brand: "Inaba",
      raw: { premiumGloveSource: true, premiumMaker: "Inaba", glovePosition: "infield", sellerUsername: "ball-glove-blueprint" },
    }),
    deal({ id: "prospect", title: "Mizuno Prospect Series PowerClose Baseball Glove", brand: "Mizuno" }),
    deal({ id: "players", title: "Rawlings Players Series Youth Baseball Glove", brand: "Rawlings" }),
    deal({ id: "r9", title: "Rawlings R9 Series Baseball Glove", brand: "Rawlings" }),
    deal({ id: "a500", title: "Wilson A500 Youth Baseball Glove", brand: "Wilson" }),
    deal({ id: "a700", title: "Wilson A700 Baseball Glove", brand: "Wilson" }),
    deal({ id: "generic", title: "Premium Leather Baseball Glove", brand: null }),
  ];

  assert.deepEqual(
    fixtures.filter((item) => matchesTopDealCategoryBoundary(item, context)).map((item) => item.id),
    ["a2k", "a2000", "hoh", "pro-preferred", "mizuno-pro", "premium-source"],
  );
  assert.deepEqual(
    rankTopDeals(fixtures, context).map((item) => item.id).sort(),
    ["a2000", "a2k", "hoh", "mizuno-pro", "premium-source", "pro-preferred"].sort(),
  );
});

test("bat categories reject batting helmets and accessories without affecting real bats", () => {
  const context = {
    now,
    category: {
      name: "Top Baseball Bat Deals",
      slug: "baseball-bats",
      sportId: "baseball",
      equipmentTypeId: null,
      searchQuery: "bat bbcor",
    },
  };
  const bat = deal({ id: "bat", title: "Louisville Slugger Atlas BBCOR Baseball Bat", equipmentTypeId: "bb-bats" });
  const helmet = deal({ id: "helmet", title: "Rawlings Mach Batting Helmet", equipmentTypeId: "bb-bats" });
  const grip = deal({ id: "grip", title: "Premium Baseball Bat Grip Tape", equipmentTypeId: "bb-bats" });
  assert.equal(matchesTopDealCategoryBoundary(bat, context), true);
  assert.equal(matchesTopDealCategoryBoundary(helmet, context), false);
  assert.equal(matchesTopDealCategoryBoundary(grip, context), false);
});

test("baseball bat gate rejects production racquet and apparel leaks", () => {
  const context = { now, category: { slug: "baseball-bats", name: "Top Baseball Bat Deals", searchQuery: "bat bbcor", sportId: "baseball" } };
  const fixtures = [
    deal({ id: "valid", title: "Louisville Slugger Atlas BBCOR Baseball Bat", equipmentTypeId: "bb-bats" }),
    deal({ id: "shift", title: "Wilson SHIFT 99 V1.0 FRM CUSTOM", equipmentTypeId: "bb-bats" }),
    deal({ id: "ultra", title: "Wilson Ultra 95 QZV5 Tennis Racket", equipmentTypeId: "bb-bats" }),
    deal({ id: "griffey", title: "Ken Griffey Jr Seattle Mariners Baseball Jersey", equipmentTypeId: "bb-bats" }),
    deal({ id: "jeter", title: "Derek Jeter New York Yankees Jersey", equipmentTypeId: "bb-bats" }),
  ];
  assert.deepEqual(fixtures.filter((item) => matchesTopDealCategoryBoundary(item, context)).map((item) => item.id), ["valid"]);
});

test("fastpitch bat variants collapse by model family before counting", () => {
  const context = { now, category: { slug: "fastpitch-softball-bats", name: "Top Fastpitch Softball Bat Deals", searchQuery: "fastpitch bat", sportId: "fastpitch-softball" } };
  const titles = [
    "2025 Marucci ASURA (-11) Fastpitch Softball Bat 30in/19oz MFPA11",
    "2025 Marucci ASURA -10 Fastpitch Softball Bat 31 inch 21 oz MFPA10",
    "2025 Marucci ASURA Fastpitch Bat Drop 8 32in x 24oz MFPA8",
    "2025 Marucci ASURA Fastpitch Softball Bat (-9) 33in/24oz MFPA9",
    "2025 Marucci ASURA Glow Citrus (-11) Fastpitch Bat 30in/19oz",
    "2025 Marucci ASURA Glow Citrus Drop -10 Fastpitch Softball Bat 31in/21oz",
    "Louisville Slugger LXT Fastpitch Softball Bat -10",
    "Marucci Whisper Fastpitch Softball Bat -10",
    "Mizuno CRBN Pro Fastpitch Softball Bat -10",
  ];
  const variants = titles.map((title, index) =>
    deal({
      id: `fastpitch-${index}`,
      sourceId: `source-${index}`,
      title,
      brand: title.startsWith("Louisville") ? "Louisville Slugger" : title.startsWith("Mizuno") ? "Mizuno" : "Marucci",
      equipmentTypeId: "fp-bats",
      sportId: "fastpitch-softball",
      url: `https://example.com/fastpitch-${index}`,
      priceDropPercent: String(20 + index),
      raw: {
        sellerUsername: `seller-${index}`,
        ...(index === 0 ? { model: "MFPA11" } : {}),
      },
    }),
  );
  const ranked = rankTopDeals(variants, { ...context, limit: 20 });
  assert.equal(ranked.length, 5);
  assert.equal(ranked.filter((item) => /\bASURA\b/i.test(item.title) && !/Glow Citrus/i.test(item.title)).length, 1);
  assert.equal(ranked.filter((item) => /Glow Citrus/i.test(item.title)).length, 1);
  assert.ok(ranked.some((item) => /\bLXT\b/i.test(item.title)));
  assert.ok(ranked.some((item) => /\bWhisper\b/i.test(item.title)));
  assert.ok(ranked.some((item) => /\bCRBN Pro\b/i.test(item.title)));
});

test("running shoes and cleats require footwear form and reject apparel mentions", () => {
  const running = { now, category: { slug: "running-shoes", name: "Top Running Shoe Deals", searchQuery: "running shoes" } };
  const cleats = { now, category: { slug: "cleats", name: "Top Cleat Deals", searchQuery: "cleats spikes" } };
  assert.equal(matchesTopDealCategoryBoundary(deal({ title: "Nike Pegasus 41 Road Running Shoes", equipmentTypeId: "running-shoes" }), running), true);
  assert.equal(matchesTopDealCategoryBoundary(deal({ title: "Fear of God MLB Athletics Sweatshirt", equipmentTypeId: "running-shoes" }), running), false);
  assert.equal(matchesTopDealCategoryBoundary(deal({ title: "New Balance FuelCell Baseball Cleats", equipmentTypeId: "cleats" }), cleats), true);
  assert.equal(matchesTopDealCategoryBoundary(deal({ title: "Team Shirt Designed to Match Cleats", equipmentTypeId: "cleats" }), cleats), false);
});

test("golf clubs require actual club form and cap non-USD results", () => {
  const context = { now, limit: 10, category: { slug: "golf-clubs", name: "Top Golf Club Deals", searchQuery: "club driver iron wedge putter", sportId: "golf" } };
  const usd = deal({ id: "usd-driver", title: "TaylorMade Qi10 Golf Driver", equipmentTypeId: "golf-clubs", sportId: "golf", currency: "USD" });
  const leaks = [
    deal({ id: "golf-shirt", title: "Titleist Golf Polo Shirt", equipmentTypeId: "golf-clubs", sportId: "golf" }),
    deal({ id: "headcover", title: "Driver Headcover Accessory", equipmentTypeId: "golf-clubs", sportId: "golf" }),
  ];
  const foreign = Array.from({ length: 6 }, (_, index) =>
    deal({
      id: `eur-${index}`,
      sourceId: `foreign-${index}`,
      title: `Callaway Paradym Golf Driver Model ${index}`,
      equipmentTypeId: "golf-clubs",
      sportId: "golf",
      currency: "EUR",
      url: `https://example.eu/driver-${index}`,
    }),
  );
  const ranked = rankTopDeals([usd, ...leaks, ...foreign], context);
  assert.equal(ranked[0].id, "usd-driver");
  assert.equal(ranked.some((item) => leaks.some((leak) => leak.id === item.id)), false);
  assert.ok(ranked.filter((item) => item.currency === "EUR").length <= 2);
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
