import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalRunningShoe,
  type RunningShoeAuditProposal,
} from "./running-shoe-history";

function proposal(title: string): RunningShoeAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "Holabird Sports",
    currentSportId: "swimming",
    currentEquipmentTypeId: "swim-other",
    proposedSportId: "running",
    proposedCanonicalEquipmentTypeId: "run-shoes",
    confidence: "medium",
  };
}

test("approves explicitly labeled road and trail running shoes", () => {
  assert.equal(isApprovedHistoricalRunningShoe(proposal(
    "On Cloudboom Max Women's Running Shoes White/Black Size 6.5",
  )), true);
  assert.equal(isApprovedHistoricalRunningShoe(proposal(
    "HOKA Mafate 5 Men's Trail Running Shoes Cement/Black Size 8.5",
  )), true);
});

test("rejects accessories, apparel, collectibles, and memorabilia", () => {
  assert.equal(isApprovedHistoricalRunningShoe(proposal(
    "Running shoe replacement insoles",
  )), false);
  assert.equal(isApprovedHistoricalRunningShoe(proposal(
    "Running Shoes graphic hoodie",
  )), false);
  assert.equal(isApprovedHistoricalRunningShoe(proposal(
    "Signed trail running shoe",
  )), false);
});

test("rejects vague footwear, low confidence, and destination mismatches", () => {
  assert.equal(isApprovedHistoricalRunningShoe(proposal(
    "Athletic shoe size 10",
  )), false);
  const low = proposal("Brooks Ghost Running Shoes Size 10");
  low.confidence = "low";
  assert.equal(isApprovedHistoricalRunningShoe(low), false);
  const wrong = proposal("Brooks Ghost Running Shoes Size 10");
  wrong.proposedSportId = "basketball";
  wrong.proposedCanonicalEquipmentTypeId = "bk-shoes-apparel";
  assert.equal(isApprovedHistoricalRunningShoe(wrong), false);
});
