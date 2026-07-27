import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalBaseballCleat,
  type BaseballCleatAuditProposal,
} from "./baseball-cleat-history";

function proposal(title: string): BaseballCleatAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "eBay",
    currentSportId: "baseball",
    currentEquipmentTypeId: "bb-other",
    proposedSportId: "baseball",
    proposedCanonicalEquipmentTypeId: "bb-cleats",
    confidence: "medium",
  };
}

test("approves explicitly labeled baseball cleats", () => {
  assert.equal(isApprovedHistoricalBaseballCleat(proposal(
    "NIKE VAPOR BSBL Black White Baseball Cleats Youth Size 6Y",
  )), true);
  assert.equal(isApprovedHistoricalBaseballCleat(proposal(
    "Under Armour Harper Baseball Cleat Youth Black/White Kids Size 3.5",
  )), true);
  assert.equal(isApprovedHistoricalBaseballCleat(proposal(
    "Adidas Adizero Afterburner Running Baseball Cleats NWT",
  )), true);
  assert.equal(isApprovedHistoricalBaseballCleat(proposal(
    "Under Armour Baseball Cleats MLB Preowned UEC New Laces",
  )), true);
});

test("rejects replacement parts, shoe accessories, and care products", () => {
  assert.equal(isApprovedHistoricalBaseballCleat(proposal(
    "Replacement baseball cleats spikes 14 pack",
  )), false);
  assert.equal(isApprovedHistoricalBaseballCleat(proposal(
    "Baseball cleat laces and shoe inserts",
  )), false);
  assert.equal(isApprovedHistoricalBaseballCleat(proposal(
    "Baseball cleat bag with deodorizer",
  )), false);
});

test("rejects vague footwear, memorabilia, low confidence, and destination mismatches", () => {
  assert.equal(isApprovedHistoricalBaseballCleat(proposal(
    "Nike athletic cleats",
  )), false);
  assert.equal(isApprovedHistoricalBaseballCleat(proposal(
    "Signed baseball cleats display case",
  )), false);
  const low = proposal("Nike Vapor Baseball Cleats");
  low.confidence = "low";
  assert.equal(isApprovedHistoricalBaseballCleat(low), false);
  const wrong = proposal("Nike Vapor Baseball Cleats");
  wrong.proposedCanonicalEquipmentTypeId = "bb-other";
  assert.equal(isApprovedHistoricalBaseballCleat(wrong), false);
});
