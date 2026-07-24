import assert from "node:assert/strict";
import test from "node:test";
import {
  buildZeroResultRecovery,
  normalizedBatQueryAlternates,
} from "./search-language";

test("zero-result recovery offers canonical size and drop-equivalent queries", () => {
  assert.deepEqual(normalizedBatQueryAlternates("27-17  Louisville Supra"), [
    "27/17 Louisville Supra",
    "drop 10 Louisville Supra",
  ]);
});

test("zero-result recovery offers only active removable constraints", () => {
  const actions = buildZeroResultRecovery({
    q: "27/17 Louisville Supra",
    sportId: "baseball",
    equipmentTypeId: "bb-bats",
    subFilterId: "all",
    condition: "new",
    source: "ebay",
    brand: "all",
    minPercentOff: 0,
    maxPrice: 0,
    priceDropOnly: false,
  });
  assert.deepEqual(actions, [
    { kind: "query", label: "Try “drop 10 Louisville Supra”", query: "drop 10 Louisville Supra" },
    { kind: "constraint", constraint: "source", label: "Search all sources" },
    { kind: "constraint", constraint: "equipmentTypeId", label: "Remove equipment type" },
    { kind: "constraint", constraint: "sportId", label: "Search all sports" },
    { kind: "constraint", constraint: "condition", label: "Include all conditions" },
  ]);
});

test("zero-result recovery does not reinterpret unrelated number pairs", () => {
  assert.deepEqual(normalizedBatQueryAlternates("Wilson A2000 17 27"), []);
});
