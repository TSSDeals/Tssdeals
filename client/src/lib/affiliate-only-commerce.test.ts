import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dealCard = readFileSync(new URL("../components/DealCard.tsx", import.meta.url), "utf8");
const dealsPage = readFileSync(new URL("../pages/Deals.tsx", import.meta.url), "utf8");
const legalPage = readFileSync(new URL("../pages/Legal.tsx", import.meta.url), "utf8");

test("public deal cards describe outbound retailer visits rather than onsite checkout", () => {
  assert.match(dealCard, /View at retailer/);
  assert.doesNotMatch(dealCard, /Buy It Now/);
  assert.doesNotMatch(dealCard, /instant checkout/i);
  assert.doesNotMatch(dealCard, /Estimated checkout price/i);
});

test("shopper and legal pages explicitly disclose affiliate-only commerce", () => {
  assert.match(dealsPage, /send(?:s)? you to the retailer to complete your purchase/i);
  assert.match(dealsPage, /do not operate a shopping cart or checkout/i);
  assert.match(legalPage, /no shopping cart or checkout/i);
  assert.match(legalPage, /completed independently on the respective retailer or marketplace website/i);
});
