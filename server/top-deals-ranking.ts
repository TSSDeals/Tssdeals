import type { Deal, DealCategory } from "@shared/schema";

const DAY_MS = 86_400_000;
const NOISE_PATTERN =
  /\b(?:replacement|spare|adapter|mount|holder|rack|stand|display case|keychain|sticker|decal|patch|poster|photo|card|collectible|memorabilia|autograph|signed|commemorative)\b/i;
const ACCESSORY_PATTERN =
  /\b(?:accessor(?:y|ies)|grip tape|bat grip|ball holder|glove wrap|lace kit|wristband|headband|socks?|water bottle|towel|keychain)\b/i;
const PART_PATTERN =
  /\b(?:replacement|spare|part only|head only|shaft only|handle only|strap only|hardware|screws?|bolts?|cap only|cover only)\b/i;
const FIELDING_GLOVE_CATEGORY_PATTERN =
  /\b(?:fielding|baseball|softball|fastpitch|slowpitch|elite|premium|collector)\b[\s/&-]*(?:gloves?|mitts?)\b|\b(?:gloves?|mitts?)\b/i;
const FIELDING_GLOVE_EQUIPMENT_PATTERN =
  /^(?:(?:bb|fp|sp)-(?:gloves?|fielding-gloves?)|baseball-gloves?|softball-gloves?|fielding-gloves?|gloves?)$/i;
const FIELDING_GLOVE_TITLE_PATTERN =
  /\b(?:(?:baseball|softball|fastpitch|slowpitch)\s+(?:fielding\s+)?(?:gloves?|mitts?)|(?:infield(?:er)?|outfield(?:er)?|pitcher(?:'s)?|fielding)\s+(?:gloves?|mitts?)|catcher(?:'s)?\s+mitts?|first[\s-]*base(?:man(?:'s)?)?\s+mitts?|a(?:1000|2000|2k)\b|heart\s+of\s+the\s+hide|pro\s+preferred)\b/i;
const FIELDING_GLOVE_STRUCTURED_PATTERN =
  /\b(?:baseball|softball|fastpitch|slowpitch|fielding|infield|outfield|pitcher|catcher|first[\s-]*base)\b[\s\S]*\b(?:gloves?|mitts?)\b|\b(?:gloves?|mitts?)\b[\s\S]*\b(?:baseball|softball|fastpitch|slowpitch|fielding|infield|outfield|pitcher|catcher|first[\s-]*base)\b/i;
const FIELDING_GLOVE_EXCLUSION_PATTERN =
  /\b(?:golf|rain|cold[\s-]*weather|winter|football|work|utility)\s+gloves?\b|\b(?:batting\s+gloves?|sliding\s+mitts?|oven\s+mitts?|training\s+(?:gloves?|mitts?)|glove\s+(?:care|oil|conditioner|cleaner|wrap|lace|laces|lacing|repair|replacement|parts?|webs?)|(?:replacement|repair)\s+glove|batting\s+helmets?|helmets?|face\s*(?:guard|mask)|chest\s+protectors?|protective\s+gear|elbow\s+guards?|leg\s+guards?|signed|autograph(?:ed)?|memorabilia|collectible|display[\s-]only|game[\s-]used)\b/i;
const ELITE_GLOVE_CATEGORY_PATTERN = /\b(?:elite|premium|high[\s-]*end|collector)\b/i;
const ELITE_GLOVE_FAMILY_PATTERN =
  /\b(?:wilson\s+)?a(?:2000|2k)\b|\b(?:rawlings\s+)?(?:pro\s+preferred|heart\s+of\s+the\s+hide)\b|\bmizuno\s+pro\b|\b(?:atoms|d-quest|emery|inaba|ip\s+select|leggera(?:-diamante)?|mack\s+provisions|wagyu[\s-]*jb|zett|nokona|junkei|glove\s+studio\s+ryu|kubota\s+slugger|donaiya|tamazawa|hi[\s-]*gold)\b/i;
const VALUE_OR_TRAINING_GLOVE_FAMILY_PATTERN =
  /\bmizuno\s+prospect\b|\brawlings\s+(?:players?|r9)\b|\bwilson\s+a(?:500|700)\b|\b(?:youth|junior|training|trainer|practice)\b/i;
const BAT_CATEGORY_PATTERN = /\b(?:baseball|softball|fastpitch|slowpitch)?\s*bats?\b|\bbbcor\b/i;
const BAT_EQUIPMENT_PATTERN = /^(?:(?:bb|fp|sp)-bats?|baseball-bats?|softball-bats?|bats?)$/i;
const BAT_TITLE_PATTERN =
  /\b(?:baseball|softball|fastpitch|slowpitch|youth|tee[\s-]?ball)\s+bats?\b|\b(?:bbcor|usssa|usa\s+baseball)\b/i;
const BAT_EXCLUSION_PATTERN =
  /\b(?:batting\s+gloves?|batting\s+helmets?|helmet|bat\s+(?:rack|holder|display|grip|tape|weight|sleeve|cover|replacement|parts?)|replacement\s+bat|jerseys?|shirts?|hoodies?|sweatshirts?|jackets?|tennis|pickleball|racquets?|rackets?|signed|autograph(?:ed)?|memorabilia|collectible|display[\s-]only)\b/i;
const FASTPITCH_EVIDENCE_PATTERN = /\b(?:fast[\s-]?pitch|fastpitch\s+softball|softball)\b/i;
const SLOWPITCH_EVIDENCE_PATTERN = /\bslow[\s-]?pitch\b/i;
const APPAREL_PATTERN =
  /\b(?:jerseys?|shirts?|t[\s-]?shirts?|hoodies?|sweatshirts?|jackets?|pants?|shorts?|hats?|caps?|socks?|apparel)\b/i;
const RUNNING_SHOE_CATEGORY_PATTERN = /\brunning[\s-]+(?:shoes?|footwear|sneakers?)\b/i;
const RUNNING_SHOE_FORM_PATTERN =
  /\b(?:running|road|trail|racing)\s+(?:shoes?|footwear|sneakers?|trainers?)\b|\b(?:shoes?|footwear|sneakers?|trainers?)\b[\s\S]*\b(?:running|road|trail|racing)\b/i;
const CLEAT_CATEGORY_PATTERN = /\bcleats?\b/i;
const CLEAT_FORM_PATTERN = /\b(?:cleats?|turf\s+shoes?|baseball\s+spikes?|football\s+spikes?|softball\s+spikes?)\b/i;
const GOLF_CLUB_CATEGORY_PATTERN = /\bgolf[\s-]+clubs?\b/i;
const GOLF_CLUB_FORM_PATTERN =
  /\b(?:golf\s+clubs?|complete\s+(?:golf\s+)?sets?|drivers?|fairway\s+woods?|hybrids?|iron\s+sets?|[2-9]\s*irons?|wedges?|putters?)\b/i;
const GOLF_CLUB_EXCLUSION_PATTERN =
  /\b(?:apparel|shirts?|polos?|pants?|shorts?|jackets?|hats?|caps?|gloves?|balls?|bags?|head[\s-]?covers?|grips?|shaft\s+only|club\s+heads?\s+only|covers?|cleaners?|towels?)\b/i;

export type TopDealReasonCode =
  | "verified-price-drop"
  | "historical-low"
  | "verified-savings"
  | "strong-market-value"
  | "popular-with-shoppers"
  | "fresh-listing";

export type RankedTopDeal = Deal & {
  topDealScore: number;
  topDealConfidence: "high" | "medium" | "limited";
  topDealReasons: Array<{ code: TopDealReasonCode; label: string }>;
  topDealSavingsTrusted: boolean;
  topDealClickCount: number;
};

export interface TopDealsContext {
  category?: Partial<Pick<DealCategory, "name" | "slug" | "sportId" | "equipmentTypeId" | "searchQuery">>;
  clickCounts?: ReadonlyMap<string, number>;
  limit?: number;
  now?: Date;
}

const CURATED_CATEGORY_NAMES: Record<string, string> = {
  "baseball-softball-gloves": "Top Baseball & Softball Fielding Glove Deals",
  "baseball-bats": "Top Baseball Bat Deals",
  "fastpitch-softball-bats": "Top Fastpitch Softball Bat Deals",
  "running-shoes": "Top Running Shoe Deals",
  cleats: "Top Cleat Deals",
  "premium-collector-gloves": "Top Premium & Collector Glove Deals",
  "elite-baseball-gloves": "Top Elite Baseball Glove Deals",
  "golf-clubs": "Top Golf Club Deals",
};

export function shopperTopDealCategory<T extends Partial<DealCategory>>(category: T): T {
  const name = category.slug ? CURATED_CATEGORY_NAMES[category.slug] : undefined;
  if (name) return { ...category, name };
  if (typeof category.name === "string") {
    return { ...category, name: category.name.replace(/^Top\s+\d+\s+/i, "Top ") };
  }
  return category;
}

function rawBoolean(deal: Deal, keys: string[]): boolean | undefined {
  const raw = (deal.raw ?? {}) as Record<string, unknown>;
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (/^(?:false|no|out[\s_-]?of[\s_-]?stock|ended|inactive)$/i.test(value)) return false;
      if (/^(?:true|yes|in[\s_-]?stock|active|available)$/i.test(value)) return true;
    }
  }
  return undefined;
}

function shippingCents(deal: Deal): number {
  const raw = (deal.raw ?? {}) as Record<string, any>;
  const candidates = [
    raw.shippingCostCents,
    raw.shipping?.costCents,
    raw.shipping?.value ? Number(raw.shipping.value) * 100 : undefined,
    raw.shippingCost ? Number(raw.shippingCost) * 100 : undefined,
  ];
  const value = candidates.map(Number).find((candidate) => Number.isFinite(candidate) && candidate >= 0);
  return value ?? 0;
}

function usableUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function lastCurrentAt(deal: Deal): Date | null {
  const value = deal.lastPriceConfirmedAt ?? deal.lastSeenAt ?? deal.foundAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isExplicitAccessoryContext(context: TopDealsContext): boolean {
  const category = context.category;
  if (!category) return false;
  const evidence = `${category.equipmentTypeId ?? ""} ${category.searchQuery ?? ""}`;
  return /\b(?:accessor(?:y|ies)?|parts?|memorabilia|collectibles?|cards?|display)\b/i.test(evidence);
}

function isBroadCategory(context: TopDealsContext): boolean {
  return !context.category?.equipmentTypeId && !(context.category?.searchQuery ?? "").trim();
}

function categoryEvidence(context: TopDealsContext): string {
  const category = context.category;
  return `${category?.name ?? ""} ${category?.slug ?? ""} ${category?.equipmentTypeId ?? ""} ${category?.searchQuery ?? ""}`;
}

function isFieldingGloveCategory(context: TopDealsContext): boolean {
  const evidence = categoryEvidence(context);
  return FIELDING_GLOVE_CATEGORY_PATTERN.test(evidence)
    && !/\bbatting\s+gloves?\b/i.test(evidence);
}

function isEliteGloveCategory(context: TopDealsContext): boolean {
  return isFieldingGloveCategory(context) && ELITE_GLOVE_CATEGORY_PATTERN.test(categoryEvidence(context));
}

function structuredFieldingEvidence(deal: Deal): string {
  const raw = (deal.raw ?? {}) as Record<string, unknown>;
  return [
    raw.category,
    raw.categoryName,
    raw.productType,
    raw.shopifyProductType,
    raw.collection,
    raw.collections,
    raw.breadcrumbs,
    raw.glovePosition,
  ]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function structuredProductEvidence(deal: Deal): string {
  const raw = (deal.raw ?? {}) as Record<string, unknown>;
  return [
    raw.category,
    raw.categoryName,
    raw.productType,
    raw.shopifyProductType,
    raw.collection,
    raw.collections,
    raw.breadcrumbs,
    raw.certification,
    raw.sport,
  ]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function hasPositiveFieldingGloveEvidence(deal: Deal): boolean {
  return FIELDING_GLOVE_TITLE_PATTERN.test(deal.title ?? "")
    || FIELDING_GLOVE_STRUCTURED_PATTERN.test(structuredFieldingEvidence(deal));
}

function hasTrustedEliteGloveEvidence(deal: Deal): boolean {
  const raw = (deal.raw ?? {}) as Record<string, unknown>;
  const evidence = `${deal.brand ?? ""} ${deal.title ?? ""} ${String(raw.premiumMaker ?? "")}`;
  if (VALUE_OR_TRAINING_GLOVE_FAMILY_PATTERN.test(evidence)) return false;
  if (raw.premiumGloveSource === true && typeof raw.premiumMaker === "string" && raw.premiumMaker.trim()) {
    return true;
  }
  return ELITE_GLOVE_FAMILY_PATTERN.test(evidence);
}

function isBatCategory(context: TopDealsContext): boolean {
  return BAT_CATEGORY_PATTERN.test(categoryEvidence(context))
    && !/\bbatting\s+(?:gloves?|helmets?)\b/i.test(categoryEvidence(context));
}

function isFastpitchBatCategory(context: TopDealsContext): boolean {
  return isBatCategory(context) && /\bfast[\s-]?pitch\b/i.test(categoryEvidence(context));
}

function isRunningShoeCategory(context: TopDealsContext): boolean {
  return RUNNING_SHOE_CATEGORY_PATTERN.test(categoryEvidence(context));
}

function isCleatCategory(context: TopDealsContext): boolean {
  return CLEAT_CATEGORY_PATTERN.test(categoryEvidence(context));
}

function isGolfClubCategory(context: TopDealsContext): boolean {
  return GOLF_CLUB_CATEGORY_PATTERN.test(categoryEvidence(context));
}

function productEvidence(deal: Deal): string {
  return `${deal.title ?? ""} ${deal.equipmentTypeId ?? ""} ${structuredProductEvidence(deal)}`;
}

/** Read-time category boundary only; it never rewrites stored taxonomy. */
export function matchesTopDealCategoryBoundary(deal: Deal, context: TopDealsContext): boolean {
  const title = deal.title ?? "";
  if (isFieldingGloveCategory(context)) {
    if (FIELDING_GLOVE_EXCLUSION_PATTERN.test(title)) return false;
    if (!FIELDING_GLOVE_EQUIPMENT_PATTERN.test(deal.equipmentTypeId ?? "")) return false;
    if (!hasPositiveFieldingGloveEvidence(deal)) return false;
    if (isEliteGloveCategory(context) && !hasTrustedEliteGloveEvidence(deal)) return false;
    return true;
  }
  if (isBatCategory(context)) {
    if (BAT_EXCLUSION_PATTERN.test(title)) return false;
    const evidence = productEvidence(deal);
    if (!BAT_EQUIPMENT_PATTERN.test(deal.equipmentTypeId ?? "") && !BAT_TITLE_PATTERN.test(evidence)) return false;
    if (!BAT_TITLE_PATTERN.test(evidence)) return false;
    if (isFastpitchBatCategory(context)) {
      return FASTPITCH_EVIDENCE_PATTERN.test(evidence) && !SLOWPITCH_EVIDENCE_PATTERN.test(evidence);
    }
    return !/\b(?:fast[\s-]?pitch|slow[\s-]?pitch)\b/i.test(evidence);
  }
  if (isRunningShoeCategory(context)) {
    if (APPAREL_PATTERN.test(title)) return false;
    return RUNNING_SHOE_FORM_PATTERN.test(productEvidence(deal));
  }
  if (isCleatCategory(context)) {
    if (APPAREL_PATTERN.test(title)) return false;
    return CLEAT_FORM_PATTERN.test(productEvidence(deal));
  }
  if (isGolfClubCategory(context)) {
    if (APPAREL_PATTERN.test(title) || GOLF_CLUB_EXCLUSION_PATTERN.test(title)) return false;
    return GOLF_CLUB_FORM_PATTERN.test(productEvidence(deal));
  }
  return true;
}

function equipmentRelevance(deal: Deal, context: TopDealsContext): number {
  const title = deal.title ?? "";
  if (NOISE_PATTERN.test(title) || ACCESSORY_PATTERN.test(title) || PART_PATTERN.test(title)) {
    return isExplicitAccessoryContext(context) ? 14 : 0;
  }
  if (!deal.sportId || !deal.equipmentTypeId) return 8;
  if (/(?:accessor|apparel|bags?|training)/i.test(deal.equipmentTypeId)) return 13;
  return 22;
}

function trustedSavings(deal: Deal): { trusted: boolean; percent: number; suspicious: boolean } {
  const price = Number(deal.priceCents);
  const manufacturerAnchor = Number(deal.manufacturerMsrpCents);
  const retailerAnchor = Number(deal.msrpCents);
  const anchor =
    deal.msrpVerified && manufacturerAnchor > price
      ? manufacturerAnchor
      : deal.msrpVerified && retailerAnchor > price
        ? retailerAnchor
        : 0;
  const percent = anchor > 0 ? ((anchor - price) / anchor) * 100 : 0;
  return { trusted: anchor > 0 && percent > 0 && percent < 85, percent, suspicious: percent >= 85 };
}

function historicalLowDays(deal: Deal): number {
  if (deal.isLow365d) return 365;
  if (deal.isLow180d) return 180;
  if (deal.isLow90d) return 90;
  if (deal.isLow60d) return 60;
  if (deal.isLow30d) return 30;
  return 0;
}

function sellerKey(deal: Deal): string {
  const raw = (deal.raw ?? {}) as Record<string, any>;
  return String(raw.seller?.username ?? raw.sellerUsername ?? raw.seller ?? deal.sourceId ?? "unknown").toLowerCase();
}

function categoryKey(deal: Deal): string {
  return deal.equipmentTypeId ?? deal.sportId ?? "unclassified";
}

function fastpitchFamilyTitle(deal: Deal): string {
  const raw = (deal.raw ?? {}) as Record<string, unknown>;
  const structuredFamily = [raw.productFamily, raw.modelName, raw.model]
    .find((value) =>
      typeof value === "string"
      && value.trim()
      && !/^[a-z]{2,}\d+[a-z0-9-]*$/i.test(value.trim()),
    ) as string | undefined;
  const structuredColorway = [raw.colorway, raw.color, raw.colour]
    .find((value) => typeof value === "string" && value.trim()) as string | undefined;
  const evidence = structuredFamily
    ? `${deal.brand ?? ""} ${structuredFamily} ${structuredColorway ?? ""}`
    : deal.title ?? "";
  return evidence
    .toLowerCase()
    .replace(/\b(?:new|used|preowned|open box|demo|sale|clearance)\b/g, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/\b\d{2}\s*(?:in(?:ch(?:es)?)?|["″])?\s*[/x-]\s*\d{1,2}\s*(?:oz|ounces?)?\b/g, " ")
    .replace(/\b\d{2}(?:\.\d+)?\s*(?:in(?:ch(?:es)?)?|["″]|oz|ounces?)\b/g, " ")
    .replace(/\(\s*-?\s*(?:8|9|10|11|12|13)\s*\)/g, " ")
    .replace(/\bdrop\s*-?\s*(?:8|9|10|11|12|13)\b/g, " ")
    .replace(/(^|\s)-\s*(?:8|9|10|11|12|13)(?:\s*oz)?\b/g, " ")
    .replace(/\b(?:length|weight|size)\s*:?\s*\d+(?:\.\d+)?\b/g, " ")
    .replace(/\b(?:fast[\s-]?pitch|softball|bat|bats|usssa|asa|usa|approved|certified|composite)\b/g, " ")
    .replace(/\b[a-z]{2,}\d+[a-z0-9-]*\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productKey(deal: Deal, context: TopDealsContext): string {
  if (isFastpitchBatCategory(context)) {
    return `${(deal.brand ?? "").toLowerCase()}::${fastpitchFamilyTitle(deal)}`;
  }
  let title = (deal.title ?? "")
    .toLowerCase()
    .replace(/\b(?:new|used|preowned|open box|demo|sale|clearance)\b/g, " ")
    .replace(/\b\d{2,3}\s*(?:in(?:ch(?:es)?)?|["″])?\s*[/x-]\s*\d{1,3}\s*(?:oz)?\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:oz\b|inch(?:es)?\b|in\b|["″])/g, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/\(\s*-\d{1,2}\s*\)/g, " ")
    .replace(/\b(?:black|white|red|blue|green|pink|purple|orange|yellow|grey|gray)\b/g, " ")
    .trim();
  title = title
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${(deal.brand ?? "").toLowerCase()}::${title}`;
}

function eligible(deal: Deal, context: TopDealsContext, now: Date): boolean {
  const title = (deal.title ?? "").trim();
  if (title.length < 8 || !usableUrl(deal.url) || !Number.isFinite(deal.priceCents) || deal.priceCents <= 0) return false;
  if (!matchesTopDealCategoryBoundary(deal, context)) return false;
  if (rawBoolean(deal, ["available", "availability", "availabilityStatus", "isAvailable", "inStock", "isActive", "active"]) === false) return false;
  const currentAt = lastCurrentAt(deal);
  if (!currentAt || now.getTime() - currentAt.getTime() > 21 * DAY_MS) return false;
  if (!deal.sportId && !deal.equipmentTypeId && deal.classificationConfidence !== "high") return false;

  const noisy = NOISE_PATTERN.test(title) || ACCESSORY_PATTERN.test(title) || PART_PATTERN.test(title);
  if (noisy && !isExplicitAccessoryContext(context)) return false;
  if (isBroadCategory(context) && deal.priceCents < 1_000) return false;
  if (isBroadCategory(context) && shippingCents(deal) > Math.max(2_500, deal.priceCents)) return false;
  return true;
}

function scoreDeal(deal: Deal, context: TopDealsContext, now: Date): RankedTopDeal {
  const reasons: RankedTopDeal["topDealReasons"] = [];
  const savings = trustedSavings(deal);
  const lowDays = historicalLowDays(deal);
  const clickCount = context.clickCounts?.get(deal.id) ?? 0;
  const ageDays = Math.max(0, (now.getTime() - (lastCurrentAt(deal)?.getTime() ?? 0)) / DAY_MS);
  const claimedDiscount = Number(deal.percentOff ?? 0);

  let value = 0;
  if (deal.hasPriceDrop && Number(deal.priceDropPercent ?? 0) >= 5) {
    value += Math.min(18, 8 + Number(deal.priceDropPercent) / 3);
    reasons.push({ code: "verified-price-drop", label: "Verified price drop" });
  }
  if (lowDays) {
    value += lowDays >= 180 ? 16 : lowDays >= 90 ? 13 : 10;
    reasons.push({ code: "historical-low", label: `${lowDays}-day low` });
  }
  if (savings.trusted) {
    value += Math.min(18, savings.percent * 0.4);
    reasons.push({ code: "verified-savings", label: "Verified savings" });
  } else if (deal.originalPriceCents && deal.originalPriceCents > deal.priceCents && deal.hasPriceDrop) {
    value += 8;
  }
  if (savings.suspicious || (!savings.trusted && claimedDiscount >= 70)) value -= 14;
  const shipping = shippingCents(deal);
  if (shipping > 0) value -= Math.min(12, (shipping / Math.max(deal.priceCents, 1)) * 10);

  const relevance = equipmentRelevance(deal, context);
  let quality = 4;
  if (deal.imageUrl) quality += 4;
  if (deal.brand?.trim()) quality += 3;
  if (deal.classificationConfidence === "high") quality += 3;
  if (deal.lastPriceConfirmedAt) quality += 3;
  if (deal.isBuyItNow) quality += 2;

  const freshness = ageDays <= 1 ? 15 : ageDays <= 3 ? 12 : ageDays <= 7 ? 9 : ageDays <= 14 ? 5 : 2;
  if (ageDays <= 3) reasons.push({ code: "fresh-listing", label: "Recently confirmed" });

  const engagement = Math.min(8, Math.log2(clickCount + 1) * 2);
  if (clickCount >= 4) reasons.push({ code: "popular-with-shoppers", label: "Popular with shoppers" });

  if (!reasons.some((reason) => reason.code !== "fresh-listing") && value >= 8) {
    reasons.unshift({ code: "strong-market-value", label: "Strong market value" });
  }

  const score = Math.max(0, Math.min(100, value + relevance + quality + freshness + engagement));
  const confidence = savings.trusted || lowDays >= 90 || (deal.hasPriceDrop && deal.lastPriceConfirmedAt)
    ? "high"
    : deal.lastPriceConfirmedAt && deal.imageUrl
      ? "medium"
      : "limited";

  return {
    ...deal,
    topDealScore: Math.round(score * 10) / 10,
    topDealConfidence: confidence,
    topDealReasons: reasons.slice(0, 3),
    topDealSavingsTrusted: savings.trusted,
    topDealClickCount: clickCount,
  };
}

export function rankTopDeals(pool: Deal[], context: TopDealsContext = {}): RankedTopDeal[] {
  const now = context.now ?? new Date();
  const limit = context.limit ?? 20;
  const representatives = new Map<string, RankedTopDeal>();
  for (const deal of pool.filter((candidate) => eligible(candidate, context, now))) {
    const key = productKey(deal, context);
    if (key.endsWith("::")) continue;
    const scored = scoreDeal(deal, context, now);
    const previous = representatives.get(key);
    if (!previous || scored.topDealScore > previous.topDealScore) representatives.set(key, scored);
  }

  const deduped = [...representatives.values()]
    .filter((deal) =>
      deal.topDealScore >= 28 &&
      deal.topDealReasons.some((reason) =>
        ["verified-price-drop", "historical-low", "verified-savings", "strong-market-value"].includes(reason.code),
      ),
    )
    .sort((a, b) => {
      if (isGolfClubCategory(context)) {
        const aUsd = (a.currency ?? "USD").toUpperCase() === "USD" ? 1 : 0;
        const bUsd = (b.currency ?? "USD").toUpperCase() === "USD" ? 1 : 0;
        if (aUsd !== bUsd) return bUsd - aUsd;
      }
      return b.topDealScore - a.topDealScore || Number(b.priceCents) - Number(a.priceCents);
    });

  const result: RankedTopDeal[] = [];
  const sourceCounts = new Map<string, number>();
  const sellerCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const broad = isBroadCategory(context);
  let nonUsdGolfDeals = 0;
  const nonUsdGolfLimit = Math.max(1, Math.floor(limit * 0.2));
  for (const deal of deduped) {
    const source = deal.sourceId ?? "unknown";
    const seller = sellerKey(deal);
    const category = categoryKey(deal);
    if ((sourceCounts.get(source) ?? 0) >= Math.max(2, Math.ceil(limit * 0.25))) continue;
    if ((sellerCounts.get(seller) ?? 0) >= Math.max(2, Math.ceil(limit * 0.2))) continue;
    if (broad && (categoryCounts.get(category) ?? 0) >= Math.max(3, Math.ceil(limit * 0.3))) continue;
    if (isGolfClubCategory(context) && (deal.currency ?? "USD").toUpperCase() !== "USD") {
      if (nonUsdGolfDeals >= nonUsdGolfLimit) continue;
      nonUsdGolfDeals += 1;
    }
    result.push(deal);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    sellerCounts.set(seller, (sellerCounts.get(seller) ?? 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    if (result.length >= limit) break;
  }
  return result;
}
