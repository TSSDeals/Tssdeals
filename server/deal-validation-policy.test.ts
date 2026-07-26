import assert from "node:assert/strict";
import test from "node:test";
import { defaultEbayPublicSyncStatus } from "./ebay-public-sync";
import {
  hasRecentSuccessfulEbaySnapshot,
  MAX_MANUAL_VALIDATION_LIMIT,
  safeManualValidationLimit,
  SCHEDULED_EBAY_VALIDATION_LIMIT,
} from "./deal-validation-policy";

test("scheduled eBay validation requires a recent successful public snapshot", () => {
  const now = new Date("2026-07-26T01:00:00.000Z");
  assert.equal(hasRecentSuccessfulEbaySnapshot(defaultEbayPublicSyncStatus(), now), false);
  assert.equal(hasRecentSuccessfulEbaySnapshot({
    ...defaultEbayPublicSyncStatus(),
    state: "success",
    lastSuccessfulAt: "2026-07-26T00:00:00.000Z",
  }, now), true);
  assert.equal(hasRecentSuccessfulEbaySnapshot({
    ...defaultEbayPublicSyncStatus(),
    state: "failed",
    lastSuccessfulAt: "2026-07-25T18:00:00.000Z",
  }, now), false);
});

test("manual validation cannot recreate the 500-request quota drain", () => {
  assert.equal(safeManualValidationLimit(undefined), SCHEDULED_EBAY_VALIDATION_LIMIT);
  assert.equal(safeManualValidationLimit("0"), 1);
  assert.equal(safeManualValidationLimit("50"), 50);
  assert.equal(safeManualValidationLimit("500"), MAX_MANUAL_VALIDATION_LIMIT);
});
