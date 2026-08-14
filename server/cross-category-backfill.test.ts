import assert from "node:assert/strict";
import test from "node:test";
import { planCrossCategoryBackfill, type CrossCategoryRow } from "./cross-category-backfill";

const row = (overrides: Partial<CrossCategoryRow>): CrossCategoryRow => ({
  id: "deal-1",
  title: "Rawlings Pro Preferred Maple Wood Baseball Bat 32 inch",
  brand: "Rawlings",
  sportId: "baseball",
  equipmentTypeId: "bb-gloves",
  subFilterId: null,
  joinedSubFilterCount: 0,
  classificationLocked: false,
  ...overrides,
});

test("moves explicit bats out of fielding gloves", () => {
  const plan = planCrossCategoryBackfill([row({})]);
  assert.equal(plan.proposed, 1);
  assert.equal(plan.proposals[0].proposedEquipmentTypeId, "bb-bats");
});

test("moves batting gloves and batting helmets out of fielding gloves", () => {
  const plan = planCrossCategoryBackfill([
    row({ id: "batting-glove", title: "Wilson Adult Baseball Batting Gloves" }),
    row({ id: "helmet", title: "Easton Baseball Batting Helmet" }),
  ]);
  assert.deepEqual(plan.proposals.map((item) => item.proposedEquipmentTypeId), ["bb-batting-gloves", "bb-protective"]);
});

test("moves running shoes and golf clubs out of unrelated categories", () => {
  const plan = planCrossCategoryBackfill([
    row({ id: "running", title: "Brooks Ghost Road Running Shoes", sportId: "baseball", equipmentTypeId: "bb-other" }),
    row({ id: "putter", title: "Odyssey Ai-One Putter 34 inch", sportId: "baseball", equipmentTypeId: "bb-bats" }),
  ]);
  assert.deepEqual(plan.proposals.map((item) => item.proposedEquipmentTypeId), ["run-shoes", "golf-putters"]);
});

test("protects locked and curated records", () => {
  const plan = planCrossCategoryBackfill([
    row({ id: "locked", classificationLocked: true }),
    row({ id: "primary", subFilterId: "reviewed" }),
    row({ id: "joined", joinedSubFilterCount: 1 }),
  ]);
  assert.equal(plan.proposed, 0);
  assert.equal(plan.protectedByReview, 3);
});

test("leaves ambiguous products and correct classifications unchanged", () => {
  const plan = planCrossCategoryBackfill([
    row({ id: "ambiguous", title: "Wilson Sporting Goods Item" }),
    row({ id: "correct", sportId: "baseball", equipmentTypeId: "bb-bats" }),
  ]);
  assert.equal(plan.proposed, 0);
  assert.equal(plan.ambiguous, 1);
  assert.equal(plan.alreadyCorrect, 1);
});
