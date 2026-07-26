import {
  isShopperMemorabiliaDeal,
  SHOPPER_BASEBALL_APPAREL_PATTERN,
  type EquipmentTypeLike,
} from "@shared/equipment-groups";
import type { ImpactCatalogItem } from "./impact-api";

const SPORT_KEYWORD_MAP: Record<string, string[]> = {
  baseball: ["baseball", "mlb"],
  "fastpitch-softball": ["softball", "fastpitch"],
  "slowpitch-softball": ["softball", "slowpitch"],
  basketball: ["basketball", "nba"],
  football: ["football", "nfl"],
  soccer: ["soccer", "mls", "fifa"],
  hockey: ["hockey", "nhl"],
  lacrosse: ["lacrosse"],
  golf: ["golf", "pga"],
  volleyball: ["volleyball"],
  wrestling: ["wrestling"],
  cycling: ["cycling"],
  gymnastics: ["gymnastics"],
  cheerleading: ["cheerleading"],
  rugby: ["rugby"],
  swimming: ["swimming"],
  "disc-golf": ["disc golf"],
  fishing: ["fishing"],
};

export function detectFanaticsSport(name: string, category: string, subCategory: string): string {
  const text = `${name} ${category} ${subCategory}`.toLowerCase();
  for (const [sportId, keywords] of Object.entries(SPORT_KEYWORD_MAP)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) return sportId;
    }
  }
  return "baseball";
}

export function classifyFanaticsItem(
  item: Pick<ImpactCatalogItem, "Name" | "Description" | "Manufacturer" | "Category" | "SubCategory">,
  allEquipmentTypes: EquipmentTypeLike[],
): { sportId: string; equipmentTypeId: string } {
  const title = `${item.Name || ""} ${item.Description || ""}`.trim();
  if (isShopperMemorabiliaDeal({ title, brand: item.Manufacturer })) {
    const memorabiliaType = allEquipmentTypes.find(
      (equipmentType) => equipmentType.sportId === "baseball-memorabilia",
    );
    if (memorabiliaType) {
      return {
        sportId: memorabiliaType.sportId,
        equipmentTypeId: memorabiliaType.id,
      };
    }
  }

  const sportId = detectFanaticsSport(item.Name, item.Category, item.SubCategory);
  const sportEqTypes = allEquipmentTypes.filter((equipmentType) => equipmentType.sportId === sportId);
  const itemText = `${item.Name || ""} ${item.Category || ""} ${item.SubCategory || ""}`;
  if (new RegExp(SHOPPER_BASEBALL_APPAREL_PATTERN, "i").test(itemText)) {
    const apparelType = sportEqTypes.find(
      (equipmentType) =>
        equipmentType.id.endsWith("-shoes-apparel")
        || /\b(?:apparel|clothing|shoes?)\b/i.test(equipmentType.name),
    );
    if (apparelType) {
      return { sportId, equipmentTypeId: apparelType.id };
    }
  }

  const defaultEqType =
    sportEqTypes.find((equipmentType) => equipmentType.id.endsWith("-other"))?.id
    ?? sportEqTypes[0]?.id
    ?? sportId;
  return { sportId, equipmentTypeId: defaultEqType };
}
