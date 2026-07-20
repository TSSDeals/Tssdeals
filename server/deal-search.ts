import { expandEquipmentTypeIds, isBaseballBatGroupId, isBaseballGloveGroupId } from "../shared/equipment-groups";

export type DealSearchConcept =
  | { kind: "text"; value: string }
  | { kind: "alias"; canonical: string; values: string[] }
  | { kind: "bat-size"; length: number; weight: number; drop: number }
  | { kind: "glove-size"; size: string }
  | { kind: "drop"; drop: number };

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

const BAT_SIZE_RES = [
  /\b(\d{2})\s*(?:\/|x|by)\s*(\d{2})\b/i,
  /\b(\d{2})\s*(?:inches?|inch|in|["″])\s*(?:\/|x|-|by)?\s*(\d{2})\s*(?:ounces?|ounce|oz)\b/i,
];
const DROP_RE = /\bdrop\s*-?\s*(\d{1,2})\b|(?:^|\s)-\s*(\d{1,2})\b/i;
const GLOVE_SIZE_QUERY_RE = /(?:^|\s)(\d{1,2}\.\d{1,2})[\s-]*(?:["″]|in(?:ch(?:es)?)?\.?)?(?=\s|$)/i;

export const BASEBALL_BAT_EVIDENCE_PATTERN =
  "(^|[^a-z0-9])(bbcor|usssa|usa\\s+baseball|baseball\\s+bat|youth\\s+(?:baseball\\s+)?bat|tee[ -]?ball\\s+bat|cat\\s*x|hype[ -]?fire|(?:louisville(?:\\s+slugger)?|ls)\\s+supra|supra\\s+(?:louisville(?:\\s+slugger)?|ls))([^a-z0-9]|$)";

export const BASEBALL_BAT_NEGATIVE_EVIDENCE_PATTERN =
  "(^|[^a-z0-9])(cricket|fastpitch|softball|slowpitch)([^a-z0-9]|$)";

export const BASEBALL_GLOVE_EVIDENCE_PATTERN =
  "(^|[^a-z0-9])(baseball\\s+(?:fielding\\s+)?glove|fielding\\s+glove|infield(?:er)?\\s+glove|outfield(?:er)?\\s+glove|pitcher(?:'s)?\\s+glove|catcher(?:'s)?\\s+mitt|first\\s+base\\s+mitt|wilson\\s+a(?:2000|2k)|a2000\\s+1786|heart\\s+of\\s+the\\s+hide|pro\\s+preferred)([^a-z0-9]|$)";

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

  const size = BAT_SIZE_RES.map((pattern) => remaining.match(pattern)).find(Boolean);
  if (size) {
    const length = Number(size[1]);
    const weight = Number(size[2]);
    concepts.push({ kind: "bat-size", length, weight, drop: Math.abs(length - weight) });
    remaining = remaining.replace(size[0], " ");
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
    const dropMatch = deal.dropWeight === concept.drop || new RegExp(`(^|[^a-z0-9])(?:drop\\s*-?\\s*|-)${concept.drop}([^a-z0-9]|$)`, "i").test(haystack);
    if (concept.kind === "drop") return dropMatch;
    const sizeMatch = new RegExp(
      `(^|[^0-9])${concept.length}\\s*(?:(?:/|x|by)\\s*${concept.weight}|(?:inches?|inch|in|["″])\\s*(?:/|x|-|by)?\\s*${concept.weight}\\s*(?:ounces?|ounce|oz))([^0-9]|$)`,
      "i",
    ).test(haystack);
    return sizeMatch || dropMatch;
  });
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
  return !hasBaseballGloveNegativeEvidence(deal)
    && new RegExp(BASEBALL_GLOVE_EVIDENCE_PATTERN, "i").test(`${deal.title} ${deal.brand ?? ""}`);
}

export function hasBaseballGloveNegativeEvidence(deal: SearchableDeal): boolean {
  const storedNegative = /^(?:fp|sp)-/.test(deal.equipmentTypeId ?? "")
    || ["fastpitch-softball", "slowpitch-softball", "golf", "boxing", "cricket"].includes(deal.sportId ?? "")
    || /(?:batting-gloves|golf-glove|boxing-gloves)/.test(deal.equipmentTypeId ?? "");
  return storedNegative || new RegExp(BASEBALL_GLOVE_NEGATIVE_EVIDENCE_PATTERN, "i").test(deal.title);
}

/** Higher means a bat-size match is more specific; exact length/weight outranks drop fallback. */
export function batSizeMatchSpecificity(search: NormalizedDealSearch, deal: SearchableDeal): number {
  const size = search.concepts.find((concept) => concept.kind === "bat-size");
  if (!size || size.kind !== "bat-size") return 0;
  const haystack = `${deal.title} ${deal.brand ?? ""}`;
  const exact = new RegExp(
    `(^|[^0-9])${size.length}\\s*(?:(?:/|x|by)\\s*${size.weight}|(?:inches?|inch|in|[\"″])\\s*(?:/|x|-|by)?\\s*${size.weight}\\s*(?:ounces?|ounce|oz))([^0-9]|$)`,
    "i",
  ).test(haystack);
  if (exact) return 2;
  const drop = deal.dropWeight === size.drop
    || new RegExp(`(^|[^a-z0-9])(?:drop\\s*-?\\s*|-)${size.drop}([^a-z0-9]|$)`, "i").test(haystack);
  return drop ? 1 : 0;
}

export function matchesDealClassificationFilters(
  deal: SearchableDeal,
  filters: { sportId?: string; equipmentTypeId?: string; equipmentTypeIds?: string[] },
): boolean {
  const requestedEquipment = expandEquipmentTypeIds(filters.sportId, filters.equipmentTypeIds?.length
    ? filters.equipmentTypeIds
    : (filters.equipmentTypeId ? [filters.equipmentTypeId] : []));
  const baseballGloveRequest = filters.sportId === "baseball" && requestedEquipment.some(isBaseballGloveGroupId);
  if (baseballGloveRequest && hasBaseballGloveNegativeEvidence(deal)) return false;
  const exactSport = !filters.sportId || deal.sportId === filters.sportId;
  const exactEquipment = requestedEquipment.length === 0 || requestedEquipment.includes(deal.equipmentTypeId ?? "");
  if (exactSport && exactEquipment) return true;

  if (filters.sportId !== "baseball") return false;
  if (requestedEquipment.some(isBaseballBatGroupId)) return hasBaseballBatEvidence(deal);
  if (baseballGloveRequest) return hasBaseballGloveEvidence(deal);
  return false;
}
