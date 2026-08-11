import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { EbayCategorySync } from "./ebay-api";
import {
  EBAY_PUBLIC_MAX_RESULTS_PER_QUERY,
  EBAY_PUBLIC_RUN_CALL_BUDGET,
  getQuotaEfficientEbayDiscoveryPlan,
  selectEbaySellersForRun,
} from "./ebay-quota-policy";

const rotatingCategories: EbayCategorySync[] = Array.from({ length: 12 }, (_, index) => ({
  categoryId: String(9000 + index),
  categoryName: `Rotating category ${index}`,
  sportId: "other",
  equipmentTypeId: `other-${index}`,
}));

test("public discovery uses a small, bounded rotating plan", () => {
  const plan = getQuotaEfficientEbayDiscoveryPlan(rotatingCategories, new Date("2026-08-11T12:00:00Z"));
  assert.ok(plan.length <= 10);
  assert.ok(plan.length < EBAY_PUBLIC_RUN_CALL_BUDGET);
  assert.equal(EBAY_PUBLIC_MAX_RESULTS_PER_QUERY, 200);
});

test("glove discovery enforces condition-specific minimum prices", () => {
  const plan = getQuotaEfficientEbayDiscoveryPlan(rotatingCategories, new Date("2026-08-11T12:00:00Z"));
  const gloves = plan.filter((request) => request.equipmentTypeId === "bb-gloves");
  assert.deepEqual(gloves.map(({ condition, minPrice }) => ({ condition, minPrice })), [
    { condition: "new", minPrice: 50 },
    { condition: "preowned", minPrice: 75 },
  ]);
});

test("saved sellers rotate through at most five broad requests per run", () => {
  const sellers = Array.from({ length: 14 }, (_, index) => `seller-${index}`);
  const first = selectEbaySellersForRun(sellers, new Date("2026-08-11T12:00:00Z"));
  const next = selectEbaySellersForRun(sellers, new Date("2026-08-11T16:00:00Z"));
  assert.equal(first.length, 5);
  assert.equal(next.length, 5);
  assert.notDeepEqual(first, next);
});

test("legacy category sync delegates to the same bounded background process", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const endpoint = routes.match(/app\.post\("\/api\/ebay\/category-sync"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  assert.match(endpoint, /queueEbayPublicSync/);
  assert.doesNotMatch(endpoint, /maxResults:\s*(?:2000|5000|10000)/);
  assert.match(routes, /createEbayBrowseBudget\("targeted admin sync", 20\)/);
});
