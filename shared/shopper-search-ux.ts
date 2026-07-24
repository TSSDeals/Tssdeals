import {
  CANONICAL_BASEBALL_BAT_ID,
  CANONICAL_BASEBALL_GLOVE_ID,
} from "./equipment-groups";

export const SHOPPER_STARTER_SEARCHES = [
  {
    query: "27/17 Louisville Supra",
    label: "27/17 Louisville Supra",
    detail: "Brand, model, and bat size",
  },
  {
    query: "LHT Wilson A1000",
    label: "LHT Wilson A1000",
    detail: "Left-hand-throw glove",
  },
  {
    query: "Hype Fire 29/21",
    label: "Hype Fire 29/21",
    detail: "Model and bat size",
  },
  {
    query: "A2000 1786 11.5",
    label: "A2000 1786 11.5",
    detail: "Glove model and size",
  },
] as const;

export const MAX_RECENT_SHOPPER_SEARCHES = 4;

export interface ShopperSubFilter {
  id: string;
  name: string;
  equipmentTypeId?: string | null;
  [key: string]: unknown;
}

export interface ShopperRefinementGroup<T extends ShopperSubFilter = ShopperSubFilter> {
  id: "length" | "drop" | "certification" | "size" | "position" | "throw-hand";
  label: string;
  items: T[];
}

function normalizedFilterName(value: ShopperSubFilter): string {
  return `${value.name ?? ""} ${value.id ?? ""}`
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function sortRefinements<T extends ShopperSubFilter>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );
}

/**
 * Presents existing taxonomy values in parent-friendly groups. This function
 * only projects records supplied by the taxonomy API; it never invents values.
 */
export function groupShopperSubFilters<T extends ShopperSubFilter>(
  equipmentTypeId: string | null | undefined,
  values: T[],
): ShopperRefinementGroup<T>[] {
  const groups = new Map<ShopperRefinementGroup["id"], T[]>();
  const add = (id: ShopperRefinementGroup["id"], item: T) => {
    const current = groups.get(id) ?? [];
    if (!current.some(({ id: existingId }) => existingId === item.id)) current.push(item);
    groups.set(id, current);
  };

  for (const item of values) {
    const name = normalizedFilterName(item);
    if (equipmentTypeId === CANONICAL_BASEBALL_BAT_ID) {
      if (/\b(?:bbcor|usssa|usa baseball|usa bat|usabat|wood)\b/.test(name)) {
        add("certification", item);
      } else if (/\b(?:drop\s*)?-\s?(?:3|5|8|9|10|11|12|13)\b|\b(?:3|5|8|9|10|11|12|13)\s*(?:oz|ounce|ounces)\b/.test(name)) {
        add("drop", item);
      } else if (/\b(?:2[4-9]|3[0-6])(?:\.\d+)?\s*(?:in(?:ch(?:es)?)?|["\u201d])?(?:\b|$)|\blength\b/.test(name)) {
        add("length", item);
      }
    } else if (equipmentTypeId === CANONICAL_BASEBALL_GLOVE_ID) {
      if (/\b(?:lht|rht|left hand throw|right hand throw|left-hand throw|right-hand throw)\b/.test(name)) {
        add("throw-hand", item);
      } else if (/\b(?:pitcher|infield|outfield|catcher|first base|first-base|utility)\b/.test(name)) {
        add("position", item);
      } else if (/\b(?:[89]|1[0-5])(?:\.\d+)?\s*(?:in(?:ch(?:es)?)?|["\u201d])?(?:\b|$)|\bsize\b/.test(name)) {
        add("size", item);
      }
    }
  }

  const definitions: Array<[ShopperRefinementGroup["id"], string]> =
    equipmentTypeId === CANONICAL_BASEBALL_BAT_ID
      ? [
          ["length", "Length"],
          ["drop", "Weight / drop"],
          ["certification", "Certification"],
        ]
      : equipmentTypeId === CANONICAL_BASEBALL_GLOVE_ID
        ? [
            ["size", "Glove size"],
            ["position", "Position"],
            ["throw-hand", "Throw hand"],
          ]
        : [];

  return definitions.flatMap(([id, label]) => {
    const items = groups.get(id);
    return items?.length ? [{ id, label, items: sortRefinements(items) }] : [];
  });
}

export function addRecentShopperSearch(
  current: readonly string[],
  next: string,
  limit = MAX_RECENT_SHOPPER_SEARCHES,
): string[] {
  const clean = next.replace(/\s+/g, " ").trim().slice(0, 120);
  const boundedLimit = Math.max(0, Math.min(limit, MAX_RECENT_SHOPPER_SEARCHES));
  if (!clean || boundedLimit === 0) return [];
  const deduped = current.filter((value) => value.trim().toLowerCase() !== clean.toLowerCase());
  return [clean, ...deduped].slice(0, boundedLimit);
}

export function parseRecentShopperSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .reduce<string[]>((result, value) => addRecentShopperSearch(result, value), [])
      .reverse();
  } catch {
    return [];
  }
}
