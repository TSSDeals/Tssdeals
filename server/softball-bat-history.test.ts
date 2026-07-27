import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalSoftballBat,
  type SoftballBatAuditProposal,
} from "./softball-bat-history";

function proposal(
  title: string,
  proposedSportId = "fastpitch-softball",
  proposedCanonicalEquipmentTypeId = "fp-bats",
): SoftballBatAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "eBay",
    currentSportId: "baseball",
    currentEquipmentTypeId: "bb-other",
    proposedSportId,
    proposedCanonicalEquipmentTypeId,
    confidence: "medium",
  };
}

test("approves explicit fastpitch bats", () => {
  assert.equal(isApprovedHistoricalSoftballBat(proposal(
    '2026 Easton Ghost Advanced 32/22 Fastpitch Bat (-10)',
  )), true);
  assert.equal(isApprovedHistoricalSoftballBat(proposal(
    'DeMarini Prism+ Fast Pitch Softball Bat 33/23',
  )), true);
  assert.equal(isApprovedHistoricalSoftballBat(proposal(
    'Easton Stealth Clarity Fastpitch Softball 33" 23oz -10',
  )), true);
});

test("approves explicit slowpitch bats", () => {
  assert.equal(isApprovedHistoricalSoftballBat(proposal(
    'Worth Mayhem XL Slowpitch Softball Bat 34in 27oz',
    "slowpitch-softball",
    "sp-bats",
  )), true);
  assert.equal(isApprovedHistoricalSoftballBat(proposal(
    'Miken Psycho Slow Pitch Composite Softball Bat 34in',
    "slowpitch-softball",
    "sp-bats",
  )), true);
  assert.equal(isApprovedHistoricalSoftballBat(proposal(
    'Miken Maniac Slowpitch Softball 34in 27oz Alloy',
    "slowpitch-softball",
    "sp-bats",
  )), true);
});

test("rejects accessories, collectibles, mismatched destinations, and low confidence", () => {
  assert.equal(isApprovedHistoricalSoftballBat(proposal(
    "Fastpitch softball bat grip tape",
  )), false);
  assert.equal(isApprovedHistoricalSoftballBat(proposal(
    "Signed fastpitch softball bat",
  )), false);
  assert.equal(isApprovedHistoricalSoftballBat(proposal(
    "Fastpitch softball bat",
    "slowpitch-softball",
    "sp-bats",
  )), false);
  const low = proposal("Fastpitch softball bat");
  low.confidence = "low";
  assert.equal(isApprovedHistoricalSoftballBat(low), false);
});
