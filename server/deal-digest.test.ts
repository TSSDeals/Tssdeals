import assert from "node:assert/strict";
import test from "node:test";
import type { Deal } from "@shared/schema";
import { dueDigestSlots, formatSmsDigest, selectDigestDeals } from "./deal-digest";

function deal(title: string, priceCents: number, equipmentTypeId: string, sportId = "baseball", overrides: Partial<Deal> = {}): Deal {
  return { id: title, sourceId: "test", title, url: `https://example.com/${encodeURIComponent(title)}`, imageUrl: null, sportId, equipmentTypeId, condition: "new", currency: "USD", priceCents, msrpCents: 30000, manufacturerMsrpCents: null, normalSellingPriceCents: null, msrpSource: "retailer", msrpVerified: true, percentOff: "20", isBuyItNow: true, foundAt: new Date(), lastSeenAt: new Date(), lastPriceConfirmedAt: new Date(), availabilityStatus: "active", unavailableAt: null, subFilterId: null, dropWeight: null, sizeNumber: null, autoIncluded: false, autoIncludeRuleId: null, raw: {}, originalPriceCents: null, highestPriceCents: null, priceDropPercent: null, hasPriceDrop: false, isFeatured: false, isLow30d: false, isLow60d: false, isLow90d: false, isLow180d: false, isLow365d: false, classificationSource: null, classificationConfidence: null, classificationLocked: false, classificationUpdatedAt: null, aiClassifiedAt: null, ...overrides } as Deal;
}

test("digest enforces price floor and category boundaries", () => {
  const categories = selectDigestDeals([
    deal("Wilson A2K Baseball Glove", 19999, "bb-gloves"),
    deal("Wilson Batting Gloves", 9999, "bb-gloves"),
    deal("Rawlings Fastpitch Softball Fielding Glove", 12999, "fp-gloves", "fastpitch-softball"),
    deal("Louisville Slugger BBCOR Baseball Bat", 24999, "bb-bats"),
    deal("Cheap Baseball Bat", 8500, "bb-bats"),
    deal("Fastpitch Softball Bat", 29999, "fp-bats", "fastpitch-softball"),
  ]);
  assert.deepEqual(categories.map((c) => c.deals.map((d) => d.title)), [
    ["Wilson A2K Baseball Glove"],
    ["Rawlings Fastpitch Softball Fielding Glove"],
    ["Louisville Slugger BBCOR Baseball Bat"],
  ]);
});

test("digest does not backfill ordinary inventory when no verified deal evidence exists", () => {
  const ordinaryOwnListing = deal("Wilson A2K Baseball Glove", 27999, "bb-gloves", "baseball", {
    sourceId: "twin-seam-sports",
    msrpCents: null,
    msrpVerified: false,
    percentOff: "40",
    raw: { submittedVia: "email-deal-inbox" },
  });
  const ordinaryRetailListing = deal("Louisville Slugger BBCOR Baseball Bat", 24999, "bb-bats", "baseball", {
    msrpCents: null,
    msrpVerified: false,
    percentOff: "35",
  });

  assert.deepEqual(selectDigestDeals([ordinaryOwnListing, ordinaryRetailListing]).map((c) => c.deals), [[], [], []]);
});

test("digest requires a meaningful verified saving, confirmed drop, or 30-day low", () => {
  const weakDiscount = deal("Wilson A2K Baseball Glove", 27999, "bb-gloves", "baseball", { msrpCents: 29999 });
  const verifiedDiscount = deal("Rawlings Pro Preferred Baseball Glove", 23999, "bb-gloves", "baseball", { msrpCents: 29999 });
  const confirmedDrop = deal("Marucci CATX BBCOR Baseball Bat", 26999, "bb-bats", "baseball", {
    msrpCents: null,
    msrpVerified: false,
    hasPriceDrop: true,
    priceDropPercent: "6",
  });
  const historicalLow = deal("Easton Hype Fire Baseball Bat", 29999, "bb-bats", "baseball", {
    msrpCents: null,
    msrpVerified: false,
    isLow30d: true,
  });

  const selected = selectDigestDeals([weakDiscount, verifiedDiscount, confirmedDrop, historicalLow]);
  assert.deepEqual(selected[0].deals.map((d) => d.title), ["Rawlings Pro Preferred Baseball Glove"]);
  assert.deepEqual(new Set(selected[2].deals.map((d) => d.title)), new Set([
    "Marucci CATX BBCOR Baseball Bat",
    "Easton Hype Fire Baseball Bat",
  ]));
});

test("new fielding-glove model targets qualify without discount evidence and enforce strict ceilings", () => {
  const ordinary = { msrpCents: null, manufacturerMsrpCents: null, msrpVerified: false, percentOff: "0" };
  const selected = selectDigestDeals([
    deal("New Wilson A2K 1786 Baseball Glove", 25999, "bb-gloves", "baseball", ordinary),
    deal("New Wilson A2000 1786 Baseball Glove", 19999, "bb-gloves", "baseball", ordinary),
    deal("New Rawlings Heart of the Hide HOH Baseball Glove", 21499, "bb-gloves", "baseball", ordinary),
    deal("New Mizuno Pro Baseball Glove", 24999, "bb-gloves", "baseball", ordinary),
    deal("New Mizuno Pro Select Baseball Glove", 19999, "bb-gloves", "baseball", ordinary),
    deal("New Marucci Capitol Baseball Glove", 15999, "bb-gloves", "baseball", ordinary),
    deal("New Marucci Cypress Baseball Glove", 13999, "bb-gloves", "baseball", ordinary),
    deal("Wilson A2K Baseball Glove at ceiling", 26000, "bb-gloves", "baseball", ordinary),
    deal("Used Wilson A2K Baseball Glove", 19999, "bb-gloves", "baseball", { ...ordinary, condition: "used" }),
  ])[0].deals;
  assert.equal(selected.length, 7);
  assert.ok(selected.every((item) => !item.title.includes("ceiling") && !item.title.startsWith("Used")));
});

test("SMS digest links to the complete summary instead of truncating individual deals", () => {
  const categoryDeals = Array.from({ length: 6 }, (_, index) =>
    deal(`Wilson A2K Model ${index + 1} Baseball Glove`, 20000 + index, "bb-gloves"));
  const body = formatSmsDigest([
    { name: "Baseball gloves", path: "/app/top-deals/baseball-softball-gloves", deals: categoryDeals },
  ], "10am");
  assert.match(body, /Baseball gloves: 6/);
  assert.match(body, /\/app\/todays-picks/);
  assert.doesNotMatch(body, /Wilson A2K Model/);
});

test("fastpitch model targets add real fielding values and exclude digest artifacts", () => {
  const ordinary = { msrpCents: null, manufacturerMsrpCents: null, msrpVerified: false, percentOff: "0" };
  const selected = selectDigestDeals([
    deal("2024 Wilson A2000 MA14 Fastpitch Softball Glove", 22995, "bb-gloves", "baseball", ordinary),
    deal("Closeout Rawlings Heart of the Hide Fastpitch Softball Glove", 17999, "bb-gloves", "baseball", ordinary),
    deal("Easton Professional Collection Fastpitch Infield Glove", 21164, "bb-gloves", "baseball", ordinary),
    deal("Rawlings Liberty Advanced Fastpitch Softball Glove", 13297, "bb-gloves", "baseball", ordinary),
    deal("Mizuno Prime Elite X Fastpitch Outfield Glove", 17995, "bb-gloves", "baseball", ordinary),
    deal("Wilson A1000 V125 Fastpitch Glove", 14999, "bb-gloves", "baseball", ordinary),
    deal("TSSDeals morning high-value picks Fastpitch gloves", 12999, "fp-gloves", "fastpitch-softball", { ...ordinary, isLow30d: true }),
    deal("Wilson A2000 Slowpitch Softball Glove", 19999, "fp-gloves", "fastpitch-softball", ordinary),
  ])[1].deals;
  assert.equal(selected.length, 6);
  assert.ok(selected.every((item) => !/TSSDeals|Slowpitch/i.test(item.title)));
});

test("digest catch-up exposes only elapsed Eastern windows", () => {
  assert.deepEqual(dueDigestSlots(new Date("2026-08-13T13:59:00Z")), []); // 9:59 ET
  assert.deepEqual(dueDigestSlots(new Date("2026-08-13T14:10:00Z")), ["10am"]);
  assert.deepEqual(dueDigestSlots(new Date("2026-08-13T18:10:00Z")), ["10am", "2pm"]);
});
