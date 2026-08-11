import type { EbayCategorySync } from "./ebay-api";

export type EbayDiscoveryRequest = EbayCategorySync & {
  condition: "new" | "preowned" | "all";
  minPrice: number;
};

const ALWAYS: EbayDiscoveryRequest[] = [
  { categoryId: "16030", categoryName: "Baseball Gloves - New", sportId: "baseball", equipmentTypeId: "bb-gloves", keywords: "baseball glove", condition: "new", minPrice: 50 },
  { categoryId: "16030", categoryName: "Baseball Gloves - Preowned", sportId: "baseball", equipmentTypeId: "bb-gloves", keywords: "baseball glove", condition: "preowned", minPrice: 75 },
];

const PRIORITY_GROUPS: EbayDiscoveryRequest[][] = [
  [
    { categoryId: "181315", categoryName: "Baseball Bats - Adult", sportId: "baseball", equipmentTypeId: "bb-bats", condition: "all", minPrice: 60 },
    { categoryId: "73897", categoryName: "Baseball Bats - Youth", sportId: "baseball", equipmentTypeId: "bb-bats", condition: "all", minPrice: 60 },
    { categoryId: "71089", categoryName: "Fastpitch Bats", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats", condition: "all", minPrice: 60 },
    { categoryId: "50797", categoryName: "Slowpitch Bats", sportId: "slowpitch-softball", equipmentTypeId: "sp-bats", condition: "all", minPrice: 60 },
  ],
  [
    { categoryId: "115280", categoryName: "Golf Drivers", sportId: "golf", equipmentTypeId: "golf-drivers", keywords: "driver", condition: "all", minPrice: 75 },
    { categoryId: "115280", categoryName: "Golf Iron Sets", sportId: "golf", equipmentTypeId: "golf-iron-sets", keywords: "iron set", condition: "all", minPrice: 200 },
    { categoryId: "115280", categoryName: "Golf Putters", sportId: "golf", equipmentTypeId: "golf-putters", keywords: "putter", condition: "all", minPrice: 75 },
    { categoryId: "159058", categoryName: "Baseball Cleats", sportId: "baseball", equipmentTypeId: "bb-cleats", keywords: "baseball", condition: "all", minPrice: 40 },
  ],
];

const DEFAULT_MIN_PRICE = 50;
const ROTATING_REQUESTS = 4;

function slotFor(date: Date): number {
  return Math.floor(date.getTime() / (4 * 60 * 60 * 1000));
}

export function getQuotaEfficientEbayDiscoveryPlan(
  available: EbayCategorySync[],
  date = new Date(),
): EbayDiscoveryRequest[] {
  const slot = slotFor(date);
  const priority = PRIORITY_GROUPS[slot % PRIORITY_GROUPS.length];
  const reservedEquipmentTypes = new Set(
    [...ALWAYS, ...PRIORITY_GROUPS.flat()].map((request) => request.equipmentTypeId),
  );
  const rotationPool = available.filter((request) => !reservedEquipmentTypes.has(request.equipmentTypeId));
  const rotating = Array.from({ length: Math.min(ROTATING_REQUESTS, rotationPool.length) }, (_, index) => {
    const request = rotationPool[(slot * ROTATING_REQUESTS + index) % rotationPool.length];
    return { ...request, condition: "all" as const, minPrice: DEFAULT_MIN_PRICE };
  });
  return [...ALWAYS, ...priority, ...rotating];
}

export function selectEbaySellersForRun<T>(sellers: T[], date = new Date(), limit = 5): T[] {
  if (sellers.length <= limit) return sellers;
  const start = (slotFor(date) * limit) % sellers.length;
  return Array.from({ length: limit }, (_, index) => sellers[(start + index) % sellers.length]);
}

export const EBAY_PUBLIC_RUN_CALL_BUDGET = 20;
export const EBAY_PUBLIC_MAX_RESULTS_PER_QUERY = 200;
