import assert from "node:assert/strict";
import test from "node:test";
import type { Deal } from "@shared/schema";
import { selectDigestDeals } from "./deal-digest";

function deal(title: string, priceCents: number, equipmentTypeId: string, sportId = "baseball"): Deal {
  return { id: title, sourceId: "test", title, url: `https://example.com/${encodeURIComponent(title)}`, imageUrl: null, sportId, equipmentTypeId, condition: "new", currency: "USD", priceCents, msrpCents: null, manufacturerMsrpCents: null, normalSellingPriceCents: null, msrpSource: null, msrpVerified: false, percentOff: "20", isBuyItNow: true, foundAt: new Date(), lastSeenAt: new Date(), lastPriceConfirmedAt: new Date(), availabilityStatus: "active", unavailableAt: null, subFilterId: null, dropWeight: null, sizeNumber: null, autoIncluded: false, autoIncludeRuleId: null, raw: {}, originalPriceCents: null, highestPriceCents: null, priceDropPercent: null, hasPriceDrop: false, isFeatured: false, isLow30d: false, isLow60d: false, isLow90d: false, isLow180d: false, isLow365d: false, classificationSource: null, classificationConfidence: null, classificationLocked: false, classificationUpdatedAt: null, aiClassifiedAt: null } as Deal;
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
