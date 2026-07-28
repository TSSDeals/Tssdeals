import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalFastpitchGlove,
  type FastpitchGloveAuditProposal,
} from "./fastpitch-glove-history";

function proposal(
  title: string,
  currentSportId: string | null = "baseball",
): FastpitchGloveAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "eBay",
    currentSportId,
    currentEquipmentTypeId: currentSportId === "fastpitch-softball"
      ? "fp-other"
      : "bb-other",
    proposedSportId: "fastpitch-softball",
    proposedCanonicalEquipmentTypeId: "fp-gloves",
    confidence: "medium",
  };
}

test("approves explicit fastpitch fielding gloves", () => {
  for (const title of [
    'Wilson Fastpitch Softball A2000 H12SS 12" Infield Glove',
    'Wilson Fastpitch Softball A2000 V125SS 12.5" Outfield Glove',
    'Rawlings Liberty Advanced Fastpitch Softball Glove 11.75"',
    'Professional Collection Color Splash 12 in Fastpitch Glove',
    'Mizuno Jennie Finch Fastpitch Softball Glove 11" RHT',
    'Wilson A440 Fast Pitch Softball Glove 12" Right Throw',
  ]) {
    assert.equal(isApprovedHistoricalFastpitchGlove(proposal(title)), true, title);
  }
});

test("approves explicit fastpitch softball mitts and catcher's mitts", () => {
  for (const title of [
    'Mizuno MVP Prime Fastpitch 12" Softball Mitt Glove',
    'MIZUNO GXS 90F2 34" Women\'s Fast Pitch Softball Catchers Mitt RHT',
    'Rawlings Liberty Advanced 34" Fastpitch Softball Catcher\'s Mitt',
  ]) {
    assert.equal(isApprovedHistoricalFastpitchGlove(proposal(title)), true, title);
  }
});

test("rejects batting gloves, training forms, accessories, and memorabilia", () => {
  for (const title of [
    "Fastpitch Softball Batting Gloves",
    "Fastpitch Training Paddle Glove",
    "Fastpitch Glove Locks Accessory",
    "Signed Fastpitch Softball Glove Display",
  ]) {
    assert.equal(isApprovedHistoricalFastpitchGlove(proposal(title)), false, title);
  }
});

test("rejects baseball-only, vague, low-confidence, and wrong-destination records", () => {
  assert.equal(isApprovedHistoricalFastpitchGlove(proposal(
    "Wilson A2000 Baseball Infield Glove",
  )), false);
  assert.equal(isApprovedHistoricalFastpitchGlove(proposal("Fastpitch Equipment")), false);
  const low = proposal("Fastpitch Softball Glove");
  low.confidence = "low";
  assert.equal(isApprovedHistoricalFastpitchGlove(low), false);
  const wrong = proposal("Fastpitch Softball Glove");
  wrong.proposedCanonicalEquipmentTypeId = "fp-other";
  assert.equal(isApprovedHistoricalFastpitchGlove(wrong), false);
});
