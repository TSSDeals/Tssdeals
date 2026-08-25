import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeListingHtml, validateListingCreatePayload } from "./ebay-listing-validation";

const valid = {
  title: "Rawlings Heart of the Hide 11.75 Baseball Glove RHT",
  description: "<p>Seller-confirmed description.</p>",
  price: "149.99",
  conditionId: "3000",
  categoryName: "Baseball Gloves",
  imageUrls: ["data:image/jpeg;base64,YWJj"],
  itemSpecifics: { Brand: "Rawlings" },
  quantity: 1,
};

test("accepts a complete seller-confirmed listing and maps generic used conservatively", () => {
  const result = validateListingCreatePayload(valid);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.condition, "USED_GOOD");
    assert.equal(result.value.price, 149.99);
  }
});

test("blocks zero-photo and implicit-condition creation", () => {
  const result = validateListingCreatePayload({ ...valid, imageUrls: [], conditionId: "" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join(" "), /photo/i);
    assert.match(result.errors.join(" "), /condition/i);
  }
});

test("blocks invalid title, price, and quantity at the server boundary", () => {
  const result = validateListingCreatePayload({ ...valid, title: "x".repeat(81), price: "NaN", quantity: 0 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join(" "), /80 characters/i);
    assert.match(result.errors.join(" "), /positive number/i);
    assert.match(result.errors.join(" "), /quantity/i);
  }
});

test("sanitizes executable HTML from generated descriptions", () => {
  const sanitized = sanitizeListingHtml('<p onclick="steal()">Safe</p><script>alert(1)</script><a href="javascript:bad()">x</a>');
  assert.doesNotMatch(sanitized, /onclick|<script|javascript:/i);
  assert.match(sanitized, /Safe/);
});
