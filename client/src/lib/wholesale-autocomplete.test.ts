import assert from "node:assert/strict";
import test from "node:test";
import { buildWholesaleSuggestions } from "./wholesale-autocomplete";

test("wholesale autocomplete waits for meaningful input and deduplicates names", () => {
  const rows = [
    { retail_name: "Wilson A2000 1786 11.5-inch Glove", retail_brand: "Wilson", retail_model: "1786", sku: "WBW100390" },
    { retail_name: "Wilson A2000 1786 11.5-inch Glove", retail_brand: "Wilson", sku: "DUPLICATE" },
    { name: "Wilson A1000 1786", manufacturer: "Wilson", sku: "WBW101443" },
  ];
  assert.deepEqual(buildWholesaleSuggestions(rows, "W"), []);
  assert.deepEqual(buildWholesaleSuggestions(rows, "Rawlings"), []);
  assert.deepEqual(buildWholesaleSuggestions(rows, "Wilson"), [
    {
      value: "Wilson A1000 1786",
      label: "Wilson A1000 1786 — Wilson · SKU WBW101443",
    },
    {
      value: "Wilson A2000 1786 11.5-inch Glove",
      label: "Wilson A2000 1786 11.5-inch Glove — Wilson · 1786 · SKU WBW100390",
    },
  ]);
});

test("brand and model matches rank above incidental word matches", () => {
  const suggestions = buildWholesaleSuggestions([
    { name: "Champro Wild Card Jersey", manufacturer: "Champro" },
    { name: "Cotton Twill Cap", manufacturer: "Other" },
    { name: "A2000 1786 Baseball Glove", manufacturer: "Wilson" },
  ], "Wil");
  assert.equal(suggestions[0].value, "A2000 1786 Baseball Glove");
});
