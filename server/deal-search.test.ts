import assert from "node:assert/strict";
import test from "node:test";
import { matchesNormalizedDealSearch, normalizeDealSearch } from "./deal-search";

const supra = { title: "2024 LS Supra Fastpitch Bat Drop -10", brand: "Louisville Slugger", dropWeight: 10 };

test("27/17 Louisville Supra matches LS and the equivalent drop", () => {
  assert.equal(matchesNormalizedDealSearch(normalizeDealSearch("27/17 Louisville Supra"), supra), true);
});

test("spaced sizing and LS alias normalize to the same search", () => {
  const deal = { title: 'Louisville Supra 27 / 17 Fastpitch Bat', brand: "LS", dropWeight: null };
  assert.equal(matchesNormalizedDealSearch(normalizeDealSearch("27 / 17 LS Supra"), deal), true);
});

test("-10 and drop 10 are equivalent", () => {
  const deal = { title: "Louisville Slugger Supra 27/17", brand: "Louisville Slugger", dropWeight: 10 };
  assert.equal(matchesNormalizedDealSearch(normalizeDealSearch("Louisville Supra -10"), deal), true);
  assert.equal(matchesNormalizedDealSearch(normalizeDealSearch("LS Supra drop 10"), deal), true);
});

test("LS is a whole alias, not a substring", () => {
  const unrelated = { title: "Wilson Supra-style Bat Drop -10", brand: "Wilson", dropWeight: 10 };
  assert.equal(matchesNormalizedDealSearch(normalizeDealSearch("LS Supra -10"), unrelated), false);
});
