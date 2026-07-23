export const TAXONOMY_REVIEW_EXPORT_VERSION = "phase1.6-decision-export-v1";

export type ReviewQueueKind = "taxonomy-correction" | "identifier-recommendation";
export type ReviewDecisionValue = "approve" | "reject" | "defer";
export type ReviewAvailability = "available" | "unavailable" | "unknown";
export type ReviewPriorityLevel = "critical" | "high" | "medium" | "low";
export type ReviewConfidence = "high" | "medium" | "low";
export type ReviewStatusFilter = "all" | "undecided" | ReviewDecisionValue;

export interface ReviewClassification {
  sportId: string | null;
  equipmentTypeId: string | null;
}

export interface ReviewPriority {
  level: ReviewPriorityLevel;
  score: number;
  affectedRecordCount: number;
  shopperVisibleFragmentation: boolean;
}

export interface ReviewQueueItem {
  key: string;
  kind: ReviewQueueKind;
  dealId: string | null;
  identifier: {
    type: string;
    value: string;
    scope: string;
  } | null;
  title: string;
  representativeTitles: string[];
  sourceIds: string[];
  sourceNames: string[];
  sellers: string[];
  currentClassifications: ReviewClassification[];
  proposedClassification: ReviewClassification;
  availability: ReviewAvailability;
  priority: ReviewPriority;
  confidence: ReviewConfidence;
  reason: string;
  evidence: string[];
  negativeEvidence: string[];
  identifierEvidence: string[];
}

export interface TaxonomyReviewPacketCounts {
  proposedCorrections: number;
  unresolvedManualReview: number;
  supportedIdentifierRecommendations: number;
  identifierQuarantine: number;
  totalIdentifierFindings: number;
}

export interface TaxonomyReviewWorkspace {
  auditBundleIdentity: string;
  generatedAt: string;
  ruleVersion: string;
  counts: TaxonomyReviewPacketCounts;
  queueItems: ReviewQueueItem[];
}

export interface ReviewFilters {
  priority: "all" | ReviewPriorityLevel;
  source: string;
  currentClassification: string;
  proposedDestination: string;
  availability: "all" | ReviewAvailability;
  reviewStatus: ReviewStatusFilter;
}

export interface TaxonomyReviewDecision {
  itemKey: string;
  queueKind: ReviewQueueKind;
  dealId: string | null;
  identifierType: string | null;
  identifierValue: string | null;
  identifierScope: string | null;
  title: string;
  sourceIds: string[];
  originalClassifications: ReviewClassification[];
  proposedClassification: ReviewClassification;
  decision: ReviewDecisionValue;
  reviewer: string;
  reviewedAt: string;
  reviewerNote: string | null;
  reviewPriority: ReviewPriorityLevel;
  confidence: ReviewConfidence;
  ruleVersion: string;
  auditBundleIdentity: string;
}

interface PacketMetadata {
  generatedAt: string;
  ruleVersion: string;
  mode: "read-only";
  applySupported: false;
}

interface PacketSummary {
  proposedCorrections: number;
  supportedIdentifierRecommendations: number;
  identifierQuarantine: number;
  unresolvedManualReview: number;
}

interface PacketDealReview {
  dealId: string;
  title: string;
  sourceId: string;
  sourceName: string;
  seller: string | null;
  availability: ReviewAvailability;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  evidence: string[];
  negativeEvidence: string[];
  identifierEvidence: string[];
  confidence: ReviewConfidence;
  reason: string;
  humanApprovalRequired: boolean;
  outcome: string;
  priority: ReviewPriority & {
    availability?: ReviewAvailability;
  };
}

interface PacketIdentifierReview {
  kind: string;
  identifierType: string;
  identifierValue: string;
  scope: string;
  evidence: string[];
  reason: string;
  confidence: ReviewConfidence;
  humanApprovalRequired: boolean;
  consensusEligible: boolean;
  supportedRecommendation: {
    sportId: string;
    canonicalEquipmentTypeId: string;
    equipmentFamily: string;
    supportingDealIds: string[];
    directEvidence: string[];
  } | null;
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
  priority: ReviewPriority & {
    availability?: ReviewAvailability;
  };
}

interface ParsedPacket {
  metadata: PacketMetadata;
  summary: PacketSummary;
  proposedCorrections: PacketDealReview[];
  likelySameProductConflicts: PacketIdentifierReview[];
  identifierQuarantine: unknown[];
  unresolvedManualReview: unknown[];
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  return stringValue(value, path);
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a non-negative number`);
  }
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((entry, index) => stringValue(entry, `${path}[${index}]`));
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error(`${path} must be one of ${options.join(", ")}`);
  }
  return value as T;
}

function priority(value: unknown, path: string): ReviewPriority & { availability?: ReviewAvailability } {
  const item = record(value, path);
  return {
    level: oneOf(item.level, ["critical", "high", "medium", "low"], `${path}.level`),
    score: numberValue(item.score, `${path}.score`),
    affectedRecordCount: numberValue(item.affectedRecordCount, `${path}.affectedRecordCount`),
    shopperVisibleFragmentation: booleanValue(
      item.shopperVisibleFragmentation,
      `${path}.shopperVisibleFragmentation`,
    ),
    availability: item.availability === undefined
      ? undefined
      : oneOf(
        item.availability,
        ["available", "unavailable", "unknown"] as const,
        `${path}.availability`,
      ),
  };
}

function dealReview(value: unknown, path: string): PacketDealReview {
  const item = record(value, path);
  return {
    dealId: stringValue(item.dealId, `${path}.dealId`),
    title: stringValue(item.title, `${path}.title`),
    sourceId: stringValue(item.sourceId, `${path}.sourceId`),
    sourceName: stringValue(item.sourceName, `${path}.sourceName`),
    seller: nullableString(item.seller, `${path}.seller`),
    availability: oneOf(
      item.availability,
      ["available", "unavailable", "unknown"],
      `${path}.availability`,
    ),
    currentSportId: nullableString(item.currentSportId, `${path}.currentSportId`),
    currentEquipmentTypeId: nullableString(
      item.currentEquipmentTypeId,
      `${path}.currentEquipmentTypeId`,
    ),
    proposedSportId: nullableString(item.proposedSportId, `${path}.proposedSportId`),
    proposedCanonicalEquipmentTypeId: nullableString(
      item.proposedCanonicalEquipmentTypeId,
      `${path}.proposedCanonicalEquipmentTypeId`,
    ),
    evidence: stringArray(item.evidence, `${path}.evidence`),
    negativeEvidence: stringArray(item.negativeEvidence, `${path}.negativeEvidence`),
    identifierEvidence: stringArray(item.identifierEvidence, `${path}.identifierEvidence`),
    confidence: oneOf(item.confidence, ["high", "medium", "low"], `${path}.confidence`),
    reason: stringValue(item.reason, `${path}.reason`),
    humanApprovalRequired: booleanValue(
      item.humanApprovalRequired,
      `${path}.humanApprovalRequired`,
    ),
    outcome: stringValue(item.outcome, `${path}.outcome`),
    priority: priority(item.priority, `${path}.priority`),
  };
}

function identifierReview(value: unknown, path: string): PacketIdentifierReview {
  const item = record(value, path);
  const recommendation = item.supportedRecommendation === null
    ? null
    : record(item.supportedRecommendation, `${path}.supportedRecommendation`);
  return {
    kind: stringValue(item.kind, `${path}.kind`),
    identifierType: stringValue(item.identifierType, `${path}.identifierType`),
    identifierValue: stringValue(item.identifierValue, `${path}.identifierValue`),
    scope: stringValue(item.scope, `${path}.scope`),
    evidence: stringArray(item.evidence, `${path}.evidence`),
    reason: stringValue(item.reason, `${path}.reason`),
    confidence: oneOf(item.confidence, ["high", "medium", "low"], `${path}.confidence`),
    humanApprovalRequired: booleanValue(
      item.humanApprovalRequired,
      `${path}.humanApprovalRequired`,
    ),
    consensusEligible: booleanValue(item.consensusEligible, `${path}.consensusEligible`),
    supportedRecommendation: recommendation && {
      sportId: stringValue(recommendation.sportId, `${path}.supportedRecommendation.sportId`),
      canonicalEquipmentTypeId: stringValue(
        recommendation.canonicalEquipmentTypeId,
        `${path}.supportedRecommendation.canonicalEquipmentTypeId`,
      ),
      equipmentFamily: stringValue(
        recommendation.equipmentFamily,
        `${path}.supportedRecommendation.equipmentFamily`,
      ),
      supportingDealIds: stringArray(
        recommendation.supportingDealIds,
        `${path}.supportedRecommendation.supportingDealIds`,
      ),
      directEvidence: stringArray(
        recommendation.directEvidence,
        `${path}.supportedRecommendation.directEvidence`,
      ),
    },
    records: array(item.records, `${path}.records`).map((entry, index) => {
      const rowPath = `${path}.records[${index}]`;
      const row = record(entry, rowPath);
      return {
        dealId: stringValue(row.dealId, `${rowPath}.dealId`),
        title: stringValue(row.title, `${rowPath}.title`),
        sourceId: stringValue(row.sourceId, `${rowPath}.sourceId`),
        sourceName: stringValue(row.sourceName, `${rowPath}.sourceName`),
        seller: nullableString(row.seller, `${rowPath}.seller`),
        currentSportId: nullableString(row.currentSportId, `${rowPath}.currentSportId`),
        currentEquipmentTypeId: nullableString(
          row.currentEquipmentTypeId,
          `${rowPath}.currentEquipmentTypeId`,
        ),
        availability: oneOf(
          row.availability,
          ["available", "unavailable", "unknown"],
          `${rowPath}.availability`,
        ),
      };
    }),
    priority: priority(item.priority, `${path}.priority`),
  };
}

function parsePacket(jsonText: string): ParsedPacket {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("The selected file is not valid JSON");
  }
  const root = record(parsed, "packet");
  const metadata = record(root.metadata, "packet.metadata");
  const summary = record(root.summary, "packet.summary");
  const packet: ParsedPacket = {
    metadata: {
      generatedAt: stringValue(metadata.generatedAt, "packet.metadata.generatedAt"),
      ruleVersion: stringValue(metadata.ruleVersion, "packet.metadata.ruleVersion"),
      mode: oneOf(metadata.mode, ["read-only"], "packet.metadata.mode"),
      applySupported: booleanValue(
        metadata.applySupported,
        "packet.metadata.applySupported",
      ) as false,
    },
    summary: {
      proposedCorrections: numberValue(
        summary.proposedCorrections,
        "packet.summary.proposedCorrections",
      ),
      supportedIdentifierRecommendations: numberValue(
        summary.supportedIdentifierRecommendations,
        "packet.summary.supportedIdentifierRecommendations",
      ),
      identifierQuarantine: numberValue(
        summary.identifierQuarantine,
        "packet.summary.identifierQuarantine",
      ),
      unresolvedManualReview: numberValue(
        summary.unresolvedManualReview,
        "packet.summary.unresolvedManualReview",
      ),
    },
    proposedCorrections: array(
      root.proposedCorrections,
      "packet.proposedCorrections",
    ).map((entry, index) => dealReview(entry, `packet.proposedCorrections[${index}]`)),
    likelySameProductConflicts: array(
      root.likelySameProductConflicts,
      "packet.likelySameProductConflicts",
    ).map((entry, index) =>
      identifierReview(entry, `packet.likelySameProductConflicts[${index}]`)),
    identifierQuarantine: array(
      root.identifierQuarantine,
      "packet.identifierQuarantine",
    ),
    unresolvedManualReview: array(
      root.unresolvedManualReview,
      "packet.unresolvedManualReview",
    ),
  };
  if (packet.metadata.applySupported !== false) {
    throw new Error("Only read-only audit packets are accepted");
  }
  return packet;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value))).sort();
}

function classificationKey(classification: ReviewClassification): string {
  return `${classification.sportId ?? "null"}/${classification.equipmentTypeId ?? "null"}`;
}

function uniqueClassifications(values: ReviewClassification[]): ReviewClassification[] {
  const byKey = new Map(values.map((value) => [classificationKey(value), value]));
  return Array.from(byKey.values()).sort((a, b) =>
    classificationKey(a).localeCompare(classificationKey(b)));
}

function proposalItem(item: PacketDealReview): ReviewQueueItem {
  if (!item.humanApprovalRequired || item.outcome !== "proposed-correction") {
    throw new Error(`Proposal ${item.dealId} is not eligible for the human approval queue`);
  }
  if (!item.proposedSportId || !item.proposedCanonicalEquipmentTypeId) {
    throw new Error(`Proposal ${item.dealId} has no canonical destination`);
  }
  return {
    key: `deal:${item.dealId}`,
    kind: "taxonomy-correction",
    dealId: item.dealId,
    identifier: null,
    title: item.title,
    representativeTitles: [item.title],
    sourceIds: [item.sourceId],
    sourceNames: [item.sourceName],
    sellers: uniqueSorted([item.seller]),
    currentClassifications: [{
      sportId: item.currentSportId,
      equipmentTypeId: item.currentEquipmentTypeId,
    }],
    proposedClassification: {
      sportId: item.proposedSportId,
      equipmentTypeId: item.proposedCanonicalEquipmentTypeId,
    },
    availability: item.availability,
    priority: item.priority,
    confidence: item.confidence,
    reason: item.reason,
    evidence: [...item.evidence],
    negativeEvidence: [...item.negativeEvidence],
    identifierEvidence: [...item.identifierEvidence],
  };
}

function identifierItem(item: PacketIdentifierReview): ReviewQueueItem {
  if (!item.supportedRecommendation
      || !item.humanApprovalRequired
      || item.consensusEligible !== false) {
    throw new Error(
      `Identifier ${item.identifierType}:${item.identifierValue} is not eligible for review`,
    );
  }
  const recommendation = item.supportedRecommendation;
  return {
    key: `identifier:${item.identifierType}:${item.scope}:${item.identifierValue}`,
    kind: "identifier-recommendation",
    dealId: null,
    identifier: {
      type: item.identifierType,
      value: item.identifierValue,
      scope: item.scope,
    },
    title: `${item.identifierType} ${item.identifierValue}`,
    representativeTitles: uniqueSorted(item.records.map((record) => record.title)),
    sourceIds: uniqueSorted(item.records.map((record) => record.sourceId)),
    sourceNames: uniqueSorted(item.records.map((record) => record.sourceName)),
    sellers: uniqueSorted(item.records.map((record) => record.seller)),
    currentClassifications: uniqueClassifications(item.records.map((record) => ({
      sportId: record.currentSportId,
      equipmentTypeId: record.currentEquipmentTypeId,
    }))),
    proposedClassification: {
      sportId: recommendation.sportId,
      equipmentTypeId: recommendation.canonicalEquipmentTypeId,
    },
    availability: item.priority.availability
      ?? (item.records.some((record) => record.availability === "available")
        ? "available"
        : item.records.every((record) => record.availability === "unavailable")
          ? "unavailable" : "unknown"),
    priority: item.priority,
    confidence: item.confidence,
    reason: item.reason,
    evidence: [...item.evidence, ...recommendation.directEvidence],
    negativeEvidence: [],
    identifierEvidence: [
      `${item.identifierType} ${item.identifierValue} (${item.scope})`,
      `independently supported by ${recommendation.supportingDealIds.length} deal records`,
    ],
  };
}

function assertCount(label: string, expected: number, actual: number): void {
  if (expected !== actual) {
    throw new Error(`${label} count mismatch: summary=${expected}, records=${actual}`);
  }
}

export function importTaxonomyReviewPacket(
  jsonText: string,
  auditBundleIdentity: string,
): TaxonomyReviewWorkspace {
  if (!/^sha256:[a-f0-9]{64}$/.test(auditBundleIdentity)) {
    throw new Error("Audit bundle identity must be a SHA-256 identity");
  }
  const packet = parsePacket(jsonText);
  assertCount(
    "Proposed correction",
    packet.summary.proposedCorrections,
    packet.proposedCorrections.length,
  );
  assertCount(
    "Supported identifier recommendation",
    packet.summary.supportedIdentifierRecommendations,
    packet.likelySameProductConflicts.length,
  );
  assertCount(
    "Identifier quarantine",
    packet.summary.identifierQuarantine,
    packet.identifierQuarantine.length,
  );
  assertCount(
    "Unresolved/manual",
    packet.summary.unresolvedManualReview,
    packet.unresolvedManualReview.length,
  );

  const queueItems = [
    ...packet.proposedCorrections.map(proposalItem),
    ...packet.likelySameProductConflicts.map(identifierItem),
  ].sort((a, b) => a.key.localeCompare(b.key));
  const queueKeys = new Set<string>();
  for (const item of queueItems) {
    if (queueKeys.has(item.key)) throw new Error(`Duplicate review queue key: ${item.key}`);
    queueKeys.add(item.key);
  }

  return {
    auditBundleIdentity,
    generatedAt: packet.metadata.generatedAt,
    ruleVersion: packet.metadata.ruleVersion,
    counts: {
      proposedCorrections: packet.proposedCorrections.length,
      unresolvedManualReview: packet.unresolvedManualReview.length,
      supportedIdentifierRecommendations: packet.likelySameProductConflicts.length,
      identifierQuarantine: packet.identifierQuarantine.length,
      totalIdentifierFindings:
        packet.likelySameProductConflicts.length + packet.identifierQuarantine.length,
    },
    queueItems,
  };
}

export async function sha256AuditBundle(jsonText: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(jsonText),
  );
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function hasTaxonomyReviewAdminAccess(user: unknown): boolean {
  return !!user && typeof user === "object"
    && (user as { isAdmin?: unknown }).isAdmin === true;
}

export function defaultReviewFilters(): ReviewFilters {
  return {
    priority: "all",
    source: "all",
    currentClassification: "all",
    proposedDestination: "all",
    availability: "all",
    reviewStatus: "all",
  };
}

export function filterReviewQueue(
  queueItems: ReviewQueueItem[],
  decisions: ReadonlyMap<string, TaxonomyReviewDecision>,
  filters: ReviewFilters,
): ReviewQueueItem[] {
  return queueItems.filter((item) => {
    const status = decisions.get(item.key)?.decision ?? "undecided";
    return (filters.priority === "all" || item.priority.level === filters.priority)
      && (filters.source === "all" || item.sourceIds.includes(filters.source))
      && (filters.currentClassification === "all"
        || item.currentClassifications.some((value) =>
          classificationKey(value) === filters.currentClassification))
      && (filters.proposedDestination === "all"
        || classificationKey(item.proposedClassification) === filters.proposedDestination)
      && (filters.availability === "all" || item.availability === filters.availability)
      && (filters.reviewStatus === "all" || status === filters.reviewStatus);
  });
}

export function createTaxonomyReviewDecision(
  workspace: TaxonomyReviewWorkspace,
  input: {
    itemKey: string;
    decision: ReviewDecisionValue;
    reviewer: string;
    reviewedAt: string;
    reviewerNote?: string | null;
  },
): TaxonomyReviewDecision {
  const item = workspace.queueItems.find((candidate) => candidate.key === input.itemKey);
  if (!item) {
    throw new Error("Decisions are allowed only for proposed corrections and supported identifiers");
  }
  if (!["approve", "reject", "defer"].includes(input.decision)) {
    throw new Error("Decision must be approve, reject, or defer");
  }
  const reviewer = input.reviewer.trim();
  if (!reviewer) throw new Error("Reviewer identity is required");
  const reviewedAt = new Date(input.reviewedAt);
  if (!Number.isFinite(reviewedAt.getTime()) || reviewedAt.toISOString() !== input.reviewedAt) {
    throw new Error("Decision timestamp must be an ISO-8601 UTC timestamp");
  }
  const note = input.reviewerNote?.trim() || null;
  return {
    itemKey: item.key,
    queueKind: item.kind,
    dealId: item.dealId,
    identifierType: item.identifier?.type ?? null,
    identifierValue: item.identifier?.value ?? null,
    identifierScope: item.identifier?.scope ?? null,
    title: item.title,
    sourceIds: [...item.sourceIds],
    originalClassifications: item.currentClassifications.map((value) => ({ ...value })),
    proposedClassification: { ...item.proposedClassification },
    decision: input.decision,
    reviewer,
    reviewedAt: input.reviewedAt,
    reviewerNote: note,
    reviewPriority: item.priority.level,
    confidence: item.confidence,
    ruleVersion: workspace.ruleVersion,
    auditBundleIdentity: workspace.auditBundleIdentity,
  };
}

export function updateTaxonomyReviewDecisionNote(
  decisions: ReadonlyMap<string, TaxonomyReviewDecision>,
  itemKey: string,
  reviewerNote: string,
): Map<string, TaxonomyReviewDecision> {
  const existing = decisions.get(itemKey);
  if (!existing) return new Map(decisions);
  const next = new Map(decisions);
  next.set(itemKey, {
    ...existing,
    reviewerNote: reviewerNote.trim() || null,
  });
  return next;
}

function sortedDecisions(
  workspace: TaxonomyReviewWorkspace,
  decisions: Iterable<TaxonomyReviewDecision>,
): TaxonomyReviewDecision[] {
  const eligibleKeys = new Set(workspace.queueItems.map((item) => item.key));
  return Array.from(decisions, (decision) => {
    if (!eligibleKeys.has(decision.itemKey)) {
      throw new Error(`Decision ${decision.itemKey} is outside the approval queue`);
    }
    if (decision.auditBundleIdentity !== workspace.auditBundleIdentity
        || decision.ruleVersion !== workspace.ruleVersion) {
      throw new Error(`Decision ${decision.itemKey} does not belong to this audit packet`);
    }
    return decision;
  }).sort((a, b) => a.itemKey.localeCompare(b.itemKey));
}

export function taxonomyReviewDecisionsJson(
  workspace: TaxonomyReviewWorkspace,
  decisions: Iterable<TaxonomyReviewDecision>,
): string {
  const rows = sortedDecisions(workspace, decisions);
  return `${JSON.stringify({
    formatVersion: TAXONOMY_REVIEW_EXPORT_VERSION,
    auditBundleIdentity: workspace.auditBundleIdentity,
    ruleVersion: workspace.ruleVersion,
    sourcePacketGeneratedAt: workspace.generatedAt,
    readOnlyReview: true,
    applySupported: false,
    decisionCount: rows.length,
    decisions: rows,
  }, null, 2)}\n`;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function taxonomyReviewDecisionsCsv(
  workspace: TaxonomyReviewWorkspace,
  decisions: Iterable<TaxonomyReviewDecision>,
): string {
  const columns = [
    "itemKey", "queueKind", "dealId", "identifierType", "identifierValue",
    "identifierScope", "title", "sourceIds", "originalClassifications",
    "proposedSportId", "proposedEquipmentTypeId", "decision", "reviewer",
    "reviewedAt", "reviewerNote", "reviewPriority", "confidence", "ruleVersion",
    "auditBundleIdentity",
  ] as const;
  const lines = [columns.join(",")];
  for (const row of sortedDecisions(workspace, decisions)) {
    const values: Record<(typeof columns)[number], unknown> = {
      itemKey: row.itemKey,
      queueKind: row.queueKind,
      dealId: row.dealId,
      identifierType: row.identifierType,
      identifierValue: row.identifierValue,
      identifierScope: row.identifierScope,
      title: row.title,
      sourceIds: row.sourceIds.join(" | "),
      originalClassifications: row.originalClassifications
        .map(classificationKey).join(" | "),
      proposedSportId: row.proposedClassification.sportId,
      proposedEquipmentTypeId: row.proposedClassification.equipmentTypeId,
      decision: row.decision,
      reviewer: row.reviewer,
      reviewedAt: row.reviewedAt,
      reviewerNote: row.reviewerNote,
      reviewPriority: row.reviewPriority,
      confidence: row.confidence,
      ruleVersion: row.ruleVersion,
      auditBundleIdentity: row.auditBundleIdentity,
    };
    lines.push(columns.map((column) => csvCell(values[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}
