import assert from "node:assert/strict";
import test from "node:test";
import {
  isSafeIdentityApproval,
  safeIdentityApprovalBatch,
  type IdentityReviewCandidate,
} from "./product-identity-review";

function candidate(overrides: Partial<IdentityReviewCandidate> = {}): IdentityReviewCandidate {
  return {
    deal_id: "deal-1",
    confidence: "high",
    evidence: [
      "canonical brand",
      "recognized A2K model family in title",
      "stored non-Other sport and equipment classification",
      "model/style code",
    ],
    title: "Wilson A2K 1786 11.5 Baseball Glove",
    deal_sport_id: "baseball",
    deal_equipment_type_id: "bb-gloves",
    canonical_brand: "Wilson",
    product_family: "A2K",
    model_code: "1786",
    sport_id: "baseball",
    equipment_type_id: "bb-gloves",
    identity_confidence: "high",
    variant: {},
    ...overrides,
  };
}

test("safe approval requires matching high-confidence classifications and title model evidence", () => {
  assert.equal(isSafeIdentityApproval(candidate()), true);
  assert.equal(isSafeIdentityApproval(candidate({ confidence: "medium" })), false);
  assert.equal(isSafeIdentityApproval(candidate({ deal_sport_id: "fastpitch-softball" })), false);
  assert.equal(isSafeIdentityApproval(candidate({
    evidence: ["canonical brand", "structured model or product-family field", "model/style code"],
  })), false);
});

test("safe approval accepts two exact variant facts when a model code is absent", () => {
  assert.equal(isSafeIdentityApproval(candidate({
    model_code: null,
    evidence: [
      "canonical brand",
      "recognized R9 model family in title",
      "stored non-Other sport and equipment classification",
      "size",
      "throw hand",
    ],
  })), true);
  assert.equal(isSafeIdentityApproval(candidate({
    model_code: null,
    evidence: [
      "canonical brand",
      "recognized R9 model family in title",
      "stored non-Other sport and equipment classification",
      "size",
    ],
  })), false);
});

test("safe approval batches are capped at 25", () => {
  const rows = Array.from({ length: 40 }, (_, index) => candidate({ deal_id: `deal-${index}` }));
  assert.equal(safeIdentityApprovalBatch(rows, 40).length, 25);
});

test("safe approval recognizes exact golf configuration evidence", () => {
  assert.equal(isSafeIdentityApproval(candidate({
    title: "TaylorMade Qi10 Driver 10.5 Degree RH Stiff",
    deal_sport_id: "golf",
    sport_id: "golf",
    deal_equipment_type_id: "golf-drivers",
    equipment_type_id: "golf-drivers",
    canonical_brand: "TaylorMade",
    product_family: "Qi10",
    model_code: null,
    evidence: [
      "canonical brand",
      "recognized Qi10 model family in title",
      "stored non-Other sport and equipment classification",
      "golf handedness",
      "golf loft",
      "shaft flex",
    ],
  })), true);
});
