import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalGolfPutter,
  type GolfPutterAuditProposal,
} from "./golf-putter-history";

function proposal(title: string): GolfPutterAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "Twin Seam Collective",
    currentSportId: "golf",
    currentEquipmentTypeId: "golf-other",
    proposedSportId: "golf",
    proposedCanonicalEquipmentTypeId: "golf-putters",
    confidence: "medium",
  };
}

test("approves explicit putter clubs and full stock-shaft configurations", () => {
  assert.equal(isApprovedHistoricalGolfPutter(proposal(
    "Wilson Infinite Bean Putter – Right / Stock Steel Shaft / 35",
  )), true);
  assert.equal(isApprovedHistoricalGolfPutter(proposal(
    "TaylorMade Spider Tour Counter Balance Putter – Right Hand / 35",
  )), true);
});

test("rejects markers, holders, covers, replacement parts, and training aids", () => {
  assert.equal(isApprovedHistoricalGolfPutter(proposal(
    "Ball Marker Magnetic Putter Grip Golf Ball Marker Holder",
  )), false);
  assert.equal(isApprovedHistoricalGolfPutter(proposal(
    "Scotty Cameron putter headcover",
  )), false);
  assert.equal(isApprovedHistoricalGolfPutter(proposal(
    "Putter replacement shaft only",
  )), false);
  assert.equal(isApprovedHistoricalGolfPutter(proposal(
    "Indoor putter training mat",
  )), false);
});

test("rejects vague clubs, memorabilia, low confidence, and destination mismatches", () => {
  assert.equal(isApprovedHistoricalGolfPutter(proposal(
    "Odyssey golf club",
  )), false);
  assert.equal(isApprovedHistoricalGolfPutter(proposal(
    "Signed Odyssey putter",
  )), false);
  const low = proposal("Odyssey Ai-One Putter 35");
  low.confidence = "low";
  assert.equal(isApprovedHistoricalGolfPutter(low), false);
  const wrong = proposal("Odyssey Ai-One Putter 35");
  wrong.proposedCanonicalEquipmentTypeId = "golf-wedges";
  assert.equal(isApprovedHistoricalGolfPutter(wrong), false);
});
