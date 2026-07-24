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

export const SHOPPER_MEMORABILIA_SPORT_ID = "memorabilia";
export const SHOPPER_BASEBALL_CATCHERS_GEAR_ID = "shopper-bb-catchers-gear";
export const SHOPPER_BASEBALL_BATTING_HELMETS_ID = "shopper-bb-batting-helmets";
export const SHOPPER_BASEBALL_APPAREL_ID = "shopper-bb-apparel";
export const SHOPPER_BASEBALL_ACCESSORIES_ID = "shopper-bb-accessories";

export const SHOPPER_MEMORABILIA_EQUIPMENT = [
  { id: "memorabilia-signed-balls", name: "Signed · Balls" },
  { id: "memorabilia-signed-bats", name: "Signed · Bats" },
  { id: "memorabilia-signed-gloves", name: "Signed · Gloves" },
  { id: "memorabilia-signed-jerseys", name: "Signed · Jerseys" },
  { id: "memorabilia-signed-photos", name: "Signed · Photos" },
  { id: "memorabilia-signed-cards", name: "Signed · Cards" },
  { id: "memorabilia-signed-other", name: "Signed · Other" },
  { id: "memorabilia-game-used", name: "Game-Used" },
  { id: "memorabilia-trading-cards", name: "Trading Cards" },
  { id: "memorabilia-display-cases", name: "Display Cases" },
  { id: "memorabilia-other-collectibles", name: "Other Collectibles" },
] as const;

export type ShopperMemorabiliaEquipmentId = typeof SHOPPER_MEMORABILIA_EQUIPMENT[number]["id"];

const SHOPPER_MEMORABILIA_IDS = new Set<string>(SHOPPER_MEMORABILIA_EQUIPMENT.map(({ id }) => id));

const SHOPPER_BASEBALL_EQUIPMENT = [
  { id: CANONICAL_BASEBALL_BAT_ID, name: "Bats", backingIds: BASEBALL_BAT_GROUP_IDS },
  { id: CANONICAL_BASEBALL_GLOVE_ID, name: "Baseball Gloves", backingIds: BASEBALL_GLOVE_GROUP_IDS },
  { id: SHOPPER_BASEBALL_CATCHERS_GEAR_ID, name: "Catcher's Gear", backingIds: ["bb-protective"] },
  { id: SHOPPER_BASEBALL_BATTING_HELMETS_ID, name: "Batting Helmets", backingIds: ["bb-protective"] },
  { id: "bb-protective", name: "Protective Gear", backingIds: ["bb-protective"] },
  { id: "bb-cleats", name: "Cleats", backingIds: ["bb-cleats"] },
  { id: "bb-bags", name: "Bags", backingIds: ["bb-bags"] },
  { id: "bb-balls", name: "Balls", backingIds: ["bb-balls"] },
  { id: "bb-training", name: "Training Equipment", backingIds: ["bb-training"] },
  { id: SHOPPER_BASEBALL_APPAREL_ID, name: "Apparel", backingIds: ["bb-shoes-apparel"] },
  {
    id: SHOPPER_BASEBALL_ACCESSORIES_ID,
    name: "Accessories",
    backingIds: ["bb-batting-gloves", "bb-field-equipment", "bb-care-accessories"],
  },
] as const;

const SHOPPER_BASEBALL_BY_ID = new Map<string, readonly string[]>(
  SHOPPER_BASEBALL_EQUIPMENT.map(({ id, backingIds }) => [id, backingIds]),
);

export const SHOPPER_MEMORABILIA_EVIDENCE_PATTERN =
  String.raw`\b(?:hand[ -]?signed|signed(?:\s+by)?|autographed(?:\s+by)?|authenticated(?:\s+by)?|memorabilia|collectibles?|commemorative|display[ -]?only|with\s+(?:a\s+)?coa|certificate\s+of\s+authenticity|psa\s*\/?\s*dna|jsa\s+(?:coa|certified|authenticated)|beckett\s+(?:coa|certified|authenticated))\b`;
export const SHOPPER_MEMORABILIA_BRANDING_EXCEPTION_PATTERN =
  String.raw`\b(?:autograph\s+model|signature\s+series)\b`;
export const SHOPPER_MEMORABILIA_SIGNED_PATTERN =
  String.raw`\b(?:hand[ -]?signed|signed(?:\s+by)?|autographed(?:\s+by)?|with\s+(?:a\s+)?coa|certificate\s+of\s+authenticity|psa\s*\/?\s*dna|jsa\s+(?:coa|certified|authenticated)|beckett\s+(?:coa|certified|authenticated))\b`;
export const SHOPPER_MEMORABILIA_GAME_USED_PATTERN =
  String.raw`\b(?:game[ -]?(?:used|worn|issued)|team[ -]issued)\b`;
export const SHOPPER_MEMORABILIA_CARD_PATTERN =
  String.raw`\b(?:trading|baseball|sports?)\s+cards?\b|\b(?:topps|panini|upper\s+deck|bowman)\b.{0,28}\bcards?\b`;
export const SHOPPER_MEMORABILIA_DISPLAY_PATTERN =
  String.raw`\b(?:display|shadow)\s+(?:case|stand|mount|box)|\bwall\s+mount\b`;
export const SHOPPER_MEMORABILIA_BALL_PATTERN = String.raw`\b(?:baseballs?|baseball\s+balls?|balls?)\b`;
export const SHOPPER_MEMORABILIA_BAT_PATTERN = String.raw`\bbats?\b`;
export const SHOPPER_MEMORABILIA_GLOVE_PATTERN = String.raw`\b(?:gloves?|mitts?|a2000|a2k)\b`;
export const SHOPPER_MEMORABILIA_JERSEY_PATTERN = String.raw`\bjerseys?\b`;
export const SHOPPER_MEMORABILIA_PHOTO_PATTERN = String.raw`\b(?:photos?|prints?|posters?)\b`;
export const SHOPPER_MEMORABILIA_ANY_SIGNED_FORM_PATTERN =
  String.raw`\b(?:baseballs?|baseball\s+balls?|balls?|bats?|gloves?|mitts?|a2000|a2k|jerseys?|photos?|prints?|posters?|cards?)\b`;

export const SHOPPER_BASEBALL_CATCHERS_GEAR_PATTERN =
  String.raw`\b(?:catchers?|catching)\b.{0,36}\b(?:gear|sets?|kits?|masks?|helmets?|chest\s+protectors?|leg\s+guards?|shin\s+guards?)\b|\b(?:masks?|chest\s+protectors?|leg\s+guards?|shin\s+guards?)\b.{0,36}\b(?:catchers?|catching)\b`;
export const SHOPPER_BASEBALL_BATTING_HELMET_PATTERN =
  String.raw`\b(?:baseball\s+)?batting\s+helmets?\b`;
export const SHOPPER_BASEBALL_APPAREL_PATTERN =
  String.raw`\b(?:jerseys?|t[ -]?shirts?|shirts?|hoodies?|sweatshirts?|shorts?|pants?|socks?|hats?|caps?|beanies?|apparel|uniforms?)\b`;

export interface EquipmentTypeLike {
  id: string;
  name: string;
  sportId: string;
  [key: string]: unknown;
}

export interface SportLike {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface ShopperDealLike {
  title?: string | null;
  brand?: string | null;
  sportId?: string | null;
  equipmentTypeId?: string | null;
}

export function isBaseballBatGroupId(id: string | null | undefined): boolean {
  return !!id && BASEBALL_BAT_GROUP.has(id);
}

export function isBaseballGloveGroupId(id: string | null | undefined): boolean {
  return !!id && BASEBALL_GLOVE_GROUP.has(id);
}

export function isShopperMemorabiliaEquipmentId(id: string | null | undefined): id is ShopperMemorabiliaEquipmentId {
  return !!id && SHOPPER_MEMORABILIA_IDS.has(id);
}

export function isVirtualShopperEquipmentId(id: string | null | undefined): boolean {
  return !!id && (SHOPPER_MEMORABILIA_IDS.has(id)
    || id === SHOPPER_BASEBALL_CATCHERS_GEAR_ID
    || id === SHOPPER_BASEBALL_BATTING_HELMETS_ID
    || id === SHOPPER_BASEBALL_APPAREL_ID
    || id === SHOPPER_BASEBALL_ACCESSORIES_ID);
}

function testPattern(pattern: string, value: string): boolean {
  return new RegExp(pattern, "i").test(value);
}

function memorabiliaEvidenceText(deal: ShopperDealLike): string {
  return `${deal.title ?? ""} ${deal.brand ?? ""}`
    .replace(new RegExp(SHOPPER_MEMORABILIA_BRANDING_EXCEPTION_PATTERN, "ig"), " ");
}

export function isShopperMemorabiliaDeal(deal: ShopperDealLike): boolean {
  const text = memorabiliaEvidenceText(deal);
  return testPattern(SHOPPER_MEMORABILIA_EVIDENCE_PATTERN, text)
    || testPattern(SHOPPER_MEMORABILIA_GAME_USED_PATTERN, text)
    || testPattern(SHOPPER_MEMORABILIA_CARD_PATTERN, text)
    || testPattern(SHOPPER_MEMORABILIA_DISPLAY_PATTERN, text);
}

export function shopperMemorabiliaEquipmentId(deal: ShopperDealLike): ShopperMemorabiliaEquipmentId | null {
  const text = memorabiliaEvidenceText(deal);
  const signed = testPattern(SHOPPER_MEMORABILIA_SIGNED_PATTERN, text);
  if (signed) {
    if (testPattern(SHOPPER_MEMORABILIA_CARD_PATTERN, text) || /\bcards?\b/i.test(text)) return "memorabilia-signed-cards";
    if (testPattern(SHOPPER_MEMORABILIA_BALL_PATTERN, text)) return "memorabilia-signed-balls";
    if (testPattern(SHOPPER_MEMORABILIA_BAT_PATTERN, text)) return "memorabilia-signed-bats";
    if (testPattern(SHOPPER_MEMORABILIA_GLOVE_PATTERN, text)) return "memorabilia-signed-gloves";
    if (testPattern(SHOPPER_MEMORABILIA_JERSEY_PATTERN, text)) return "memorabilia-signed-jerseys";
    if (testPattern(SHOPPER_MEMORABILIA_PHOTO_PATTERN, text)) return "memorabilia-signed-photos";
    return "memorabilia-signed-other";
  }
  if (testPattern(SHOPPER_MEMORABILIA_GAME_USED_PATTERN, text)) return "memorabilia-game-used";
  if (testPattern(SHOPPER_MEMORABILIA_CARD_PATTERN, text)) return "memorabilia-trading-cards";
  if (testPattern(SHOPPER_MEMORABILIA_DISPLAY_PATTERN, text)) return "memorabilia-display-cases";
  if (isShopperMemorabiliaDeal(deal)) return "memorabilia-other-collectibles";
  return null;
}

export function shopperResultEquipmentTypeId(deal: ShopperDealLike): string {
  return shopperMemorabiliaEquipmentId(deal)
    ?? canonicalResultEquipmentTypeId(deal.sportId, deal.equipmentTypeId);
}

export function canonicalResultEquipmentTypeId(
  sportId: string | null | undefined,
  equipmentTypeId: string | null | undefined,
): string {
  if (sportId === "baseball" && isBaseballGloveGroupId(equipmentTypeId)) return CANONICAL_BASEBALL_GLOVE_ID;
  return equipmentTypeId ?? "other";
}

export function canonicalEquipmentTypeLabel(equipmentTypeId: string, fallback: string): string {
  if (equipmentTypeId === CANONICAL_BASEBALL_GLOVE_ID) return "Baseball Gloves";
  const memorabilia = SHOPPER_MEMORABILIA_EQUIPMENT.find(({ id }) => id === equipmentTypeId);
  if (memorabilia) return memorabilia.name;
  const baseball = SHOPPER_BASEBALL_EQUIPMENT.find(({ id }) => id === equipmentTypeId);
  if (baseball) return baseball.name;
  return fallback;
}

export function expandEquipmentTypeIds(sportId: string | undefined, ids: string[]): string[] {
  if (sportId === SHOPPER_MEMORABILIA_SPORT_ID) return [];
  const shopperExpanded = ids.flatMap((id) => SHOPPER_BASEBALL_BY_ID.get(id) ?? [id]);
  if (sportId !== "baseball") return Array.from(new Set(shopperExpanded));
  return Array.from(new Set(shopperExpanded.flatMap((id) => {
    const shopperBackingIds = SHOPPER_BASEBALL_BY_ID.get(id);
    if (shopperBackingIds) return shopperBackingIds;
    if (isBaseballBatGroupId(id)) return BASEBALL_BAT_GROUP_IDS;
    if (isBaseballGloveGroupId(id)) return BASEBALL_GLOVE_GROUP_IDS;
    return [id];
  })));
}

export function curateShopperSports<T extends SportLike>(sports: T[]): Array<T | SportLike> {
  if (sports.some(({ id }) => id === SHOPPER_MEMORABILIA_SPORT_ID)) return sports;
  return [...sports, { id: SHOPPER_MEMORABILIA_SPORT_ID, name: "Memorabilia", virtual: true }];
}

/** Curates only the shopper-facing list; admin/audit reads retain every raw taxonomy row. */
export function curateShopperEquipmentTypes<T extends EquipmentTypeLike>(types: T[], sportId?: string): T[] {
  if (!sportId) return [];
  if (sportId === SHOPPER_MEMORABILIA_SPORT_ID) {
    return SHOPPER_MEMORABILIA_EQUIPMENT.map(({ id, name }) => ({
      id,
      name,
      sportId,
      virtual: true,
    })) as unknown as T[];
  }
  if (sportId !== "baseball") return types;

  const fallback = types[0] ?? { id: "", name: "", sportId: "baseball" };
  return SHOPPER_BASEBALL_EQUIPMENT.map(({ id, name, backingIds }) => {
    const source = types.find((type) => type.id === id)
      ?? types.find((type) => backingIds.includes(type.id as never))
      ?? fallback;
    return {
      ...source,
      id,
      name,
      sportId: "baseball",
      equivalentIds: [...backingIds],
      virtual: isVirtualShopperEquipmentId(id),
    } as T;
  });
}
