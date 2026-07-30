import assert from "node:assert/strict";
import test from "node:test";
import { calculateDemandIntelligence, marketWindowDays } from "./demand-brain";

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

test("Demand Score rewards strong velocity and sell-through with transparent output", () => {
  const result = calculateDemandIntelligence({
    windowDays: 90,
    averageSoldPriceCents: 18453,
    minimumSoldPriceCents: 5600,
    maximumSoldPriceCents: 39500,
    averageShippingCents: 1150,
    sellThroughPercent: 41,
    totalSold: 128,
    totalSellers: 101,
  });
  assert.equal(result.confidence, "high");
  assert.ok((result.score ?? 0) >= 50);
  assert.ok((result.maximumAcquisitionCents ?? 0) > 0);
  assert.equal(result.explanation.length, 4);
});

test("Demand Score discounts tiny samples instead of presenting false confidence", () => {
  const result = calculateDemandIntelligence({
    windowDays: 90,
    averageSoldPriceCents: 15000,
    minimumSoldPriceCents: 12000,
    maximumSoldPriceCents: 19000,
    sellThroughPercent: 4,
    totalSold: 3,
    totalSellers: 3,
  });
  assert.equal(result.confidence, "low");
  assert.ok((result.score ?? 100) < 40);
  assert.equal(result.marketStatus, "uncertain");
});

test("Demand Score refuses to score an insufficient exact-model sample", () => {
  const result = calculateDemandIntelligence({
    windowDays: 90,
    averageSoldPriceCents: null,
    totalSold: 0,
  });
  assert.equal(result.score, null);
  assert.equal(result.confidence, "insufficient");
  assert.equal(result.maximumAcquisitionCents, null);
});
