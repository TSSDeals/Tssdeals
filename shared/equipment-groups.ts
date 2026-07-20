export const CANONICAL_BASEBALL_BAT_ID = "bb-bats";
export const BASEBALL_BAT_GROUP_IDS = [CANONICAL_BASEBALL_BAT_ID, "baseball-bat", "bat"] as const;

const BASEBALL_BAT_GROUP = new Set<string>(BASEBALL_BAT_GROUP_IDS);

export interface EquipmentTypeLike {
  id: string;
  name: string;
  sportId: string;
  [key: string]: unknown;
}

export function isBaseballBatGroupId(id: string | null | undefined): boolean {
  return !!id && BASEBALL_BAT_GROUP.has(id);
}

export function expandEquipmentTypeIds(sportId: string | undefined, ids: string[]): string[] {
  if (sportId !== "baseball" || !ids.some(isBaseballBatGroupId)) return Array.from(new Set(ids));
  return Array.from(new Set(ids.flatMap((id) => isBaseballBatGroupId(id) ? BASEBALL_BAT_GROUP_IDS : [id])));
}

/** Curates only the shopper-facing list; admin/audit reads retain every raw taxonomy row. */
export function curateShopperEquipmentTypes<T extends EquipmentTypeLike>(types: T[], sportId?: string): T[] {
  if (sportId !== "baseball") return types;
  const canonical = types.find((type) => type.id === CANONICAL_BASEBALL_BAT_ID)
    ?? types.find((type) => isBaseballBatGroupId(type.id));
  const withoutAliases = types.filter((type) => !isBaseballBatGroupId(type.id));
  if (!canonical) return withoutAliases;
  return [...withoutAliases, {
    ...canonical,
    id: CANONICAL_BASEBALL_BAT_ID,
    name: "Baseball Bats",
    equivalentIds: [...BASEBALL_BAT_GROUP_IDS],
  }]
    .sort((a, b) => a.name.localeCompare(b.name));
}
