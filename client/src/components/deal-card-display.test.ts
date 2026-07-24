import assert from "node:assert/strict";
import test from "node:test";
import { formatKnownShipping } from "@shared/deal-display";

test("known free shipping is labeled without inference", () => {
  assert.equal(
    formatKnownShipping({
      currency: "USD",
      raw: { shippingOptions: [{ shippingCost: { value: "0.00", currency: "USD" } }] },
    }),
    "Free shipping",
  );
});

test("known paid shipping is formatted and missing shipping stays hidden", () => {
  assert.match(
    formatKnownShipping({ currency: "USD", raw: { shippingCost: "12.50" } }) ?? "",
    /12\.50 shipping$/,
  );
  assert.equal(formatKnownShipping({ currency: "USD", raw: {} }), null);
  assert.equal(formatKnownShipping({ raw: { shippingCost: "unknown" } }), null);
  assert.equal(formatKnownShipping({ raw: { shippingCost: -1 } }), null);
});
