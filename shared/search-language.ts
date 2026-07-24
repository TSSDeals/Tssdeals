export interface BatSizeIntent {
  length: number;
  weight: number;
  drop: number;
  matched: string;
  index: number;
}

const EXPLICIT_BAT_SIZE_PATTERNS = [
  /\b(\d{2})\s*(?:\/|x|by)\s*(\d{2})\b/i,
  /\b(\d{2})\s*(?:inches?|inch|in|["″])\s*(?:\/|x|-|by)?\s*(\d{2})\s*(?:ounces?|ounce|oz)\b/i,
];

const SHOPPING_SHORTHAND_BAT_SIZE_PATTERNS = [
  /\b(\d{2})\s*-\s*(\d{2})\b/i,
  /\b(\d{2})\s+(\d{2})\b/i,
];

const BASEBALL_BAT_QUERY_INTENT =
  /(^|[^a-z0-9])(?:baseball\s+bat|youth\s+(?:baseball\s+)?bat|tee[ -]?ball\s+bat|bbcor|usssa|usa\s+baseball|cat\s*x|hype[ -]?fire|(?:louisville(?:\s+slugger)?|ls)\s+supra|supra)([^a-z0-9]|$)/i;

function plausibleBatSize(length: number, weight: number): boolean {
  const drop = length - weight;
  return length >= 24
    && length <= 34
    && weight >= 12
    && weight <= 31
    && drop >= 3
    && drop <= 14;
}

function intentFromMatch(match: RegExpMatchArray | null): BatSizeIntent | null {
  if (!match) return null;
  const length = Number(match[1]);
  const weight = Number(match[2]);
  if (!plausibleBatSize(length, weight)) return null;
  return {
    length,
    weight,
    drop: length - weight,
    matched: match[0],
    index: match.index ?? 0,
  };
}

/**
 * Parses exact bat dimensions everywhere, but only treats ambiguous dash/space
 * pairs as dimensions when the rest of the query supplies baseball-bat intent.
 */
export function extractBatSizeIntent(query: string): BatSizeIntent | null {
  for (const pattern of EXPLICIT_BAT_SIZE_PATTERNS) {
    const intent = intentFromMatch(query.match(pattern));
    if (intent) return intent;
  }
  if (!BASEBALL_BAT_QUERY_INTENT.test(query)) return null;
  for (const pattern of SHOPPING_SHORTHAND_BAT_SIZE_PATTERNS) {
    const intent = intentFromMatch(query.match(pattern));
    if (intent) return intent;
  }
  return null;
}

/** PostgreSQL/JavaScript-compatible regex for common title size notations. */
export function batSizeTitlePattern(length: number, weight: number): string {
  return `(^|[^0-9])${length}(?:\\s*(?:/|x|by|-)\\s*${weight}|\\s+${weight}|\\s*(?:inches?|inch|in|["″])\\s*(?:/|x|-|by)?\\s*${weight}\\s*(?:ounces?|ounce|oz))([^0-9]|$)`;
}

function replaceBatSize(query: string, intent: BatSizeIntent, replacement: string): string {
  return `${query.slice(0, intent.index)}${replacement}${query.slice(intent.index + intent.matched.length)}`
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedBatQueryAlternates(query: string): string[] {
  const intent = extractBatSizeIntent(query);
  if (!intent) return [];
  const candidates = [
    replaceBatSize(query, intent, `${intent.length}/${intent.weight}`),
    replaceBatSize(query, intent, `drop ${intent.drop}`),
  ];
  const original = query.replace(/\s+/g, " ").trim().toLowerCase();
  return Array.from(new Set(candidates))
    .filter((candidate) => candidate.toLowerCase() !== original);
}

export type SearchRecoveryConstraint =
  | "subFilterId"
  | "brand"
  | "source"
  | "equipmentTypeId"
  | "sportId"
  | "condition"
  | "minPercentOff"
  | "maxPrice"
  | "priceDropOnly";

export type SearchRecoveryAction =
  | { kind: "query"; label: string; query: string }
  | { kind: "constraint"; label: string; constraint: SearchRecoveryConstraint };

export interface SearchRecoveryFilters {
  q: string;
  sportId: string;
  equipmentTypeId: string;
  subFilterId: string;
  condition: string;
  source: string;
  brand: string;
  minPercentOff: number;
  maxPrice: number;
  priceDropOnly: boolean;
}

/** Builds bounded, deterministic recovery choices; it never invents results. */
export function buildZeroResultRecovery(filters: SearchRecoveryFilters): SearchRecoveryAction[] {
  const actions: SearchRecoveryAction[] = normalizedBatQueryAlternates(filters.q)
    .slice(0, 2)
    .map((query) => ({ kind: "query", label: `Try “${query}”`, query }));

  const constraints: Array<[boolean, SearchRecoveryConstraint, string]> = [
    [filters.subFilterId !== "all", "subFilterId", "Remove sub-filter"],
    [filters.brand !== "all", "brand", "Remove brand"],
    [filters.source !== "all", "source", "Search all sources"],
    [filters.equipmentTypeId !== "all", "equipmentTypeId", "Remove equipment type"],
    [filters.sportId !== "all", "sportId", "Search all sports"],
    [filters.condition !== "all", "condition", "Include all conditions"],
    [filters.minPercentOff > 0, "minPercentOff", "Remove minimum discount"],
    [filters.maxPrice > 0, "maxPrice", "Remove maximum price"],
    [filters.priceDropOnly, "priceDropOnly", "Include non-price-drops"],
  ];
  for (const [active, constraint, label] of constraints) {
    if (active) actions.push({ kind: "constraint", constraint, label });
  }
  return actions.slice(0, 5);
}
