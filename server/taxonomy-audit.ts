import { normalizeBrand } from "./brand-normalizer";
import {
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

export const TAXONOMY_AUDIT_RULE_VERSION = "phase1.5-read-only-v1";

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
export type AuditOutcome =
  | "proposed-correction"
  | "genuine-conflict-review"
  | "unresolved-other"
  | "ambiguous-evidence"
  | "already-compatible-no-action";

export interface TaxonomyFinding {
  kind:
    | "duplicate-display-label"
    | "synonymous-ids"
    | "legacy-id"
    | "orphaned-id"
    | "noncanonical-id"
    | "display-group-fragmentation";
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

export type IdentifierFindingKind =
  | "likely-same-product-conflict"
  | "unsafe-identifier-reuse"
  | "invalid-identifier"
  | "unresolved-collision";

export interface IdentifierFinding {
  kind: IdentifierFindingKind;
  identifierType: "upc" | "sku" | "itemNumber";
  identifierValue: string;
  scope: string;
  currentIds: string[];
  recordCount: number;
  evidence: string[];
  reason: string;
  confidence: AuditConfidence;
  humanApprovalRequired: true;
  examples: Array<{
    id: string;
    title: string;
    sourceId: string;
    sourceName: string;
    seller: string | null;
  }>;
}

export type ReviewPriorityLevel = "critical" | "high" | "medium" | "low";
export type ReviewAvailability = "available" | "unavailable" | "unknown";

export interface ReviewPriority {
  level: ReviewPriorityLevel;
  score: number;
  affectedRecordCount: number;
  shopperVisibleFragmentation: boolean;
  evidenceStrength: AuditConfidence;
  sourceId: string | null;
  sourceReviewRecordCount: number;
  availability: ReviewAvailability;
}

export interface DealReviewRecord {
  dealId: string;
  title: string;
  sourceId: string;
  sourceName: string;
  seller: string | null;
  availability: ReviewAvailability;
  availabilityEvidence: string | null;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  equipmentFamily: string | null;
  evidence: string[];
  negativeEvidence: string[];
  identifierEvidence: string[];
  confidence: AuditConfidence;
  reason: string;
  humanApprovalRequired: boolean;
  status: "proposed" | "pending";
  outcome: Exclude<AuditOutcome, "already-compatible-no-action">;
  priority: ReviewPriority;
}

export interface IdentifierRecommendation {
  sportId: string;
  canonicalEquipmentTypeId: string;
  equipmentFamily: string;
  supportingDealIds: string[];
  directEvidence: string[];
}

export interface IdentifierReviewRecord {
  kind: IdentifierFindingKind;
  identifierType: IdentifierFinding["identifierType"];
  identifierValue: string;
  scope: string;
  currentIds: string[];
  recordCount: number;
  evidence: string[];
  reason: string;
  confidence: AuditConfidence;
  humanApprovalRequired: true;
  consensusEligible: false;
  quarantineReason: string | null;
  supportedRecommendation: IdentifierRecommendation | null;
  priority: ReviewPriority;
  records: Array<{
    dealId: string;
    title: string;
    sourceId: string;
    sourceName: string;
    seller: string | null;
    currentSportId: string | null;
    currentEquipmentTypeId: string | null;
    availability: ReviewAvailability;
  }>;
}

export interface TaxonomyReviewPacket {
  metadata: {
    generatedAt: string;
    ruleVersion: string;
    mode: "read-only";
    applySupported: false;
    baselineEvidence: "phase1.4-production-audit-offline";
  };
  summary: {
    proposedCorrections: number;
    likelySameProductFindings: number;
    supportedIdentifierRecommendations: number;
    identifierQuarantine: number;
    unresolvedManualReview: number;
  };
  proposedCorrections: DealReviewRecord[];
  likelySameProductConflicts: IdentifierReviewRecord[];
  identifierQuarantine: IdentifierReviewRecord[];
  unresolvedManualReview: DealReviewRecord[];
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
  outcome: Exclude<AuditOutcome, "already-compatible-no-action">;
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
    identifierFindings: number;
    identifierFindingCounts: Record<IdentifierFindingKind, number>;
    correctionGroups: number;
    proposedRecords: number;
    pendingRecords: number;
    proposedCorrectionRecords: number;
    conflictReviewRecords: number;
    unresolvedOtherRecords: number;
    ambiguousEvidenceRecords: number;
    compatibleNoActionRecords: number;
    otherRecords: number;
    unclassifiedRecords: number;
  };
  taxonomyFindings: TaxonomyFinding[];
  identifierFindings: IdentifierFinding[];
  correctionGroups: CorrectionGroup[];
  fieldCoverage: FieldCoverage[];
  brandInventory: BrandInventoryRow[];
  sourceCategoryInventory: SourceCategoryInventoryRow[];
  rawFieldInventory: RawFieldInventoryRow[];
  taxonomyInventory: TaxonomyInventory;
  assignmentPaths: typeof TAXONOMY_ASSIGNMENT_PATHS;
  reviewPacket: TaxonomyReviewPacket;
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
    "piasCategory", "wcCategories", "breadcrumbs", "collection", "collections", "tags",
    "tag", "productTags", "product_tags", "keywords", "googleProductCategory", "itemGroup",
  ],
  seller: ["ebaySeller", "seller", "sellerName", "merchantName", "storeName", "advertiserName"],
  availability: [
    "availability", "stockAvailability", "stockStatus", "inventoryStatus", "inventoryPolicy", "wcInStock",
  ],
} as const;

type RawFieldKind = keyof typeof RAW_FIELD_ALIASES;

interface EvidenceRule {
  sportId: string;
  equipmentTypeId: string;
  family: string;
  titlePattern: RegExp;
  structuredPattern?: RegExp;
  negative?: RegExp;
  priority: number;
}

const MIXED_BASEBALL_SOFTBALL_TITLE_PATTERN = /\bbaseball\s*(?:\/|&|\+|and)\s*softball\b|\bsoftball\s*(?:\/|&|\+|and)\s*baseball\b|\bbb\s*\/\s*sb\b/i;
const SOFTBALL_TITLE_PATTERN = /\b(?:fast\s*pitch|slow\s*pitch|softballs?)\b/i;
const TRAINING_BALL_FORM_PATTERN = /\b(?:weighted|limited[ -]?flight|pitching[ -]?machine|dimpled|foam)\b.{0,24}\b(?:baseballs?|softballs?|balls?)\b|\b(?:baseballs?|softballs?|balls?)\b.{0,24}\b(?:weighted|limited[ -]?flight|pitching[ -]?machine|training\s+aid)\b|\btraining\s+(?:baseballs?|softballs?|balls?)\b/i;
const BALL_CONTAINER_PATTERN = /\b(?:baseballs?|softballs?|balls?)\b.{0,60}\b(?:buckets?|containers?|cadd(?:y|ies)|carriers?|totes?)\b|\b(?:buckets?|containers?|cadd(?:y|ies)|carriers?|totes?)\b.{0,60}\b(?:baseballs?|softballs?|balls?)\b|\b(?:baseballs?|softballs?|balls?)\s+(?:holders?|racks?|stands?|displays?|storage)\b|\b(?:holders?|racks?|stands?|displays?|storage)\b.{0,40}\b(?:baseballs?|softballs?|balls?)\b/i;
const GLOVE_ACCESSORY_PATTERN = /\b(?:glove|mitt)\s+(?:laces?|repair\s+kits?|care|accessor(?:y|ies)|conditioner|mallets?|wraps?)\b|\b(?:laces?|repair\s+kits?|accessor(?:y|ies))\b.{0,20}\b(?:glove|mitt)\b/i;
const BAT_ACCESSORY_PATTERN = /\b(?:baseball\s+|softball\s+)?bats?\b.{0,24}\b(?:holders?|racks?|organizers?|stands?|hangers?|displays?|storage|grip\s+(?:tapes?|wraps?))\b|\b(?:holders?|racks?|organizers?|stands?|hangers?|displays?)\b.{0,24}\b(?:baseball\s+|softball\s+)?bats?\b|\bgrip\s+(?:tapes?|wraps?)\b.{0,24}\b(?:baseball\s+|softball\s+)?bats?\b/i;
const BIKE_ACCESSORY_PATTERN = /\b(?:mountain\s+|road\s+|gravel\s+|bmx\s+)?(?:bikes?|bicycles?)\b.{0,24}\b(?:pedals?|grips?|pegs?|pumps?|tires?|tyres?|tubes?|wheels?|racks?|helmets?|replacement\s+parts?|parts?)\b|\b(?:pedals?|grips?|pegs?|pumps?|tires?|tyres?|tubes?|wheels?|racks?|helmets?|replacement\s+parts?|parts?)\b.{0,24}\b(?:mountain\s+|road\s+|gravel\s+|bmx\s+)?(?:bikes?|bicycles?)\b/i;
const GOAL_HOOP_ACCESSORY_PATTERN = /\b(?:soccer\s+|hockey\s+)?goal\s+(?:shooting\s+)?targets?\b|\b(?:shooting\s+)?targets?\b.{0,24}\b(?:soccer\s+|hockey\s+)?goals?\b|\bbasketball\s+hoop\s+(?:weights?|sandbags?)\b|\b(?:hoop|goal)\s+(?:replacement\s+)?weights?\b|\bsandbag\s+covers?\b/i;
const BALL_NOVELTY_REFERENCE_PATTERN = /\b(?:stadium\s+)?horns?\b|\bnoisemakers?\b|\bsoccer\s+ball\s+party\b/i;
const BALL_MEMORABILIA_TERM_PATTERN = /\b(?:decorative|themed?(?:\s+gift)?|gift|souvenir|commemorative|autographed|signed|signature)\b/i;
const BALL_PRODUCT_FORM_PATTERN = /\b(?:baseballs?|baseball\s+balls?|soccer\s+balls?|balls?)\b/i;
const EXPLICIT_GAME_PRACTICE_BALL_PATTERN = /\b(?:game|practice|match)\s+(?:baseballs?|soccer\s+balls?|balls?)\b|\b(?:baseballs?|soccer\s+balls?|balls?)\b.{0,16}\b(?:game|practice|match)\s+(?:use|play|ball)?\b/i;
const NON_BALL_EQUIPMENT_FORM_PATTERN = /\b(?:bats?|gloves?|mitts?|cleats?|shoes?|helmets?|masks?|jerseys?|apparel|bags?)\b/i;
const BATTING_TEE_REPLACEMENT_PATTERN = /\b(?:replacement|replace)\b.{0,50}\b(?:batting\s+tee|tee)\b.{0,40}\b(?:toppers?|tubes?|cups?|ball\s+rests?|rubber\s+tops?|components?|parts?)\b|\b(?:batting\s+tee|tee)\b.{0,50}\b(?:replacement|replace)\b.{0,40}\b(?:toppers?|tubes?|cups?|ball\s+rests?|rubber\s+tops?|components?|parts?)\b|\b(?:toppers?|tubes?|cups?|ball\s+rests?|rubber\s+tops?)\b.{0,40}\b(?:batting\s+tee|tee)\b.{0,30}\b(?:replacement|replace)\b/i;
const BASEBALL_CATEGORY_NEGATIVE_PATTERN = /\b(?:fast\s*pitch|slow\s*pitch|softballs?)\b/i;
const BASEBALL_BALL_NEGATIVE_PATTERN = /\b(?:fast\s*pitch|slow\s*pitch|softballs?)\b|\b(?:weighted|limited[ -]?flight|pitching[ -]?machine|dimpled|training\s+aid)\b|\b(?:ball|baseball|softball)\s+(?:bucket|container|caddy|carrier|tote)\b/i;
const SOFTBALL_BALL_FORM_NEGATIVE_PATTERN = /\b(?:fielders?|catchers?)['’]?\s*(?:masks?|mitts?|gear)|\b(?:masks?|helmets?|gloves?|mitts?|bats?|grips?|holders?|racks?|stands?|accessor(?:y|ies)|training\s+aids?|training\s+balls?)\b/i;

// Specific equipment rules precede ball rules deliberately. A bare sport name
// is never a ball signal. These rules only create read-only audit proposals.
const CROSS_SPORT_EVIDENCE_RULES: readonly EvidenceRule[] = [
  { sportId: "baseball", equipmentTypeId: "bb-cleats", family: "cleats", priority: 100, titlePattern: /\bbaseball\s+(?:cleats?|spikes?)\b/i, structuredPattern: /\b(?:baseball.{0,30}(?:cleats?|spikes?|footwear)|(?:cleats?|spikes?|footwear).{0,30}baseball)\b/i },
  { sportId: "fastpitch-softball", equipmentTypeId: "fp-protective", family: "protective-equipment", priority: 130, titlePattern: /\bfast\s*pitch\b.{0,50}\b(?:catchers?(?:['’]s?)?\s+(?:gear|kit|set|helmet)|fielders?(?:['’]s?)?\s+mask|protective\s+equipment)\b|\bjen\s+schro\b.{0,60}\bsoftball\s+catchers?(?:['’]s?)?\s+gear\b/i, structuredPattern: /\bfast\s*pitch.{0,30}(?:protective|catcher|fielder|helmet|mask|gear)\b/i, negative: MIXED_BASEBALL_SOFTBALL_TITLE_PATTERN },
  { sportId: "fastpitch-softball", equipmentTypeId: "fp-gloves", family: "fielding-glove", priority: 130, titlePattern: /\bfast\s*pitch\b.{0,50}\b(?:fielding\s+)?(?:gloves?|mitts?)\b|\b(?:fielding\s+)?(?:gloves?|mitts?)\b.{0,50}\bfast\s*pitch\b/i, structuredPattern: /\bfast\s*pitch.{0,30}(?:fielding\s+)?(?:gloves?|mitts?)\b/i, negative: /\b(?:batting|laces?|repair\s+kits?|accessor(?:y|ies))\b|\bbaseball\s*(?:\/|&|\+|and)\s*softball\b/i },
  { sportId: "fastpitch-softball", equipmentTypeId: "fp-training", family: "training-equipment", priority: 125, titlePattern: /\bfast\s*pitch\b.{0,40}\btraining\s+(?:softballs?|balls?)\b|\btraining\s+(?:softballs?|balls?)\b.{0,40}\bfast\s*pitch\b/i, structuredPattern: /\bfast\s*pitch.{0,30}training\s+(?:softballs?|balls?)\b/i, negative: MIXED_BASEBALL_SOFTBALL_TITLE_PATTERN },
  { sportId: "fastpitch-softball", equipmentTypeId: "fp-balls", family: "ball", priority: 120, titlePattern: /\bfast\s*pitch\b.{0,40}\b(?:softballs|balls?)\b|\b(?:softballs|balls?)\b.{0,40}\bfast\s*pitch\b/i, structuredPattern: /\bfast\s*pitch.{0,30}\b(?:softballs|balls?)\b/i, negative: SOFTBALL_BALL_FORM_NEGATIVE_PATTERN },
  { sportId: "slowpitch-softball", equipmentTypeId: "sp-protective", family: "protective-equipment", priority: 130, titlePattern: /\bslow\s*pitch\b.{0,50}\b(?:catchers?(?:['’]s?)?\s+(?:gear|kit|set|helmet)|fielders?(?:['’]s?)?\s+mask|protective\s+equipment)\b/i, structuredPattern: /\bslow\s*pitch.{0,30}(?:protective|catcher|fielder|helmet|mask|gear)\b/i, negative: MIXED_BASEBALL_SOFTBALL_TITLE_PATTERN },
  { sportId: "slowpitch-softball", equipmentTypeId: "sp-gloves", family: "fielding-glove", priority: 130, titlePattern: /\bslow\s*pitch\b.{0,50}\b(?:fielding\s+)?(?:gloves?|mitts?)\b|\b(?:fielding\s+)?(?:gloves?|mitts?)\b.{0,50}\bslow\s*pitch\b/i, structuredPattern: /\bslow\s*pitch.{0,30}(?:fielding\s+)?(?:gloves?|mitts?)\b/i, negative: /\b(?:batting|laces?|repair\s+kits?|accessor(?:y|ies))\b|\bbaseball\s*(?:\/|&|\+|and)\s*softball\b/i },
  { sportId: "slowpitch-softball", equipmentTypeId: "sp-training", family: "training-equipment", priority: 125, titlePattern: /\bslow\s*pitch\b.{0,40}\btraining\s+(?:softballs?|balls?)\b|\btraining\s+(?:softballs?|balls?)\b.{0,40}\bslow\s*pitch\b/i, structuredPattern: /\bslow\s*pitch.{0,30}training\s+(?:softballs?|balls?)\b/i, negative: MIXED_BASEBALL_SOFTBALL_TITLE_PATTERN },
  { sportId: "slowpitch-softball", equipmentTypeId: "sp-balls", family: "ball", priority: 120, titlePattern: /\bslow\s*pitch\b.{0,40}\b(?:softballs|balls?)\b|\b(?:softballs|balls?)\b.{0,40}\bslow\s*pitch\b/i, structuredPattern: /\bslow\s*pitch.{0,30}\b(?:softballs|balls?)\b/i, negative: SOFTBALL_BALL_FORM_NEGATIVE_PATTERN },
  { sportId: "baseball", equipmentTypeId: "bb-protective", family: "protective-equipment", priority: 100, titlePattern: /\bbaseball\b.{0,40}\b(?:helmet|facemask|catcher(?:'s)?\s+(?:gear|kit|set)|chest\s+protector|leg\s+guards?)\b|\b(?:helmet|facemask|catcher(?:'s)?\s+(?:gear|kit|set)|chest\s+protector|leg\s+guards?)\b.{0,40}\bbaseball\b/i, structuredPattern: /\bbaseball.{0,30}(?:protective|helmet|facemask|catcher|chest protector|leg guards?)\b/i, negative: BASEBALL_CATEGORY_NEGATIVE_PATTERN },
  { sportId: "baseball", equipmentTypeId: "bb-training", family: "training-equipment", priority: 110, titlePattern: /\bbaseball\b.{0,40}\b(?:pitching\s+machine|training\s+(?:aid|net|balls?)|weighted\s+balls?|limited[ -]?flight\s+balls?|dimpled\s+balls?)\b|\b(?:weighted|limited[ -]?flight|pitching[ -]?machine|dimpled)\b.{0,24}\bbaseballs?\b|\bbatting\s+tee\b/i, structuredPattern: /\bbaseball.{0,30}(?:training|pitching machine|batting tee|weighted ball|limited flight)\b/i, negative: BASEBALL_CATEGORY_NEGATIVE_PATTERN },
  { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats", family: "bat", priority: 100, titlePattern: /\bfast\s*pitch\b.*\bbats?\b|\bbats?\b.*\bfast\s*pitch\b/i, structuredPattern: /\bfast\s*pitch.{0,30}\bbats?\b|\bbats?.{0,30}\bfast\s*pitch\b/i },
  { sportId: "slowpitch-softball", equipmentTypeId: "sp-bats", family: "bat", priority: 100, titlePattern: /\bslow\s*pitch\b.*\bbats?\b|\bbats?\b.*\bslow\s*pitch\b/i, structuredPattern: /\bslow\s*pitch.{0,30}\bbats?\b|\bbats?.{0,30}\bslow\s*pitch\b/i },
  { sportId: "golf", equipmentTypeId: "golf-drivers", family: "driver", priority: 90, titlePattern: /\bgolf\s+driver\b|\bdriver\s+(?:9|10\.5|12)\s*(?:°|degree)/i, structuredPattern: /\bgolf.{0,20}drivers?\b|\bdrivers?.{0,20}golf\b/i, negative: /headcover|cover/i },
  { sportId: "golf", equipmentTypeId: "golf-iron-sets", family: "iron-set", priority: 90, titlePattern: /\bgolf\s+iron\s+set\b|\biron\s+set\s*\(?\d/i, structuredPattern: /\bgolf.{0,20}iron sets?\b|\biron sets?.{0,20}golf\b/i },
  { sportId: "golf", equipmentTypeId: "golf-wedges", family: "wedge", priority: 90, titlePattern: /\bgolf\s+wedge\b|\bwedge\s+(?:48|50|52|54|56|58|60)\b/i, structuredPattern: /\bgolf.{0,20}wedges?\b|\bwedges?.{0,20}golf\b/i },
  { sportId: "golf", equipmentTypeId: "golf-putters", family: "putter", priority: 90, titlePattern: /\bgolf\s+putter\b|\bputter\s+\d{2}(?:\.|\s|\")/i, structuredPattern: /\bgolf.{0,20}putters?\b|\bputters?.{0,20}golf\b/i, negative: /cover|headcover/i },
  { sportId: "basketball", equipmentTypeId: "bk-shoes-apparel", family: "footwear", priority: 100, titlePattern: /\bbasketball\s+(?:shoes?|sneakers?)\b|\b(?:shoes?|sneakers?)\b.{0,20}\bbasketball\b/i, structuredPattern: /\bbasketball.{0,30}(?:shoes?|footwear)\b|\b(?:shoes?|footwear).{0,30}basketball\b/i },
  { sportId: "basketball", equipmentTypeId: "bk-hoops-nets", family: "hoops-nets", priority: 100, titlePattern: /\bbasketball\s+(?:hoop|goal|net|rim|backboard)\b/i, structuredPattern: /\bbasketball.{0,30}(?:hoops?|goals?|nets?|rims?|backboards?)\b/i, negative: GOAL_HOOP_ACCESSORY_PATTERN },
  { sportId: "football", equipmentTypeId: "fb-protective", family: "protective-equipment", priority: 100, titlePattern: /\bfootball\s+(?:helmet|facemask|face\s*mask|shoulder\s+pads?|mouthguard)\b/i, structuredPattern: /\bfootball.{0,30}(?:protective|helmets?|facemasks?|face masks?|shoulder pads?|mouthguards?)\b/i },
  { sportId: "soccer", equipmentTypeId: "soc-nets", family: "nets", priority: 100, titlePattern: /\bsoccer\s+(?:goal|net)\b/i, structuredPattern: /\bsoccer.{0,20}(?:goals?|nets?)\b/i, negative: GOAL_HOOP_ACCESSORY_PATTERN },
  { sportId: "lacrosse", equipmentTypeId: "lax-sticks", family: "stick", priority: 90, titlePattern: /\blacrosse\s+(?:stick|head|shaft)\b/i, structuredPattern: /\blacrosse.{0,20}(?:sticks?|heads?|shafts?)\b/i },
  { sportId: "hockey", equipmentTypeId: "hk-sticks", family: "stick", priority: 90, titlePattern: /\bhockey\s+stick\b/i, structuredPattern: /\bhockey.{0,20}sticks?\b/i },
  { sportId: "hockey", equipmentTypeId: "hk-skates", family: "skates", priority: 90, titlePattern: /\bhockey\s+skates?\b/i, structuredPattern: /\bhockey.{0,20}skates?\b/i },
  { sportId: "fishing", equipmentTypeId: "fish-rods", family: "rod", priority: 90, titlePattern: /\bfishing\s+rod\b/i, structuredPattern: /\bfishing.{0,20}rods?\b/i },
  { sportId: "fishing", equipmentTypeId: "fish-reels", family: "reel", priority: 90, titlePattern: /\b(?:fishing|spinning|baitcasting)\s+reel\b/i, structuredPattern: /\bfishing.{0,20}reels?\b|\breels?.{0,20}fishing\b/i },
  { sportId: "cycling", equipmentTypeId: "cyc-bikes", family: "bike", priority: 90, titlePattern: /\b(?:road|mountain|gravel|bmx)\s+(?:bike|bicycle)\b/i, structuredPattern: /\bcycling.{0,20}(?:bikes?|bicycles?)\b/i, negative: BIKE_ACCESSORY_PATTERN },
  { sportId: "swimming", equipmentTypeId: "swim-goggles", family: "goggles", priority: 90, titlePattern: /\bswim(?:ming)?\s+goggles?\b/i, structuredPattern: /\bswim(?:ming)?.{0,20}goggles?\b/i },
  { sportId: "running", equipmentTypeId: "run-shoes", family: "shoes", priority: 70, titlePattern: /\brunning\s+shoes?\b/i, structuredPattern: /\brunning.{0,20}(?:shoes?|footwear)\b/i, negative: /basketball|baseball|football|soccer|tennis|volleyball|wrestling/i },
  { sportId: "baseball", equipmentTypeId: "bb-balls", family: "ball", priority: 20, titlePattern: /\bbaseballs\b|\bbaseball\s+balls?\b|\bbaseball\b.{0,24}\b(?:dozen|pack\s+of\s+\d+)\b|\b(?:dozen|pack\s+of\s+\d+)\b.{0,24}\bbaseball\b/i, structuredPattern: /\bbaseball.{0,30}balls?\b|\bballs?.{0,30}baseball\b/i, negative: BASEBALL_BALL_NEGATIVE_PATTERN },
  { sportId: "basketball", equipmentTypeId: "bk-balls", family: "ball", priority: 20, titlePattern: /\bbasketballs\b|\bbasketball\s+balls?\b|\b(?:official|game|indoor|outdoor|composite|leather)\s+(?:game\s+)?basketball\b/i, structuredPattern: /\bbasketball.{0,30}balls?\b|\bballs?.{0,30}basketball\b/i },
  { sportId: "football", equipmentTypeId: "fb-balls", family: "ball", priority: 20, titlePattern: /\bfootballs\b|\bfootball\s+balls?\b|\b(?:official|game|composite|leather)\s+(?:game\s+)?football\b|\bfootball\b.{0,16}\bsize\s*(?:9|youth|junior)\b/i, structuredPattern: /\bfootball.{0,30}balls?\b|\bballs?.{0,30}football\b/i, negative: /soccer|fifa|uefa|world\s+cup|premier\s+league|bundesliga|boots?|facemasks?|helmets?|jerseys?|cleats?|gloves?/i },
  { sportId: "soccer", equipmentTypeId: "soc-balls", family: "ball", priority: 20, titlePattern: /\bsoccer\s+balls?\b/i, structuredPattern: /\bsoccer.{0,20}balls?\b|\bballs?.{0,20}soccer\b/i, negative: BALL_NOVELTY_REFERENCE_PATTERN },
  { sportId: "volleyball", equipmentTypeId: "vb-balls", family: "ball", priority: 20, titlePattern: /\bvolleyballs\b|\bvolleyball\s+balls?\b|\b(?:official|game|indoor|outdoor)\s+volleyball\b/i, structuredPattern: /\bvolleyball.{0,20}balls?\b|\bballs?.{0,20}volleyball\b/i, negative: /shoe|jersey|net|knee/i },
  { sportId: "rugby", equipmentTypeId: "rug-balls", family: "ball", priority: 20, titlePattern: /\brugby\s+balls?\b/i, structuredPattern: /\brugby.{0,20}balls?\b|\bballs?.{0,20}rugby\b/i },
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

function availabilityFor(deal: AuditDealRow): {
  availability: ReviewAvailability;
  evidence: string | null;
} {
  const observation = rawValues(deal.raw, "availability")[0];
  if (!observation) return { availability: "unknown", evidence: null };
  const normalized = normalizeText(observation.value);
  if (/^(?:false|0|no)$/.test(normalized)) {
    return {
      availability: "unavailable",
      evidence: `raw ${observation.field}: ${observation.value}`,
    };
  }
  if (/^(?:true|1|yes)$/.test(normalized)) {
    return {
      availability: "available",
      evidence: `raw ${observation.field}: ${observation.value}`,
    };
  }
  if (/\b(?:out of stock|unavailable|sold out|discontinued|inactive)\b/.test(normalized)) {
    return {
      availability: "unavailable",
      evidence: `raw ${observation.field}: ${observation.value}`,
    };
  }
  if (/\b(?:in stock|available|active|ships?|ready to ship)\b/.test(normalized)) {
    return {
      availability: "available",
      evidence: `raw ${observation.field}: ${observation.value}`,
    };
  }
  return {
    availability: "unknown",
    evidence: `raw ${observation.field}: ${observation.value}`,
  };
}

function reviewPriority(input: {
  affectedRecordCount: number;
  shopperVisibleFragmentation: boolean;
  evidenceStrength: AuditConfidence;
  sourceId: string | null;
  sourceReviewRecordCount: number;
  availability: ReviewAvailability;
}): ReviewPriority {
  const cohortPoints = Math.min(30, Math.ceil(Math.log2(input.affectedRecordCount + 1)) * 5);
  const sourcePoints = Math.min(15, Math.ceil(Math.log2(input.sourceReviewRecordCount + 1)) * 3);
  const evidencePoints = input.evidenceStrength === "high" ? 30
    : input.evidenceStrength === "medium" ? 18 : 6;
  const availabilityPoints = input.availability === "available" ? 10
    : input.availability === "unavailable" ? -5 : 0;
  const score = Math.max(0, Math.min(100,
    cohortPoints + sourcePoints + evidencePoints
      + (input.shopperVisibleFragmentation ? 20 : 0) + availabilityPoints));
  const level: ReviewPriorityLevel = score >= 75 ? "critical"
    : score >= 55 ? "high" : score >= 30 ? "medium" : "low";
  return { ...input, score, level };
}

type EvidenceSignalKind = "title" | "structured" | "identity-consensus" | "stored-taxonomy";

interface EvidenceSignal {
  kind: EvidenceSignalKind;
  evidence: string;
}

interface CandidateEvidence {
  sportId: string;
  equipmentTypeId: string;
  family: string;
  priority: number;
  signals: EvidenceSignal[];
}

interface IdentityConsensus {
  candidate: Omit<CandidateEvidence, "signals" | "priority">;
  supportingRecords: number;
  identityType: "upc" | "sku" | "itemNumber";
  identityValue: string;
  scope: string;
}

interface EvidenceAssessment {
  match: (CandidateEvidence & { confidence: AuditConfidence }) | null;
  blockedReasons: string[];
}

const BASEBALL_BAT_AUDIT_TITLE_PATTERN = /\b(?:baseball|tee[ -]?ball|t[ -]?ball)\s+bats?\b|\bbats?\b.{0,50}\b(?:bbcor|usssa|usa\s+baseball)\b|\b(?:bbcor|usssa|usa\s+baseball)\b.{0,50}\bbats?\b|\b(?:cat\s*x|hype[ -]?fire|(?:louisville(?:\s+slugger)?|ls)\s+supra|supra\s+(?:louisville(?:\s+slugger)?|ls))\b(?=.{0,80}(?:\b\d{2}\s*(?:\/|x)\s*\d{2}\b|\b(?:bbcor|usssa)\b|\bdrop\s*-?\s*\d+\b|-\d+\b))/i;
// Generic retailer families such as "Bats", "Gloves", "Mitts", "Youth Bats",
// or "Fielding Gloves" are sport-agnostic. Structured Baseball evidence must
// name Baseball (or a Baseball-only certification) as well as the equipment.
const BASEBALL_BAT_AUDIT_STRUCTURED_PATTERN = /\b(?:baseball|bbcor|usa\s+baseball).{0,30}\bbats?\b|\bbats?.{0,30}\b(?:baseball|bbcor|usa\s+baseball)\b/i;
const BASEBALL_GLOVE_AUDIT_STRUCTURED_PATTERN = /\bbaseball.{0,30}(?:fielding\s+)?(?:gloves?|mitts?)\b|\b(?:fielding\s+)?(?:gloves?|mitts?).{0,30}\bbaseball\b/i;
const BASEBALL_BAT_AUDIT_NEGATIVE_PATTERN = /\b(?:cricket|fast\s*pitch|slow\s*pitch|softballs?)\b/i;
const BASEBALL_GLOVE_AUDIT_NEGATIVE_PATTERN = /\b(?:fast\s*pitch|slow\s*pitch|softballs?|batting|golf|boxing|work|winter)\b|\b(?:glove|mitt)\s+(?:laces?|repair\s+kits?|care|accessor(?:y|ies))\b/i;

const PROTECTED_EQUIPMENT_PATTERNS: ReadonlyArray<{ family: string; pattern: RegExp }> = [
  { family: "apparel", pattern: /\b(?:jerseys?|t[ -]?shirts?|shirts?|hoodies?|sweatshirts?|shorts?|pants?|socks?|hats?|caps?|beanies?|apparel|uniforms?)\b/i },
  { family: "footwear", pattern: /\b(?:shoes?|cleats?|spikes?|boots?|sneakers?|footwear)\b/i },
  { family: "protective-equipment", pattern: /\b(?:helmets?|facemasks?|face\s*masks?|fielders?(?:['’]s?)?\s+masks?|shoulder\s+pads?|chest\s+protectors?|leg\s+guards?|shin\s+guards?|mouthguards?)\b/i },
  { family: "glove-accessory", pattern: GLOVE_ACCESSORY_PATTERN },
  { family: "bat-accessory", pattern: BAT_ACCESSORY_PATTERN },
  { family: "ball-container", pattern: BALL_CONTAINER_PATTERN },
  { family: "training-aid", pattern: TRAINING_BALL_FORM_PATTERN },
  { family: "bike-accessory", pattern: BIKE_ACCESSORY_PATTERN },
  { family: "goal-hoop-accessory", pattern: GOAL_HOOP_ACCESSORY_PATTERN },
  { family: "novelty-accessory", pattern: BALL_NOVELTY_REFERENCE_PATTERN },
  { family: "training-accessory", pattern: BATTING_TEE_REPLACEMENT_PATTERN },
  { family: "bag", pattern: /\b(?:bat\s+bags?|bags?|backpacks?|duffels?|totes?|wheeled\s+bags?)\b/i },
  { family: "glove", pattern: /\b(?:gloves?|mitts?)\b/i },
  { family: "bat", pattern: /\bbats?\b/i },
  { family: "nets-hoops", pattern: /\b(?:hoops?|nets?|goals?|rims?|backboards?)\b/i },
  { family: "memorabilia", pattern: /\b(?:hand[ -]?signed|signed\s+by|autographed\s+by|memorabilia|collectibles?|trading\s+cards?|baseball\s+cards?|photos?|posters?|display\s+(?:case|stand|mount)|wall\s+mount)\b/i },
  { family: "ball", pattern: /\b(?:baseballs|basketballs|footballs|softballs|volleyballs|soccer\s+balls?|game\s+balls?|training\s+balls?|practice\s+balls?|balls?\s+(?:set|bucket|pack|dozen))\b/i },
] as const;

const COMPATIBLE_PROTECTED_FAMILIES: Record<string, ReadonlySet<string>> = {
  apparel: new Set(["apparel"]),
  bag: new Set(["bag"]),
  "bag vests": new Set(["bag", "apparel"]),
  bat: new Set(["bat"]),
  ball: new Set(["ball"]),
  "batting glove": new Set(["glove"]),
  cleats: new Set(["footwear"]),
  glove: new Set(["glove"]),
  shorts: new Set(["apparel"]),
  socks: new Set(["apparel"]),
  shoes: new Set(["footwear"]),
  "shoe and apparel": new Set(["footwear", "apparel"]),
  "shoe apparel": new Set(["footwear", "apparel"]),
  "swimming apparel": new Set(["apparel"]),
  footwear: new Set(["footwear"]),
  "fielding-glove": new Set(["glove"]),
  "bat bag equipment bag": new Set(["bag", "bat"]),
  "equipment care and accessories": new Set(["glove-accessory", "bat-accessory", "glove", "bat"]),
  "protective equipment": new Set(["protective-equipment"]),
  "protective-equipment": new Set(["protective-equipment"]),
  "hoop and net": new Set(["nets-hoops"]),
  "hoops-nets": new Set(["nets-hoops"]),
  nets: new Set(["nets-hoops"]),
  "training equipment": new Set(["training-aid", "ball-container", "ball", "nets-hoops"]),
  "training-equipment": new Set(["training-aid", "ball-container", "ball", "nets-hoops"]),
  "field equipment": new Set(["training-aid", "ball-container", "nets-hoops"]),
  goggles: new Set(["protective-equipment"]),
};

function candidateKey(candidate: Pick<CandidateEvidence, "sportId" | "equipmentTypeId">): string {
  return `${candidate.sportId}/${candidate.equipmentTypeId}`;
}

function addCandidateSignal(
  candidates: Map<string, CandidateEvidence>,
  candidate: Omit<CandidateEvidence, "signals">,
  signal: EvidenceSignal,
) {
  const key = candidateKey(candidate);
  const current = candidates.get(key) ?? { ...candidate, signals: [] };
  if (!current.signals.some((item) => item.kind === signal.kind && item.evidence === signal.evidence)) {
    current.signals.push(signal);
  }
  current.priority = Math.max(current.priority, candidate.priority);
  candidates.set(key, current);
}

function structuredEvidence(deal: AuditDealRow, source?: AuditSourceRow): Array<{ field: string; value: string }> {
  return [
    ...rawValues(deal.raw, "sourceCategory"),
    ...(source?.category ? [{ field: "source.category", value: source.category }] : []),
  ];
}

function isBallMemorabiliaTitle(title: string): boolean {
  if (!BALL_MEMORABILIA_TERM_PATTERN.test(title)
      || !BALL_PRODUCT_FORM_PATTERN.test(title)
      || NON_BALL_EQUIPMENT_FORM_PATTERN.test(title)) return false;
  return !EXPLICIT_GAME_PRACTICE_BALL_PATTERN.test(title);
}

function protectedFamilies(deal: AuditDealRow, source?: AuditSourceRow): Set<string> {
  const structured = structuredEvidence(deal, source).map((item) => item.value).join(" ");
  const context = `${deal.title} ${structured}`;
  const protections = new Set(PROTECTED_EQUIPMENT_PATTERNS
    .filter((protection) => protection.pattern.test(context))
    .map((protection) => protection.family));
  if (isBallMemorabiliaTitle(deal.title)) protections.add("ball-memorabilia");
  return protections;
}

function candidateHasCompatibleProtection(candidate: CandidateEvidence, protections: Set<string>): boolean {
  if (protections.size === 0) return true;
  const compatible = COMPATIBLE_PROTECTED_FAMILIES[candidate.family] ?? new Set<string>();
  return Array.from(protections).every((family) => compatible.has(family));
}

function sportConflictsWithTitle(deal: AuditDealRow, sportId: string): boolean {
  if (MIXED_BASEBALL_SOFTBALL_TITLE_PATTERN.test(deal.title)) return false;
  if (sportId === "baseball") return SOFTBALL_TITLE_PATTERN.test(deal.title);
  if (sportId === "fastpitch-softball") {
    return /\bslow\s*pitch\b|\bbaseball\b/i.test(deal.title);
  }
  if (sportId === "slowpitch-softball") {
    return /\bfast\s*pitch\b|\bbaseball\b/i.test(deal.title);
  }
  return false;
}

function equipmentFamilyConflictsWithTitle(
  deal: AuditDealRow,
  candidate: Pick<CandidateEvidence, "sportId" | "family">,
): boolean {
  if (candidate.family !== "fielding-glove") return false;
  const nonFielding = /\b(?:batting|golf|boxing|work|winter)\b|\b(?:glove|mitt)\s+(?:laces?|repair\s+kits?|care|accessor(?:y|ies))\b/i;
  if (nonFielding.test(deal.title)) return true;
  if (candidate.sportId === "baseball") return SOFTBALL_TITLE_PATTERN.test(deal.title);
  if (candidate.sportId === "fastpitch-softball") return /\bslow\s*pitch\b|\bbaseball\b/i.test(deal.title);
  if (candidate.sportId === "slowpitch-softball") return /\bfast\s*pitch\b|\bbaseball\b/i.test(deal.title);
  return false;
}

function hasCredibleSoftballBatDimensions(title: string, pitch: "fast" | "slow"): boolean {
  const pitchPattern = pitch === "fast" ? /\bfast\s*pitch\b/i : /\bslow\s*pitch\b/i;
  if (!pitchPattern.test(title)) return false;

  // Regulation youth/adult bat lengths are deliberately bounded away from
  // common 11-inch, 12-inch, and 16-inch softball diameters.
  const hasBatLength = /\b(?:2[6-9]|3[0-5])(?:\.\d+)?\s*(?:"|in(?:ch(?:es)?)?)(?!\w)/i.test(title);
  const hasBatWeight = /\b(?:1[5-9]|2\d|3[01])(?:\.\d+)?\s*(?:oz|ounces?)\b/i.test(title);
  const hasBatConstruction = /\b(?:drop\s*-?\s*\d+|alloy|composite|barrel)\b|(?:^|\s)-\s*\d{1,2}\b/i.test(title);
  return hasBatLength && hasBatWeight && hasBatConstruction;
}

function collectDirectEvidence(deal: AuditDealRow, source?: AuditSourceRow): Map<string, CandidateEvidence> {
  const candidates = new Map<string, CandidateEvidence>();
  const titleAndBrand = `${deal.title} ${deal.brand ?? ""}`;
  const structured = structuredEvidence(deal, source);
  const addTitle = (candidate: Omit<CandidateEvidence, "signals">, evidence: string) =>
    addCandidateSignal(candidates, candidate, { kind: "title", evidence });
  const addStructured = (candidate: Omit<CandidateEvidence, "signals">, pattern: RegExp) => {
    const matched = structured.find((item) => pattern.test(item.value));
    if (matched) {
      addCandidateSignal(candidates, candidate, {
        kind: "structured",
        evidence: `structured ${matched.field} evidence matched ${candidate.sportId}/${candidate.equipmentTypeId}`,
      });
    }
  };

  const baseballBat = {
    sportId: "baseball", equipmentTypeId: CANONICAL_BASEBALL_BAT_ID, family: "bat", priority: 120,
  };
  if (!BASEBALL_BAT_AUDIT_NEGATIVE_PATTERN.test(deal.title)
      && !BAT_ACCESSORY_PATTERN.test(deal.title)
      && BASEBALL_BAT_AUDIT_TITLE_PATTERN.test(titleAndBrand)) {
    addTitle(baseballBat, "specific Baseball bat title/model evidence");
  }
  if (!BASEBALL_BAT_AUDIT_NEGATIVE_PATTERN.test(deal.title)
      && !BAT_ACCESSORY_PATTERN.test(deal.title)) {
    addStructured(baseballBat, BASEBALL_BAT_AUDIT_STRUCTURED_PATTERN);
  }

  if (hasCredibleSoftballBatDimensions(deal.title, "fast")) {
    addTitle({
      sportId: "fastpitch-softball", equipmentTypeId: "fp-bats",
      family: "bat", priority: 135,
    }, "fastpitch designation plus credible bat length, weight, and construction evidence");
  }
  if (hasCredibleSoftballBatDimensions(deal.title, "slow")) {
    addTitle({
      sportId: "slowpitch-softball", equipmentTypeId: "sp-bats",
      family: "bat", priority: 135,
    }, "slowpitch designation plus credible bat length, weight, and construction evidence");
  }

  const baseballGlove = {
    sportId: "baseball", equipmentTypeId: CANONICAL_BASEBALL_GLOVE_ID,
    family: "fielding-glove", priority: 120,
  };
  if (!BASEBALL_GLOVE_AUDIT_NEGATIVE_PATTERN.test(deal.title)
      && hasBaseballGloveEvidence({ ...deal, raw: undefined })) {
    addTitle(baseballGlove, "specific Baseball fielding-glove title/model evidence");
  }
  if (!BASEBALL_GLOVE_AUDIT_NEGATIVE_PATTERN.test(deal.title)) {
    addStructured(baseballGlove, BASEBALL_GLOVE_AUDIT_STRUCTURED_PATTERN);
  }

  for (const rule of CROSS_SPORT_EVIDENCE_RULES) {
    const candidate = {
      sportId: rule.sportId, equipmentTypeId: rule.equipmentTypeId,
      family: rule.family, priority: rule.priority,
    };
    if (rule.titlePattern.test(deal.title) && !rule.negative?.test(deal.title)) {
      addTitle(candidate, `specific title evidence matched ${rule.sportId}/${rule.equipmentTypeId}`);
    }
    if (rule.structuredPattern && !rule.negative?.test(deal.title)) {
      addStructured(candidate, rule.structuredPattern);
    }
  }
  return candidates;
}

function ownedEquipmentCandidate(
  deal: AuditDealRow,
  equipmentById: Map<string, AuditEquipmentRow>,
): Omit<CandidateEvidence, "signals" | "priority"> | null {
  const equipment = deal.equipmentTypeId ? equipmentById.get(deal.equipmentTypeId) : undefined;
  if (!equipment?.sportId || isOther(deal.equipmentTypeId, equipment.name)) return null;
  const known = knownCanonicalEquipment(equipment.sportId, deal.equipmentTypeId);
  return {
    sportId: equipment.sportId,
    equipmentTypeId: known?.id ?? deal.equipmentTypeId!,
    family: known?.family ?? semanticTaxonomyLabel(equipment.name),
  };
}

function storedCandidate(
  deal: AuditDealRow,
  equipmentById: Map<string, AuditEquipmentRow>,
): Omit<CandidateEvidence, "signals" | "priority"> | null {
  const owned = ownedEquipmentCandidate(deal, equipmentById);
  return owned && owned.sportId === deal.sportId ? owned : null;
}

type IdentifierType = "upc" | "sku" | "itemNumber";

interface IdentifierObservation {
  key: string;
  type: IdentifierType;
  value: string;
  normalized: string;
  scope: string;
  validForConsensus: boolean;
  invalidReason: string | null;
}

export function isValidGtin(value: string): boolean {
  if (/[^\d\s-]/.test(value)) return false;
  const digits = value.replace(/[^\d]/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let weight = 3;
  for (let index = digits.length - 2; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

function identifierScope(deal: AuditDealRow, type: IdentifierType): string {
  if (type === "upc") return "global:validated-gtin";
  const seller = normalizeText(sellerFor(deal) ?? "") || "unknown-seller";
  return type === "sku"
    ? `source:${deal.sourceId}|seller:${seller}`
    : `source:${deal.sourceId}`;
}

function isUsableSku(normalized: string): boolean {
  return normalized.length >= 5
    && normalized.length <= 64
    && /[a-z]/.test(normalized)
    && /\d/.test(normalized)
    && !/^(?:sku|unknown|default|none|na|null|product)\d*$/.test(normalized)
    && !/^(.)\1+$/.test(normalized);
}

function identifierObservations(deal: AuditDealRow): IdentifierObservation[] {
  const observations: IdentifierObservation[] = [];
  for (const type of ["upc", "sku", "itemNumber"] as const) {
    for (const item of rawValues(deal.raw, type)) {
      const normalized = item.value.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!normalized) continue;
      const scope = identifierScope(deal, type);
      let invalidReason: string | null = null;
      if (type === "upc" && !isValidGtin(item.value)) {
        invalidReason = "UPC/GTIN is a placeholder or has an invalid length, character set, or check digit";
      } else if (type === "sku" && !isUsableSku(normalized)) {
        invalidReason = "SKU is numeric, generic, malformed, or too weak for product identity";
      } else if (type === "sku" && !normalizeText(sellerFor(deal) ?? "")) {
        invalidReason = "ordinary SKU has no known seller identity and is ineligible for source/seller consensus";
      } else if (type === "itemNumber" && (normalized.length < 5 || normalized.length > 80)) {
        invalidReason = "item number is too short or malformed for product identity";
      }
      observations.push({
        key: `${type}|${scope}|${normalized}`,
        type,
        value: item.value,
        normalized,
        scope,
        validForConsensus: invalidReason === null,
        invalidReason,
      });
    }
  }
  return Array.from(new Map(observations.map((item) => [item.key, item])).values());
}

function normalizedIdentityKeys(deal: AuditDealRow): IdentifierObservation[] {
  return identifierObservations(deal).filter((identity) => identity.validForConsensus);
}

function buildIdentityConsensus(
  dataset: TaxonomyAuditDataset,
  equipmentById: Map<string, AuditEquipmentRow>,
  sourcesById: Map<string, AuditSourceRow>,
): Map<string, IdentityConsensus> {
  const support = new Map<string, Map<string, {
    candidate: Omit<CandidateEvidence, "signals" | "priority">;
    dealIds: Set<string>;
    identityType: "upc" | "sku" | "itemNumber";
    identityValue: string;
  }>>();
  for (const deal of dataset.deals) {
    const stored = storedCandidate(deal, equipmentById);
    if (!stored) continue;
    const protections = protectedFamilies(deal, sourcesById.get(deal.sourceId));
    const direct = Array.from(collectDirectEvidence(deal, sourcesById.get(deal.sourceId)).values())
      .filter((candidate) => candidateHasCompatibleProtection(candidate, protections));
    const supporting = direct.find((candidate) => candidateKey(candidate) === candidateKey(stored));
    if (!supporting) continue;
    if (direct.some((candidate) => candidateKey(candidate) !== candidateKey(stored))) continue;
    for (const identity of normalizedIdentityKeys(deal)) {
      const classifications = support.get(identity.key) ?? new Map();
      const storedKey = candidateKey(stored);
      const entry = classifications.get(storedKey) ?? {
        candidate: stored, dealIds: new Set<string>(),
        identityType: identity.type, identityValue: identity.value,
      };
      entry.dealIds.add(deal.id);
      classifications.set(storedKey, entry);
      support.set(identity.key, classifications);
    }
  }

  const consensus = new Map<string, IdentityConsensus>();
  for (const [identityKey, classifications] of Array.from(support.entries())) {
    if (classifications.size !== 1) continue;
    const entry = Array.from(classifications.values())[0];
    if (entry.dealIds.size < 2) continue;
    consensus.set(identityKey, {
      candidate: entry.candidate,
      supportingRecords: entry.dealIds.size,
      identityType: entry.identityType,
      identityValue: entry.identityValue,
      scope: identityKey.split("|").slice(1, -1).join("|"),
    });
  }
  return consensus;
}

function assessDealEvidence(
  deal: AuditDealRow,
  source: AuditSourceRow | undefined,
  equipmentById: Map<string, AuditEquipmentRow>,
  identityConsensus: Map<string, IdentityConsensus>,
): EvidenceAssessment {
  if (MIXED_BASEBALL_SOFTBALL_TITLE_PATTERN.test(deal.title)) {
    return {
      match: null,
      blockedReasons: ["mixed Baseball/Softball product requires an approved shared-category policy"],
    };
  }
  const candidates = collectDirectEvidence(deal, source);
  for (const identity of normalizedIdentityKeys(deal)) {
    const consensus = identityConsensus.get(identity.key);
    if (!consensus) continue;
    if (!candidates.has(candidateKey(consensus.candidate))) continue;
    addCandidateSignal(candidates, { ...consensus.candidate, priority: 110 }, {
      kind: "identity-consensus",
      evidence: `${consensus.identityType} ${consensus.identityValue} (${consensus.scope}) agrees across ${consensus.supportingRecords} correctly classified records and matches direct product-family evidence`,
    });
  }

  const ownedStored = ownedEquipmentCandidate(deal, equipmentById);
  if (ownedStored && ownedStored.sportId === deal.sportId) {
    const matching = candidates.get(candidateKey(ownedStored));
    if (matching) {
      addCandidateSignal(candidates, { ...ownedStored, priority: matching.priority }, {
        kind: "stored-taxonomy",
        evidence: `stored taxonomy ${deal.sportId}/${deal.equipmentTypeId} is compatible with the candidate`,
      });
    }
  }

  const protections = protectedFamilies(deal, source);
  const blockedReasons: string[] = [];
  const compatible = Array.from(candidates.values()).filter((candidate) => {
    if (sportConflictsWithTitle(deal, candidate.sportId)) {
      blockedReasons.push(`${candidateKey(candidate)} blocked by explicit conflicting sport evidence`);
      return false;
    }
    if (equipmentFamilyConflictsWithTitle(deal, candidate)) {
      blockedReasons.push(`${candidateKey(candidate)} blocked by explicit non-fielding glove evidence`);
      return false;
    }
    if (candidateHasCompatibleProtection(candidate, protections)) return true;
    blockedReasons.push(`${candidateKey(candidate)} blocked by explicit ${Array.from(protections).join(", ")} evidence`);
    return false;
  });
  if (compatible.length === 0) {
    const storedIsCompatible = !!ownedStored
      && !sportConflictsWithTitle(deal, ownedStored.sportId)
      && !equipmentFamilyConflictsWithTitle(deal, ownedStored)
      && candidateHasCompatibleProtection({ ...ownedStored, priority: 0, signals: [] }, protections);
    if (storedIsCompatible) {
      return { match: null, blockedReasons: [] };
    }
    if (ownedStored?.sportId && sportConflictsWithTitle(deal, ownedStored.sportId)) {
      blockedReasons.push(`stored taxonomy ${candidateKey(ownedStored)} conflicts with explicit sport evidence`);
    } else if (ownedStored && equipmentFamilyConflictsWithTitle(deal, ownedStored)) {
      blockedReasons.push(`stored taxonomy ${candidateKey(ownedStored)} conflicts with explicit non-fielding glove evidence`);
    } else if (protections.size > 0 && blockedReasons.length === 0
        && (!ownedStored || !candidateHasCompatibleProtection(
          { ...ownedStored, priority: 0, signals: [] }, protections,
        ))) {
      blockedReasons.push(`stored taxonomy conflicts with explicit ${Array.from(protections).join(", ")} evidence`);
    }
    return { match: null, blockedReasons };
  }

  const strongKeys = new Set(compatible
    .filter((candidate) => candidate.signals.some((signal) =>
      signal.kind === "structured" || signal.kind === "identity-consensus"))
    .map(candidateKey));
  if (strongKeys.size > 1) {
    return { match: null, blockedReasons: [...blockedReasons, "conflicting structured or identifier evidence"] };
  }

  let selected: CandidateEvidence;
  if (strongKeys.size === 1) {
    selected = compatible.find((candidate) => candidateKey(candidate) === Array.from(strongKeys)[0])!;
  } else {
    const highestPriority = Math.max(...compatible.map((candidate) => candidate.priority));
    const highest = compatible.filter((candidate) => candidate.priority === highestPriority);
    if (highest.length !== 1) {
      return { match: null, blockedReasons: [...blockedReasons, "ambiguous title-only equipment evidence"] };
    }
    selected = highest[0];
  }

  const competing = compatible.filter((candidate) => candidateKey(candidate) !== candidateKey(selected));
  const storedConflict = !!ownedStored && candidateKey(ownedStored) !== candidateKey(selected);
  const signalKinds = new Set(selected.signals.map((signal) => signal.kind));
  const fanatics = /fanatics/i.test(`${deal.sourceId} ${source?.name ?? ""}`);
  const fanaticsMerchandise = protections.has("apparel") || protections.has("memorabilia");
  if (fanatics && (fanaticsMerchandise || signalKinds.size < 2)) {
    return {
      match: null,
      blockedReasons: [...blockedReasons, "Fanatics merchandise requires two non-conflicting independent signals"],
    };
  }
  const confidence: AuditConfidence = signalKinds.size >= 2
      && !storedConflict && competing.length === 0 ? "high" : "medium";
  return { match: { ...selected, confidence }, blockedReasons };
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
  negativeEvidence: string[];
  reason: string;
  confidence: AuditConfidence;
  humanApprovalRequired: boolean;
  status: "proposed" | "pending";
  outcome: Exclude<AuditOutcome, "already-compatible-no-action">;
}

function correctionForDeal(
  deal: AuditDealRow,
  equipmentById: Map<string, AuditEquipmentRow>,
  sportsById: Map<string, AuditSportRow>,
  source: AuditSourceRow | undefined,
  identityConsensus: Map<string, IdentityConsensus>,
): DealCorrection | null {
  const currentEquipment = deal.equipmentTypeId ? equipmentById.get(deal.equipmentTypeId) : undefined;
  if ((deal.sportId && !sportsById.has(deal.sportId))
      || (deal.equipmentTypeId && !currentEquipment)) {
    return {
      deal, family: currentEquipment ? semanticTaxonomyLabel(currentEquipment.name) : null,
      proposedSportId: null, proposedEquipmentTypeId: null,
      evidence: ["stored taxonomy reference is orphaned"],
      negativeEvidence: ["stored sport or equipment reference is absent from the approved taxonomy snapshot"],
      reason: "A safe destination cannot be inferred until the orphaned reference is reviewed.",
      confidence: "low", humanApprovalRequired: true, status: "pending",
      outcome: "genuine-conflict-review",
    };
  }

  const ownerConflict = currentEquipment?.sportId && deal.sportId !== currentEquipment.sportId;
  const assessment = assessDealEvidence(deal, source, equipmentById, identityConsensus);
  const evidence = assessment.match;
  if (evidence && (deal.sportId !== evidence.sportId || deal.equipmentTypeId !== evidence.equipmentTypeId)) {
    const unresolvedCurrent = isOther(deal.equipmentTypeId, currentEquipment?.name);
    return {
      deal, family: evidence.family,
      proposedSportId: evidence.sportId, proposedEquipmentTypeId: evidence.equipmentTypeId,
      evidence: [
        ...evidence.signals.map((signal) => signal.evidence),
        ...(ownerConflict ? [`equipment owner is ${currentEquipment?.sportId}`] : []),
      ],
      negativeEvidence: assessment.blockedReasons,
      reason: unresolvedCurrent
        ? "Compatible product evidence identifies a canonical category while the stored classification is unresolved/Other."
        : "Compatible product evidence conflicts with the stored sport or equipment category.",
      confidence: evidence.confidence,
      humanApprovalRequired: !unresolvedCurrent || evidence.confidence !== "high",
      status: unresolvedCurrent ? "proposed" : "pending",
      outcome: unresolvedCurrent ? "proposed-correction" : "genuine-conflict-review",
    };
  }

  if (!evidence && assessment.blockedReasons.length > 0) {
    const mixedOrAmbiguous = assessment.blockedReasons.some((reason) =>
      /mixed Baseball\/Softball|ambiguous|conflicting structured or identifier/i.test(reason));
    const unresolvedCurrent = isOther(deal.equipmentTypeId, currentEquipment?.name);
    return {
      deal, family: "unresolved", proposedSportId: null, proposedEquipmentTypeId: null,
      evidence: assessment.blockedReasons,
      negativeEvidence: assessment.blockedReasons,
      reason: mixedOrAmbiguous
        ? "Multiple or shared-category signals do not identify one approved destination."
        : "Explicit equipment or merchandise evidence conflicts with a safe automatic destination.",
      confidence: "low", humanApprovalRequired: true, status: "pending",
      outcome: mixedOrAmbiguous || unresolvedCurrent
        ? "ambiguous-evidence"
        : "genuine-conflict-review",
    };
  }

  const known = knownCanonicalEquipment(deal.sportId, deal.equipmentTypeId);
  if (known && deal.equipmentTypeId !== known.id) {
    return {
      deal, family: known.family, proposedSportId: deal.sportId ?? null,
      proposedEquipmentTypeId: known.id,
      evidence: [`stored ID ${deal.equipmentTypeId} is a reviewed read-path alias of ${known.id}`],
      negativeEvidence: [],
      reason: "Stored legacy ID fragments a canonical shopper equipment group.",
      confidence: "medium", humanApprovalRequired: true, status: "proposed",
      outcome: "proposed-correction",
    };
  }

  if (ownerConflict) {
    return {
      deal, family: currentEquipment ? semanticTaxonomyLabel(currentEquipment.name) : null,
      proposedSportId: currentEquipment?.sportId ?? null,
      proposedEquipmentTypeId: deal.equipmentTypeId ?? null,
      evidence: [`equipment ${deal.equipmentTypeId} belongs to ${currentEquipment?.sportId}`],
      negativeEvidence: ["stored sport conflicts with the equipment row's owning sport"],
      reason: "Stored sport conflicts with the owning sport of the stored equipment row.",
      confidence: "medium", humanApprovalRequired: true, status: "pending",
      outcome: "genuine-conflict-review",
    };
  }

  if (isOther(deal.equipmentTypeId, currentEquipment?.name)) {
    return {
      deal, family: "unresolved", proposedSportId: null, proposedEquipmentTypeId: null,
      evidence: [
        "stored equipment is null, generic Other, or numbered Other",
        ...(assessment.blockedReasons.length > 0
          ? assessment.blockedReasons
          : ["no unique compatible evidence rule matched"]),
      ],
      negativeEvidence: assessment.blockedReasons.length > 0
        ? assessment.blockedReasons
        : ["no unique compatible evidence rule matched"],
      reason: "Ambiguous record must remain pending; Phase 1 does not guess a destination.",
      confidence: "low", humanApprovalRequired: true, status: "pending",
      outcome: "unresolved-other",
    };
  }
  return null;
}

interface CorrectionAnalysis {
  groups: CorrectionGroup[];
  records: DealCorrection[];
  outcomeCounts: Record<AuditOutcome, number>;
  identityConsensus: Map<string, IdentityConsensus>;
}

function correctionGroupKey(correction: DealCorrection): string {
  return JSON.stringify([
    correction.proposedSportId, correction.family, correction.deal.sourceId,
    sellerFor(correction.deal), correction.deal.sportId ?? null,
    correction.deal.equipmentTypeId ?? null, correction.proposedEquipmentTypeId,
    correction.reason, correction.confidence, correction.humanApprovalRequired,
    correction.status, correction.outcome,
  ]);
}

function correctionGroups(dataset: TaxonomyAuditDataset): CorrectionAnalysis {
  const equipmentById = new Map(dataset.equipmentTypes.map((row) => [row.id, row]));
  const sportsById = new Map(dataset.sports.map((row) => [row.id, row]));
  const sourcesById = new Map(dataset.sources.map((row) => [row.id, row]));
  const identityConsensus = buildIdentityConsensus(dataset, equipmentById, sourcesById);
  const grouped = new Map<string, CorrectionGroup>();
  const records: DealCorrection[] = [];
  const outcomeCounts: Record<AuditOutcome, number> = {
    "proposed-correction": 0,
    "genuine-conflict-review": 0,
    "unresolved-other": 0,
    "ambiguous-evidence": 0,
    "already-compatible-no-action": 0,
  };

  for (const deal of dataset.deals) {
    const source = sourcesById.get(deal.sourceId);
    const correction = correctionForDeal(
      deal, equipmentById, sportsById, source, identityConsensus,
    );
    if (!correction) {
      outcomeCounts["already-compatible-no-action"] += 1;
      continue;
    }
    records.push(correction);
    outcomeCounts[correction.outcome] += 1;
    const seller = sellerFor(deal);
    const key = correctionGroupKey(correction);
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
        outcome: correction.outcome,
        examples: [],
      };
      grouped.set(key, group);
    }
    group.recordCount += 1;
    addExample(group.examples, deal);
  }

  const groups = Array.from(grouped.values()).sort((a, b) =>
    (a.sportId ?? "").localeCompare(b.sportId ?? "")
    || (a.equipmentFamily ?? "").localeCompare(b.equipmentFamily ?? "")
    || a.sourceId.localeCompare(b.sourceId)
    || (a.seller ?? "").localeCompare(b.seller ?? "")
    || (a.currentEquipmentTypeId ?? "").localeCompare(b.currentEquipmentTypeId ?? ""));
  return { groups, records, outcomeCounts, identityConsensus };
}

const IDENTITY_TITLE_STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "new", "size", "set", "jeu", "juego", "cordage",
  "corda", "tennis", "string", "strings", "baseball", "softball", "ball", "balls", "product",
  "women", "womens", "men", "mens", "youth", "adult", "official",
]);

function identityTitleTokens(title: string): Set<string> {
  const normalized = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return new Set(normalizeText(normalized).split(" ")
    .filter((token) => (token.length >= 3 || /^\d+$/.test(token))
      && !IDENTITY_TITLE_STOP_WORDS.has(token)));
}

function sharedIdentityTitleTokens(records: AuditDealRow[]): Set<string> {
  if (records.length === 0) return new Set();
  const [first, ...rest] = records.map((deal) => identityTitleTokens(deal.title));
  return new Set(Array.from(first).filter((token) => rest.every((tokens) => tokens.has(token))));
}

function titlesLikelyDescribeSameProduct(records: AuditDealRow[]): boolean {
  const shared = sharedIdentityTitleTokens(records);
  return shared.size >= 3
    || (shared.size >= 2 && Array.from(shared).some((token) => /\d/.test(token)));
}

function titlesClearlyUnrelated(records: AuditDealRow[]): boolean {
  if (records.length < 2) return false;
  const tokenSets = records.map((deal) => identityTitleTokens(deal.title));
  for (let left = 0; left < tokenSets.length; left += 1) {
    for (let right = left + 1; right < tokenSets.length; right += 1) {
      const overlap = Array.from(tokenSets[left]).filter((token) => tokenSets[right].has(token));
      if (overlap.length > 0) return false;
    }
  }
  return true;
}

function supportedIdentifierRecommendation(
  records: AuditDealRow[],
  sourcesById: Map<string, AuditSourceRow>,
): IdentifierRecommendation | null {
  const supported = new Map<string, {
    candidate: CandidateEvidence;
    dealIds: Set<string>;
    evidence: Set<string>;
  }>();
  for (const deal of records) {
    const protections = protectedFamilies(deal, sourcesById.get(deal.sourceId));
    const compatible = Array.from(collectDirectEvidence(deal, sourcesById.get(deal.sourceId)).values())
      .filter((candidate) => !sportConflictsWithTitle(deal, candidate.sportId))
      .filter((candidate) => !equipmentFamilyConflictsWithTitle(deal, candidate))
      .filter((candidate) => candidateHasCompatibleProtection(candidate, protections));
    const keys = new Set(compatible.map(candidateKey));
    if (keys.size > 1) return null;
    if (compatible.length !== 1) continue;
    const candidate = compatible[0];
    const key = candidateKey(candidate);
    const entry = supported.get(key) ?? {
      candidate,
      dealIds: new Set<string>(),
      evidence: new Set<string>(),
    };
    entry.dealIds.add(deal.id);
    for (const signal of candidate.signals) {
      if (signal.kind !== "identity-consensus" && signal.kind !== "stored-taxonomy") {
        entry.evidence.add(`${deal.id}: ${signal.evidence}`);
      }
    }
    supported.set(key, entry);
  }
  if (supported.size !== 1) return null;
  const entry = Array.from(supported.values())[0];
  if (entry.dealIds.size < 2) return null;
  return {
    sportId: entry.candidate.sportId,
    canonicalEquipmentTypeId: entry.candidate.equipmentTypeId,
    equipmentFamily: entry.candidate.family,
    supportingDealIds: Array.from(entry.dealIds).sort(),
    directEvidence: Array.from(entry.evidence).sort(),
  };
}

type IdentifierReviewDraft = Omit<IdentifierReviewRecord, "priority">;

function buildFieldInventories(dataset: TaxonomyAuditDataset): {
  fieldCoverage: FieldCoverage[];
  brandInventory: BrandInventoryRow[];
  sourceCategoryInventory: SourceCategoryInventoryRow[];
  rawFieldInventory: RawFieldInventoryRow[];
  identifierFindings: IdentifierFinding[];
  identifierReviews: IdentifierReviewRecord[];
} {
  const total = dataset.deals.length;
  const coverage = new Map<string, { present: number; malformed: number; values: Set<string> }>();
  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, { sourceId: string; field: string; value: string; count: number }>();
  const rawFields = new Map<string, { count: number; values: Set<string> }>();
  const identifiers = new Map<string, {
    observation: IdentifierObservation;
    records: AuditDealRow[];
    classifications: Map<string, AuditDealRow[]>;
  }>();
  const sourceNames = new Map(dataset.sources.map((source) => [source.id, source.name]));
  const sourcesById = new Map(dataset.sources.map((source) => [source.id, source]));

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
      const malformed = kind === "upc"
        ? values.some((value) => !isValidGtin(value))
        : kind === "sku"
          ? values.some((value) => !isUsableSku(value.toLowerCase().replace(/[^a-z0-9]/g, "")))
          : values.some((value) => {
            const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
            return normalized.length < 5 || normalized.length > 80;
          });
      touchCoverage(kind, values, malformed);
    }
    for (const observation of identifierObservations(deal)) {
      const classificationKey = `${deal.sportId ?? "null"}/${deal.equipmentTypeId ?? "null"}`;
      const identity = identifiers.get(observation.key) ?? {
        observation, records: [], classifications: new Map<string, AuditDealRow[]>(),
      };
      if (!identity.records.some((row) => row.id === deal.id)) identity.records.push(deal);
      const classified = identity.classifications.get(classificationKey) ?? [];
      if (!classified.some((row) => row.id === deal.id)) classified.push(deal);
      identity.classifications.set(classificationKey, classified);
      identifiers.set(observation.key, identity);
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

  const identifierFindings: IdentifierFinding[] = [];
  const identifierReviewDrafts: IdentifierReviewDraft[] = [];
  for (const identity of Array.from(identifiers.values())) {
    const { observation, records } = identity;
    const classificationConflict = identity.classifications.size >= 2;
    const collision = records.length >= 2;
    const clearlyUnrelated = titlesClearlyUnrelated(records);
    if (!classificationConflict && !collision
        && !(observation.type === "upc" && observation.invalidReason)) continue;
    if (!classificationConflict && collision && !observation.invalidReason && !clearlyUnrelated) continue;
    const likelySameProduct = observation.validForConsensus
      && classificationConflict
      && titlesLikelyDescribeSameProduct(records);
    let kind: IdentifierFindingKind;
    if (clearlyUnrelated && records.length >= 2) kind = "unsafe-identifier-reuse";
    else if (observation.invalidReason) kind = "invalid-identifier";
    else if (likelySameProduct) kind = "likely-same-product-conflict";
    else kind = "unresolved-collision";

    const sharedTokens = Array.from(sharedIdentityTitleTokens(records)).sort();
    const sourceEvidence = Array.from(new Set(records.map((deal) => {
      const sourceName = sourceNames.get(deal.sourceId) ?? deal.sourceId;
      return `${deal.sourceId}/${sourceName}/${sellerFor(deal) ?? "no seller"}`;
    }))).sort();
    const evidence = [
      `${observation.type} is scoped as ${observation.scope}`,
      `source/seller records: ${sourceEvidence.join("; ")}`,
      ...(observation.invalidReason ? [observation.invalidReason] : []),
      ...(classificationConflict
        ? [`identifier occurs under ${identity.classifications.size} inconsistent sport/equipment assignments`]
        : []),
      ...(sharedTokens.length > 0
        ? [`representative titles share identity tokens: ${sharedTokens.slice(0, 8).join(", ")}`]
        : ["representative titles share no meaningful product tokens"]),
    ];
    const reasonByKind: Record<IdentifierFindingKind, string> = {
      "likely-same-product-conflict": "Validated, scoped identity and compatible titles indicate likely translations or variants of the same product with inconsistent taxonomy.",
      "unsafe-identifier-reuse": "The identifier is reused by unrelated products and must not provide identity consensus.",
      "invalid-identifier": "The identifier is structurally invalid or too weak to provide identity consensus.",
      "unresolved-collision": "The scoped identifier collision lacks enough compatible product evidence to decide whether the records are the same product.",
    };
    const finding: IdentifierFinding = {
      kind,
      identifierType: observation.type,
      identifierValue: observation.value,
      scope: observation.scope,
      currentIds: Array.from(identity.classifications.keys()).sort(),
      recordCount: records.length,
      evidence,
      reason: reasonByKind[kind],
      confidence: kind === "likely-same-product-conflict" ? "high" : "low",
      humanApprovalRequired: true,
      examples: records.slice(0, 5).map(({ id, title, sourceId, raw }) => ({
        id,
        title,
        sourceId,
        sourceName: sourceNames.get(sourceId) ?? sourceId,
        seller: sellerFor({ id, title, sourceId, raw }),
      })),
    };
    identifierFindings.push(finding);

    const recommendation = kind === "likely-same-product-conflict"
      ? supportedIdentifierRecommendation(records, sourcesById)
      : null;
    const quarantineReason = recommendation
      ? null
      : kind === "likely-same-product-conflict"
        ? "matching direct product-family evidence does not independently support one destination across at least two records"
        : reasonByKind[kind];
    identifierReviewDrafts.push({
      kind,
      identifierType: observation.type,
      identifierValue: observation.value,
      scope: observation.scope,
      currentIds: finding.currentIds,
      recordCount: records.length,
      evidence,
      reason: reasonByKind[kind],
      confidence: finding.confidence,
      humanApprovalRequired: true,
      consensusEligible: false,
      quarantineReason,
      supportedRecommendation: recommendation,
      records: records.map(({ id, title, sourceId, sportId, equipmentTypeId, raw }) => ({
        dealId: id,
        title,
        sourceId,
        sourceName: sourceNames.get(sourceId) ?? sourceId,
        seller: sellerFor({ id, title, sourceId, raw }),
        currentSportId: sportId ?? null,
        currentEquipmentTypeId: equipmentTypeId ?? null,
        availability: availabilityFor({ id, title, sourceId, raw }).availability,
      })),
    });
  }
  identifierFindings.sort((a, b) => a.kind.localeCompare(b.kind)
    || a.identifierType.localeCompare(b.identifierType)
    || a.identifierValue.localeCompare(b.identifierValue));
  const sourceReviewDealIds = new Map<string, Set<string>>();
  for (const review of identifierReviewDrafts) {
    for (const record of review.records) {
      const ids = sourceReviewDealIds.get(record.sourceId) ?? new Set<string>();
      ids.add(record.dealId);
      sourceReviewDealIds.set(record.sourceId, ids);
    }
  }
  const identifierReviews = identifierReviewDrafts.map((review): IdentifierReviewRecord => {
    const sourceIds = Array.from(new Set(review.records.map((record) => record.sourceId)));
    const sourceId = sourceIds.length === 1 ? sourceIds[0] : null;
    const availability: ReviewAvailability = review.records.some((record) => record.availability === "available")
      ? "available"
      : review.records.length > 0
          && review.records.every((record) => record.availability === "unavailable")
        ? "unavailable" : "unknown";
    return {
      ...review,
      priority: reviewPriority({
        affectedRecordCount: review.recordCount,
        shopperVisibleFragmentation: review.currentIds.length > 1,
        evidenceStrength: review.supportedRecommendation ? "high" : review.confidence,
        sourceId,
        sourceReviewRecordCount: sourceId
          ? sourceReviewDealIds.get(sourceId)?.size ?? review.recordCount
          : review.recordCount,
        availability,
      }),
    };
  }).sort((a, b) => b.priority.score - a.priority.score
    || b.recordCount - a.recordCount
    || a.identifierType.localeCompare(b.identifierType)
    || a.identifierValue.localeCompare(b.identifierValue));
  return {
    fieldCoverage,
    brandInventory,
    sourceCategoryInventory,
    rawFieldInventory,
    identifierFindings,
    identifierReviews,
  };
}

function identifierEvidenceForDeal(
  deal: AuditDealRow,
  identityConsensus: Map<string, IdentityConsensus>,
): string[] {
  return identifierObservations(deal).map((identity) => {
    if (identity.invalidReason) {
      return `${identity.type} ${identity.value} quarantined: ${identity.invalidReason}`;
    }
    const consensus = identityConsensus.get(identity.key);
    if (consensus) {
      return `${identity.type} ${identity.value} (${consensus.scope}) agrees across ${consensus.supportingRecords} correctly classified records`;
    }
    return `${identity.type} ${identity.value} (${identity.scope}) has no eligible identity consensus`;
  });
}

function shopperVisibleFragmentationForCorrection(
  correction: DealCorrection,
  equipmentById: Map<string, AuditEquipmentRow>,
): boolean {
  if (!correction.proposedEquipmentTypeId) return false;
  const currentEquipment = correction.deal.equipmentTypeId
    ? equipmentById.get(correction.deal.equipmentTypeId) : undefined;
  if (isOther(correction.deal.equipmentTypeId, currentEquipment?.name)) return true;
  const currentDisplayId = canonicalResultEquipmentTypeId(
    correction.deal.sportId,
    correction.deal.equipmentTypeId,
  );
  const proposedDisplayId = canonicalResultEquipmentTypeId(
    correction.proposedSportId,
    correction.proposedEquipmentTypeId,
  );
  return currentDisplayId !== proposedDisplayId;
}

function buildTaxonomyReviewPacket(
  dataset: TaxonomyAuditDataset,
  correctionAnalysis: CorrectionAnalysis,
  identifierReviews: IdentifierReviewRecord[],
  generatedAt: string,
): TaxonomyReviewPacket {
  const sourcesById = new Map(dataset.sources.map((source) => [source.id, source]));
  const equipmentById = new Map(dataset.equipmentTypes.map((equipment) => [equipment.id, equipment]));
  const cohortCounts = new Map<string, number>();
  const sourceReviewCounts = new Map<string, number>();
  for (const correction of correctionAnalysis.records) {
    const cohortKey = correctionGroupKey(correction);
    cohortCounts.set(cohortKey, (cohortCounts.get(cohortKey) ?? 0) + 1);
    sourceReviewCounts.set(
      correction.deal.sourceId,
      (sourceReviewCounts.get(correction.deal.sourceId) ?? 0) + 1,
    );
  }

  const dealReviews = correctionAnalysis.records.map((correction): DealReviewRecord => {
    const deal = correction.deal;
    const availability = availabilityFor(deal);
    const affectedRecordCount = cohortCounts.get(correctionGroupKey(correction)) ?? 1;
    const shopperVisibleFragmentation = shopperVisibleFragmentationForCorrection(
      correction,
      equipmentById,
    );
    return {
      dealId: deal.id,
      title: deal.title,
      sourceId: deal.sourceId,
      sourceName: sourcesById.get(deal.sourceId)?.name ?? deal.sourceId,
      seller: sellerFor(deal),
      availability: availability.availability,
      availabilityEvidence: availability.evidence,
      currentSportId: deal.sportId ?? null,
      currentEquipmentTypeId: deal.equipmentTypeId ?? null,
      proposedSportId: correction.proposedSportId,
      proposedCanonicalEquipmentTypeId: correction.proposedEquipmentTypeId,
      equipmentFamily: correction.family,
      evidence: correction.evidence,
      negativeEvidence: correction.negativeEvidence,
      identifierEvidence: identifierEvidenceForDeal(deal, correctionAnalysis.identityConsensus),
      confidence: correction.confidence,
      reason: correction.reason,
      humanApprovalRequired: correction.humanApprovalRequired,
      status: correction.status,
      outcome: correction.outcome,
      priority: reviewPriority({
        affectedRecordCount,
        shopperVisibleFragmentation,
        evidenceStrength: correction.confidence,
        sourceId: deal.sourceId,
        sourceReviewRecordCount: sourceReviewCounts.get(deal.sourceId) ?? 1,
        availability: availability.availability,
      }),
    };
  }).sort((a, b) => b.priority.score - a.priority.score
    || a.sourceId.localeCompare(b.sourceId)
    || a.dealId.localeCompare(b.dealId));

  const proposedCorrections = dealReviews.filter((record) =>
    record.outcome === "proposed-correction");
  const unresolvedManualReview = dealReviews.filter((record) =>
    record.outcome !== "proposed-correction");
  const likelySameProductFindings = identifierReviews.filter((record) =>
    record.kind === "likely-same-product-conflict");
  const likelySameProductConflicts = likelySameProductFindings.filter((record) =>
    record.supportedRecommendation !== null);
  const identifierQuarantine = identifierReviews.filter((record) =>
    record.supportedRecommendation === null);
  return {
    metadata: {
      generatedAt,
      ruleVersion: TAXONOMY_AUDIT_RULE_VERSION,
      mode: "read-only",
      applySupported: false,
      baselineEvidence: "phase1.4-production-audit-offline",
    },
    summary: {
      proposedCorrections: proposedCorrections.length,
      likelySameProductFindings: likelySameProductFindings.length,
      supportedIdentifierRecommendations: likelySameProductConflicts.length,
      identifierQuarantine: identifierQuarantine.length,
      unresolvedManualReview: unresolvedManualReview.length,
    },
    proposedCorrections,
    likelySameProductConflicts,
    identifierQuarantine,
    unresolvedManualReview,
  };
}

export function buildTaxonomyAuditReport(
  dataset: TaxonomyAuditDataset,
  options: { generatedAt?: string } = {},
): TaxonomyAuditReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const fieldInventories = buildFieldInventories(dataset);
  const taxonomyFindings = taxonomyStructureFindings(dataset)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
  const identifierFindingCounts: Record<IdentifierFindingKind, number> = {
    "likely-same-product-conflict": 0,
    "unsafe-identifier-reuse": 0,
    "invalid-identifier": 0,
    "unresolved-collision": 0,
  };
  for (const finding of fieldInventories.identifierFindings) identifierFindingCounts[finding.kind] += 1;
  const correctionAnalysis = correctionGroups(dataset);
  const corrections = correctionAnalysis.groups;
  const outcomes = correctionAnalysis.outcomeCounts;
  const reconciledDeals = Object.values(outcomes).reduce((sum, count) => sum + count, 0);
  if (reconciledDeals !== dataset.deals.length) {
    throw new Error(`taxonomy audit outcome reconciliation failed: ${reconciledDeals} != ${dataset.deals.length}`);
  }
  const equipmentById = new Map(dataset.equipmentTypes.map((row) => [row.id, row]));
  const otherRecords = dataset.deals.filter((deal) =>
    isOther(deal.equipmentTypeId, deal.equipmentTypeId ? equipmentById.get(deal.equipmentTypeId)?.name : null)).length;
  const unclassifiedRecords = dataset.deals.filter((deal) => !deal.sportId || !deal.equipmentTypeId).length;
  const reviewPacket = buildTaxonomyReviewPacket(
    dataset,
    correctionAnalysis,
    fieldInventories.identifierReviews,
    generatedAt,
  );
  return {
    metadata: {
      generatedAt,
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
      identifierFindings: fieldInventories.identifierFindings.length,
      identifierFindingCounts,
      correctionGroups: corrections.length,
      proposedRecords: outcomes["proposed-correction"],
      pendingRecords: outcomes["genuine-conflict-review"]
        + outcomes["unresolved-other"] + outcomes["ambiguous-evidence"],
      proposedCorrectionRecords: outcomes["proposed-correction"],
      conflictReviewRecords: outcomes["genuine-conflict-review"],
      unresolvedOtherRecords: outcomes["unresolved-other"],
      ambiguousEvidenceRecords: outcomes["ambiguous-evidence"],
      compatibleNoActionRecords: outcomes["already-compatible-no-action"],
      otherRecords,
      unclassifiedRecords,
    },
    taxonomyFindings,
    identifierFindings: fieldInventories.identifierFindings,
    correctionGroups: corrections,
    fieldCoverage: fieldInventories.fieldCoverage,
    brandInventory: fieldInventories.brandInventory,
    sourceCategoryInventory: fieldInventories.sourceCategoryInventory,
    rawFieldInventory: fieldInventories.rawFieldInventory,
    taxonomyInventory: buildTaxonomyInventory(dataset),
    assignmentPaths: TAXONOMY_ASSIGNMENT_PATHS,
    reviewPacket,
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
    "confidence", "humanApprovalRequired", "status", "outcome", "examples",
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

export function taxonomyAuditIdentifierFindingsCsv(report: TaxonomyAuditReport): string {
  const columns: Array<keyof IdentifierFinding> = [
    "kind", "identifierType", "identifierValue", "scope", "currentIds",
    "recordCount", "evidence", "reason", "confidence", "humanApprovalRequired", "examples",
  ];
  const lines = [columns.join(",")];
  for (const row of report.identifierFindings) {
    lines.push(columns.map((column) => {
      const value = column === "examples"
        ? row.examples.map((example) =>
          `${example.id}: ${example.title} [${example.sourceId}/${example.sourceName}/${example.seller ?? "no seller"}]`)
        : row[column];
      return csvCell(value);
    }).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function taxonomyDealReviewCsv(rows: DealReviewRecord[]): string {
  const columns = [
    "dealId", "title", "sourceId", "sourceName", "seller", "availability",
    "availabilityEvidence", "currentSportId", "currentEquipmentTypeId", "proposedSportId",
    "proposedCanonicalEquipmentTypeId", "equipmentFamily", "evidence", "negativeEvidence",
    "identifierEvidence", "confidence", "reason", "humanApprovalRequired", "status", "outcome",
    "priorityLevel", "priorityScore", "affectedRecordCount", "shopperVisibleFragmentation",
    "sourceReviewRecordCount",
  ] as const;
  const lines = [columns.join(",")];
  for (const row of rows) {
    const values: Record<(typeof columns)[number], unknown> = {
      dealId: row.dealId,
      title: row.title,
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      seller: row.seller,
      availability: row.availability,
      availabilityEvidence: row.availabilityEvidence,
      currentSportId: row.currentSportId,
      currentEquipmentTypeId: row.currentEquipmentTypeId,
      proposedSportId: row.proposedSportId,
      proposedCanonicalEquipmentTypeId: row.proposedCanonicalEquipmentTypeId,
      equipmentFamily: row.equipmentFamily,
      evidence: row.evidence,
      negativeEvidence: row.negativeEvidence,
      identifierEvidence: row.identifierEvidence,
      confidence: row.confidence,
      reason: row.reason,
      humanApprovalRequired: row.humanApprovalRequired,
      status: row.status,
      outcome: row.outcome,
      priorityLevel: row.priority.level,
      priorityScore: row.priority.score,
      affectedRecordCount: row.priority.affectedRecordCount,
      shopperVisibleFragmentation: row.priority.shopperVisibleFragmentation,
      sourceReviewRecordCount: row.priority.sourceReviewRecordCount,
    };
    lines.push(columns.map((column) => csvCell(values[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function taxonomyIdentifierReviewCsv(rows: IdentifierReviewRecord[]): string {
  const columns = [
    "kind", "identifierType", "identifierValue", "scope", "currentIds", "recordCount",
    "evidence", "reason", "confidence", "humanApprovalRequired", "consensusEligible",
    "quarantineReason", "recommendedSportId", "recommendedCanonicalEquipmentTypeId",
    "recommendedEquipmentFamily", "recommendationSupportingDealIds", "recommendationDirectEvidence",
    "priorityLevel", "priorityScore", "affectedRecordCount", "shopperVisibleFragmentation",
    "sourceId", "sourceReviewRecordCount", "availability", "records",
  ] as const;
  const lines = [columns.join(",")];
  for (const row of rows) {
    const values: Record<(typeof columns)[number], unknown> = {
      kind: row.kind,
      identifierType: row.identifierType,
      identifierValue: row.identifierValue,
      scope: row.scope,
      currentIds: row.currentIds,
      recordCount: row.recordCount,
      evidence: row.evidence,
      reason: row.reason,
      confidence: row.confidence,
      humanApprovalRequired: row.humanApprovalRequired,
      consensusEligible: row.consensusEligible,
      quarantineReason: row.quarantineReason,
      recommendedSportId: row.supportedRecommendation?.sportId ?? null,
      recommendedCanonicalEquipmentTypeId:
        row.supportedRecommendation?.canonicalEquipmentTypeId ?? null,
      recommendedEquipmentFamily: row.supportedRecommendation?.equipmentFamily ?? null,
      recommendationSupportingDealIds: row.supportedRecommendation?.supportingDealIds ?? [],
      recommendationDirectEvidence: row.supportedRecommendation?.directEvidence ?? [],
      priorityLevel: row.priority.level,
      priorityScore: row.priority.score,
      affectedRecordCount: row.priority.affectedRecordCount,
      shopperVisibleFragmentation: row.priority.shopperVisibleFragmentation,
      sourceId: row.priority.sourceId,
      sourceReviewRecordCount: row.priority.sourceReviewRecordCount,
      availability: row.priority.availability,
      records: row.records.map((record) =>
        `${record.dealId}: ${record.title} [${record.sourceId}/${record.sourceName}/${record.seller ?? "no seller"}/${record.currentSportId ?? "null"}/${record.currentEquipmentTypeId ?? "null"}/${record.availability}]`),
    };
    lines.push(columns.map((column) => csvCell(values[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function taxonomyReviewProposedCorrectionsCsv(report: TaxonomyAuditReport): string {
  return taxonomyDealReviewCsv(report.reviewPacket.proposedCorrections);
}

export function taxonomyReviewUnresolvedManualCsv(report: TaxonomyAuditReport): string {
  return taxonomyDealReviewCsv(report.reviewPacket.unresolvedManualReview);
}

export function taxonomyReviewSupportedIdentifierConflictsCsv(report: TaxonomyAuditReport): string {
  return taxonomyIdentifierReviewCsv(report.reviewPacket.likelySameProductConflicts);
}

export function taxonomyReviewIdentifierQuarantineCsv(report: TaxonomyAuditReport): string {
  return taxonomyIdentifierReviewCsv(report.reviewPacket.identifierQuarantine);
}

export function taxonomyReviewPacketJson(report: TaxonomyAuditReport): string {
  return `${JSON.stringify(report.reviewPacket, null, 2)}\n`;
}

export function taxonomyReviewMarkdown(report: TaxonomyAuditReport): string {
  const packet = report.reviewPacket;
  const priorityCounts = (rows: Array<{ priority: ReviewPriority }>) => {
    const counts: Record<ReviewPriorityLevel, number> = {
      critical: 0, high: 0, medium: 0, low: 0,
    };
    for (const row of rows) counts[row.priority.level] += 1;
    return counts;
  };
  const proposalPriorities = priorityCounts(packet.proposedCorrections);
  const unresolvedPriorities = priorityCounts(packet.unresolvedManualReview);
  return [
    "# TSSDeals Phase 1.5 taxonomy review packet",
    "",
    `Generated: ${packet.metadata.generatedAt}`,
    "",
    "> Approval-ready, read-only review material. This packet has no apply or mutation mode.",
    "",
    "## Review queues",
    "",
    `- Proposed corrections ready for human review: ${packet.summary.proposedCorrections}.`,
    `- Likely same-product identifier findings: ${packet.summary.likelySameProductFindings}.`,
    `- Likely same-product conflicts with a direct-evidence-supported recommendation: ${packet.summary.supportedIdentifierRecommendations}.`,
    `- Identifier quarantine: ${packet.summary.identifierQuarantine}.`,
    `- Unresolved/manual-review deal records: ${packet.summary.unresolvedManualReview}.`,
    "",
    "## Priority distribution",
    "",
    `- Proposed corrections: critical ${proposalPriorities.critical}, high ${proposalPriorities.high}, medium ${proposalPriorities.medium}, low ${proposalPriorities.low}.`,
    `- Unresolved/manual: critical ${unresolvedPriorities.critical}, high ${unresolvedPriorities.high}, medium ${unresolvedPriorities.medium}, low ${unresolvedPriorities.low}.`,
    "",
    "Priority combines cohort size, shopper-visible fragmentation, evidence strength, source review volume, and current availability when a structured supplier value is present.",
    "",
    "## Identifier approval boundary",
    "",
    "Every identifier conflict remains human-review-only and consensus-ineligible. A likely same-product conflict receives a recommendation only when at least two records independently produce the same compatible direct product-family destination. Identifier agreement alone never creates a classification. Invalid identifiers, unsafe reuse, unresolved collisions, sellerless SKUs, numeric/generic SKUs, and conflicting direct evidence remain quarantined.",
    "",
    "## Baseline evidence",
    "",
    "The supplied Phase 1.4 production bundle was inspected offline only. It reported 1,283 proposed-correction records and 2,472 identifier findings: 1,959 likely-same-product conflicts, 12 unsafe-reuse findings, 296 invalid identifiers, and 205 unresolved collisions. Its correction cohorts retain representative examples rather than every deal, so this Phase 1.5 packet is generated from a future read-only snapshot and was not run against production in this change.",
    "",
  ].join("\n");
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
  const topIdentifierFindings = report.identifierFindings
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
    `- Proposed corrections: ${report.summary.proposedCorrectionRecords}.`,
    `- Genuine conflicts requiring review: ${report.summary.conflictReviewRecords}.`,
    `- Unresolved/Other records: ${report.summary.unresolvedOtherRecords}.`,
    `- Ambiguous-evidence records: ${report.summary.ambiguousEvidenceRecords}.`,
    `- Already compatible / no action: ${report.summary.compatibleNoActionRecords}.`,
    `- Total pending review: ${report.summary.pendingRecords}.`,
    `- Identifier findings: ${report.summary.identifierFindings}.`,
    `  - Likely same-product conflicts: ${report.summary.identifierFindingCounts["likely-same-product-conflict"]}.`,
    `  - Unsafe identifier reuse: ${report.summary.identifierFindingCounts["unsafe-identifier-reuse"]}.`,
    `  - Invalid identifiers: ${report.summary.identifierFindingCounts["invalid-identifier"]}.`,
    `  - Unresolved collisions: ${report.summary.identifierFindingCounts["unresolved-collision"]}.`,
    "",
    "## Largest correction cohorts",
    "",
    "| Outcome | Sport | Family | Source / seller | Current | Proposed | Count | Confidence | Approval |",
    "|---|---|---|---|---|---|---:|---|---|",
  ];
  if (topCorrections.length === 0) lines.push("| — | — | — | — | — | — | 0 | — | — |");
  for (const group of topCorrections) {
    lines.push(`| ${group.outcome} | ${group.sportId ?? "Unresolved"} | ${group.equipmentFamily ?? "Unresolved"} | ${group.sourceName}${group.seller ? ` / ${group.seller}` : ""} | ${group.currentSportId ?? "null"}/${group.currentEquipmentTypeId ?? "null"} | ${group.proposedSportId ?? "pending"}/${group.proposedCanonicalEquipmentTypeId ?? "pending"} | ${group.recordCount} | ${group.confidence} | ${group.humanApprovalRequired ? "Required" : "Not required by confidence policy"} |`);
  }
  lines.push(
    "",
    "## Identifier findings",
    "",
    "| Kind | Identifier | Scope | Current classifications | Records | Representative sources / sellers |",
    "|---|---|---|---|---:|---|",
  );
  if (topIdentifierFindings.length === 0) lines.push("| — | — | — | — | 0 | — |");
  for (const finding of topIdentifierFindings) {
    const sourceSummary = finding.examples
      .map((example) => `${example.sourceId}/${example.sourceName}/${example.seller ?? "no seller"}`)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join("; ");
    lines.push(`| ${finding.kind} | ${finding.identifierType}:${finding.identifierValue} | ${finding.scope.replace(/\|/g, " / ")} | ${finding.currentIds.join(", ")} | ${finding.recordCount} | ${sourceSummary} |`);
  }
  lines.push(
    "",
    "## Phase 1.5 evidence and review policy",
    "",
    "A sport name alone is never ball evidence. Explicit softball/fastpitch/slowpitch, mixed Baseball/Softball, training-ball, ball-container, glove-accessory, ball-memorabilia, and batting-tee replacement-component evidence is evaluated before ordinary equipment destinations. Canonical stored sport/equipment families use an explicit compatibility layer so compatible products are counted as no action rather than pending. High confidence still requires two independent compatible signal types; proposed corrections, genuine conflicts, unresolved Other records, ambiguous evidence, and compatible no-action records are reported separately.",
    "",
    "Validated UPC/GTIN values must pass a structural check digit and cannot be repeated-digit placeholders. SKU identity is source- and known-seller-scoped; sellerless, numeric, or generic SKUs cannot provide consensus. Source item numbers are source-scoped. Identifier consensus can only reinforce matching direct product-family evidence; it cannot create a destination by itself.",
    "",
    "The approval-review packet expands correction decisions per deal, partitions directly supported likely-same-product recommendations from identifier quarantine, and orders review using transparent cohort, fragmentation, evidence, source-volume, and availability factors. Every identifier conflict remains consensus-ineligible and human-review-only.",
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
