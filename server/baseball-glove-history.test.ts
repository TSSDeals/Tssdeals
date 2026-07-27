import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalBaseballGlove,
  type GloveAuditProposal,
} from "./baseball-glove-history";

const proposal = (title: string): GloveAuditProposal => ({
  dealId: "deal-1",
  title,
  sourceName: "Example",
  currentSportId: "baseball",
  currentEquipmentTypeId: "bb-other",
  proposedSportId: "baseball",
  proposedCanonicalEquipmentTypeId: "bb-gloves",
  confidence: "medium",
});

test("accepts explicit fielding gloves and established glove families", () => {
  assert.equal(isApprovedHistoricalBaseballGlove(proposal(
    'Rawlings R9 11.5-Inch Infield Glove',
  )), true);
  assert.equal(isApprovedHistoricalBaseballGlove(proposal(
    'Wilson 2025 Tennis A2000 1786SS 11.5" Infield Baseball Glove',
  )), true);
});

test("rejects accessories, protective liners, other sports, training forms, and memorabilia", () => {
  for (const title of [
    "60 Pcs Glove Locks Baseball Glove Accessory",
    "All-Star Adult Fingers Baseball Catcher's Inner Protective Glove",
    "Bauer Intermediate Hockey Goalie Catcher Glove",
    "Wilson A2000 Training Pancake/Paddle Baseball Glove",
    "Signed Gold Glove Logo",
    "Tennis Oven Mitt",
  ]) {
    assert.equal(isApprovedHistoricalBaseballGlove(proposal(title)), false, title);
  }
});

