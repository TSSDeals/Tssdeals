import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedIdentifierTaxonomyChanges,
  type IdentifierTaxonomyReview,
} from "./identifier-taxonomy-history";

function review(overrides: Partial<IdentifierTaxonomyReview> = {}): IdentifierTaxonomyReview {
  return {
    kind: "likely-same-product-conflict",
    identifierType: "upc",
    confidence: "high",
    humanApprovalRequired: true,
    consensusEligible: false,
    supportedRecommendation: {
      sportId: "baseball",
      canonicalEquipmentTypeId: "bb-gloves",
      supportingDealIds: ["reference-1", "reference-2"],
      directEvidence: ["explicit fielding glove title", "structured Baseball Gloves category"],
    },
    records: [
      {
        dealId: "reference-1",
        title: "Wilson A2000 1786 Baseball Glove",
        currentSportId: "baseball",
        currentEquipmentTypeId: "bb-gloves",
      },
      {
        dealId: "target-1",
        title: "Wilson Guante Baseball A2000 1786",
        currentSportId: "baseball",
        currentEquipmentTypeId: "bb-other",
      },
    ],
    ...overrides,
  };
}

test("approves only mismatched records from independently supported UPC or item-number reviews", () => {
  const changes = approvedIdentifierTaxonomyChanges([
    review(),
    review({ identifierType: "itemNumber", records: [{
      dealId: "target-2",
      title: "Wilson A2000 1786 11.5",
      currentSportId: "baseball",
      currentEquipmentTypeId: "bb-other",
    }] }),
  ]);
  assert.deepEqual(changes.map((change) => change.dealId), ["target-1", "target-2"]);
  assert.deepEqual(changes[0].after, { sportId: "baseball", equipmentTypeId: "bb-gloves" });
});

test("rejects quarantined, weak, SKU, and under-supported reviews", () => {
  const cases = [
    review({ kind: "unresolved-collision" }),
    review({ confidence: "low" }),
    review({ humanApprovalRequired: false }),
    review({ consensusEligible: true }),
    review({ identifierType: "sku" }),
    review({ supportedRecommendation: null }),
    review({ supportedRecommendation: {
      sportId: "baseball", canonicalEquipmentTypeId: "bb-gloves",
      supportingDealIds: ["reference-1"], directEvidence: ["one", "two"],
    } }),
    review({ supportedRecommendation: {
      sportId: "baseball", canonicalEquipmentTypeId: "bb-gloves",
      supportingDealIds: ["reference-1", "reference-2"], directEvidence: ["one"],
    } }),
  ];
  for (const candidate of cases) {
    assert.deepEqual(approvedIdentifierTaxonomyChanges([candidate]), []);
  }
});

test("deduplicates agreeing identifiers and rejects conflicting destinations for one deal", () => {
  const agreeing = approvedIdentifierTaxonomyChanges([review(), review({ identifierType: "itemNumber" })]);
  assert.equal(agreeing.length, 1);

  const conflicting = review({
    identifierType: "itemNumber",
    supportedRecommendation: {
      sportId: "fastpitch-softball",
      canonicalEquipmentTypeId: "fp-gloves",
      supportingDealIds: ["reference-3", "reference-4"],
      directEvidence: ["explicit fastpitch glove", "structured fastpitch glove"],
    },
  });
  assert.deepEqual(approvedIdentifierTaxonomyChanges([review(), conflicting]), []);
});

test("never approves memorabilia titles into playable equipment", () => {
  const candidate = review({
    records: [
      {
        dealId: "reference",
        title: "Minnesota Twins Game-Used Baseball Panorama Collage",
        currentSportId: "baseball",
        currentEquipmentTypeId: "bb-balls",
      },
      {
        dealId: "translated",
        title: "Detroit Tigers Gerahmte Stadion-Panoramacollage mit einem Baseball",
        currentSportId: "baseball",
        currentEquipmentTypeId: "bb-other",
      },
    ],
    supportedRecommendation: {
      sportId: "baseball",
      canonicalEquipmentTypeId: "bb-balls",
      supportingDealIds: ["reference", "translated"],
      directEvidence: ["reference evidence", "translated evidence"],
    },
  });

  assert.deepEqual(approvedIdentifierTaxonomyChanges([candidate]), []);
});
