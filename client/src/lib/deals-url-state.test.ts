import assert from "node:assert/strict";
import test from "node:test";
import { dealsQueryFromSearch, searchWithDealsQuery } from "./deals-url-state";

test("direct deal URLs hydrate encoded shopping queries", () => {
  assert.equal(
    dealsQueryFromSearch("?q=27%2F17%20Louisville%20Supra"),
    "27/17 Louisville Supra",
  );
  assert.equal(dealsQueryFromSearch("?q=LHT+Wilson+A1000"), "LHT Wilson A1000");
});

test("query URL synchronization preserves unrelated parameters and clears q safely", () => {
  assert.equal(
    searchWithDealsQuery("?source=ebay", "27/17 Louisville Supra"),
    "?source=ebay&q=27%2F17+Louisville+Supra",
  );
  assert.equal(searchWithDealsQuery("?source=ebay&q=old", "  "), "?source=ebay");
});
