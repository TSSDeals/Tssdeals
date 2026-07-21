import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseTaxonomyAuditInvocation } from "./taxonomy-audit-cli";
import { TAXONOMY_ASSIGNMENT_PATHS } from "./taxonomy-assignment-paths";
import {
  buildTaxonomyAuditReport,
  taxonomyAuditCorrectionsCsv,
  taxonomyAuditMarkdown,
  type TaxonomyAuditDataset,
} from "./taxonomy-audit";

function fixture(): TaxonomyAuditDataset {
  return {
    sports: [
      { id: "baseball", name: "Baseball", userCreated: false },
      { id: "basketball", name: "Basketball", userCreated: false },
    ],
    equipmentTypes: [
      { id: "bb-bats", name: "Bats", sportId: "baseball", userCreated: false },
      { id: "baseball-bat", name: "Baseball Bat", sportId: "baseball", userCreated: true },
      { id: "bat", name: "Bat", sportId: "baseball", userCreated: true },
      { id: "bats", name: "Bats", sportId: "baseball", userCreated: true },
      { id: "bb-other", name: "Other", sportId: "baseball", userCreated: false },
      { id: "bb-gloves", name: "Gloves", sportId: "baseball", userCreated: false },
      { id: "bk-balls", name: "Balls", sportId: "basketball", userCreated: false },
      { id: "bk-other", name: "Other", sportId: "basketball", userCreated: false },
    ],
    subFilters: [
      { id: "bb-bats-drop-10", name: "Drop 10", equipmentTypeId: "bb-bats" },
      { id: "bat-drop-10", name: "Drop -10", equipmentTypeId: "bat" },
    ],
    sources: [
      { id: "ebay", name: "eBay", category: "multi-sport" },
      { id: "justbats", name: "JustBats", category: "baseball" },
    ],
    deals: [
      {
        id: "legacy-bat", sourceId: "ebay", title: "Louisville Slugger Supra 27/17 USSSA Baseball Bat",
        brand: "Louisville Sluggers", sportId: "baseball", equipmentTypeId: "bat",
        subFilterIds: ["bat-drop-10"], raw: { ebaySeller: "bat-seller", sku: "SUPRA-2717" },
      },
      {
        id: "other-bat", sourceId: "ebay", title: "Easton Hype Fire 27/17 USSSA",
        brand: "Easton Sports", sportId: "baseball", equipmentTypeId: "bb-other",
        raw: { ebaySeller: "bat-seller", categoryName: "Baseball & Softball", upc: "123456789012" },
      },
      {
        id: "canonical-bat", sourceId: "justbats", title: "Marucci CATX 27/17 USSSA Baseball Bat",
        brand: "Marucci", sportId: "baseball", equipmentTypeId: "bb-bats",
        dropWeight: 10, raw: { sku: "CATX-2717", certification: "USSSA" },
      },
      {
        id: "ambiguous", sourceId: "ebay", title: "Easton Premium Sports Equipment",
        brand: "Easton", sportId: "baseball", equipmentTypeId: "bb-other",
        raw: { ebaySeller: "mixed-seller", category: "Sporting Goods" },
      },
      {
        id: "basketball-other", sourceId: "ebay", title: "Spalding Official Indoor Basketball",
        brand: "Spalding", sportId: "basketball", equipmentTypeId: "bk-other",
        raw: { ebaySeller: "ball-seller", upc: "123456789012" },
      },
    ],
  };
}

test("audits duplicate and synonymous Bats IDs plus fragmented display groups", () => {
  const report = buildTaxonomyAuditReport(fixture(), { generatedAt: "2026-07-21T00:00:00.000Z" });
  assert.ok(report.taxonomyFindings.some((finding) =>
    finding.kind === "duplicate-display-label"
    && finding.currentIds.includes("bb-bats")
    && finding.currentIds.includes("bats")));
  assert.ok(report.taxonomyFindings.some((finding) =>
    finding.kind === "synonymous-ids"
    && finding.currentIds.includes("bat")
    && finding.currentIds.includes("baseball-bat")
    && finding.proposedCanonicalId === "bb-bats"));
  assert.ok(report.taxonomyFindings.some((finding) =>
    finding.kind === "display-group-fragmentation"
    && finding.currentIds.includes("bb-bats")
    && finding.currentIds.includes("bats")));
  const inventory = report.taxonomyInventory.equipmentTypes.filter((row) =>
    ["bb-bats", "bat", "bats"].includes(row.id));
  assert.deepEqual(inventory.map((row) => row.id).sort(), ["bat", "bats", "bb-bats"]);
  assert.equal(inventory.find((row) => row.id === "bat")?.disposition, "legacy-alias");
  assert.equal(inventory.find((row) => row.id === "bb-bats")?.dealCount, 1);
});

test("proposes an Other bat with seller/source evidence but leaves canonical records unchanged", () => {
  const report = buildTaxonomyAuditReport(fixture());
  const otherBat = report.correctionGroups.find((group) =>
    group.examples.some((example) => example.id === "other-bat"));
  assert.ok(otherBat);
  assert.equal(otherBat.proposedSportId, "baseball");
  assert.equal(otherBat.proposedCanonicalEquipmentTypeId, "bb-bats");
  assert.equal(otherBat.confidence, "high");
  assert.equal(otherBat.sourceId, "ebay");
  assert.equal(otherBat.seller, "bat-seller");
  assert.ok(!report.correctionGroups.some((group) =>
    group.examples.some((example) => example.id === "canonical-bat")));
});

test("keeps ambiguous Other products pending and audits other sports", () => {
  const report = buildTaxonomyAuditReport(fixture());
  const ambiguous = report.correctionGroups.find((group) =>
    group.examples.some((example) => example.id === "ambiguous"));
  assert.ok(ambiguous);
  assert.equal(ambiguous.status, "pending");
  assert.equal(ambiguous.proposedCanonicalEquipmentTypeId, null);
  assert.equal(ambiguous.humanApprovalRequired, true);

  const basketball = report.correctionGroups.find((group) =>
    group.examples.some((example) => example.id === "basketball-other"));
  assert.ok(basketball);
  assert.equal(basketball.proposedSportId, "basketball");
  assert.equal(basketball.proposedCanonicalEquipmentTypeId, "bk-balls");
  assert.equal(basketball.humanApprovalRequired, true);
});

test("reports brand aliases, source categories, field coverage, and identifier conflicts", () => {
  const report = buildTaxonomyAuditReport(fixture());
  assert.ok(report.brandInventory.some((brand) =>
    brand.storedValue === "Louisville Sluggers"
    && brand.proposedCanonicalValue === "Louisville Slugger"
    && brand.isAlias));
  assert.ok(report.sourceCategoryInventory.some((category) =>
    category.sourceId === "ebay" && category.storedValue === "Baseball & Softball"));
  assert.ok(report.fieldCoverage.some((field) => field.field === "upc" && field.present === 2));
  assert.ok(report.taxonomyFindings.some((finding) =>
    finding.kind === "identifier-conflict" && finding.label === "upc:123456789012"));
});

test("emits machine-readable CSV and a concise Markdown summary", () => {
  const report = buildTaxonomyAuditReport(fixture(), { generatedAt: "2026-07-21T00:00:00.000Z" });
  const csv = taxonomyAuditCorrectionsCsv(report);
  const markdown = taxonomyAuditMarkdown(report);
  assert.match(csv, /^sportId,equipmentFamily,sourceId,/);
  assert.match(csv, /bb-bats/);
  assert.match(markdown, /Read-only report/);
  assert.match(markdown, /all 5 deals across 2 sports/);
});

test("CLI has no apply or mutation mode and the database snapshot is transaction-read-only", () => {
  assert.deepEqual(parseTaxonomyAuditInvocation([]), { format: "json", outputDir: null });
  assert.deepEqual(parseTaxonomyAuditInvocation([
    "--format", "bundle", "--output-dir", "audit-out",
  ]), { format: "bundle", outputDir: "audit-out" });
  for (const flag of ["--apply", "--execute", "--update", "--delete", "--merge", "--recategorize"]) {
    assert.throws(() => parseTaxonomyAuditInvocation([flag]), /read-only and has no apply mode/);
  }
  const databaseSource = readFileSync(join(process.cwd(), "server", "taxonomy-audit-db.ts"), "utf8");
  assert.match(databaseSource, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY/);
  assert.doesNotMatch(databaseSource, /\.insert\(|\.update\(|\.delete\(|\bALTER\b|\bTRUNCATE\b/i);
});

test("assignment-path inventory covers every current taxonomy writer/projector and points to real files", () => {
  const required = [
    "approved-static-seed", "ebay-keyword-category-seller", "cj-affiliate", "impact-catalog",
    "amazon", "shareasale-rakuten", "shopify", "woocommerce", "playitagain", "sidelineswap",
    "baseball-resale", "fanatics-feed", "bulk-upsert-and-brand-normalization",
    "shared-sub-filter-classifier", "ai-auto-classification", "ai-review-approval",
    "admin-taxonomy-and-deal-edit", "search-read-projection",
  ];
  assert.deepEqual(TAXONOMY_ASSIGNMENT_PATHS.map((path) => path.id), required);
  for (const path of TAXONOMY_ASSIGNMENT_PATHS) {
    for (const file of path.files) assert.ok(existsSync(join(process.cwd(), file)), `${path.id}: ${file}`);
  }
});
