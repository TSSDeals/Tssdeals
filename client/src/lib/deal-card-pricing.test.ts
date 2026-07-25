import assert from "node:assert/strict";
import test from "node:test";
import { deriveDealCardPricing } from "./deal-card-pricing";

test("Top Deals suppress untrusted MSRP and percent savings without mojibake", () => {
  const pricing = deriveDealCardPricing({
    priceCents: 1999,
    msrpCents: 99999,
    manufacturerMsrpCents: 99999,
    percentOff: "98",
    msrpVerified: false,
    topDealSavingsTrusted: false,
  });

  assert.equal(pricing.hasMsrp, false);
  assert.equal(pricing.hasMfrMsrp, false);
  assert.equal(pricing.showDualPricing, false);
  assert.equal(pricing.mfrPercentOff, null);
  assert.equal(pricing.percent, "\u2014");
  assert.equal(Object.values(pricing).some((value) => String(value).includes("â")), false);
});

test("ordinary cards preserve trusted savings display", () => {
  const pricing = deriveDealCardPricing({
    priceCents: 19999,
    msrpCents: 29999,
    manufacturerMsrpCents: 29999,
    percentOff: "33.34",
    msrpVerified: true,
    topDealSavingsTrusted: true,
  });

  assert.equal(pricing.hasMsrp, true);
  assert.equal(pricing.hasMfrMsrp, true);
  assert.equal(pricing.percent, "33%");
});
