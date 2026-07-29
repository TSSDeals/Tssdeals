import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductResearchUrl,
  buildLedgerResearchKey,
  productResearchObservationInput,
  productResearchReviewInput,
  productResearchWindow,
} from "./product-research";

const baseObservation = {
  observationType: "category" as const,
  researchKey: "category:baseball-fielding-gloves",
  label: "Baseball Fielding Gloves & Mitts",
  marketplace: "EBAY_US" as const,
  queryText: "Baseball Gloves",
  categoryId: "16030",
  windowDays: 90 as const,
  periodStart: "2026-04-29",
  periodEnd: "2026-07-28",
  sourceUrl: "https://www.ebay.com/sh/research?keywords=Baseball+Gloves",
};

test("Product Research accepts supported demand and baseline windows", () => {
  for (const days of [5, 10, 30, 90, 365, 1095]) {
    assert.equal(productResearchWindow(days), days);
  }
  assert.equal(productResearchWindow("not-a-window"), 30);
});

test("Product Research accepts decimal eBay percentages and stores database-safe values", () => {
  const parsed = productResearchObservationInput.parse({
    observationType: "category",
    researchKey: "category:baseball-fielding-gloves",
    label: "Baseball Fielding Gloves & Mitts",
    marketplace: "EBAY_US",
    windowDays: 5,
    periodStart: "2026-07-24",
    periodEnd: "2026-07-29",
    freeShippingPercent: 25.6,
    sellThroughPercent: 11.37,
    sourceUrl: "https://www.ebay.com/sh/research?keywords=Baseball+Gloves",
  });

  assert.equal(parsed.freeShippingPercent, 26);
  assert.equal(parsed.sellThroughPercent, 11);
});

test("Product Research URLs are prefilled without scraping private result rows", () => {
  const url = new URL(buildProductResearchUrl({
    queryText: "Wilson A2000 1786",
    categoryId: "16030",
    windowDays: 30,
    endDate: new Date("2026-07-28T12:00:00Z"),
  }));
  assert.equal(url.hostname, "www.ebay.com");
  assert.equal(url.searchParams.get("keywords"), "Wilson A2000 1786");
  assert.equal(url.searchParams.get("categoryId"), "16030");
  assert.equal(url.searchParams.get("dayRange"), "30");
  assert.equal(url.searchParams.get("tabName"), "SOLD");
});

test("aggregate observations reject non-eBay sources and impossible price ranges", () => {
  assert.equal(productResearchObservationInput.safeParse({
    ...baseObservation,
    sourceUrl: "https://example.com/private-export",
  }).success, false);
  assert.equal(productResearchObservationInput.safeParse({
    ...baseObservation,
    minimumSoldPriceCents: 20000,
    maximumSoldPriceCents: 10000,
  }).success, false);
});

test("sell-through is accepted through 90 days but never fabricated for longer windows", () => {
  assert.equal(productResearchObservationInput.safeParse({
    ...baseObservation,
    sellThroughPercent: 42,
  }).success, true);
  assert.equal(productResearchObservationInput.safeParse({
    ...baseObservation,
    windowDays: 1095,
    periodStart: "2023-07-29",
    sellThroughPercent: 42,
  }).success, false);
  assert.equal(productResearchObservationInput.safeParse({
    ...baseObservation,
    windowDays: 1095,
    periodStart: "2023-07-29",
    sellThroughPercent: null,
  }).success, true);
});

test("product-level observations require an approved identity reference", () => {
  assert.equal(productResearchObservationInput.safeParse({
    ...baseObservation,
    observationType: "product_identity",
    researchKey: "identity:test",
  }).success, false);
});

test("recent ledger glove models receive stable research keys", () => {
  assert.equal(
    buildLedgerResearchKey("Wilson", "A2000 1786 11.5\""),
    "ledger-model:wilson:a2000-1786-11-5",
  );
  assert.equal(
    buildLedgerResearchKey(" Rawlings ", "Heart of the Hide"),
    "ledger-model:rawlings:heart-of-the-hide",
  );
});

test("recent sold ledger models can be recorded without a product identity", () => {
  assert.equal(productResearchObservationInput.safeParse({
    ...baseObservation,
    observationType: "ledger_model",
    productIdentityId: null,
    researchKey: "ledger-model:mizuno:mvp-prime",
    label: "Mizuno MVP Prime",
    queryText: "Mizuno MVP Prime",
  }).success, true);
});

test("insufficient-data reviews require useful notes and an optional eBay source", () => {
  const review = {
    researchKey: "ledger-model:ssk:dwg3820i",
    label: "SSK DWG3820I",
    windowDays: 90 as const,
    outcome: "insufficient_data" as const,
    notes: "Exact-model search returned no trustworthy aggregate sold sample.",
    sourceUrl: "https://www.ebay.com/sh/research?keywords=SSK+DWG3820I",
  };
  assert.equal(productResearchReviewInput.safeParse(review).success, true);
  assert.equal(productResearchReviewInput.safeParse({ ...review, notes: "None" }).success, false);
  assert.equal(productResearchReviewInput.safeParse({
    ...review,
    sourceUrl: "https://example.com/results",
  }).success, false);
});
