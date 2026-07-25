import assert from "node:assert/strict";
import test from "node:test";
import {
  SHOPPER_STARTER_SEARCHES,
  addRecentShopperSearch,
  groupShopperSubFilters,
  parseRecentShopperSearches,
} from "./shopper-search-ux";

test("starter searches preserve the two critical homepage-to-results journeys", () => {
  assert.equal(SHOPPER_STARTER_SEARCHES[0]?.query, "27/17 Louisville Supra");
  assert.ok(SHOPPER_STARTER_SEARCHES.some(({ query }) => query === "LHT Wilson A1000"));
  assert.ok(SHOPPER_STARTER_SEARCHES.every(({ detail }) => detail.length > 0));
});

test("bat refinements group only real taxonomy records", () => {
  const records = [
    { id: "bat-27", name: '27"' },
    { id: "bat-drop-10", name: "Drop -10" },
    { id: "bat-usssa", name: "USSSA" },
    { id: "bat-color-red", name: "Red" },
  ];
  const grouped = groupShopperSubFilters("bb-bats", records);

  assert.deepEqual(grouped.map(({ id }) => id), ["length", "drop", "certification"]);
  assert.deepEqual(grouped.flatMap(({ items }) => items.map(({ id }) => id)), [
    "bat-27",
    "bat-drop-10",
    "bat-usssa",
  ]);
  assert.ok(grouped.flatMap(({ items }) => items).every((item) => records.includes(item)));
});

test("glove refinements expose size, position, and throw hand without unrelated values", () => {
  const records = [
    { id: "glove-11-5", name: '11.5"' },
    { id: "glove-infield", name: "Infield" },
    { id: "glove-lht", name: "Left Hand Throw" },
    { id: "glove-color-tan", name: "Tan" },
  ];
  const grouped = groupShopperSubFilters("bb-gloves", records);

  assert.deepEqual(grouped.map(({ id }) => id), ["size", "position", "throw-hand"]);
  assert.equal(grouped.flatMap(({ items }) => items).some(({ id }) => id === "glove-color-tan"), false);
});

test("non-baseball categories never receive inferred category-aware controls", () => {
  assert.deepEqual(
    groupShopperSubFilters("soc-cleats", [{ id: "size-10", name: "Size 10" }]),
    [],
  );
});

test("recent searches are local, bounded, normalized, and case-insensitively deduplicated", () => {
  let recent: string[] = [];
  for (const query of ["  Supra   -10 ", "LHT Wilson A1000", "Hype Fire", "A2000 1786", "supra -10"]) {
    recent = addRecentShopperSearch(recent, query);
  }
  assert.deepEqual(recent, ["supra -10", "A2000 1786", "Hype Fire", "LHT Wilson A1000"]);
  assert.deepEqual(parseRecentShopperSearches(JSON.stringify(recent)), recent);
  assert.deepEqual(parseRecentShopperSearches("<not-json>"), []);
});
