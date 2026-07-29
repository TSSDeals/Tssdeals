import assert from "node:assert/strict";
import test from "node:test";
import { researchPeriodFromUrl } from "./ProductResearchPanel";

test("Product Research preserves the exact dates encoded by eBay", () => {
  const period = researchPeriodFromUrl(
    "https://www.ebay.com/sh/research?startDate=1690687388197&endDate=1785295388197&tz=America%2FNew_York",
    1095,
  );
  assert.deepEqual(period, {
    periodStart: "2023-07-29",
    periodEnd: "2026-07-28",
  });
});
