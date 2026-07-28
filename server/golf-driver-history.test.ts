import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalGolfDriver,
  type GolfDriverAuditProposal,
} from "./golf-driver-history";

function proposal(
  title: string,
  currentSportId: string | null = "golf",
): GolfDriverAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "Twin Seam Collective",
    currentSportId,
    currentEquipmentTypeId: currentSportId === "golf" ? "golf-other" : "bb-other",
    proposedSportId: "golf",
    proposedCanonicalEquipmentTypeId: "golf-drivers",
    confidence: "medium",
  };
}

test("approves explicit golf drivers from the reviewed cohort", () => {
  assert.equal(isApprovedHistoricalGolfDriver(proposal(
    "TaylorMade Qi35 Driver — Right / 10.5 / Fujikura VENTUS Blue 5 Stiff Flex",
  )), true);
  assert.equal(isApprovedHistoricalGolfDriver(proposal(
    "Titleist GT3 Driver — Right Hand / Mitsubishi Tensei 1K Blue 55 Regular Flex / 10.0",
  )), true);
  assert.equal(isApprovedHistoricalGolfDriver(proposal(
    "Srixon ZXi LS Driver — Right Hand / 9.0 / Project X HZRDUS Black Gen 5 X-Stiff Flex",
  )), true);
});

test("approves reviewed DYNAPWR drivers incorrectly stored under baseball", () => {
  assert.equal(isApprovedHistoricalGolfDriver(proposal(
    "Wilson DYNAPWR Max Driver Lite - Size Women’s",
    "baseball",
  )), true);
  assert.equal(isApprovedHistoricalGolfDriver(proposal(
    "DYNAPWR Carbon Driver",
    "baseball",
  )), true);
});

test("rejects team-logo accessories, vehicle parts, and other driver meanings", () => {
  assert.equal(isApprovedHistoricalGolfDriver(proposal(
    "Hometown Brands St. Louis Cardinals Team Logo Driver",
    "baseball",
  )), false);
  assert.equal(isApprovedHistoricalGolfDriver(proposal(
    "Fit System Driver Side Heated Mirror Glass w/Backing Driver Side (LH)",
    "football",
  )), false);
  assert.equal(isApprovedHistoricalGolfDriver(proposal(
    "Golf Driver Headcover",
  )), false);
  assert.equal(isApprovedHistoricalGolfDriver(proposal(
    "Replacement Driver Shaft Only",
  )), false);
});

test("rejects vague, low-confidence, and destination-mismatched records", () => {
  assert.equal(isApprovedHistoricalGolfDriver(proposal(
    "Professional Driver",
    "baseball",
  )), false);
  const low = proposal("TaylorMade Qi35 Driver");
  low.confidence = "low";
  assert.equal(isApprovedHistoricalGolfDriver(low), false);
  const wrong = proposal("TaylorMade Qi35 Driver");
  wrong.proposedCanonicalEquipmentTypeId = "golf-other";
  assert.equal(isApprovedHistoricalGolfDriver(wrong), false);
});
