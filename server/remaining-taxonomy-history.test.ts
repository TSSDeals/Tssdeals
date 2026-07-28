import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedRemainingDestination,
  type RemainingTaxonomyAuditProposal,
} from "./remaining-taxonomy-history";

function proposal(
  title: string,
  sportId: string,
  equipmentTypeId: string,
): RemainingTaxonomyAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "audit",
    currentSportId: "baseball",
    currentEquipmentTypeId: "bb-other",
    proposedSportId: sportId,
    proposedCanonicalEquipmentTypeId: equipmentTypeId,
    confidence: "medium",
  };
}

test("approves the reviewed remaining equipment families", () => {
  const cases: Array<[string, string, string]> = [
    ["WNBA Official Game Basketball", "basketball", "bk-balls"],
    ["NBA Team Tribute Mini Outdoor Basketball", "basketball", "bk-balls"],
    ["Nike LeBron Witness 8 Basketball Shoes", "basketball", "bk-shoes-apparel"],
    ['Huffy 26" Granite Mountain Bike', "cycling", "cyc-bikes"],
    ['Huffy Women\'s Granite 26" 15-Speed Mountain Bicycle', "cycling", "cyc-bikes"],
    ["Wilson Fast Pitch Softballs A9060 ASA", "fastpitch-softball", "fp-balls"],
    ["Fastpitch Softball Training Balls Leather Cover", "fastpitch-softball", "fp-training"],
    ["Wilson GST Game Football with Custom Logo", "football", "fb-balls"],
    ["Franklin NHL Youth Street Hockey Stick and 2 Balls", "hockey", "hk-sticks"],
    ["Dudley 12 inch Slow Pitch Softballs", "slowpitch-softball", "sp-balls"],
    ["Easton Slowpitch Softball Glove PCSP14", "slowpitch-softball", "sp-gloves"],
    ["Mikasa VQ2000 Competition Game Volleyball", "volleyball", "vb-balls"],
    ["Pro Neoprene Pool Volleyball 2 Pack with Ball Pump", "volleyball", "vb-balls"],
  ];
  for (const [title, sportId, equipmentTypeId] of cases) {
    assert.deepEqual(
      approvedRemainingDestination(proposal(title, sportId, equipmentTypeId)),
      { sportId, equipmentTypeId },
      title,
    );
  }
});

test("rejects accessories and adjacent products inside supported destinations", () => {
  const cases: Array<[string, string, string]> = [
    ["Basketball Pump", "basketball", "bk-balls"],
    ["Basketball Jersey", "basketball", "bk-shoes-apparel"],
    ["Mountain Bike Rack", "cycling", "cyc-bikes"],
    ["Fast Pitch Softball Bucket", "fastpitch-softball", "fp-balls"],
    ["Fastpitch Training Ball Bag", "fastpitch-softball", "fp-training"],
    ["Football Tee", "football", "fb-balls"],
    ["Hockey Stick Bag", "hockey", "hk-sticks"],
    ["Slow Pitch Softball Bag", "slowpitch-softball", "sp-balls"],
    ["Slowpitch Batting Gloves", "slowpitch-softball", "sp-gloves"],
    ["Volleyball Pump Only", "volleyball", "vb-balls"],
  ];
  for (const [title, sportId, equipmentTypeId] of cases) {
    assert.equal(
      approvedRemainingDestination(proposal(title, sportId, equipmentTypeId)),
      null,
      title,
    );
  }
});

test("rejects all reviewed protected destinations and low-confidence records", () => {
  for (const [title, sportId, equipmentTypeId] of [
    ["Mini souvenir baseball bats", "baseball", "bb-bats"],
    ["Glove Locks", "baseball", "bb-gloves"],
    ["Driver Side Heated Mirror Glass", "golf", "golf-drivers"],
    ["Putter Grip Ball Marker Holder", "golf", "golf-putters"],
    ["Nike Swim Goggle Case", "swimming", "swim-goggles"],
  ]) {
    assert.equal(
      approvedRemainingDestination(proposal(title, sportId, equipmentTypeId)),
      null,
      title,
    );
  }
  const low = proposal("WNBA Official Game Basketball", "basketball", "bk-balls");
  low.confidence = "low";
  assert.equal(approvedRemainingDestination(low), null);
});
