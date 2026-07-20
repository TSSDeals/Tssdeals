export type DealSearchConcept =
  | { kind: "text"; value: string }
  | { kind: "alias"; canonical: string; values: string[] }
  | { kind: "bat-size"; length: number; weight: number; drop: number }
  | { kind: "drop"; drop: number };

export interface NormalizedDealSearch {
  concepts: DealSearchConcept[];
  rankQuery: string;
}

export interface SearchableDeal {
  title: string;
  brand?: string | null;
  dropWeight?: number | null;
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

export const BASEBALL_BAT_EVIDENCE_PATTERN =
  "(^|[^a-z0-9])(bbcor|usssa|usa\\s+baseball|baseball\\s+bat|youth\\s+(?:baseball\\s+)?bat|tee[ -]?ball\\s+bat|cat\\s*x|hype[ -]?fire)([^a-z0-9]|$)";

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
    const dropMatch = deal.dropWeight === concept.drop || new RegExp(`(^|[^a-z0-9])(?:drop\\s*-?\\s*|-)${concept.drop}([^a-z0-9]|$)`, "i").test(haystack);
    if (concept.kind === "drop") return dropMatch;
    const sizeMatch = new RegExp(
      `(^|[^0-9])${concept.length}\\s*(?:(?:/|x|by)\\s*${concept.weight}|(?:inches?|inch|in|["″])\\s*(?:/|x|-|by)?\\s*${concept.weight}\\s*(?:ounces?|ounce|oz))([^0-9]|$)`,
      "i",
    ).test(haystack);
    return sizeMatch || dropMatch;
  });
}

export function hasBaseballBatEvidence(deal: SearchableDeal): boolean {
  const evidence = `${deal.title} ${deal.brand ?? ""} ${JSON.stringify(deal.raw ?? {})}`;
  return new RegExp(BASEBALL_BAT_EVIDENCE_PATTERN, "i").test(evidence) && !/\bcricket\b/i.test(evidence);
}

export function matchesDealClassificationFilters(
  deal: SearchableDeal,
  filters: { sportId?: string; equipmentTypeId?: string; equipmentTypeIds?: string[] },
): boolean {
  const requestedEquipment = filters.equipmentTypeIds?.length
    ? filters.equipmentTypeIds
    : (filters.equipmentTypeId ? [filters.equipmentTypeId] : []);
  const exactSport = !filters.sportId || deal.sportId === filters.sportId;
  const exactEquipment = requestedEquipment.length === 0 || requestedEquipment.includes(deal.equipmentTypeId ?? "");
  if (exactSport && exactEquipment) return true;

  return filters.sportId === "baseball"
    && requestedEquipment.includes("bb-bats")
    && hasBaseballBatEvidence(deal);
}
