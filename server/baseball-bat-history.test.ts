import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalBaseballBat,
  type BatAuditProposal,
} from "./baseball-bat-history";

const proposal = (title: string): BatAuditProposal => ({
  dealId: "deal-1",
  title,
  sourceName: "Example",
  currentSportId: "baseball",
  currentEquipmentTypeId: "bb-other",
  proposedSportId: "baseball",
  proposedCanonicalEquipmentTypeId: "bb-bats",
  confidence: "medium",
});

test("accepts explicit playable bats and established bat models with size evidence", () => {
  for (const title of [
    "Louisville Slugger 2026 Atlas BBCOR Baseball Bat 31/28",
    "ProNine Baseball Fungo Bat 37 Inch",
    "2026 Easton Hype Fire 34/31",
    "2027 DeMarini Zen (-10) USA Baseball Bat",
    "Marucci Cat X Connect Hybrid -8 I 31” 23 oz (Used)",
    "Marucci CATX Alloy USA Bat 2025 (-5)",
    "EASTON BEAST -10 25\"/15OZ 2 1/4\" DIAMETER TEE BALL BAT",
    "Louisville Slugger Prime 916 Bat BBCOR | (-3) Composite 29 oz 32\" Needs Wrap",
    "Easton Surge XXL Youth Baseball Composite Bat LGS1XL 30/17",
    "Worth Youth Girls Storm Tee Ball Bat 24\" 12 oz -12",
    "Victus Pro Crayon Bobby Witt -11 USA Tee Ball Bat",
    "Easton Pro Big Barrel Little League 7046 Alloy 30\" / 22oz Bat",
    "Louisville Slugger TPX Response Tee Ball Bat 25” 14 oz",
    "CamWood Bats Pro Euro Beech Hands & Speed Trainer Baseball Training Bat A32",
  ]) {
    assert.equal(isApprovedHistoricalBaseballBat(proposal(title)), true, title);
  }
});

test("rejects bat accessories, display pieces, mini bats, and memorabilia", () => {
  for (const title of [
    "Bruce Bolt Premium Pine Tar Push Up Stick",
    "Baseball Bat Grip Tape",
    "Wall Mount Baseball Bat Display Rack",
    "Mini Louisville Slugger Baseball Bat",
    "Signed Ronald Acuna Baseball Bat",
    "Baseball Bat Bag",
    "Bat Weight Donut",
    "Sports Baseball Training Mini Tee Popper, Hitting Tee for Perfect Swings, Bat",
    "2 Williamsport Little League World Series wooden mini baseball bats",
    "Varo COR Bat Training Weight, 20oz, for Baseball",
  ]) {
    assert.equal(isApprovedHistoricalBaseballBat(proposal(title)), false, title);
  }
});

test("rejects low confidence and non-baseball destinations", () => {
  assert.equal(isApprovedHistoricalBaseballBat({
    ...proposal("Easton Baseball Bat"),
    confidence: "low",
  }), false);
  assert.equal(isApprovedHistoricalBaseballBat({
    ...proposal("Easton Baseball Bat"),
    proposedSportId: "fastpitch-softball",
  }), false);
});
