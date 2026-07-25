import { BASELINE_SPORTS_SOURCE_ID } from "@shared/retailer-programs";

export type BaselineCouponDisplay = {
  code: string;
  checkoutPrice: string;
  shippingComplete: boolean;
};

export function baselineCouponDisplay(deal: any): BaselineCouponDisplay | null {
  if (deal?.sourceId !== BASELINE_SPORTS_SOURCE_ID) return null;
  const recommendation = deal?.raw?.baselineCouponRecommendation;
  if (
    !recommendation ||
    typeof recommendation.code !== "string" ||
    !/^TSS(?:5|10|15)$/.test(recommendation.code) ||
    !Number.isInteger(recommendation.estimatedCheckoutCents) ||
    recommendation.estimatedCheckoutCents <= 0
  ) return null;
  return {
    code: recommendation.code,
    checkoutPrice: `$${(recommendation.estimatedCheckoutCents / 100).toFixed(2)}`,
    shippingComplete: recommendation.shippingComplete === true,
  };
}
