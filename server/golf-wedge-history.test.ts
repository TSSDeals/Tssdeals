import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalGolfWedge,
  type GolfWedgeAuditProposal,
} from "./golf-wedge-history";

function proposal(title: string): GolfWedgeAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "Twin Seam Collective",
    currentSportId: "golf",
    currentEquipmentTypeId: "golf-other",
    proposedSportId: "golf",
    proposedCanonicalEquipmentTypeId: "golf-wedges",
    confidence: "medium",
  };
}

test("approves explicit wedge clubs and full club configurations", () => {
  assert.equal(isApprovedHistoricalGolfWedge(proposal(
    "Mizuno Pro T1 Wedge White Satin – Right Hand / True Temper Tour Issue S400 / 54.08 M",
  )), true);
  assert.equal(isApprovedHistoricalGolfWedge(proposal(
    "Callaway Opus SP Black Shadow Sand Wedge – Left Hand / 56.10 S",
  )), true);
});

test("rejects wedge accessories, apparel, collectibles, and memorabilia", () => {
  assert.equal(isApprovedHistoricalGolfWedge(proposal(
    "Golf wedge replacement shaft",
  )), false);
  assert.equal(isApprovedHistoricalGolfWedge(proposal(
    "Wedge headcover",
  )), false);
  assert.equal(isApprovedHistoricalGolfWedge(proposal(
    "Signed Cleveland wedge",
  )), false);
});

test("rejects vague clubs, low confidence, and destination mismatches", () => {
  assert.equal(isApprovedHistoricalGolfWedge(proposal(
    "Cleveland golf club",
  )), false);
  const low = proposal("Cleveland RTX Wedge 54 Degree");
  low.confidence = "low";
  assert.equal(isApprovedHistoricalGolfWedge(low), false);
  const wrong = proposal("Cleveland RTX Wedge 54 Degree");
  wrong.proposedCanonicalEquipmentTypeId = "golf-putters";
  assert.equal(isApprovedHistoricalGolfWedge(wrong), false);
});
