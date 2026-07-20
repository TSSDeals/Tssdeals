export const CANONICAL_BASEBALL_BAT_ID = "bb-bats";
export const BASEBALL_BAT_GROUP_IDS = [CANONICAL_BASEBALL_BAT_ID, "baseball-bat", "bat"] as const;
export const CANONICAL_BASEBALL_GLOVE_ID = "bb-gloves";
export const BASEBALL_GLOVE_GROUP_IDS = [
  CANONICAL_BASEBALL_GLOVE_ID,
  "glove",
  "gloves",
  "baseball-glove",
  "baseball-gloves",
] as const;

const BASEBALL_BAT_GROUP = new Set<string>(BASEBALL_BAT_GROUP_IDS);
const BASEBALL_GLOVE_GROUP = new Set<string>(BASEBALL_GLOVE_GROUP_IDS);

export interface EquipmentTypeLike {
  id: string;
  name: string;
  sportId: string;
  [key: string]: unknown;
}

export function isBaseballBatGroupId(id: string | null | undefined): boolean {
  return !!id && BASEBALL_BAT_GROUP.has(id);
}

export function isBaseballGloveGroupId(id: string | null | undefined): boolean {
  return !!id && BASEBALL_GLOVE_GROUP.has(id);
}

export function expandEquipmentTypeIds(sportId: string | undefined, ids: string[]): string[] {
  if (sportId !== "baseball") return Array.from(new Set(ids));
  return Array.from(new Set(ids.flatMap((id) => {
    if (isBaseballBatGroupId(id)) return BASEBALL_BAT_GROUP_IDS;
    if (isBaseballGloveGroupId(id)) return BASEBALL_GLOVE_GROUP_IDS;
    return [id];
  })));
}

/** Curates only the shopper-facing list; admin/audit reads retain every raw taxonomy row. */
export function curateShopperEquipmentTypes<T extends EquipmentTypeLike>(types: T[], sportId?: string): T[] {
  if (sportId !== "baseball") return types;
  const canonicalBat = types.find((type) => type.id === CANONICAL_BASEBALL_BAT_ID)
    ?? types.find((type) => isBaseballBatGroupId(type.id));
  const canonicalGlove = types.find((type) => type.id === CANONICAL_BASEBALL_GLOVE_ID)
    ?? types.find((type) => isBaseballGloveGroupId(type.id));
  const curated = types.filter((type) => !isBaseballBatGroupId(type.id) && !isBaseballGloveGroupId(type.id));
  if (canonicalBat) curated.push({
    ...canonicalBat,
    id: CANONICAL_BASEBALL_BAT_ID,
    name: "Baseball Bats",
    equivalentIds: [...BASEBALL_BAT_GROUP_IDS],
  });
  if (canonicalGlove) curated.push({
    ...canonicalGlove,
    id: CANONICAL_BASEBALL_GLOVE_ID,
    name: "Baseball Gloves",
    equivalentIds: [...BASEBALL_GLOVE_GROUP_IDS],
  });
  return curated
    .sort((a, b) => a.name.localeCompare(b.name));
}
