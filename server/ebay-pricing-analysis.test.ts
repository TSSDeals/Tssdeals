import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSuggestedPrice,
  determineCompetitiveness,
  estimateEbayFees,
  extractSearchKeywords,
  isRelevantComparable,
  summarizeComparablePrices,
} from "./ebay-pricing-math";

test("pricing search keeps model and size terms while removing listing filler", () => {
  const query = extractSearchKeywords('NEW Wilson A2000 1786 11.5" Baseball Glove RHT - Ships Free!');
  assert.match(query, /wilson/);
  assert.match(query, /a2000/);
  assert.match(query, /1786/);
  assert.match(query, /11\.5/);
  assert.doesNotMatch(query, /ships|free|new/);
});

test("comparable filtering rejects wrong equipment, condition, and throw hand", () => {
  const source = { title: "Wilson A2000 1786 11.5 Baseball Glove LHT", condition: "New", conditionId: "1000" };
  assert.equal(isRelevantComparable(source, {
    title: "Wilson A2000 1786 11.5 Baseball Glove LHT",
    condition: "New",
    conditionId: "1000",
  }), true);
  assert.equal(isRelevantComparable(source, {
    title: "Wilson A2000 Batting Gloves",
    condition: "New",
    conditionId: "1000",
  }), false);
  assert.equal(isRelevantComparable(source, {
    title: "Wilson A2000 1786 11.5 Baseball Glove RHT",
    condition: "New",
    conditionId: "1000",
  }), false);
  assert.equal(isRelevantComparable(source, {
    title: "Wilson A2000 1786 11.5 Baseball Glove LHT",
    condition: "Pre-Owned",
    conditionId: "3000",
  }), false);
});

test("pricing summary removes extreme outliers and uses a true even median", () => {
  const summary = summarizeComparablePrices([18_000, 19_000, 20_000, 21_000, 22_000, 100_000]);
  assert.deepEqual(summary.prices, [18_000, 19_000, 20_000, 21_000, 22_000]);
  assert.equal(summary.median, 20_000);
  assert.equal(summarizeComparablePrices([10_000, 20_000]).median, 15_000);
});

test("pricing conclusions require at least three active comparables", () => {
  assert.equal(determineCompetitiveness(20_000, 22_000, null, 2), "no_data");
  assert.equal(calculateSuggestedPrice(21_000, 22_000, null, null, null, 2), null);
  assert.equal(determineCompetitiveness(20_000, 22_000, null, 3), "competitive");
});

test("estimated profit accounts for standard eBay selling fees", () => {
  assert.equal(estimateEbayFees(20_000), 2_690);
});
