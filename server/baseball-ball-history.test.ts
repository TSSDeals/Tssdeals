import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalBaseballBall,
  type BaseballBallAuditProposal,
} from "./baseball-ball-history";

function proposal(title: string): BaseballBallAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "eBay",
    currentSportId: "baseball",
    currentEquipmentTypeId: "bb-other",
    proposedSportId: "baseball",
    proposedCanonicalEquipmentTypeId: "bb-balls",
    confidence: "medium",
  };
}

test("approves regulation, league, practice, and used playable baseballs", () => {
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "RLLB1 Little League Baseballs",
  )), true);
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "A1010S-Blem Practice Baseballs",
  )), true);
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "Lot of (4) Brand New ROMLB Rawlings Official Major League Baseballs",
  )), true);
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "Mixed Lot Of 28 Used High School Baseballs, 23 Leather, 5 Synthetic",
  )), true);
});

test("rejects safety, plastic, and other training-ball products", () => {
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "Markwort Safe-T-Ball Baseballs 12-Pack",
  )), false);
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "Champro Safe-T-Soft Baseballs: CBB61",
  )), false);
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "Champro Plastic Vented Baseballs: CBB51D",
  )), false);
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "Weighted Training Baseballs",
  )), false);
});

test("rejects memorabilia, display, holder, and novelty products", () => {
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "2 or 6Pack Blank Baseballs Solid Cork Core Unmarked Autograph Balls",
  )), false);
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "Signed Major League Baseball",
  )), false);
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "Baseball Display Cube Holder",
  )), false);
  assert.equal(isApprovedHistoricalBaseballBall(proposal(
    "Miniature Souvenir Baseball",
  )), false);
});

test("rejects vague, low-confidence, and destination-mismatched records", () => {
  assert.equal(isApprovedHistoricalBaseballBall(proposal("Official League Ball")), false);
  const low = proposal("Official League Baseballs");
  low.confidence = "low";
  assert.equal(isApprovedHistoricalBaseballBall(low), false);
  const wrong = proposal("Official League Baseballs");
  wrong.proposedCanonicalEquipmentTypeId = "bb-training";
  assert.equal(isApprovedHistoricalBaseballBall(wrong), false);
});
