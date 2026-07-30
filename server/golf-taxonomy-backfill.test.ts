import assert from "node:assert/strict";
import test from "node:test";
import { planGolfTaxonomyBackfill, type GolfBackfillRow } from "./golf-taxonomy-backfill";

const row = (overrides: Partial<GolfBackfillRow>): GolfBackfillRow => ({
  id: "deal-1",
  title: "TaylorMade Qi35 10.5 Degree Driver Stiff",
  sportId: "baseball",
  equipmentTypeId: "bb-other",
  subFilterId: null,
  joinedSubFilterCount: 0,
  ...overrides,
});

test("moves an obvious wrong-sport driver into golf drivers", () => {
  const plan = planGolfTaxonomyBackfill([row({})]);
  assert.equal(plan.proposed, 1);
  assert.equal(plan.proposals[0].proposedSportId, "golf");
  assert.equal(plan.proposals[0].proposedEquipmentTypeId, "golf-drivers");
});

test("moves a putter stored as a golf driver into putters", () => {
  const plan = planGolfTaxonomyBackfill([row({
    title: "Odyssey Ai-One Milled Seven T Putter 34 inch",
    sportId: "golf",
    equipmentTypeId: "golf-drivers",
  })]);
  assert.equal(plan.proposals[0].proposedEquipmentTypeId, "golf-putters");
});

test("never promotes club accessories into club categories", () => {
  const plan = planGolfTaxonomyBackfill([row({
    title: "TaylorMade Qi35 Driver Headcover",
    sportId: "golf",
    equipmentTypeId: "golf-other",
  })]);
  assert.equal(plan.proposed, 0);
  assert.equal(plan.accessoriesExcluded, 1);
});

test("never treats an impact driver as a golf driver", () => {
  const plan = planGolfTaxonomyBackfill([row({
    title: "20V Brushless Impact Driver Tool Kit",
    sportId: null,
    equipmentTypeId: null,
  })]);
  assert.equal(plan.proposed, 0);
  assert.equal(plan.ambiguous, 1);
});

test("protects records that already have curated sub-filter assignments", () => {
  const plan = planGolfTaxonomyBackfill([row({ joinedSubFilterCount: 1 })]);
  assert.equal(plan.proposed, 0);
  assert.equal(plan.protectedBySubFilters, 1);
});

test("does not rewrite a correct golf classification", () => {
  const plan = planGolfTaxonomyBackfill([row({
    sportId: "golf",
    equipmentTypeId: "golf-drivers",
  })]);
  assert.equal(plan.proposed, 0);
  assert.equal(plan.alreadyCorrect, 1);
});
