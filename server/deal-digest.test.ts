import assert from "node:assert/strict";
import test from "node:test";
import type { Deal } from "@shared/schema";
import { dueDigestSlots, selectDigestDeals } from "./deal-digest";

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

test("digest requires a meaningful verified saving, confirmed drop, or 90-day low", () => {
  const weakDiscount = deal("Wilson A2K Baseball Glove", 27999, "bb-gloves", "baseball", { msrpCents: 29999 });
  const verifiedDiscount = deal("Rawlings Pro Preferred Baseball Glove", 23999, "bb-gloves", "baseball", { msrpCents: 29999 });
  const confirmedDrop = deal("Marucci CATX BBCOR Baseball Bat", 26999, "bb-bats", "baseball", {
    msrpCents: null,
    msrpVerified: false,
    hasPriceDrop: true,
    priceDropPercent: "12",
  });
  const historicalLow = deal("Easton Hype Fire Baseball Bat", 29999, "bb-bats", "baseball", {
    msrpCents: null,
    msrpVerified: false,
    isLow90d: true,
  });

  const selected = selectDigestDeals([weakDiscount, verifiedDiscount, confirmedDrop, historicalLow]);
  assert.deepEqual(selected[0].deals.map((d) => d.title), ["Rawlings Pro Preferred Baseball Glove"]);
  assert.deepEqual(new Set(selected[2].deals.map((d) => d.title)), new Set([
    "Marucci CATX BBCOR Baseball Bat",
    "Easton Hype Fire Baseball Bat",
  ]));
});

test("digest catch-up exposes only elapsed Eastern windows", () => {
  assert.deepEqual(dueDigestSlots(new Date("2026-08-13T13:59:00Z")), []); // 9:59 ET
  assert.deepEqual(dueDigestSlots(new Date("2026-08-13T14:10:00Z")), ["10am"]);
  assert.deepEqual(dueDigestSlots(new Date("2026-08-13T18:10:00Z")), ["10am", "2pm"]);
});
