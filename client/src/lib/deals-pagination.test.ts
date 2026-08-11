import assert from "node:assert/strict";
import test from "node:test";
import {
  DEALS_PAGE_SIZE,
  DEALS_PAGE_SIZE_OPTIONS,
  dealsPageNumber,
  mayHaveNextDealsPage,
  nextDealsOffset,
} from "./deals-pagination";

test("deal pages default to a bounded browser-friendly size", () => {
  assert.equal(DEALS_PAGE_SIZE, 60);
  assert.deepEqual(DEALS_PAGE_SIZE_OPTIONS, [30, 60, 90, 120, 200]);
});

test("deal pagination advances and never moves before the first result", () => {
  assert.equal(nextDealsOffset(0, 60, "next"), 60);
  assert.equal(nextDealsOffset(60, 60, "previous"), 0);
  assert.equal(nextDealsOffset(0, 60, "previous"), 0);
  assert.equal(dealsPageNumber(120, 60), 3);
});

test("a full page is the only page that may have another result page", () => {
  assert.equal(mayHaveNextDealsPage(60, 60), true);
  assert.equal(mayHaveNextDealsPage(59, 60), false);
});
