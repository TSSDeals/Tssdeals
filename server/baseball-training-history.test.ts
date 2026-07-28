import assert from "node:assert/strict";
import test from "node:test";
import {
  isApprovedHistoricalBaseballTraining,
  type BaseballTrainingAuditProposal,
} from "./baseball-training-history";

function proposal(
  title: string,
  currentSportId: string | null = "baseball",
): BaseballTrainingAuditProposal {
  return {
    dealId: "deal-1",
    title,
    sourceName: "eBay",
    currentSportId,
    currentEquipmentTypeId: currentSportId === "baseball" ? "bb-other" : "rug-other",
    proposedSportId: "baseball",
    proposedCanonicalEquipmentTypeId: "bb-training",
    confidence: "medium",
  };
}

test("approves reviewed batting tees and tee-ball practice sets", () => {
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    'FDLS Baseball Batting tee for Adults and Youth Teens, 27"-46"',
  )), true);
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Champion Sports Deluxe Batting Tee - Mounted Adjustable Telescopic One",
  )), true);
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Rawlings Youth Batting Tee with Ball",
    "rugby",
  )), true);
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Tee Ball Set with Adjustable Batting Tee for Baseball Practice",
  )), true);
});

test("approves pitching machines and their purpose-built training baseballs", () => {
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Furlihong 380BH Baseball Pitching Machine, Battery Powered",
  )), true);
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Ballistic Leather Pitching Machine Baseballs",
  )), true);
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "12 Pack Dimpled Baseballs 9-Inch Pitching Machine Baseballs",
  )), true);
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Furlihong Baseball Pitching Machine Use Ping Pong Size Training Balls",
  )), true);
});

test("rejects other sports, replacement parts, apparel, and memorabilia", () => {
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Golf Batting Practice Tee",
  )), false);
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Baseball Pitching Machine Replacement Motor",
  )), false);
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Baseball Training Hoodie",
  )), false);
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Signed Baseball Pitching Machine Poster",
  )), false);
});

test("rejects ordinary balls, vague products, low confidence, and wrong destinations", () => {
  assert.equal(isApprovedHistoricalBaseballTraining(proposal(
    "Rawlings Official League Baseballs 12 Pack",
  )), false);
  assert.equal(isApprovedHistoricalBaseballTraining(proposal("Training Equipment")), false);
  const low = proposal("Baseball Batting Tee");
  low.confidence = "low";
  assert.equal(isApprovedHistoricalBaseballTraining(low), false);
  const wrong = proposal("Baseball Batting Tee");
  wrong.proposedCanonicalEquipmentTypeId = "bb-other";
  assert.equal(isApprovedHistoricalBaseballTraining(wrong), false);
});
