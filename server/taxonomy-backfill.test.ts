import assert from "node:assert/strict";
import test from "node:test";
import {
  planGuardedTaxonomyBackfill,
  type BackfillProposal,
  type BackfillSnapshot,
} from "./taxonomy-backfill";

const proposal: BackfillProposal = {
  dealId: "deal-1",
  title: "Wilson A2000 1786 Baseball Glove",
  confidence: "high",
  humanApprovalRequired: false,
  currentSportId: "baseball",
  currentEquipmentTypeId: "bb-other",
  proposedSportId: "baseball",
  proposedCanonicalEquipmentTypeId: "bb-gloves",
  evidence: ["strict deterministic product-form rule"],
};
const snapshot: BackfillSnapshot = {
  id: "deal-1",
  title: proposal.title,
  sportId: "baseball",
  equipmentTypeId: "bb-other",
  subFilterId: null,
  joinedSubFilterCount: 0,
};

test("guarded backfill accepts only an unchanged high-confidence row without subfilters", () => {
  const result = planGuardedTaxonomyBackfill([proposal], [snapshot]);
  assert.deepEqual(result.changes, [{
    id: "deal-1",
    title: proposal.title,
    before: { sportId: "baseball", equipmentTypeId: "bb-other" },
    after: { sportId: "baseball", equipmentTypeId: "bb-gloves" },
  }]);
  assert.deepEqual(result.skipped, []);
});

test("guarded backfill rejects medium, stale, and tagged rows", () => {
  const result = planGuardedTaxonomyBackfill([
    { ...proposal, dealId: "medium", confidence: "medium" },
    { ...proposal, dealId: "stale" },
    { ...proposal, dealId: "tagged" },
  ], [
    { ...snapshot, id: "medium" },
    { ...snapshot, id: "stale", title: "Changed title" },
    { ...snapshot, id: "tagged", joinedSubFilterCount: 1 },
  ]);
  assert.equal(result.changes.length, 0);
  assert.deepEqual(result.skipped.map((row) => row.reason), [
    "not an automatically eligible high-confidence proposal",
    "live deal no longer matches the audited snapshot",
    "existing sub-filter assignments require separate review",
  ]);
});
