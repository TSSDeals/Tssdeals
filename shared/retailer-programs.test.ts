import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOutboundAffiliateUrl,
  attachBaselineCouponRecommendations,
  BASELINE_SPORTS_PROGRAM,
  BASELINE_SPORTS_SOURCE_ID,
  preferredRetailerRank,
  recommendBaselineCoupon,
  TWIN_SEAM_SOURCE_ID,
  type ComparableRetailOffer,
} from "./retailer-programs";

test("Baseline affiliate URL tagging replaces duplicates and preserves query and fragment", () => {
  assert.equal(
    applyOutboundAffiliateUrl("https://www.baselinesports.us/products/glove"),
    "https://www.baselinesports.us/products/glove?aff=380",
  );
  assert.equal(
    applyOutboundAffiliateUrl("https://baselinesports.us/products/glove?variant=12#details"),
    "https://baselinesports.us/products/glove?variant=12&aff=380#details",
  );
  assert.equal(
    applyOutboundAffiliateUrl("https://www.baselinesports.us/products/glove?aff=1&AFF=2&x=3#fit"),
    "https://www.baselinesports.us/products/glove?x=3&aff=380#fit",
  );
  assert.equal(
    applyOutboundAffiliateUrl("https://example.com/products/glove?aff=1#fit"),
    "https://example.com/products/glove?aff=1#fit",
  );
});

test("preferred source order is Twin Seam, Baseline, then others", () => {
  assert.deepEqual(
    [BASELINE_SPORTS_SOURCE_ID, "ebay", TWIN_SEAM_SOURCE_ID]
      .sort((a, b) => preferredRetailerRank(a) - preferredRetailerRank(b)),
    [TWIN_SEAM_SOURCE_ID, BASELINE_SPORTS_SOURCE_ID, "ebay"],
  );
});

function baseline(overrides: Partial<ComparableRetailOffer> = {}): ComparableRetailOffer {
  return {
    sourceId: BASELINE_SPORTS_SOURCE_ID,
    productKey: "wilson-a2000-1786",
    priceCents: 20_000,
    shippingCents: 1_000,
    couponEligibility: "eligible",
    title: "Wilson A2000 1786",
    brand: "Wilson",
    ...overrides,
  };
}

function alternative(overrides: Partial<ComparableRetailOffer> = {}): ComparableRetailOffer {
  return {
    sourceId: "other-store",
    productKey: "wilson-a2000-1786",
    priceCents: 20_000,
    shippingCents: 0,
    ...overrides,
  };
}

test("coupon recommendation is shipping-aware, smallest-first, and rounds to cents", () => {
  const recommendation = recommendBaselineCoupon(baseline(), [alternative()]);
  assert.deepEqual(recommendation, {
    code: "TSS10",
    percentOff: 10,
    estimatedCheckoutCents: 19_000,
    baselineListedCents: 20_000,
    bestAlternativeCents: 20_000,
    shippingComplete: true,
  });

  const rounded = recommendBaselineCoupon(
    baseline({ priceCents: 10_001, shippingCents: 0 }),
    [alternative({ priceCents: 9_600 })],
  );
  assert.equal(rounded?.code, "TSS5");
  assert.equal(rounded?.estimatedCheckoutCents, 9_501);
});

test("coupon recommendation requires a matching eligible product and a winning code", () => {
  assert.equal(recommendBaselineCoupon(baseline({ couponEligibility: "unknown" }), [alternative()]), null);
  assert.equal(recommendBaselineCoupon(baseline({ couponEligibility: "ineligible" }), [alternative()]), null);
  assert.equal(recommendBaselineCoupon(baseline(), [alternative({ productKey: "different" })]), null);
  assert.equal(recommendBaselineCoupon(baseline({ priceCents: 19_000, shippingCents: null }), [alternative()]), null);
  assert.equal(
    recommendBaselineCoupon(baseline({ priceCents: 30_000 }), [alternative({ priceCents: 20_000 })]),
    null,
  );
});

test("coupon metadata supports global disable and brand/product exclusions", () => {
  const disabled = structuredClone(BASELINE_SPORTS_PROGRAM);
  disabled.couponRecommendations.enabled = false;
  assert.equal(recommendBaselineCoupon(baseline(), [alternative()], disabled), null);

  const excluded = structuredClone(BASELINE_SPORTS_PROGRAM);
  excluded.couponRecommendations.rules.forEach((rule) => rule.excludedBrands.push("Wilson"));
  assert.equal(recommendBaselineCoupon(baseline(), [alternative()], excluded), null);
});

test("recommendations attach only to explicitly normalized same-product Baseline rows", () => {
  const deals = attachBaselineCouponRecommendations([
    {
      id: "baseline",
      sourceId: "baseline-sports",
      title: "Wilson A2000",
      brand: "Wilson",
      priceCents: 20_000,
      raw: {
        normalizedProductKey: "wilson-a2000-1786",
        baselineCouponEligibility: "eligible",
        shippingCents: 1_000,
      },
    },
    {
      id: "other",
      sourceId: "other",
      title: "Wilson A2000",
      brand: "Wilson",
      priceCents: 20_000,
      raw: { normalizedProductKey: "wilson-a2000-1786", shippingCents: 0 },
    },
  ]);
  assert.equal((deals[0].raw as any).baselineCouponRecommendation.code, "TSS10");

  const unnormalized = attachBaselineCouponRecommendations([
    {
      id: "baseline",
      sourceId: "baseline-sports",
      title: "Wilson A2000",
      priceCents: 20_000,
      raw: { baselineCouponEligibility: "eligible" },
    },
    {
      id: "other",
      sourceId: "other",
      title: "Wilson A2000",
      priceCents: 19_000,
      raw: {},
    },
  ]);
  assert.equal((unnormalized[0].raw as any).baselineCouponRecommendation, undefined);
});
