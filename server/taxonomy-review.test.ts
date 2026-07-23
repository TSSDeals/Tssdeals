import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  createTaxonomyReviewDecision,
  defaultReviewFilters,
  filterReviewQueue,
  hasTaxonomyReviewAdminAccess,
  importTaxonomyReviewPacket,
  sha256AuditBundle,
  taxonomyReviewDecisionsCsv,
  taxonomyReviewDecisionsJson,
  updateTaxonomyReviewDecisionNote,
  type TaxonomyReviewDecision,
} from "../shared/taxonomy-review";

const BUNDLE_IDENTITY = `sha256:${"a".repeat(64)}`;

function priority(level: "critical" | "high" | "medium" | "low", score: number) {
  return {
    level,
    score,
    affectedRecordCount: 4,
    shopperVisibleFragmentation: true,
    evidenceStrength: "medium",
    sourceId: "academy-sports",
    sourceReviewRecordCount: 5,
    availability: "available",
  };
}

function packetFixture() {
  return {
    metadata: {
      generatedAt: "2026-07-23T02:41:13.097Z",
      ruleVersion: "phase1.5-read-only-v1",
      mode: "read-only",
      applySupported: false,
      baselineEvidence: "phase1.4-production-audit-offline",
    },
    summary: {
      proposedCorrections: 2,
      likelySameProductFindings: 2,
      supportedIdentifierRecommendations: 1,
      identifierQuarantine: 1,
      unresolvedManualReview: 1,
    },
    proposedCorrections: [
      {
        dealId: "deal-bat",
        title: "Easton Hype Fire 27/17 USSSA Baseball Bat",
        sourceId: "academy-sports",
        sourceName: "Academy Sports + Outdoors",
        seller: null,
        availability: "available",
        availabilityEvidence: "raw wcInStock: true",
        currentSportId: "baseball",
        currentEquipmentTypeId: "bb-other",
        proposedSportId: "baseball",
        proposedCanonicalEquipmentTypeId: "bb-bats",
        equipmentFamily: "bat",
        evidence: ["specific Baseball bat evidence"],
        negativeEvidence: [],
        identifierEvidence: ["itemNumber A-100 has no eligible consensus"],
        confidence: "medium",
        reason: "Strong compatible bat evidence identifies a canonical destination.",
        humanApprovalRequired: true,
        status: "proposed",
        outcome: "proposed-correction",
        priority: priority("critical", 82),
      },
      {
        dealId: "deal-glove",
        title: "Wilson A2000 1786 11.5 Baseball Glove",
        sourceId: "impact-wilson",
        sourceName: "Wilson Sporting Goods Co",
        seller: "Wilson",
        availability: "unknown",
        availabilityEvidence: null,
        currentSportId: "baseball",
        currentEquipmentTypeId: "bb-balls",
        proposedSportId: "baseball",
        proposedCanonicalEquipmentTypeId: "bb-gloves",
        equipmentFamily: "fielding-glove",
        evidence: ["specific Baseball fielding-glove evidence"],
        negativeEvidence: ["no batting-glove evidence"],
        identifierEvidence: ["validated UPC reinforces identity only"],
        confidence: "high",
        reason: "Direct fielding-glove evidence conflicts with the stored group.",
        humanApprovalRequired: true,
        status: "proposed",
        outcome: "proposed-correction",
        priority: { ...priority("high", 68), availability: "unknown" },
      },
    ],
    likelySameProductConflicts: [
      {
        kind: "likely-same-product-conflict",
        identifierType: "itemNumber",
        identifierValue: "WZ4006501XB7",
        scope: "source:impact-wilson",
        currentIds: ["baseball/bb-other", "basketball/bk-balls"],
        recordCount: 2,
        evidence: ["source-scoped item number", "direct Basketball evidence agrees"],
        reason: "Translated products share identity and independently agree on Basketball.",
        confidence: "high",
        humanApprovalRequired: true,
        consensusEligible: false,
        quarantineReason: null,
        supportedRecommendation: {
          sportId: "basketball",
          canonicalEquipmentTypeId: "bk-balls",
          equipmentFamily: "ball",
          supportingDealIds: ["wilson-en", "wilson-es"],
          directEvidence: [
            "wilson-en: specific Basketball evidence",
            "wilson-es: specific Basketball evidence",
          ],
        },
        records: [
          {
            dealId: "wilson-en",
            title: "Wilson NBA Outdoor Basketball",
            sourceId: "impact-wilson",
            sourceName: "Wilson Sporting Goods Co",
            seller: null,
            currentSportId: "basketball",
            currentEquipmentTypeId: "bk-balls",
            availability: "available",
          },
          {
            dealId: "wilson-es",
            title: "Wilson Balón de baloncesto NBA",
            sourceId: "impact-wilson",
            sourceName: "Wilson Sporting Goods Co",
            seller: null,
            currentSportId: "baseball",
            currentEquipmentTypeId: "bb-other",
            availability: "unknown",
          },
        ],
        priority: { ...priority("critical", 80), sourceId: "impact-wilson" },
      },
    ],
    identifierQuarantine: [
      {
        kind: "unsafe-identifier-reuse",
        identifierType: "sku",
        identifierValue: "12345",
        scope: "quarantine",
        supportedRecommendation: null,
      },
    ],
    unresolvedManualReview: [
      {
        dealId: "manual-only",
        title: "Ambiguous sporting goods item",
        proposedCanonicalEquipmentTypeId: null,
      },
    ],
  };
}

function workspace() {
  return importTaxonomyReviewPacket(JSON.stringify(packetFixture()), BUNDLE_IDENTITY);
}

test("taxonomy review access follows the existing server-issued admin flag", () => {
  assert.equal(hasTaxonomyReviewAdminAccess(null), false);
  assert.equal(hasTaxonomyReviewAdminAccess({}), false);
  assert.equal(hasTaxonomyReviewAdminAccess({ isAdmin: false }), false);
  assert.equal(hasTaxonomyReviewAdminAccess({ isAdmin: "true" }), false);
  assert.equal(hasTaxonomyReviewAdminAccess({ isAdmin: true }), true);

  const page = readFileSync(
    join(process.cwd(), "client/src/pages/AdminTaxonomyReview.tsx"),
    "utf8",
  );
  assert.match(page, /hasTaxonomyReviewAdminAccess\(user\)/);
  assert.match(page, /Admin sign-in required/);
  assert.match(page, /Admin Access Only/);
});

test("approval queue contains only proposed corrections and supported identifiers", () => {
  const review = workspace();
  assert.deepEqual(review.counts, {
    proposedCorrections: 2,
    unresolvedManualReview: 1,
    supportedIdentifierRecommendations: 1,
    identifierQuarantine: 1,
    totalIdentifierFindings: 2,
  });
  assert.equal(review.queueItems.length, 3);
  assert.equal(
    review.queueItems.filter((item) => item.kind === "taxonomy-correction").length,
    2,
  );
  assert.equal(
    review.queueItems.filter((item) => item.kind === "identifier-recommendation").length,
    1,
  );
  assert.ok(!review.queueItems.some((item) => item.key.includes("manual-only")));
  assert.ok(!review.queueItems.some((item) => item.key.includes("12345")));

  assert.throws(() => createTaxonomyReviewDecision(review, {
    itemKey: "deal:manual-only",
    decision: "approve",
    reviewer: "admin@example.com",
    reviewedAt: "2026-07-23T03:00:00.000Z",
  }), /only for proposed corrections and supported identifiers/i);
  assert.throws(() => createTaxonomyReviewDecision(review, {
    itemKey: "identifier:sku:quarantine:12345",
    decision: "approve",
    reviewer: "admin@example.com",
    reviewedAt: "2026-07-23T03:00:00.000Z",
  }), /only for proposed corrections and supported identifiers/i);
});

test("packet validation rejects mutation-capable and inconsistent inputs", () => {
  const mutating = packetFixture();
  mutating.metadata.applySupported = true;
  assert.throws(
    () => importTaxonomyReviewPacket(JSON.stringify(mutating), BUNDLE_IDENTITY),
    /only read-only audit packets|applySupported/i,
  );

  const mismatched = packetFixture();
  mismatched.summary.proposedCorrections = 999;
  assert.throws(
    () => importTaxonomyReviewPacket(JSON.stringify(mismatched), BUNDLE_IDENTITY),
    /count mismatch/i,
  );

  const unsupported = packetFixture();
  unsupported.likelySameProductConflicts[0].supportedRecommendation = null;
  assert.throws(
    () => importTaxonomyReviewPacket(JSON.stringify(unsupported), BUNDLE_IDENTITY),
    /not eligible for review/i,
  );
});

test("filters cover priority, source, classifications, availability, and review status", () => {
  const review = workspace();
  const bat = review.queueItems.find((item) => item.key === "deal:deal-bat");
  assert.ok(bat);
  assert.equal(bat.priority.level, "critical");
  assert.equal(bat.confidence, "medium");

  const decision = createTaxonomyReviewDecision(review, {
    itemKey: bat.key,
    decision: "defer",
    reviewer: "admin@example.com",
    reviewedAt: "2026-07-23T03:00:00.000Z",
    reviewerNote: "Needs retailer confirmation",
  });
  const decisions = new Map([[decision.itemKey, decision]]);

  assert.deepEqual(filterReviewQueue(review.queueItems, decisions, {
    ...defaultReviewFilters(),
    priority: "critical",
    source: "academy-sports",
    currentClassification: "baseball/bb-other",
    proposedDestination: "baseball/bb-bats",
    availability: "available",
    reviewStatus: "defer",
  }).map((item) => item.key), ["deal:deal-bat"]);

  assert.equal(filterReviewQueue(review.queueItems, decisions, {
    ...defaultReviewFilters(),
    reviewStatus: "undecided",
  }).length, 2);
});

test("decision exports are deterministic and retain the complete review identity", () => {
  const review = workspace();
  const dealDecision = createTaxonomyReviewDecision(review, {
    itemKey: "deal:deal-glove",
    decision: "reject",
    reviewer: "admin@example.com",
    reviewedAt: "2026-07-23T03:01:00.000Z",
    reviewerNote: "Stored listing needs manual verification",
  });
  const identifier = review.queueItems.find((item) =>
    item.kind === "identifier-recommendation");
  assert.ok(identifier);
  const identifierDecision = createTaxonomyReviewDecision(review, {
    itemKey: identifier.key,
    decision: "approve",
    reviewer: "admin@example.com",
    reviewedAt: "2026-07-23T03:00:00.000Z",
  });

  const forward = [dealDecision, identifierDecision];
  const reverse = [identifierDecision, dealDecision];
  const json = taxonomyReviewDecisionsJson(review, forward);
  assert.equal(json, taxonomyReviewDecisionsJson(review, reverse));
  const parsed = JSON.parse(json);
  assert.equal(parsed.applySupported, false);
  assert.equal(parsed.readOnlyReview, true);
  assert.equal(parsed.auditBundleIdentity, BUNDLE_IDENTITY);
  assert.equal(parsed.ruleVersion, "phase1.5-read-only-v1");
  assert.equal(parsed.decisionCount, 2);
  assert.deepEqual(parsed.decisions.map((row: TaxonomyReviewDecision) => row.itemKey), [
    "deal:deal-glove",
    identifier.key,
  ]);
  assert.deepEqual(parsed.decisions[0].originalClassifications, [{
    sportId: "baseball",
    equipmentTypeId: "bb-balls",
  }]);
  assert.equal(parsed.decisions[1].identifierValue, "WZ4006501XB7");
  assert.deepEqual(parsed.decisions[1].proposedClassification, {
    sportId: "basketball",
    equipmentTypeId: "bk-balls",
  });

  const csv = taxonomyReviewDecisionsCsv(review, reverse);
  assert.equal(csv, taxonomyReviewDecisionsCsv(review, forward));
  assert.match(csv, /^itemKey,queueKind,dealId,identifierType,/);
  assert.match(csv, /admin@example\.com/);
  assert.match(csv, /phase1\.5-read-only-v1/);
  assert.match(csv, new RegExp(BUNDLE_IDENTITY));
});

test("note-only edits update both exports without changing decision or timestamp", () => {
  const review = workspace();
  const original = createTaxonomyReviewDecision(review, {
    itemKey: "deal:deal-bat",
    decision: "approve",
    reviewer: "admin@example.com",
    reviewedAt: "2026-07-23T03:05:00.000Z",
    reviewerNote: "Initial note",
  });
  const decisions = updateTaxonomyReviewDecisionNote(
    new Map([[original.itemKey, original]]),
    original.itemKey,
    "Latest visible reviewer note",
  );
  const updated = decisions.get(original.itemKey);
  assert.ok(updated);
  assert.equal(updated.reviewerNote, "Latest visible reviewer note");
  assert.equal(updated.decision, "approve");
  assert.equal(updated.reviewedAt, "2026-07-23T03:05:00.000Z");

  const json = taxonomyReviewDecisionsJson(review, decisions.values());
  const csv = taxonomyReviewDecisionsCsv(review, decisions.values());
  assert.match(json, /"reviewerNote": "Latest visible reviewer note"/);
  assert.match(csv, /Latest visible reviewer note/);
  assert.doesNotMatch(json, /Initial note/);
  assert.doesNotMatch(csv, /Initial note/);
  assert.match(json, /"decision": "approve"/);
  assert.match(json, /"reviewedAt": "2026-07-23T03:05:00.000Z"/);
});

test("bundle identity is a deterministic SHA-256 of the imported packet bytes", async () => {
  assert.equal(
    await sha256AuditBundle("{}"),
    "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
  );
});

test("Phase 1.6 files expose no database, API, persistence, or apply path", () => {
  const files = [
    "shared/taxonomy-review.ts",
    "client/src/pages/AdminTaxonomyReview.tsx",
  ];
  const forbidden = [
    /\bapiRequest\s*\(/,
    /\bfetch\s*\(/,
    /\bdb\./,
    /\bstorage\./,
    /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|TRUNCATE\s+TABLE)\b/i,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
  ];
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
    }
  }
  assert.equal(existsSync(join(process.cwd(), "taxonomy-audit-output-phase1-5")), false);
  assert.equal(
    existsSync(join(process.cwd(), "taxonomy-review-packet.json")),
    false,
  );
});
