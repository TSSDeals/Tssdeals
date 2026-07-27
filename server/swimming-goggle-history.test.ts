import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalSwimmingGoggle,
  type SwimmingGoggleAuditProposal,
} from "./swimming-goggle-history";

function proposal(title: string): SwimmingGoggleAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "Academy Sports + Outdoors",
    currentSportId: "swimming",
    currentEquipmentTypeId: "swim-other",
    proposedSportId: "swimming",
    proposedCanonicalEquipmentTypeId: "swim-goggles",
    confidence: "medium",
  };
}

test("approves genuine swim goggles from the reviewed historical cohort", () => {
  assert.equal(isApprovedHistoricalSwimmingGoggle(proposal(
    "Speedo Adults' Vanquisher 2.0 Mirrored Swim Goggles",
  )), true);
  assert.equal(isApprovedHistoricalSwimmingGoggle(proposal(
    "View Kids' SWIPE Swimming Goggles",
  )), true);
  assert.equal(isApprovedHistoricalSwimmingGoggle(proposal(
    "Speedo Youth Hydrospex Classic Swim Goggle",
  )), true);
  assert.equal(isApprovedHistoricalSwimmingGoggle(proposal(
    "Aqua2ude Kids' Unicorn Bow Multi Mask Swim Goggles",
  )), true);
});

test("rejects the reviewed goggle case and common goggle accessories", () => {
  assert.equal(isApprovedHistoricalSwimmingGoggle(proposal(
    "Nike Swim Goggle Case",
  )), false);
  assert.equal(isApprovedHistoricalSwimmingGoggle(proposal(
    "Replacement Lenses for Swimming Goggles",
  )), false);
  assert.equal(isApprovedHistoricalSwimmingGoggle(proposal(
    "Swim Goggles Replacement Strap",
  )), false);
  assert.equal(isApprovedHistoricalSwimmingGoggle(proposal(
    "Anti-Fog Spray for Swim Goggles",
  )), false);
});

test("rejects vague products, low confidence, and destination mismatches", () => {
  assert.equal(isApprovedHistoricalSwimmingGoggle(proposal(
    "Speedo Swim Accessories",
  )), false);
  const low = proposal("Speedo Vanquisher Swim Goggles");
  low.confidence = "low";
  assert.equal(isApprovedHistoricalSwimmingGoggle(low), false);
  const wrong = proposal("Speedo Vanquisher Swim Goggles");
  wrong.proposedCanonicalEquipmentTypeId = "swim-other";
  assert.equal(isApprovedHistoricalSwimmingGoggle(wrong), false);
});
