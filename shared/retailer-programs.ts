export const TWIN_SEAM_SOURCE_ID = "twin-seam-sports";
export const SHOPIFY_COLLECTIVE_SOURCE_ID = "shopify-collective";
export const BASELINE_SPORTS_SOURCE_ID = "baseline-sports";
export const BASELINE_SPORTS_NAME = "Baseline Sports";
export const BASELINE_SPORTS_URL = "https://www.baselinesports.us";
export const BASELINE_AFFILIATE_ID = "380";

export type CouponEligibility = "eligible" | "ineligible" | "unknown";

export type CouponRule = {
  code: string;
  percentOff: number;
  enabled: boolean;
  excludedBrands: string[];
  excludedProductPatterns: string[];
};

export type RetailerProgram = {
  sourceId: string;
  preferenceRank: number;
  affiliate?: {
    parameter: string;
    value: string;
    hosts: string[];
  };
  couponRecommendations: {
    enabled: boolean;
    defaultEligibility: CouponEligibility;
    rules: CouponRule[];
  };
};

export const BASELINE_SPORTS_PROGRAM: RetailerProgram = {
  sourceId: BASELINE_SPORTS_SOURCE_ID,
  preferenceRank: 1,
  affiliate: {
    parameter: "aff",
    value: BASELINE_AFFILIATE_ID,
    hosts: ["baselinesports.us", "www.baselinesports.us"],
  },
  couponRecommendations: {
    enabled: true,
    // Shopify catalog data does not prove coupon eligibility. An adapter or
    // approved source rule must explicitly mark a product eligible.
    defaultEligibility: "unknown",
    rules: [
      { code: "TSS5", percentOff: 5, enabled: true, excludedBrands: [], excludedProductPatterns: [] },
      { code: "TSS10", percentOff: 10, enabled: true, excludedBrands: [], excludedProductPatterns: [] },
      { code: "TSS15", percentOff: 15, enabled: true, excludedBrands: [], excludedProductPatterns: [] },
    ],
  },
};

export function preferredRetailerRank(sourceId: string | null | undefined): number {
  if (sourceId === TWIN_SEAM_SOURCE_ID) return 0;
  if (sourceId === SHOPIFY_COLLECTIVE_SOURCE_ID) return 1;
  if (sourceId === BASELINE_SPORTS_SOURCE_ID) return 2;
  return 3;
}

export function applyOutboundAffiliateUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return rawUrl ?? "";
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const affiliate = BASELINE_SPORTS_PROGRAM.affiliate!;
  if (!affiliate.hosts.includes(url.hostname.toLowerCase())) return rawUrl;

  const affiliateKeys: string[] = [];
  url.searchParams.forEach((_value, key) => {
    if (key.toLowerCase() === affiliate.parameter.toLowerCase()) {
      affiliateKeys.push(key);
    }
  });
  affiliateKeys.forEach((key) => url.searchParams.delete(key));
  url.searchParams.set(affiliate.parameter, affiliate.value);
  return url.toString();
}

export type ComparableRetailOffer = {
  sourceId: string;
  productKey: string;
  priceCents: number;
  shippingCents?: number | null;
  brand?: string | null;
  title?: string | null;
  couponEligibility?: CouponEligibility;
};

export type CouponRecommendation = {
  code: string;
  percentOff: number;
  estimatedCheckoutCents: number;
  baselineListedCents: number;
  bestAlternativeCents: number;
  shippingComplete: boolean;
};

function knownDeliveredCents(offer: ComparableRetailOffer): number {
  return offer.priceCents + (offer.shippingCents == null ? 0 : offer.shippingCents);
}

function isExcluded(offer: ComparableRetailOffer, rule: CouponRule): boolean {
  const brand = offer.brand?.trim().toLowerCase() ?? "";
  if (rule.excludedBrands.some((excluded) => excluded.trim().toLowerCase() === brand)) return true;
  const title = offer.title ?? "";
  return rule.excludedProductPatterns.some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(title);
    } catch {
      return title.toLowerCase().includes(pattern.toLowerCase());
    }
  });
}

export function recommendBaselineCoupon(
  baseline: ComparableRetailOffer,
  alternatives: ComparableRetailOffer[],
  program: RetailerProgram = BASELINE_SPORTS_PROGRAM,
): CouponRecommendation | null {
  if (
    !program.couponRecommendations.enabled ||
    baseline.sourceId !== BASELINE_SPORTS_SOURCE_ID ||
    baseline.couponEligibility !== "eligible" ||
    !baseline.productKey ||
    !Number.isInteger(baseline.priceCents) ||
    baseline.priceCents <= 0
  ) return null;

  const comparable = alternatives.filter((offer) =>
    offer.sourceId !== BASELINE_SPORTS_SOURCE_ID &&
    offer.productKey === baseline.productKey &&
    Number.isInteger(offer.priceCents) &&
    offer.priceCents > 0
  );
  if (comparable.length === 0) return null;

  const bestAlternativeCents = Math.min(...comparable.map(knownDeliveredCents));
  const ordinaryBaselineCents = knownDeliveredCents(baseline);
  if (ordinaryBaselineCents <= bestAlternativeCents) return null;

  const rules = [...program.couponRecommendations.rules]
    .filter((rule) => rule.enabled && !isExcluded(baseline, rule))
    .sort((a, b) => a.percentOff - b.percentOff);

  for (const rule of rules) {
    // Discount applies to the listed item price. Shipping, when known, remains
    // unchanged. Integer-cent math makes rounding deterministic.
    const discountedItemCents = Math.round(
      baseline.priceCents * (100 - rule.percentOff) / 100,
    );
    const estimatedCheckoutCents =
      discountedItemCents + (baseline.shippingCents == null ? 0 : baseline.shippingCents);
    if (estimatedCheckoutCents <= bestAlternativeCents - 1) {
      return {
        code: rule.code,
        percentOff: rule.percentOff,
        estimatedCheckoutCents,
        baselineListedCents: baseline.priceCents,
        bestAlternativeCents,
        shippingComplete:
          baseline.shippingCents != null &&
          comparable.every((offer) => offer.shippingCents != null),
      };
    }
  }
  return null;
}

export function attachBaselineCouponRecommendations<T extends {
  sourceId: string;
  priceCents: number;
  brand?: string | null;
  title?: string | null;
  raw?: unknown;
}>(deals: T[]): T[] {
  const offers = deals.map((deal) => {
    const raw = (deal.raw && typeof deal.raw === "object")
      ? deal.raw as Record<string, unknown>
      : {};
    const productKey =
      typeof raw.normalizedProductKey === "string"
        ? raw.normalizedProductKey.trim()
        : typeof raw.productGroupKey === "string"
          ? raw.productGroupKey.trim()
          : "";
    return {
      deal,
      offer: {
        sourceId: deal.sourceId,
        productKey,
        priceCents: deal.priceCents,
        shippingCents: Number.isInteger(raw.shippingCents) ? raw.shippingCents as number : null,
        brand: deal.brand,
        title: deal.title,
        couponEligibility:
          raw.baselineCouponEligibility === "eligible" ||
          raw.baselineCouponEligibility === "ineligible" ||
          raw.baselineCouponEligibility === "unknown"
            ? raw.baselineCouponEligibility
            : "unknown",
      } satisfies ComparableRetailOffer,
      raw,
    };
  });

  return offers.map(({ deal, offer, raw }) => {
    if (deal.sourceId !== BASELINE_SPORTS_SOURCE_ID) return deal;
    const recommendation = recommendBaselineCoupon(
      offer,
      offers.map((entry) => entry.offer),
    );
    if (!recommendation) return deal;
    return {
      ...deal,
      raw: {
        ...raw,
        baselineCouponRecommendation: recommendation,
      },
    };
  });
}
