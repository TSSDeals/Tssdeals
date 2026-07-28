import assert from "node:assert/strict";
import test from "node:test";
import { marketWindowDays } from "./demand-brain";

test("Demand Brain accepts the four supported rolling windows", () => {
  assert.equal(marketWindowDays("5"), 5);
  assert.equal(marketWindowDays(10), 10);
  assert.equal(marketWindowDays("30"), 30);
  assert.equal(marketWindowDays(90), 90);
});

test("Demand Brain defaults invalid windows to 30 days", () => {
  assert.equal(marketWindowDays(undefined), 30);
  assert.equal(marketWindowDays("7"), 30);
  assert.equal(marketWindowDays("all"), 30);
});
