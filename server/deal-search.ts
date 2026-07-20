export type DealSearchConcept =
  | { kind: "text"; value: string }
  | { kind: "brand"; values: string[] }
  | { kind: "bat-size"; length: number; weight: number; drop: number }
  | { kind: "drop"; drop: number };

export interface NormalizedDealSearch {
  concepts: DealSearchConcept[];
  rankQuery: string;
}

const LOUISVILLE_RE = /\b(?:louisville\s+slugger|louisville|ls)\b/i;
const BAT_SIZE_RE = /\b(\d{2})\s*\/\s*(\d{2})\b/;
const DROP_RE = /\bdrop\s*-?\s*(\d{1,2})\b|(?:^|\s)-(\d{1,2})\b/i;

/** Turns user-facing bat shorthand into independent, AND-able search concepts. */
export function normalizeDealSearch(query: string): NormalizedDealSearch {
  let remaining = query.toLowerCase();
  const concepts: DealSearchConcept[] = [];

  const size = remaining.match(BAT_SIZE_RE);
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

  if (LOUISVILLE_RE.test(remaining)) {
    concepts.push({ kind: "brand", values: ["louisville slugger", "louisville", "ls"] });
    remaining = remaining.replace(LOUISVILLE_RE, " ");
  }

  for (const value of remaining.split(/[^a-z0-9.]+/).filter(Boolean)) {
    concepts.push({ kind: "text", value });
  }

  const rankQuery = concepts
    .flatMap((concept) => {
      if (concept.kind === "text") return [concept.value];
      if (concept.kind === "brand") return ["louisville", "slugger"];
      if (concept.kind === "bat-size") return [`${concept.length}`, `${concept.weight}`];
      return [`drop ${concept.drop}`];
    })
    .join(" ");

  return { concepts, rankQuery };
}

export function matchesNormalizedDealSearch(
  search: NormalizedDealSearch,
  deal: { title: string; brand?: string | null; dropWeight?: number | null },
): boolean {
  const haystack = `${deal.title} ${deal.brand ?? ""}`.toLowerCase();
  return search.concepts.every((concept) => {
    if (concept.kind === "text") return haystack.includes(concept.value);
    if (concept.kind === "brand") {
      return concept.values.some((value) => new RegExp(`(^|[^a-z0-9])${value.replace(" ", "\\s+")}([^a-z0-9]|$)`, "i").test(haystack));
    }
    const dropMatch = deal.dropWeight === concept.drop || new RegExp(`(^|[^a-z0-9])(?:drop\\s*-?\\s*|-)${concept.drop}([^a-z0-9]|$)`, "i").test(haystack);
    if (concept.kind === "drop") return dropMatch;
    const sizeMatch = new RegExp(`(^|[^0-9])${concept.length}\\s*(?:/|x|by)\\s*${concept.weight}([^0-9]|$)`, "i").test(haystack);
    return sizeMatch || dropMatch;
  });
}
