import assert from "node:assert/strict";
import test from "node:test";
import {
  makeManualReviewSignature,
  planManualTaxonomyReviewQueue,
  type ManualTaxonomyReviewRow,
} from "./manual-taxonomy-review";

function row(overrides: Partial<ManualTaxonomyReviewRow> = {}): ManualTaxonomyReviewRow {
  return {
    id: "1",
    title: "Mystery premium sporting product",
    brand: "Example",
    sourceId: "source",
    imageUrl: null,
    priceCents: 10000,
    sportId: "baseball",
    equipmentTypeId: "bb-other",
    classificationSource: null,
    classificationConfidence: null,
    classificationLocked: false,
    ...overrides,
  };
}

test("review signature is stable across case and whitespace", () => {
  assert.equal(
    makeManualReviewSignature("  Wilson   Mystery Model ", " WILSON "),
    "wilson|wilson mystery model",
  );
});

test("queue excludes deterministic, locked, resolved, and skipped products", () => {
  const items = planManualTaxonomyReviewQueue([
    row({ id: "ambiguous" }),
    row({ id: "known", title: "Wilson A2000 1786 Baseball Glove" }),
    row({ id: "locked", classificationLocked: true }),
    row({ id: "manual", classificationSource: "manual" }),
    row({ id: "skipped", classificationSource: "manual-skip" }),
  ], new Map(), 25);
  assert.deepEqual(items.map((item) => item.id), ["ambiguous"]);
});

test("cached suggestions rise above unresolved items and limit is bounded", () => {
  const suggested = row({ id: "suggested", title: "Unknown Model A", priceCents: 5000 });
  const unresolved = row({ id: "unresolved", title: "Unknown Model B", priceCents: 20000 });
  const suggestions = new Map([[makeManualReviewSignature(suggested.title, suggested.brand), {
    sportId: "golf",
    equipmentTypeId: "golf-other",
    confidence: "medium",
    reasoning: "Likely golf equipment",
  }]]);
  const items = planManualTaxonomyReviewQueue([unresolved, suggested], suggestions, 1);
  assert.equal(items[0]?.id, "suggested");
  assert.equal(items[0]?.suggestion?.sportId, "golf");
});
