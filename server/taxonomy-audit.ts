import { normalizeBrand } from "./brand-normalizer";
import {
  hasBaseballBatEvidence,
  hasBaseballGloveEvidence,
  normalizeGloveSize,
  type SearchableDeal,
} from "./deal-search";
import { TAXONOMY_ASSIGNMENT_PATHS } from "./taxonomy-assignment-paths";
import {
  CANONICAL_BASEBALL_BAT_ID,
  CANONICAL_BASEBALL_GLOVE_ID,
  canonicalEquipmentTypeLabel,
  canonicalResultEquipmentTypeId,
} from "../shared/equipment-groups";

export const TAXONOMY_AUDIT_RULE_VERSION = "phase1-read-only-v1";

export interface AuditSportRow {
  id: string;
  name: string;
  userCreated?: boolean;
}

export interface AuditEquipmentRow {
  id: string;
  name: string;
  sportId: string | null;
  userCreated?: boolean;
}

export interface AuditSubFilterRow {
  id: string;
  name: string;
  equipmentTypeId: string;
}

export interface AuditSourceRow {
  id: string;
  name: string;
  category?: string | null;
}

export interface AuditDealRow extends SearchableDeal {
  id: string;
  sourceId: string;
  title: string;
  brand?: string | null;
  sportId?: string | null;
  equipmentTypeId?: string | null;
  subFilterId?: string | null;
  subFilterIds?: string[];
  dropWeight?: number | null;
  sizeNumber?: string | null;
  classificationSource?: string | null;
  classificationConfidence?: string | null;
  raw?: unknown;
}

export interface TaxonomyAuditDataset {
  sports: AuditSportRow[];
  equipmentTypes: AuditEquipmentRow[];
  subFilters: AuditSubFilterRow[];
  sources: AuditSourceRow[];
  deals: AuditDealRow[];
}

export type AuditConfidence = "high" | "medium" | "low";

export interface TaxonomyFinding {
  kind:
    | "duplicate-display-label"
    | "synonymous-ids"
    | "legacy-id"
    | "orphaned-id"
    | "noncanonical-id"
    | "display-group-fragmentation"
    | "identifier-conflict";
  entity: "sport" | "equipment-type" | "sub-filter" | "display-group" | "deal";
  sportId: string | null;
  equipmentFamily: string | null;
  label: string;
  currentIds: string[];
  proposedCanonicalId: string | null;
  recordCount: number;
  evidence: string[];
  reason: string;
  confidence: AuditConfidence;
  humanApprovalRequired: boolean;
  examples: Array<{ id: string; title: string }>;
}

export interface CorrectionGroup {
  sportId: string | null;
  equipmentFamily: string | null;
  sourceId: string;
  sourceName: string;
  seller: string | null;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  recordCount: number;
  evidence: string[];
  reason: string;
  confidence: AuditConfidence;
  humanApprovalRequired: boolean;
  status: "proposed" | "pending";
  examples: Array<{ id: string; title: string }>;
}

export interface FieldCoverage {
  field: string;
  present: number;
  missing: number;
  malformed: number;
  representativeValues: string[];
}

export interface BrandInventoryRow {
  storedValue: string;
  proposedCanonicalValue: string;
  recordCount: number;
  isAlias: boolean;
}

export interface SourceCategoryInventoryRow {
  sourceId: string;
  sourceName: string;
  categoryField: string;
  storedValue: string;
  recordCount: number;
}

export interface RawFieldInventoryRow {
  field: string;
  recordCount: number;
  representativeValues: string[];
}

export interface TaxonomyInventory {
  sports: Array<{
    id: string;
    label: string;
    userCreated: boolean;
    dealCount: number;
  }>;
  equipmentTypes: Array<{
    id: string;
    label: string;
    sportId: string | null;
    userCreated: boolean;
    equipmentFamily: string;
    dealCount: number;
    displayGroupId: string;
    displayLabel: string;
    proposedCanonicalId: string | null;
    disposition: "canonical" | "legacy-alias" | "unresolved-other" | "orphaned";
  }>;
  subFilters: Array<{
    id: string;
    label: string;
    equipmentTypeId: string;
    assignmentCount: number;
    disposition: "current-parent" | "legacy-parent" | "orphaned-parent";
  }>;
}

export interface TaxonomyAuditReport {
  metadata: {
    generatedAt: string;
    ruleVersion: string;
    mode: "read-only";
    scope: "all-deals-all-sports";
    applySupported: false;
  };
  summary: {
    sports: number;
    equipmentTypes: number;
    subFilters: number;
    sources: number;
    deals: number;
    taxonomyFindings: number;
    correctionGroups: number;
    proposedRecords: number;
    pendingRecords: number;
    otherRecords: number;
    unclassifiedRecords: number;
  };
  taxonomyFindings: TaxonomyFinding[];
  correctionGroups: CorrectionGroup[];
  fieldCoverage: FieldCoverage[];
  brandInventory: BrandInventoryRow[];
  sourceCategoryInventory: SourceCategoryInventoryRow[];
  rawFieldInventory: RawFieldInventoryRow[];
  taxonomyInventory: TaxonomyInventory;
  assignmentPaths: typeof TAXONOMY_ASSIGNMENT_PATHS;
}

const BASEBALL_BAT_AUDIT_IDS = new Set(["bb-bats", "baseball-bat", "bat", "bats"]);
const BASEBALL_GLOVE_AUDIT_IDS = new Set([
  "bb-gloves", "glove", "gloves", "baseball-glove", "baseball-gloves",
]);

const RAW_FIELD_ALIASES = {
  model: ["model", "modelNumber", "model_number", "mpn", "styleNumber", "style", "productFamily"],
  size: ["size", "sizeNumber", "size_number", "variationSize"],
  drop: ["drop", "dropWeight", "drop_weight"],
  certification: ["certification", "certifications", "cert", "association"],
  upc: ["upc", "gtin", "ean", "impactGtin", "cjGtin", "barcode"],
  sku: ["sku", "shopifySku", "vendorSku", "merchantSku", "stockCode"],
  itemNumber: [
    "itemNumber", "item_number", "itemId", "ebayItemId", "shopifyProductId",
    "shopifyVariantId", "wcProductId", "cjProductId", "impactCatalogItemId", "catalogId",
  ],
  sourceCategory: [
    "category", "categoryName", "subCategory", "productType", "shopifyProductType",
    "piasCategory", "wcCategories", "breadcrumbs", "collection", "collections",
  ],
  seller: ["ebaySeller", "seller", "sellerName", "merchantName", "storeName", "advertiserName"],
} as const;

type RawFieldKind = keyof typeof RAW_FIELD_ALIASES;

interface EvidenceRule {
  sportId: string;
  equipmentTypeId: string;
  family: string;
  pattern: RegExp;
  negative?: RegExp;
}

// Deliberately explicit and high precision. These rules only create audit
// proposals; they never expand search candidates or update stored data.
const CROSS_SPORT_EVIDENCE_RULES: readonly EvidenceRule[] = [
  { sportId: "baseball", equipmentTypeId: "bb-balls", family: "ball", pattern: /\b(?:baseballs?|baseball\s+balls?)\b/i },
  { sportId: "baseball", equipmentTypeId: "bb-cleats", family: "cleats", pattern: /\bbaseball\s+(?:cleats?|spikes?)\b/i },
  { sportId: "baseball", equipmentTypeId: "bb-protective", family: "protective-equipment", pattern: /\bbaseball\s+(?:helmet|catcher(?:'s)?\s+gear|chest\s+protector|leg\s+guards?)\b/i },
  { sportId: "baseball", equipmentTypeId: "bb-training", family: "training-equipment", pattern: /\b(?:baseball\s+pitching\s+machine|baseball\s+training\s+(?:aid|net)|batting\s+tee)\b/i },
  { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats", family: "bat", pattern: /\bfast\s*pitch\b.*\bbat\b|\bbat\b.*\bfast\s*pitch\b/i },
  { sportId: "slowpitch-softball", equipmentTypeId: "sp-bats", family: "bat", pattern: /\bslow\s*pitch\b.*\bbat\b|\bbat\b.*\bslow\s*pitch\b/i },
  { sportId: "golf", equipmentTypeId: "golf-drivers", family: "driver", pattern: /\bgolf\s+driver\b|\bdriver\s+(?:9|10\.5|12)\s*(?:°|degree)/i, negative: /headcover|cover/i },
  { sportId: "golf", equipmentTypeId: "golf-iron-sets", family: "iron-set", pattern: /\bgolf\s+iron\s+set\b|\biron\s+set\s*\(?\d/i },
  { sportId: "golf", equipmentTypeId: "golf-wedges", family: "wedge", pattern: /\bgolf\s+wedge\b|\bwedge\s+(?:48|50|52|54|56|58|60)\b/i },
  { sportId: "golf", equipmentTypeId: "golf-putters", family: "putter", pattern: /\bgolf\s+putter\b|\bputter\s+\d{2}(?:\.|\s|\")/i, negative: /cover|headcover/i },
  { sportId: "basketball", equipmentTypeId: "bk-balls", family: "ball", pattern: /\b(?:indoor|outdoor|official|youth)?\s*basketball\b/i },
  { sportId: "basketball", equipmentTypeId: "bk-hoops-nets", family: "hoops-nets", pattern: /\bbasketball\s+(?:hoop|goal|net)\b/i },
  { sportId: "football", equipmentTypeId: "fb-balls", family: "ball", pattern: /\b(?:official|youth|junior)?\s*football\b/i, negative: /helmet|jersey|cleat|glove|team/i },
  { sportId: "football", equipmentTypeId: "fb-protective", family: "protective-equipment", pattern: /\bfootball\s+(?:helmet|shoulder\s+pads?|mouthguard)\b/i },
  { sportId: "soccer", equipmentTypeId: "soc-balls", family: "ball", pattern: /\bsoccer\s+ball\b/i },
  { sportId: "soccer", equipmentTypeId: "soc-nets", family: "nets", pattern: /\bsoccer\s+(?:goal|net)\b/i },
  { sportId: "lacrosse", equipmentTypeId: "lax-sticks", family: "stick", pattern: /\blacrosse\s+(?:stick|head|shaft)\b/i },
  { sportId: "hockey", equipmentTypeId: "hk-sticks", family: "stick", pattern: /\bhockey\s+stick\b/i },
  { sportId: "hockey", equipmentTypeId: "hk-skates", family: "skates", pattern: /\bhockey\s+skates?\b/i },
  { sportId: "fishing", equipmentTypeId: "fish-rods", family: "rod", pattern: /\bfishing\s+rod\b/i },
  { sportId: "fishing", equipmentTypeId: "fish-reels", family: "reel", pattern: /\b(?:fishing|spinning|baitcasting)\s+reel\b/i },
  { sportId: "volleyball", equipmentTypeId: "vb-balls", family: "ball", pattern: /\bvolleyball\b/i, negative: /shoe|jersey|net|knee/i },
  { sportId: "cycling", equipmentTypeId: "cyc-bikes", family: "bike", pattern: /\b(?:road|mountain|gravel|bmx)\s+(?:bike|bicycle)\b/i },
  { sportId: "swimming", equipmentTypeId: "swim-goggles", family: "goggles", pattern: /\bswim(?:ming)?\s+goggles?\b/i },
  { sportId: "running", equipmentTypeId: "run-shoes", family: "shoes", pattern: /\brunning\s+shoes?\b/i },
  { sportId: "rugby", equipmentTypeId: "rug-balls", family: "ball", pattern: /\brugby\s+ball\b/i },
] as const;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function singularizeToken(value: string): string {
  return value
    .replace(/\bbaseball\b/g, "")
    .replace(/\b(bats|gloves|balls|bags|drivers|putters|wedges|sticks|skates|shoes)\b/g, (word) => {
      if (word === "shoes") return "shoe";
      return word.slice(0, -1);
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function semanticTaxonomyLabel(label: string): string {
  return singularizeToken(normalizeText(label));
}

function isOther(id: string | null | undefined, label?: string | null): boolean {
  return !id || id === "other" || /(?:^|-)other(?:-\d+)?$/.test(id)
    || /^other(?:\s*\d+)?$/i.test(label ?? "");
}

function knownCanonicalEquipment(sportId: string | null | undefined, equipmentTypeId: string | null | undefined) {
  if (sportId === "baseball" && BASEBALL_BAT_AUDIT_IDS.has(equipmentTypeId ?? "")) {
    return { id: CANONICAL_BASEBALL_BAT_ID, family: "bat" };
  }
  if (sportId === "baseball" && BASEBALL_GLOVE_AUDIT_IDS.has(equipmentTypeId ?? "")) {
    return { id: CANONICAL_BASEBALL_GLOVE_ID, family: "fielding-glove" };
  }
  return null;
}

function rawObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function printable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = JSON.stringify(value);
  return text && text !== "[]" && text !== "{}" ? text : null;
}

function rawValues(raw: unknown, kind: RawFieldKind): Array<{ field: string; value: string }> {
  const object = rawObject(raw);
  const byLower = new Map(Object.entries(object).map(([key, value]) => [key.toLowerCase(), { field: key, value }]));
  const values: Array<{ field: string; value: string }> = [];
  for (const alias of RAW_FIELD_ALIASES[kind]) {
    const entry = byLower.get(alias.toLowerCase());
    const value = printable(entry?.value);
    if (entry && value) values.push({ field: entry.field, value });
  }
  return values;
}

function sellerFor(deal: AuditDealRow): string | null {
  return rawValues(deal.raw, "seller")[0]?.value ?? null;
}

function detectDealEvidence(deal: AuditDealRow): {
  sportId: string;
  equipmentTypeId: string;
  family: string;
  evidence: string;
  confidence: AuditConfidence;
} | null {
  if (hasBaseballBatEvidence(deal)) {
    return {
      sportId: "baseball",
      equipmentTypeId: CANONICAL_BASEBALL_BAT_ID,
      family: "bat",
      evidence: "bounded Baseball bat title/model/certification evidence",
      confidence: "high",
    };
  }
  if (hasBaseballGloveEvidence(deal)) {
    return {
      sportId: "baseball",
      equipmentTypeId: CANONICAL_BASEBALL_GLOVE_ID,
      family: "fielding-glove",
      evidence: "bounded Baseball fielding-glove family/model/title evidence",
      confidence: "high",
    };
  }
  for (const rule of CROSS_SPORT_EVIDENCE_RULES) {
    if (rule.pattern.test(deal.title) && !rule.negative?.test(deal.title)) {
      return {
        sportId: rule.sportId,
        equipmentTypeId: rule.equipmentTypeId,
        family: rule.family,
        evidence: `explicit title evidence matched ${rule.sportId}/${rule.equipmentTypeId}`,
        confidence: "medium",
      };
    }
  }
  return null;
}

function addExample(examples: Array<{ id: string; title: string }>, deal: AuditDealRow) {
  if (examples.length < 5 && !examples.some((example) => example.id === deal.id)) {
    examples.push({ id: deal.id, title: deal.title });
  }
}

function groupCountByEquipment(deals: AuditDealRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const deal of deals) {
    if (deal.equipmentTypeId) counts.set(deal.equipmentTypeId, (counts.get(deal.equipmentTypeId) ?? 0) + 1);
  }
  return counts;
}

function buildTaxonomyInventory(dataset: TaxonomyAuditDataset): TaxonomyInventory {
  const sportIds = new Set(dataset.sports.map((row) => row.id));
  const equipmentById = new Map(dataset.equipmentTypes.map((row) => [row.id, row]));
  const sportCounts = new Map<string, number>();
  const equipmentCounts = groupCountByEquipment(dataset.deals);
  const subFilterCounts = new Map<string, number>();
  for (const deal of dataset.deals) {
    if (deal.sportId) sportCounts.set(deal.sportId, (sportCounts.get(deal.sportId) ?? 0) + 1);
    for (const subFilterId of new Set([
      deal.subFilterId,
      ...(deal.subFilterIds ?? []),
    ].filter(Boolean) as string[])) {
      subFilterCounts.set(subFilterId, (subFilterCounts.get(subFilterId) ?? 0) + 1);
    }
  }
  return {
    sports: dataset.sports.map((row) => ({
      id: row.id,
      label: row.name,
      userCreated: row.userCreated === true,
      dealCount: sportCounts.get(row.id) ?? 0,
    })).sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)),
    equipmentTypes: dataset.equipmentTypes.map((row) => {
      const known = knownCanonicalEquipment(row.sportId, row.id);
      const displayGroupId = canonicalResultEquipmentTypeId(row.sportId, row.id);
      const displayFallback = equipmentById.get(displayGroupId)?.name ?? row.name;
      const orphaned = !row.sportId || !sportIds.has(row.sportId);
      return {
        id: row.id,
        label: row.name,
        sportId: row.sportId,
        userCreated: row.userCreated === true,
        equipmentFamily: known?.family ?? semanticTaxonomyLabel(row.name),
        dealCount: equipmentCounts.get(row.id) ?? 0,
        displayGroupId,
        displayLabel: canonicalEquipmentTypeLabel(displayGroupId, displayFallback),
        proposedCanonicalId: known?.id ?? null,
        disposition: orphaned ? "orphaned" as const
          : isOther(row.id, row.name) ? "unresolved-other" as const
          : known && known.id !== row.id ? "legacy-alias" as const
          : "canonical" as const,
      };
    }).sort((a, b) => (a.sportId ?? "").localeCompare(b.sportId ?? "")
      || a.label.localeCompare(b.label) || a.id.localeCompare(b.id)),
    subFilters: dataset.subFilters.map((row) => {
      const parent = equipmentById.get(row.equipmentTypeId);
      const knownParent = knownCanonicalEquipment(parent?.sportId, row.equipmentTypeId);
      return {
        id: row.id,
        label: row.name,
        equipmentTypeId: row.equipmentTypeId,
        assignmentCount: subFilterCounts.get(row.id) ?? 0,
        disposition: !parent ? "orphaned-parent" as const
          : knownParent && knownParent.id !== row.equipmentTypeId ? "legacy-parent" as const
          : "current-parent" as const,
      };
    }).sort((a, b) => a.equipmentTypeId.localeCompare(b.equipmentTypeId)
      || a.label.localeCompare(b.label) || a.id.localeCompare(b.id)),
  };
}

function chooseCanonical<T extends { id: string; userCreated?: boolean }>(rows: T[]): T | null {
  const approved = rows.filter((row) => row.userCreated !== true);
  if (approved.length === 1) return approved[0];
  return null;
}

function taxonomyStructureFindings(dataset: TaxonomyAuditDataset): TaxonomyFinding[] {
  const findings: TaxonomyFinding[] = [];
  const sportIds = new Set(dataset.sports.map((row) => row.id));
  const equipmentById = new Map(dataset.equipmentTypes.map((row) => [row.id, row]));
  const subFilterIds = new Set(dataset.subFilters.map((row) => row.id));
  const equipmentCounts = groupCountByEquipment(dataset.deals);

  const addGroupedRows = <T extends { id: string; name: string; userCreated?: boolean }>(
    entity: "sport" | "equipment-type" | "sub-filter",
    rows: T[],
    keyFor: (row: T) => string,
    sportFor: (row: T) => string | null,
  ) => {
    const exact = new Map<string, T[]>();
    const semantic = new Map<string, T[]>();
    for (const row of rows) {
      const scope = keyFor(row);
      const exactKey = `${scope}|${normalizeText(row.name)}`;
      const semanticKey = `${scope}|${semanticTaxonomyLabel(row.name)}`;
      exact.set(exactKey, [...(exact.get(exactKey) ?? []), row]);
      semantic.set(semanticKey, [...(semantic.get(semanticKey) ?? []), row]);
    }
    const emitted = new Set<string>();
    for (const [key, group] of Array.from(exact.entries())) {
      if (group.length < 2) continue;
      emitted.add(key);
      const canonical = chooseCanonical(group);
      findings.push({
        kind: "duplicate-display-label",
        entity,
        sportId: sportFor(group[0]),
        equipmentFamily: semanticTaxonomyLabel(group[0].name) || null,
        label: group[0].name,
        currentIds: group.map((row) => row.id).sort(),
        proposedCanonicalId: canonical?.id ?? null,
        recordCount: entity === "equipment-type"
          ? group.reduce((sum, row) => sum + (equipmentCounts.get(row.id) ?? 0), 0)
          : 0,
        evidence: [
          "case-insensitive identical display label within the same taxonomy scope",
          ...(entity === "equipment-type"
            ? [`assignment counts: ${group.map((row) => `${row.id}=${equipmentCounts.get(row.id) ?? 0}`).join(", ")}`]
            : []),
        ],
        reason: "Identical shopper labels are backed by different database IDs.",
        confidence: canonical ? "medium" : "low",
        humanApprovalRequired: true,
        examples: [],
      });
    }
    for (const [key, group] of Array.from(semantic.entries())) {
      if (group.length < 2 || emitted.has(key)) continue;
      const canonical = chooseCanonical(group);
      findings.push({
        kind: "synonymous-ids",
        entity,
        sportId: sportFor(group[0]),
        equipmentFamily: semanticTaxonomyLabel(group[0].name) || null,
        label: group.map((row) => row.name).join(" / "),
        currentIds: group.map((row) => row.id).sort(),
        proposedCanonicalId: canonical?.id ?? null,
        recordCount: entity === "equipment-type"
          ? group.reduce((sum, row) => sum + (equipmentCounts.get(row.id) ?? 0), 0)
          : 0,
        evidence: [
          "singular/plural and sport-prefix-normalized labels are synonymous within the same scope",
          ...(entity === "equipment-type"
            ? [`assignment counts: ${group.map((row) => `${row.id}=${equipmentCounts.get(row.id) ?? 0}`).join(", ")}`]
            : []),
        ],
        reason: "One semantic taxonomy concept is split across multiple IDs.",
        confidence: canonical ? "medium" : "low",
        humanApprovalRequired: true,
        examples: [],
      });
    }
  };

  addGroupedRows("sport", dataset.sports, () => "sports", () => null);
  addGroupedRows(
    "equipment-type",
    dataset.equipmentTypes,
    (row) => row.sportId ?? "__orphan__",
    (row) => row.sportId,
  );
  addGroupedRows(
    "sub-filter",
    dataset.subFilters,
    (row) => knownCanonicalEquipment(equipmentById.get(row.equipmentTypeId)?.sportId, row.equipmentTypeId)?.id
      ?? row.equipmentTypeId,
    (row) => equipmentById.get(row.equipmentTypeId)?.sportId ?? null,
  );

  for (const equipment of dataset.equipmentTypes) {
    if (equipment.sportId && sportIds.has(equipment.sportId)) continue;
    findings.push({
      kind: "orphaned-id", entity: "equipment-type", sportId: equipment.sportId,
      equipmentFamily: semanticTaxonomyLabel(equipment.name) || null, label: equipment.name,
      currentIds: [equipment.id], proposedCanonicalId: null,
      recordCount: equipmentCounts.get(equipment.id) ?? 0,
      evidence: [equipment.sportId ? `owning sport ${equipment.sportId} does not exist` : "owning sport is null"],
      reason: "Equipment row has no valid owning sport.", confidence: "high",
      humanApprovalRequired: true, examples: [],
    });
  }
  for (const equipment of dataset.equipmentTypes) {
    if (!(equipment.id === "other"
      || /^other[-_ ]?\d+$/i.test(equipment.id)
      || /(?:^|-)other-\d+$/i.test(equipment.id)
      || /^other\s+\d+$/i.test(equipment.name))) continue;
    findings.push({
      kind: "noncanonical-id", entity: "equipment-type", sportId: equipment.sportId,
      equipmentFamily: "unresolved", label: equipment.name, currentIds: [equipment.id],
      proposedCanonicalId: null, recordCount: equipmentCounts.get(equipment.id) ?? 0,
      evidence: ["generic or numbered Other ID has no stable semantic product meaning"],
      reason: "Numbered/generic Other rows must be audited record-by-record; they are not safe aliases.",
      confidence: "high", humanApprovalRequired: true,
      examples: dataset.deals.filter((deal) => deal.equipmentTypeId === equipment.id)
        .slice(0, 5).map(({ id, title }) => ({ id, title })),
    });
  }
  for (const subFilter of dataset.subFilters) {
    if (equipmentById.has(subFilter.equipmentTypeId)) continue;
    findings.push({
      kind: "orphaned-id", entity: "sub-filter", sportId: null,
      equipmentFamily: null, label: subFilter.name, currentIds: [subFilter.id], proposedCanonicalId: null,
      recordCount: 0, evidence: [`parent equipment ${subFilter.equipmentTypeId} does not exist`],
      reason: "Sub-filter row has no valid parent equipment type.", confidence: "high",
      humanApprovalRequired: true, examples: [],
    });
  }

  for (const equipment of dataset.equipmentTypes) {
    const known = knownCanonicalEquipment(equipment.sportId, equipment.id);
    if (!known || known.id === equipment.id) continue;
    const examples = dataset.deals.filter((deal) => deal.equipmentTypeId === equipment.id)
      .slice(0, 5).map(({ id, title }) => ({ id, title }));
    findings.push({
      kind: "legacy-id", entity: "equipment-type", sportId: equipment.sportId,
      equipmentFamily: known.family, label: equipment.name, currentIds: [equipment.id],
      proposedCanonicalId: known.id, recordCount: equipmentCounts.get(equipment.id) ?? 0,
      evidence: [`approved read-path alias group maps ${equipment.id} to ${known.id}`],
      reason: "Legacy ID represents an existing canonical Baseball equipment group.", confidence: "high",
      humanApprovalRequired: false, examples,
    });
  }

  const displayGroups = new Map<string, Array<{ equipment: AuditEquipmentRow; key: string; count: number }>>();
  for (const equipment of dataset.equipmentTypes) {
    const key = canonicalResultEquipmentTypeId(equipment.sportId, equipment.id);
    const fallback = dataset.equipmentTypes.find((row) => row.id === key)?.name ?? equipment.name;
    const label = canonicalEquipmentTypeLabel(key, fallback);
    const scope = `${equipment.sportId ?? "__none__"}|${normalizeText(label)}`;
    displayGroups.set(scope, [...(displayGroups.get(scope) ?? []), {
      equipment, key, count: equipmentCounts.get(equipment.id) ?? 0,
    }]);
  }
  for (const group of Array.from(displayGroups.values())) {
    const keys = Array.from(new Set(group.map((item) => item.key)));
    if (keys.length < 2) continue;
    const known = group.map((item) => knownCanonicalEquipment(item.equipment.sportId, item.equipment.id)).find(Boolean);
    findings.push({
      kind: "display-group-fragmentation", entity: "display-group",
      sportId: group[0].equipment.sportId,
      equipmentFamily: known?.family ?? (semanticTaxonomyLabel(group[0].equipment.name) || null),
      label: group[0].equipment.name,
      currentIds: keys.sort(), proposedCanonicalId: known?.id ?? null,
      recordCount: group.reduce((sum, item) => sum + item.count, 0),
      evidence: [
        "client display-label lookup produces the same heading for multiple result grouping keys",
        `assignment counts: ${group.map((item) => `${item.equipment.id}=${item.count}`).join(", ")}`,
      ],
      reason: "Deals can render in visually identical but separate UI sections.",
      confidence: known ? "high" : "medium", humanApprovalRequired: !known, examples: [],
    });
  }

  for (const deal of dataset.deals) {
    if (deal.sportId && !sportIds.has(deal.sportId)) {
      findings.push({
        kind: "orphaned-id", entity: "deal", sportId: deal.sportId, equipmentFamily: null,
        label: deal.title, currentIds: [deal.sportId], proposedCanonicalId: null,
        recordCount: 1, evidence: ["stored sport ID is absent from sports"],
        reason: "Deal references an orphaned sport value.", confidence: "high",
        humanApprovalRequired: true, examples: [{ id: deal.id, title: deal.title }],
      });
    }
    if (deal.equipmentTypeId && !equipmentById.has(deal.equipmentTypeId)) {
      findings.push({
        kind: "orphaned-id", entity: "deal", sportId: deal.sportId ?? null, equipmentFamily: null,
        label: deal.title, currentIds: [deal.equipmentTypeId], proposedCanonicalId: null,
        recordCount: 1, evidence: ["stored equipment ID is absent from equipment_types"],
        reason: "Deal references an orphaned equipment value.", confidence: "high",
        humanApprovalRequired: true, examples: [{ id: deal.id, title: deal.title }],
      });
    }
    for (const id of Array.from(new Set([deal.subFilterId, ...(deal.subFilterIds ?? [])].filter(Boolean) as string[]))) {
      if (subFilterIds.has(id)) continue;
      findings.push({
        kind: "orphaned-id", entity: "deal", sportId: deal.sportId ?? null, equipmentFamily: null,
        label: deal.title, currentIds: [id], proposedCanonicalId: null,
        recordCount: 1, evidence: ["assigned sub-filter ID is absent from equipment_sub_filters"],
        reason: "Deal references an orphaned sub-filter value.", confidence: "high",
        humanApprovalRequired: true, examples: [{ id: deal.id, title: deal.title }],
      });
    }
  }
  return findings;
}

interface DealCorrection {
  deal: AuditDealRow;
  family: string | null;
  proposedSportId: string | null;
  proposedEquipmentTypeId: string | null;
  evidence: string[];
  reason: string;
  confidence: AuditConfidence;
  humanApprovalRequired: boolean;
  status: "proposed" | "pending";
}

function correctionForDeal(
  deal: AuditDealRow,
  equipmentById: Map<string, AuditEquipmentRow>,
  sportsById: Map<string, AuditSportRow>,
): DealCorrection | null {
  const currentEquipment = deal.equipmentTypeId ? equipmentById.get(deal.equipmentTypeId) : undefined;
  if ((deal.sportId && !sportsById.has(deal.sportId))
      || (deal.equipmentTypeId && !currentEquipment)) {
    return {
      deal, family: currentEquipment ? semanticTaxonomyLabel(currentEquipment.name) : null,
      proposedSportId: null, proposedEquipmentTypeId: null,
      evidence: ["stored taxonomy reference is orphaned"],
      reason: "A safe destination cannot be inferred until the orphaned reference is reviewed.",
      confidence: "low", humanApprovalRequired: true, status: "pending",
    };
  }

  const ownerConflict = currentEquipment?.sportId && deal.sportId !== currentEquipment.sportId;
  const evidence = detectDealEvidence(deal);
  if (evidence && (deal.sportId !== evidence.sportId || deal.equipmentTypeId !== evidence.equipmentTypeId)) {
    return {
      deal, family: evidence.family,
      proposedSportId: evidence.sportId, proposedEquipmentTypeId: evidence.equipmentTypeId,
      evidence: [evidence.evidence, ...(ownerConflict ? [`equipment owner is ${currentEquipment?.sportId}`] : [])],
      reason: isOther(deal.equipmentTypeId, currentEquipment?.name)
        ? "Strong product evidence identifies a canonical category while the stored classification is unresolved/Other."
        : "Strong product evidence conflicts with the stored sport or equipment category.",
      confidence: evidence.confidence,
      humanApprovalRequired: evidence.confidence !== "high",
      status: "proposed",
    };
  }

  const known = knownCanonicalEquipment(deal.sportId, deal.equipmentTypeId);
  if (known && deal.equipmentTypeId !== known.id) {
    return {
      deal, family: known.family, proposedSportId: deal.sportId ?? null,
      proposedEquipmentTypeId: known.id,
      evidence: [`stored ID ${deal.equipmentTypeId} is a reviewed read-path alias of ${known.id}`],
      reason: "Stored legacy ID fragments a canonical shopper equipment group.",
      confidence: "high", humanApprovalRequired: false, status: "proposed",
    };
  }

  if (ownerConflict) {
    return {
      deal, family: currentEquipment ? semanticTaxonomyLabel(currentEquipment.name) : null,
      proposedSportId: currentEquipment?.sportId ?? null,
      proposedEquipmentTypeId: deal.equipmentTypeId ?? null,
      evidence: [`equipment ${deal.equipmentTypeId} belongs to ${currentEquipment?.sportId}`],
      reason: "Stored sport conflicts with the owning sport of the stored equipment row.",
      confidence: "high", humanApprovalRequired: true, status: "proposed",
    };
  }

  if (isOther(deal.equipmentTypeId, currentEquipment?.name)) {
    return {
      deal, family: "unresolved", proposedSportId: null, proposedEquipmentTypeId: null,
      evidence: ["stored equipment is null, generic Other, or numbered Other", "no unique strong evidence rule matched"],
      reason: "Ambiguous record must remain pending; Phase 1 does not guess a destination.",
      confidence: "low", humanApprovalRequired: true, status: "pending",
    };
  }
  return null;
}

function correctionGroups(dataset: TaxonomyAuditDataset): CorrectionGroup[] {
  const equipmentById = new Map(dataset.equipmentTypes.map((row) => [row.id, row]));
  const sportsById = new Map(dataset.sports.map((row) => [row.id, row]));
  const sourcesById = new Map(dataset.sources.map((row) => [row.id, row]));
  const grouped = new Map<string, CorrectionGroup>();

  for (const deal of dataset.deals) {
    const correction = correctionForDeal(deal, equipmentById, sportsById);
    if (!correction) continue;
    const source = sourcesById.get(deal.sourceId);
    const seller = sellerFor(deal);
    const key = JSON.stringify([
      correction.proposedSportId, correction.family, deal.sourceId, seller,
      deal.sportId ?? null, deal.equipmentTypeId ?? null,
      correction.proposedEquipmentTypeId, correction.reason,
      correction.confidence, correction.humanApprovalRequired, correction.status,
    ]);
    let group = grouped.get(key);
    if (!group) {
      group = {
        sportId: correction.proposedSportId ?? deal.sportId ?? null,
        equipmentFamily: correction.family,
        sourceId: deal.sourceId,
        sourceName: source?.name ?? deal.sourceId,
        seller,
        currentSportId: deal.sportId ?? null,
        currentEquipmentTypeId: deal.equipmentTypeId ?? null,
        proposedSportId: correction.proposedSportId,
        proposedCanonicalEquipmentTypeId: correction.proposedEquipmentTypeId,
        recordCount: 0,
        evidence: correction.evidence,
        reason: correction.reason,
        confidence: correction.confidence,
        humanApprovalRequired: correction.humanApprovalRequired,
        status: correction.status,
        examples: [],
      };
      grouped.set(key, group);
    }
    group.recordCount += 1;
    addExample(group.examples, deal);
  }

  return Array.from(grouped.values()).sort((a, b) =>
    (a.sportId ?? "").localeCompare(b.sportId ?? "")
    || (a.equipmentFamily ?? "").localeCompare(b.equipmentFamily ?? "")
    || a.sourceId.localeCompare(b.sourceId)
    || (a.seller ?? "").localeCompare(b.seller ?? "")
    || (a.currentEquipmentTypeId ?? "").localeCompare(b.currentEquipmentTypeId ?? ""));
}

function buildFieldInventories(dataset: TaxonomyAuditDataset): {
  fieldCoverage: FieldCoverage[];
  brandInventory: BrandInventoryRow[];
  sourceCategoryInventory: SourceCategoryInventoryRow[];
  rawFieldInventory: RawFieldInventoryRow[];
  identityFindings: TaxonomyFinding[];
} {
  const total = dataset.deals.length;
  const coverage = new Map<string, { present: number; malformed: number; values: Set<string> }>();
  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, { sourceId: string; field: string; value: string; count: number }>();
  const rawFields = new Map<string, { count: number; values: Set<string> }>();
  const identifiers = new Map<string, { type: string; value: string; classifications: Map<string, AuditDealRow[]> }>();
  const sourceNames = new Map(dataset.sources.map((source) => [source.id, source.name]));

  const touchCoverage = (field: string, values: string[], malformed = false) => {
    const entry = coverage.get(field) ?? { present: 0, malformed: 0, values: new Set<string>() };
    if (values.length > 0) entry.present += 1;
    if (malformed) entry.malformed += 1;
    for (const value of values) if (entry.values.size < 12) entry.values.add(value);
    coverage.set(field, entry);
  };

  for (const deal of dataset.deals) {
    const raw = rawObject(deal.raw);
    for (const [field, rawValue] of Object.entries(raw)) {
      const value = printable(rawValue);
      if (!value) continue;
      const entry = rawFields.get(field) ?? { count: 0, values: new Set<string>() };
      entry.count += 1;
      if (entry.values.size < 5) entry.values.add(value);
      rawFields.set(field, entry);
    }

    const brand = deal.brand?.trim();
    touchCoverage("brand", brand ? [brand] : []);
    if (brand) brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);

    const modelValues = rawValues(deal.raw, "model").map((item) => item.value);
    touchCoverage("model", modelValues);
    const sizeValues = [deal.sizeNumber, ...rawValues(deal.raw, "size").map((item) => item.value)]
      .filter((value): value is string => !!value);
    const storedSizeMalformed = !!deal.sizeNumber
      && !/^\d{1,3}(?:\.\d{1,3})?$/.test(deal.sizeNumber.trim())
      && !normalizeGloveSize(deal.sizeNumber);
    touchCoverage("size", sizeValues, storedSizeMalformed);

    const dropValues = [deal.dropWeight === null || deal.dropWeight === undefined ? null : String(deal.dropWeight),
      ...rawValues(deal.raw, "drop").map((item) => item.value)]
      .filter((value): value is string => !!value);
    touchCoverage("drop", dropValues, deal.dropWeight !== null && deal.dropWeight !== undefined
      && (!Number.isInteger(deal.dropWeight) || deal.dropWeight < 0 || deal.dropWeight > 20));

    const certifications = rawValues(deal.raw, "certification").map((item) => item.value);
    touchCoverage("certification", certifications);
    for (const kind of ["upc", "sku", "itemNumber"] as const) {
      const values = rawValues(deal.raw, kind).map((item) => item.value);
      const malformed = kind === "upc" && values.some((value) => !/^(?:\d[ -]?){8,14}$/.test(value));
      touchCoverage(kind, values, malformed);
      for (const value of values) {
        const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!normalized) continue;
        const identityKey = `${kind}|${normalized}`;
        const classificationKey = `${deal.sportId ?? "null"}/${deal.equipmentTypeId ?? "null"}`;
        const identity = identifiers.get(identityKey) ?? {
          type: kind, value, classifications: new Map<string, AuditDealRow[]>(),
        };
        identity.classifications.set(classificationKey, [
          ...(identity.classifications.get(classificationKey) ?? []), deal,
        ]);
        identifiers.set(identityKey, identity);
      }
    }

    for (const category of rawValues(deal.raw, "sourceCategory")) {
      const key = `${deal.sourceId}|${category.field}|${category.value}`;
      const entry = categoryCounts.get(key) ?? {
        sourceId: deal.sourceId, field: category.field, value: category.value, count: 0,
      };
      entry.count += 1;
      categoryCounts.set(key, entry);
    }
  }

  const fieldCoverage = ["brand", "model", "size", "drop", "certification", "upc", "sku", "itemNumber"]
    .map((field): FieldCoverage => {
      const entry = coverage.get(field) ?? { present: 0, malformed: 0, values: new Set<string>() };
      return {
        field, present: entry.present, missing: total - entry.present,
        malformed: entry.malformed, representativeValues: Array.from(entry.values),
      };
    });
  const brandInventory = Array.from(brandCounts, ([storedValue, recordCount]): BrandInventoryRow => {
    const canonical = normalizeBrand(storedValue) ?? storedValue;
    return { storedValue, proposedCanonicalValue: canonical, recordCount, isAlias: canonical !== storedValue };
  }).sort((a, b) => a.proposedCanonicalValue.localeCompare(b.proposedCanonicalValue)
    || a.storedValue.localeCompare(b.storedValue));
  const sourceCategoryInventory = Array.from(categoryCounts.values())
    .map((entry): SourceCategoryInventoryRow => ({
      sourceId: entry.sourceId,
      sourceName: sourceNames.get(entry.sourceId) ?? entry.sourceId,
      categoryField: entry.field,
      storedValue: entry.value,
      recordCount: entry.count,
    }))
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId)
      || a.categoryField.localeCompare(b.categoryField)
      || b.recordCount - a.recordCount);
  const rawFieldInventory = Array.from(rawFields, ([field, entry]): RawFieldInventoryRow => ({
    field, recordCount: entry.count, representativeValues: Array.from(entry.values),
  })).sort((a, b) => b.recordCount - a.recordCount || a.field.localeCompare(b.field));

  const identityFindings: TaxonomyFinding[] = [];
  for (const identity of Array.from(identifiers.values())) {
    if (identity.classifications.size < 2) continue;
    const examples = Array.from(identity.classifications.values()).flat().slice(0, 5)
      .map(({ id, title }) => ({ id, title }));
    identityFindings.push({
      kind: "identifier-conflict", entity: "deal", sportId: null, equipmentFamily: null,
      label: `${identity.type}:${identity.value}`,
      currentIds: Array.from(identity.classifications.keys()).sort(), proposedCanonicalId: null,
      recordCount: Array.from(identity.classifications.values()).reduce((sum, rows) => sum + rows.length, 0),
      evidence: [`identical normalized ${identity.type} occurs under inconsistent sport/equipment assignments`],
      reason: "Product identity collision requires a canonical-product review before reclassification.",
      confidence: "high", humanApprovalRequired: true, examples,
    });
  }
  return { fieldCoverage, brandInventory, sourceCategoryInventory, rawFieldInventory, identityFindings };
}

export function buildTaxonomyAuditReport(
  dataset: TaxonomyAuditDataset,
  options: { generatedAt?: string } = {},
): TaxonomyAuditReport {
  const fieldInventories = buildFieldInventories(dataset);
  const taxonomyFindings = [
    ...taxonomyStructureFindings(dataset),
    ...fieldInventories.identityFindings,
  ].sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
  const corrections = correctionGroups(dataset);
  const equipmentById = new Map(dataset.equipmentTypes.map((row) => [row.id, row]));
  const otherRecords = dataset.deals.filter((deal) =>
    isOther(deal.equipmentTypeId, deal.equipmentTypeId ? equipmentById.get(deal.equipmentTypeId)?.name : null)).length;
  const unclassifiedRecords = dataset.deals.filter((deal) => !deal.sportId || !deal.equipmentTypeId).length;
  return {
    metadata: {
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      ruleVersion: TAXONOMY_AUDIT_RULE_VERSION,
      mode: "read-only",
      scope: "all-deals-all-sports",
      applySupported: false,
    },
    summary: {
      sports: dataset.sports.length,
      equipmentTypes: dataset.equipmentTypes.length,
      subFilters: dataset.subFilters.length,
      sources: dataset.sources.length,
      deals: dataset.deals.length,
      taxonomyFindings: taxonomyFindings.length,
      correctionGroups: corrections.length,
      proposedRecords: corrections.filter((group) => group.status === "proposed")
        .reduce((sum, group) => sum + group.recordCount, 0),
      pendingRecords: corrections.filter((group) => group.status === "pending")
        .reduce((sum, group) => sum + group.recordCount, 0),
      otherRecords,
      unclassifiedRecords,
    },
    taxonomyFindings,
    correctionGroups: corrections,
    fieldCoverage: fieldInventories.fieldCoverage,
    brandInventory: fieldInventories.brandInventory,
    sourceCategoryInventory: fieldInventories.sourceCategoryInventory,
    rawFieldInventory: fieldInventories.rawFieldInventory,
    taxonomyInventory: buildTaxonomyInventory(dataset),
    assignmentPaths: TAXONOMY_ASSIGNMENT_PATHS,
  };
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(" | ") : value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function taxonomyAuditCorrectionsCsv(report: TaxonomyAuditReport): string {
  const columns: Array<keyof CorrectionGroup> = [
    "sportId", "equipmentFamily", "sourceId", "sourceName", "seller",
    "currentSportId", "currentEquipmentTypeId", "proposedSportId",
    "proposedCanonicalEquipmentTypeId", "recordCount", "evidence", "reason",
    "confidence", "humanApprovalRequired", "status", "examples",
  ];
  const lines = [columns.join(",")];
  for (const row of report.correctionGroups) {
    lines.push(columns.map((column) => {
      const value = column === "examples"
        ? row.examples.map((example) => `${example.id}: ${example.title}`)
        : row[column];
      return csvCell(value);
    }).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function taxonomyAuditMarkdown(report: TaxonomyAuditReport): string {
  const duplicateCount = report.taxonomyFindings.filter((finding) =>
    finding.kind === "duplicate-display-label" || finding.kind === "synonymous-ids").length;
  const displayFragments = report.taxonomyFindings.filter((finding) =>
    finding.kind === "display-group-fragmentation");
  const topCorrections = report.correctionGroups
    .slice()
    .sort((a, b) => b.recordCount - a.recordCount)
    .slice(0, 20);
  const lines = [
    "# TSSDeals Phase 1 taxonomy audit",
    "",
    `Generated: ${report.metadata.generatedAt}`,
    "",
    "> Read-only report. Phase 1 has no apply, update, delete, merge, or recategorization mode.",
    "",
    "## Summary",
    "",
    `- Scope: all ${report.summary.deals} deals across ${report.summary.sports} sports.`,
    `- Taxonomy: ${report.summary.equipmentTypes} equipment types and ${report.summary.subFilters} sub-filters.`,
    `- Duplicate/synonymous taxonomy findings: ${duplicateCount}.`,
    `- Fragmented UI display groups: ${displayFragments.length}.`,
    `- Records in Other/unresolved: ${report.summary.otherRecords}.`,
    `- Proposed high/medium-evidence records: ${report.summary.proposedRecords}.`,
    `- Pending ambiguous/orphaned records: ${report.summary.pendingRecords}.`,
    "",
    "## Largest correction cohorts",
    "",
    "| Sport | Family | Source / seller | Current | Proposed | Count | Confidence | Approval |",
    "|---|---|---|---|---|---:|---|---|",
  ];
  if (topCorrections.length === 0) lines.push("| — | — | — | — | — | 0 | — | — |");
  for (const group of topCorrections) {
    lines.push(`| ${group.sportId ?? "Unresolved"} | ${group.equipmentFamily ?? "Unresolved"} | ${group.sourceName}${group.seller ? ` / ${group.seller}` : ""} | ${group.currentSportId ?? "null"}/${group.currentEquipmentTypeId ?? "null"} | ${group.proposedSportId ?? "pending"}/${group.proposedCanonicalEquipmentTypeId ?? "pending"} | ${group.recordCount} | ${group.confidence} | ${group.humanApprovalRequired ? "Required" : "Not required by confidence policy"} |`);
  }
  lines.push(
    "",
    "## Assignment-path assessment",
    "",
    `The audit inventories ${report.assignmentPaths.length} seed, ingestion, persistence, classification, Admin, and read-projection paths. Importers remain unable to create live taxonomy rows, but several choose fallbacks from the fragmented live taxonomy or maintain source-local maps. No path is changed by this report.`,
    "",
    "## Next review gate",
    "",
    "Review the JSON finding evidence and CSV cohorts before approving a canonical registry, shared classifier, schema migration, or any production backfill. Ambiguous records remain pending.",
    "",
  );
  return lines.join("\n");
}
