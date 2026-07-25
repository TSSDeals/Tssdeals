import assert from "node:assert/strict";
import test from "node:test";
import { baselineCouponDisplay } from "./baseline-coupon-display";

test("Baseline UI copy is available only for a calculated recommendation", () => {
  assert.deepEqual(baselineCouponDisplay({
    sourceId: "baseline-sports",
    priceCents: 20_000,
    raw: {
      baselineCouponRecommendation: {
        code: "TSS10",
        estimatedCheckoutCents: 18_000,
        shippingComplete: true,
      },
    },
  }), {
    code: "TSS10",
    checkoutPrice: "$180.00",
    shippingComplete: true,
  });
  assert.equal(baselineCouponDisplay({ sourceId: "baseline-sports", raw: {} }), null);
  assert.equal(baselineCouponDisplay({
    sourceId: "other",
    raw: { baselineCouponRecommendation: { code: "TSS10", estimatedCheckoutCents: 18_000 } },
  }), null);
});
