import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalProtectiveEquipment,
  type ProtectiveAuditProposal,
} from "./protective-equipment-history";

const proposal = (
  title: string,
  sportId = "baseball",
  equipmentTypeId = "bb-protective",
): ProtectiveAuditProposal => ({
  dealId: "deal-1",
  title,
  sourceName: "Example",
  currentSportId: sportId,
  currentEquipmentTypeId: sportId === "baseball" ? "bb-other" : "fp-other",
  proposedSportId: sportId,
  proposedCanonicalEquipmentTypeId: equipmentTypeId,
  confidence: "medium",
});

test("accepts explicit baseball and fastpitch protective equipment", () => {
  for (const row of [
    proposal("Easton Elite X Senior Baseball Batting Helmet universal jaw guard navy NOCSAE"),
    proposal("Under Armour Baseball Helmet Blue With Facemask"),
    proposal("All-Star System Seven Adult Baseball Catcher's Leg Guards"),
    proposal("Wilson Baseball Catcher's Chest Protector"),
    proposal(
      "Easton Jen Schro The Very Best Catcher's Box Set | Softball Catcher's Gear",
      "fastpitch-softball",
      "fp-protective",
    ),
    proposal(
      "Rawlings Women's HIVIZ Fast Pitch Softball Fielders' Mask",
      "fastpitch-softball",
      "fp-protective",
    ),
  ]) {
    assert.equal(isApprovedHistoricalProtectiveEquipment(row), true, row.title);
  }
});

test("rejects accessories, replacement parts, memorabilia, and toys", () => {
  for (const title of [
    "Baseball Helmet Bag",
    "Replacement Helmet Padding Kit",
    "Batting Helmet Chin Strap",
    "Baseball Jaw Guard Replacement Only",
    "Signed MLB Batting Helmet",
    "Mini Baseball Helmet Ornament",
  ]) {
    assert.equal(isApprovedHistoricalProtectiveEquipment(proposal(title)), false, title);
  }
});

test("rejects mismatched destinations and low-confidence proposals", () => {
  assert.equal(isApprovedHistoricalProtectiveEquipment({
    ...proposal("Baseball Batting Helmet"),
    proposedCanonicalEquipmentTypeId: "fp-protective",
  }), false);
  assert.equal(isApprovedHistoricalProtectiveEquipment({
    ...proposal("Baseball Batting Helmet"),
    confidence: "low",
  }), false);
});
