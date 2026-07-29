import assert from "node:assert/strict";
import test from "node:test";
import { moveSectionToIndex, normalizeSectionIds } from "./admin-section-layout";

test("moves an admin section directly to the requested position", () => {
  assert.deepEqual(
    moveSectionToIndex(["a", "b", "c", "d"], "a", 3),
    ["b", "c", "d", "a"],
  );
  assert.deepEqual(
    moveSectionToIndex(["a", "b", "c", "d"], "d", 1),
    ["a", "d", "b", "c"],
  );
});

test("ignores invalid moves without changing the order", () => {
  const order = ["a", "b"];
  assert.equal(moveSectionToIndex(order, "missing", 1), order);
  assert.equal(moveSectionToIndex(order, "a", 0), order);
});

test("keeps only valid persisted section ids", () => {
  assert.deepEqual(
    normalizeSectionIds(["a", "stale", 12, "b", "a"], ["a", "b", "c"]),
    ["a", "b", "a"],
  );
});
