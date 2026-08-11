import {
  expandEquipmentTypeIds,
  isBaseballBatGroupId,
  isBaseballGloveGroupId,
  isShopperMemorabiliaDeal,
  isShopperMemorabiliaSportId,
  normalizeShopperSportId,
  shopperMemorabiliaEquipmentId,
} from "../shared/equipment-groups";
import { classifyGolfClubProduct } from "./golf-product-classifier";
import {
  batSizeTitlePattern,
  extractBatSizeIntent,
} from "../shared/search-language";

export type DealSearchConcept =
  | { kind: "text"; value: string }
  | { kind: "alias"; canonical: string; values: string[] }
  | { kind: "bat-size"; length: number; weight: number; drop: number }
  | { kind: "glove-size"; size: string }
  | { kind: "glove-hand"; hand: GloveThrowHand }
  | { kind: "golf-hand"; hand: GolfHand }
  | { kind: "golf-flex"; flex: GolfFlex }
  | { kind: "golf-loft"; loft: string }
  | { kind: "drop"; drop: number };

export type GloveThrowHand = "left" | "right";
export type GolfHand = "left" | "right";
export type GolfFlex = "ladies" | "senior" | "regular" | "stiff" | "x-stiff";

export interface NormalizedDealSearch {
  concepts: DealSearchConcept[];
  rankQuery: string;
}

export interface SearchableDeal {
  title: string;
  brand?: string | null;
  dropWeight?: number | null;
  sizeNumber?: string | null;
  subFilterId?: string | null;
  subFilterIds?: string[];
  sportId?: string | null;
  equipmentTypeId?: string | null;
  sourceId?: string | null;
  raw?: unknown;
}

interface AliasGroup {
  canonical: string;
  values: string[];
}

// Add brand/model spellings here instead of adding query-specific branches.
const ALIAS_GROUPS: AliasGroup[] = [
  { canonical: "louisville slugger", values: ["louisville slugger", "louisville", "ls"] },
  { canonical: "demarini", values: ["demarini", "de marini"] },
  { canonical: "cat x", values: ["catx", "cat x"] },
  { canonical: "hype fire", values: ["hypefire", "hype fire", "hype-fire"] },
];

const DROP_RE = /\bdrop\s*-?\s*(\d{1,2})\b|(?:^|\s)-\s*(\d{1,2})\b/i;
const GLOVE_SIZE_QUERY_RE = /(?:^|\s)(\d{1,2}\.\d{1,2})[\s-]*(?:["″]|in(?:ch(?:es)?)?\.?)?(?=\s|$)/i;
const GLOVE_HAND_QUERY_RES: Array<{ hand: GloveThrowHand; pattern: RegExp }> = [
  {
    hand: "left",
    pattern: /(?:^|[^a-z0-9])(?:lht|lh[\s-]*throw(?:er|ing)?|lefty|left[\s-]*hand(?:ed)?[\s-]*throw(?:er|ing)?)(?=[^a-z0-9]|$)/i,
  },
  {
    hand: "right",
    pattern: /(?:^|[^a-z0-9])(?:rht|rh[\s-]*throw(?:er|ing)?|right[\s-]*hand(?:ed)?[\s-]*throw(?:er|ing)?)(?=[^a-z0-9]|$)/i,
  },
];

const GOLF_INTENT_RE = /\b(?:golf|driver|fairway|wood|hybrid|rescue|iron(?:s|\s+set)?|wedge|putter|qi10|stealth|paradym|elyte|ai\s+smoke|g430|g440|p7(?:70|90)|apex|t(?:100|150|200|350)|jpx\s*92[35]|zx[457]|vokey|sm\d{1,2}|white\s+hot|pld)\b/i;
const GOLF_HAND_QUERY_RES: Array<{ hand: GolfHand; pattern: RegExp }> = [
  { hand: "left", pattern: /(?:^|[^a-z0-9])(?:lh|left[\s-]*hand(?:ed)?)(?=[^a-z0-9]|$)/i },
  { hand: "right", pattern: /(?:^|[^a-z0-9])(?:rh|right[\s-]*hand(?:ed)?)(?=[^a-z0-9]|$)/i },
];
const GOLF_FLEX_QUERY_RES: Array<{ flex: GolfFlex; pattern: RegExp }> = [
  { flex: "x-stiff", pattern: /(?:^|[^a-z0-9])(?:x[\s-]*stiff|extra[\s-]*stiff|xs)(?=[^a-z0-9]|$)/i },
  { flex: "stiff", pattern: /(?:^|[^a-z0-9])(?:stiff|s[\s-]*flex)(?=[^a-z0-9]|$)/i },
  { flex: "regular", pattern: /(?:^|[^a-z0-9])(?:regular|reg|r[\s-]*flex)(?=[^a-z0-9]|$)/i },
  { flex: "senior", pattern: /(?:^|[^a-z0-9])(?:senior|a[\s-]*flex|lite)(?=[^a-z0-9]|$)/i },
  { flex: "ladies", pattern: /(?:^|[^a-z0-9])(?:ladies|women(?:'s)?|womens|l[\s-]*flex)(?=[^a-z0-9]|$)/i },
];
const GOLF_LOFT_QUERY_RE = /(?:^|\s)(\d{1,2}(?:\.\d)?)\s*(?:°|deg(?:ree)?s?|loft)(?=\s|$)/i;

export const GOLF_HAND_PATTERNS: Record<GolfHand, string> = {
  left: "(^|[^a-z0-9])(lh|left[\\s-]*hand(?:ed)?)([^a-z0-9]|$)",
  right: "(^|[^a-z0-9])(rh|right[\\s-]*hand(?:ed)?)([^a-z0-9]|$)",
};
export const GOLF_FLEX_PATTERNS: Record<GolfFlex, string> = {
  "x-stiff": "(^|[^a-z0-9])(x[\\s-]*stiff|extra[\\s-]*stiff|xs)([^a-z0-9]|$)",
  stiff: "(^|[^a-z0-9])(stiff|s[\\s-]*flex)([^a-z0-9]|$)",
  regular: "(^|[^a-z0-9])(regular|reg|r[\\s-]*flex)([^a-z0-9]|$)",
  senior: "(^|[^a-z0-9])(senior|a[\\s-]*flex|lite)([^a-z0-9]|$)",
  ladies: "(^|[^a-z0-9])(ladies|women(?:'s)?|womens|l[\\s-]*flex)([^a-z0-9]|$)",
};

export function golfLoftPattern(loft: string): string {
  return `(^|[^0-9.])${loft.replace(".", "\\.")}\\s*(?:°|deg(?:ree)?s?|loft)([^0-9.]|$)`;
}

export const BASEBALL_GLOVE_THROW_HAND_PATTERNS: Record<GloveThrowHand, string> = {
  left: "(^|[^a-z0-9])(lht|lh[\\s-]*throw(?:er|ing)?|lefty|left[\\s-]*hand(?:ed)?[\\s-]*throw(?:er|ing)?)([^a-z0-9]|$)",
  right: "(^|[^a-z0-9])(rht|rh[\\s-]*throw(?:er|ing)?|right[\\s-]*hand(?:ed)?[\\s-]*throw(?:er|ing)?)([^a-z0-9]|$)",
};

export const BASEBALL_BAT_EVIDENCE_PATTERN =
  "(^|[^a-z0-9])(bbcor|usssa|usa\\s+baseball|baseball\\s+bat|youth\\s+(?:baseball\\s+)?bat|tee[ -]?ball\\s+bat|cat\\s*x|hype[ -]?fire|(?:louisville(?:\\s+slugger)?|ls)\\s+supra|supra\\s+(?:louisville(?:\\s+slugger)?|ls))([^a-z0-9]|$)";

export const BASEBALL_BAT_NEGATIVE_EVIDENCE_PATTERN =
  "(^|[^a-z0-9])(cricket|fastpitch|softball|slowpitch)([^a-z0-9]|$)";

export const BASEBALL_GLOVE_EVIDENCE_PATTERN =
  "(^|[^a-z0-9])(baseball\\s+(?:fielding\\s+)?glove|fielding\\s+glove|infield(?:er)?\\s+glove|outfield(?:er)?\\s+glove|infield\\s+baseball|pitcher(?:'s)?\\s+glove|catcher(?:'s)?\\s+mitt|first\\s+base\\s+mitt|a(?:2000|2k)(?:[^a-z0-9]+[a-z][a-z0-9-]*){0,3}[^a-z0-9]+1786(?:ss)?|heart\\s+of\\s+the\\s+hide|pro\\s+preferred)([^a-z0-9]|$)";

export const BASEBALL_GLOVE_FAMILY_PATTERN = "(^|[^a-z0-9])a(?:2000|2k)([^a-z0-9]|$)";
export const BASEBALL_GLOVE_KNOWN_MODEL_PATTERN =
  "(^|[^a-z0-9])a(?:2000|2k)(?:[^a-z0-9]+[a-z][a-z0-9-]*){0,3}[^a-z0-9]+1786(?:ss)?([^a-z0-9]|$)";
export const BASEBALL_GLOVE_EXPLICIT_BASEBALL_PATTERN =
  "(^|[^a-z0-9])(baseball\\s+(?:fielding\\s+)?glove|infield\\s+baseball)([^a-z0-9]|$)";
export const BASEBALL_GLOVE_STRUCTURED_CONTEXT_PATTERN =
  "(baseball.{0,24}(glove|mitt)|(fielding|infield|outfield).{0,16}(glove|mitt)|gloves?\\s*&\\s*mitts?|justgloves|baseballmonkey|baseball\\s+bargains)";

export const BASEBALL_GLOVE_NEGATIVE_EVIDENCE_PATTERN =
  "(^|[^a-z0-9])(batting|golf|boxing|winter|work|working|garden|gardening|football|goalkeeper|hockey|lacrosse|motorcycle|cycling|ski|snow|driving|weightlifting|fitness|fastpitch|slowpitch|softball)\\s+(?:glove|mitt)|(?:glove|mitt)\\s+(?:liner|dryer|oil|conditioner|care\\s+kit)([^a-z0-9]|$)";

const SOFTBALL_SPORT_IDS = new Set(["fastpitch-softball", "slowpitch-softball"]);

function hasStoredSoftballClassification(deal: SearchableDeal): boolean {
  return SOFTBALL_SPORT_IDS.has(deal.sportId ?? "")
    || /^(?:fp|sp)-/.test(deal.equipmentTypeId ?? "");
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function searchAliasPattern(values: string[]): string {
  const alternatives = values.map((value) =>
    value.split(/[\s-]+/).map(escapeRegex).join("[\\s-]*"),
  );
  return `(^|[^a-z0-9])(${alternatives.join("|")})([^a-z0-9]|$)`;
}

/** Turns brand/model spelling and bat shorthand into independent search concepts. */
export function normalizeDealSearch(query: string): NormalizedDealSearch {
  let remaining = query.toLowerCase();
  const concepts: DealSearchConcept[] = [];
  const hasGolfIntent = GOLF_INTENT_RE.test(remaining);

  if (hasGolfIntent) {
    for (const { hand, pattern } of GOLF_HAND_QUERY_RES) {
      const match = remaining.match(pattern);
      if (!match) continue;
      concepts.push({ kind: "golf-hand", hand });
      remaining = remaining.replace(match[0], " ");
      break;
    }
    for (const { flex, pattern } of GOLF_FLEX_QUERY_RES) {
      const match = remaining.match(pattern);
      if (!match) continue;
      concepts.push({ kind: "golf-flex", flex });
      remaining = remaining.replace(match[0], " ");
      break;
    }
    const loft = remaining.match(GOLF_LOFT_QUERY_RE);
    if (loft) {
      concepts.push({ kind: "golf-loft", loft: loft[1] });
      remaining = remaining.replace(loft[0], " ");
    }
  }

  for (const { hand, pattern } of hasGolfIntent ? [] : GLOVE_HAND_QUERY_RES) {
    const match = remaining.match(pattern);
    if (!match) continue;
    concepts.push({ kind: "glove-hand", hand });
    remaining = remaining.replace(match[0], " ");
  }

  const size = extractBatSizeIntent(remaining);
  if (size) {
    concepts.push({
      kind: "bat-size",
      length: size.length,
      weight: size.weight,
      drop: size.drop,
    });
    remaining = `${remaining.slice(0, size.index)} ${remaining.slice(size.index + size.matched.length)}`;
  }

  const drop = remaining.match(DROP_RE);
  if (drop) {
    concepts.push({ kind: "drop", drop: Number(drop[1] ?? drop[2]) });
    remaining = remaining.replace(drop[0], " ");
  }

  const gloveSize = remaining.match(GLOVE_SIZE_QUERY_RE);
  if (gloveSize) {
    concepts.push({ kind: "glove-size", size: normalizeGloveSize(gloveSize[1])! });
    remaining = remaining.replace(gloveSize[0], " ");
  }

  for (const group of ALIAS_GROUPS) {
    const match = remaining.match(new RegExp(searchAliasPattern(group.values), "i"));
    if (!match) continue;
    concepts.push({ kind: "alias", canonical: group.canonical, values: group.values });
    remaining = remaining.replace(match[0], " ");
  }

  for (const value of remaining.split(/[^a-z0-9.]+/).filter(Boolean)) {
    concepts.push({ kind: "text", value });
  }

  const rankQuery = concepts
    .flatMap((concept) => {
      if (concept.kind === "text") return [concept.value];
      if (concept.kind === "alias") return concept.canonical.split(" ");
      if (concept.kind === "bat-size") return [`${concept.length}`, `${concept.weight}`];
      if (concept.kind === "glove-size") return [concept.size];
      if (concept.kind === "glove-hand") return [];
      if (concept.kind === "golf-hand") return [concept.hand === "left" ? "lh" : "rh"];
      if (concept.kind === "golf-flex") return [concept.flex];
      if (concept.kind === "golf-loft") return [`${concept.loft} loft`];
      return [`drop ${concept.drop}`];
    })
    .join(" ");

  return { concepts, rankQuery };
}

export function matchesNormalizedDealSearch(search: NormalizedDealSearch, deal: SearchableDeal): boolean {
  const haystack = `${deal.title} ${deal.brand ?? ""}`.toLowerCase();
  return search.concepts.every((concept) => {
    if (concept.kind === "text") return haystack.includes(concept.value);
    if (concept.kind === "alias") return new RegExp(searchAliasPattern(concept.values), "i").test(haystack);
    if (concept.kind === "glove-size") return matchesGloveSize(deal, concept.size);
    if (concept.kind === "glove-hand") return matchesBaseballGloveThrowHand(deal, concept.hand);
    if (concept.kind === "golf-hand") return new RegExp(GOLF_HAND_PATTERNS[concept.hand], "i").test(haystack);
    if (concept.kind === "golf-flex") return new RegExp(GOLF_FLEX_PATTERNS[concept.flex], "i").test(haystack);
    if (concept.kind === "golf-loft") return new RegExp(golfLoftPattern(concept.loft), "i").test(haystack);
    const dropMatch = deal.dropWeight === concept.drop || new RegExp(`(^|[^a-z0-9])(?:drop\\s*-?\\s*|-)${concept.drop}([^a-z0-9]|$)`, "i").test(haystack);
    if (concept.kind === "drop") return dropMatch;
    const sizeMatch = new RegExp(batSizeTitlePattern(concept.length, concept.weight), "i").test(haystack);
    return sizeMatch || dropMatch;
  });
}

export function matchesBaseballGloveThrowHand(
  deal: SearchableDeal,
  requested: GloveThrowHand,
): boolean {
  const storedBaseballGlove =
    deal.sportId === "baseball" && isBaseballGloveGroupId(deal.equipmentTypeId ?? "");
  if (!storedBaseballGlove && !hasBaseballGloveEvidence(deal)) return false;

  const opposite: GloveThrowHand = requested === "left" ? "right" : "left";
  return new RegExp(BASEBALL_GLOVE_THROW_HAND_PATTERNS[requested], "i").test(deal.title)
    && !new RegExp(BASEBALL_GLOVE_THROW_HAND_PATTERNS[opposite], "i").test(deal.title);
}

export function normalizeGloveSize(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(?:size\s*)?(\d{1,2}(?:\.\d{1,2})?)[\s-]*(?:["″]|in(?:ch(?:es)?)?\.?)?$/i);
  if (!match) return null;
  const size = Number(match[1]);
  if (size < 8 || size > 15) return null;
  return String(size);
}

export function gloveSizeTitlePattern(size: string): string {
  const escaped = size.replace(".", "\\.");
  return `(^|[^0-9.])${escaped}[\\s-]*(?:[\"″]|in(?:ch(?:es)?)?\\.?)?(?=[^0-9.]|$)`;
}

export function matchesGloveSize(deal: SearchableDeal, requested: string, requestedSubFilterId?: string): boolean {
  const normalized = normalizeGloveSize(requested);
  if (!normalized) return false;
  if (requestedSubFilterId && (deal.subFilterId === requestedSubFilterId || deal.subFilterIds?.includes(requestedSubFilterId))) return true;
  if (normalizeGloveSize(deal.sizeNumber) === normalized) return true;
  return new RegExp(gloveSizeTitlePattern(normalized), "i").test(deal.title);
}

export function hasBaseballBatEvidence(deal: SearchableDeal): boolean {
  const evidence = `${deal.title} ${deal.brand ?? ""} ${JSON.stringify(deal.raw ?? {})}`;
  return new RegExp(BASEBALL_BAT_EVIDENCE_PATTERN, "i").test(evidence)
    && !hasStoredSoftballClassification(deal)
    && !new RegExp(BASEBALL_BAT_NEGATIVE_EVIDENCE_PATTERN, "i").test(deal.title);
}

export function hasBaseballGloveEvidence(deal: SearchableDeal): boolean {
  if (hasBaseballGloveNegativeEvidence(deal)) return false;
  const titleAndBrand = `${deal.title} ${deal.brand ?? ""}`;
  if (new RegExp(BASEBALL_GLOVE_EVIDENCE_PATTERN, "i").test(titleAndBrand)) return true;
  const hasFamily = new RegExp(BASEBALL_GLOVE_FAMILY_PATTERN, "i").test(titleAndBrand);
  const hasSize = !!normalizeGloveSize(deal.sizeNumber)
    || Array.from(deal.title.matchAll(/(^|[^0-9.])(\d{1,2}(?:\.\d{1,2})?)[\s-]*(?:["″]|in(?:ch(?:es)?)?\.?)?(?=[^0-9.]|$)/gi))
      .some((match) => !!normalizeGloveSize(match[2]));
  return hasFamily && hasSize
    && new RegExp(BASEBALL_GLOVE_STRUCTURED_CONTEXT_PATTERN, "i").test(structuredGloveContext(deal));
}

function structuredGloveContext(deal: SearchableDeal): string {
  const raw = deal.raw && typeof deal.raw === "object" ? deal.raw as Record<string, unknown> : {};
  const keys = ["category", "categoryName", "productType", "shopifyProductType", "collection", "collections", "breadcrumbs", "seller", "sellerName", "storeName"];
  return [deal.sourceId ?? "", ...keys.map((key) => JSON.stringify(raw[key] ?? ""))].join(" ");
}

export function hasBaseballGloveNegativeEvidence(deal: SearchableDeal): boolean {
  if (new RegExp(BASEBALL_GLOVE_NEGATIVE_EVIDENCE_PATTERN, "i").test(deal.title)) return true;
  const titleAndBrand = `${deal.title} ${deal.brand ?? ""}`;
  const strongStoredSoftballOverride = new RegExp(BASEBALL_GLOVE_KNOWN_MODEL_PATTERN, "i").test(titleAndBrand)
    && new RegExp(BASEBALL_GLOVE_EXPLICIT_BASEBALL_PATTERN, "i").test(deal.title);
  const storedSoftball = /^(?:fp|sp)-/.test(deal.equipmentTypeId ?? "")
    || SOFTBALL_SPORT_IDS.has(deal.sportId ?? "");
  const storedUnrelated = ["golf", "boxing", "cricket"].includes(deal.sportId ?? "")
    || /(?:batting-gloves|golf-glove|boxing-gloves)/.test(deal.equipmentTypeId ?? "");
  return storedUnrelated || (storedSoftball && !strongStoredSoftballOverride);
}

export function hasStrongBaseballGloveSearchIntent(query: string | null | undefined): boolean {
  return !!query && hasBaseballGloveEvidence({ title: query });
}

/** Projects recovered search results for display without changing their stored database values. */
export function projectDealSearchClassification<T extends SearchableDeal>(query: string | undefined, deal: T): T {
  // Candidate retrieval remains query-aware in storage. Once a search has returned a deal,
  // its own unambiguous evidence is sufficient to canonicalize display grouping.
  if (!query?.trim() || !hasBaseballGloveEvidence(deal)) return deal;
  if (deal.sportId === "baseball" && deal.equipmentTypeId === "bb-gloves") return deal;
  return { ...deal, sportId: "baseball", equipmentTypeId: "bb-gloves" };
}

/** Higher means a bat-size match is more specific; exact length/weight outranks drop fallback. */
export function batSizeMatchSpecificity(search: NormalizedDealSearch, deal: SearchableDeal): number {
  const size = search.concepts.find((concept) => concept.kind === "bat-size");
  if (!size || size.kind !== "bat-size") return 0;
  const haystack = `${deal.title} ${deal.brand ?? ""}`;
  const exact = new RegExp(batSizeTitlePattern(size.length, size.weight), "i").test(haystack);
  if (exact) return 2;
  const drop = deal.dropWeight === size.drop
    || new RegExp(`(^|[^a-z0-9])(?:drop\\s*-?\\s*|-)${size.drop}([^a-z0-9]|$)`, "i").test(haystack);
  return drop ? 1 : 0;
}

/** Shared ranking model: exact structured shopping evidence outranks loose text. */
export function dealSearchMatchSpecificity(
  search: NormalizedDealSearch,
  deal: SearchableDeal,
): number {
  const haystack = `${deal.title} ${deal.brand ?? ""}`.toLowerCase();
  return search.concepts.reduce((score, concept) => {
    if (concept.kind === "bat-size") return score + (batSizeMatchSpecificity(search, deal) * 15);
    if (concept.kind === "glove-hand") {
      return score + (matchesBaseballGloveThrowHand(deal, concept.hand) ? 24 : 0);
    }
    if (concept.kind === "glove-size") return score + (matchesGloveSize(deal, concept.size) ? 16 : 0);
    if (concept.kind === "drop") {
      const exactDrop = deal.dropWeight === concept.drop
        || new RegExp(`(^|[^a-z0-9])(?:drop\\s*-?\\s*|-)${concept.drop}([^a-z0-9]|$)`, "i").test(haystack);
      return score + (exactDrop ? 12 : 0);
    }
    if (concept.kind === "alias") {
      return score + (new RegExp(searchAliasPattern(concept.values), "i").test(haystack) ? 10 : 0);
    }
    const exactText = new RegExp(searchAliasPattern([concept.value]), "i").test(haystack);
    return score + (exactText ? 4 : (haystack.includes(concept.value) ? 1 : 0));
  }, 0);
}

/**
 * Stable final ordering guard for database-backed search results. The database
 * still performs candidate retrieval and its selected sort within each tier;
 * this only guarantees that exact structured attributes precede broad recovery.
 */
export function orderDealsBySearchSpecificity<T extends SearchableDeal>(
  query: string,
  deals: T[],
): T[] {
  const search = normalizeDealSearch(query);
  return deals
    .map((deal, index) => ({
      deal,
      index,
      specificity: dealSearchMatchSpecificity(search, deal),
    }))
    .sort((a, b) => b.specificity - a.specificity || a.index - b.index)
    .map(({ deal }) => deal);
}

export function matchesDealClassificationFilters(
  deal: SearchableDeal,
  filters: { q?: string; sportId?: string; equipmentTypeId?: string; equipmentTypeIds?: string[] },
): boolean {
  const normalizedSportId = normalizeShopperSportId(filters.sportId);
  if (isShopperMemorabiliaSportId(normalizedSportId)) {
    if (!isShopperMemorabiliaDeal(deal)) return false;
    const requestedShopperEquipment = filters.equipmentTypeIds?.length
      ? filters.equipmentTypeIds
      : (filters.equipmentTypeId ? [filters.equipmentTypeId] : []);
    return requestedShopperEquipment.length === 0
      || requestedShopperEquipment.includes(shopperMemorabiliaEquipmentId(deal) ?? "");
  }
  if (normalizedSportId === "baseball" && isShopperMemorabiliaDeal(deal)) return false;

  const requestedEquipment = expandEquipmentTypeIds(normalizedSportId, filters.equipmentTypeIds?.length
    ? filters.equipmentTypeIds
    : (filters.equipmentTypeId ? [filters.equipmentTypeId] : []));
  const baseballGloveRequest = normalizedSportId === "baseball" && requestedEquipment.some(isBaseballGloveGroupId);
  if (baseballGloveRequest && hasBaseballGloveNegativeEvidence(deal)) return false;
  const exactSport = !normalizedSportId || deal.sportId === normalizedSportId;
  const exactEquipment = requestedEquipment.length === 0 || requestedEquipment.includes(deal.equipmentTypeId ?? "");
  if (normalizedSportId === "golf") {
    const requestedClubFamily = requestedEquipment.some((id) =>
      ["golf-drivers", "golf-irons", "golf-iron-sets", "golf-wedges", "golf-putters", "golf-other"].includes(id),
    );
    if (!requestedClubFamily) return exactSport && exactEquipment;
    const golfClub = classifyGolfClubProduct(`${deal.title ?? ""} ${deal.brand ?? ""}`);
    if (!golfClub) return false;
    return requestedEquipment.includes(golfClub.equipmentTypeId);
  }

  if (exactSport && exactEquipment) return true;

  if (normalizedSportId !== "baseball") return false;
  if (requestedEquipment.length === 0 && hasStrongBaseballGloveSearchIntent(filters.q)) {
    return hasBaseballGloveEvidence(deal);
  }
  if (requestedEquipment.some(isBaseballBatGroupId)) return hasBaseballBatEvidence(deal);
  if (baseballGloveRequest) return hasBaseballGloveEvidence(deal);
  return false;
}
