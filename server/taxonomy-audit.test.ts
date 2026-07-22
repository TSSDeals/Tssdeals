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
        raw: {
          ebaySeller: "bat-seller", categoryName: "Baseball & Softball",
          productType: "Baseball Bats", upc: "123456789012",
        },
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

test("requires compatible title and structured evidence for a high-confidence Other bat", () => {
  const report = buildTaxonomyAuditReport(fixture());
  const otherBat = report.correctionGroups.find((group) =>
    group.examples.some((example) => example.id === "other-bat"));
  assert.ok(otherBat);
  assert.equal(otherBat.proposedSportId, "baseball");
  assert.equal(otherBat.proposedCanonicalEquipmentTypeId, "bb-bats");
  assert.equal(otherBat.confidence, "high");
  assert.equal(otherBat.humanApprovalRequired, false);
  assert.ok(otherBat.evidence.some((item) => item.includes("structured productType")));
  assert.equal(otherBat.sourceId, "ebay");
  assert.equal(otherBat.seller, "bat-seller");
  assert.ok(!report.correctionGroups.some((group) =>
    group.examples.some((example) => example.id === "canonical-bat")));
});

function hardeningFixture(deals: TaxonomyAuditDataset["deals"]): TaxonomyAuditDataset {
  const base = fixture();
  return {
    ...base,
    sports: [
      ...base.sports,
      { id: "football", name: "Football", userCreated: false },
    ],
    equipmentTypes: [
      ...base.equipmentTypes,
      { id: "bb-balls", name: "Balls", sportId: "baseball", userCreated: false },
      { id: "bb-cleats", name: "Cleats", sportId: "baseball", userCreated: false },
      { id: "bb-protective", name: "Protective Equipment", sportId: "baseball", userCreated: false },
      { id: "bb-bags", name: "Bags", sportId: "baseball", userCreated: false },
      { id: "bb-shoes-apparel", name: "Shoes & Apparel", sportId: "baseball", userCreated: false },
      { id: "bb-batting-gloves", name: "Batting Gloves", sportId: "baseball", userCreated: false },
      { id: "bb-training", name: "Training Equipment", sportId: "baseball", userCreated: false },
      { id: "bk-shoes-apparel", name: "Shoes & Apparel", sportId: "basketball", userCreated: false },
      { id: "bk-hoops-nets", name: "Hoops & Nets", sportId: "basketball", userCreated: false },
      { id: "fb-balls", name: "Balls", sportId: "football", userCreated: false },
      { id: "fb-protective", name: "Protective Equipment", sportId: "football", userCreated: false },
      { id: "fb-other", name: "Other", sportId: "football", userCreated: false },
    ],
    sources: [
      ...base.sources,
      { id: "fanatics", name: "Fanatics", category: "licensed merchandise" },
      { id: "academy-sports", name: "Academy Sports", category: "multi-sport" },
      { id: "sidelineswap", name: "SidelineSwap", category: "multi-sport resale" },
    ],
    deals,
  };
}

function correctionFor(report: ReturnType<typeof buildTaxonomyAuditReport>, id: string) {
  return report.correctionGroups.find((group) =>
    group.examples.some((example) => example.id === id));
}

test("sport names never turn specific equipment into baseballs, basketballs, or footballs", () => {
  const report = buildTaxonomyAuditReport(hardeningFixture([
    { id: "baseball-apparel", sourceId: "ebay", title: "Marucci Script Adult Baseball Leadoff Hoodie", sportId: "baseball", equipmentTypeId: "bb-balls" },
    { id: "baseball-cleats", sourceId: "academy-sports", title: "Nike Alpha Huarache Baseball Cleats", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "baseball-helmet", sourceId: "ebay", title: "All-Star Adult Baseball Catcher's Helmet", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "baseball-glove", sourceId: "ebay", title: "Wilson A2000 1786 11.5 Baseball Glove", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Baseball Gloves" } },
    { id: "baseball-bag", sourceId: "ebay", title: "Louisville Slugger Baseball Bat Bag", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Baseball Bags" } },
    { id: "basketball-shoes", sourceId: "academy-sports", title: "Nike Women's Sabrina 3 Basketball Shoes", sportId: "basketball", equipmentTypeId: "bk-other" },
    { id: "basketball-hoop", sourceId: "academy-sports", title: "Silverback 60 inch Basketball Hoop", sportId: "basketball", equipmentTypeId: "bk-other" },
    { id: "football-facemask", sourceId: "sidelineswap", title: "Riddell Adult Football Facemask", sportId: "football", equipmentTypeId: "fb-other" },
    { id: "fifa-football", sourceId: "ebay", title: "FIFA World Cup 2026 Football Size 5", sportId: "football", equipmentTypeId: "fb-other" },
  ]));

  const expected = new Map([
    ["baseball-cleats", "bb-cleats"],
    ["baseball-helmet", "bb-protective"],
    ["baseball-glove", "bb-gloves"],
    ["basketball-shoes", "bk-shoes-apparel"],
    ["basketball-hoop", "bk-hoops-nets"],
    ["football-facemask", "fb-protective"],
  ]);
  for (const [id, destination] of expected) {
    assert.equal(correctionFor(report, id)?.proposedCanonicalEquipmentTypeId, destination, id);
  }
  for (const id of [
    "baseball-apparel", "baseball-cleats", "baseball-helmet", "baseball-glove", "baseball-bag",
    "basketball-shoes", "basketball-hoop", "football-facemask",
    "fifa-football",
  ]) {
    assert.ok(!["bb-balls", "bk-balls", "fb-balls"].includes(
      correctionFor(report, id)?.proposedCanonicalEquipmentTypeId ?? ""), id);
  }
  assert.equal(correctionFor(report, "baseball-apparel")?.status, "pending");
  assert.equal(correctionFor(report, "baseball-bag")?.status, "pending");
  assert.equal(correctionFor(report, "fifa-football")?.status, "pending");
});

test("high-confidence proposals require two independent compatible signals", () => {
  const report = buildTaxonomyAuditReport(hardeningFixture([
    { id: "title-only-bat", sourceId: "ebay", title: "2026 Louisville Slugger Atlas BBCOR Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "structured-bat", sourceId: "ebay", title: "2026 Louisville Slugger Atlas BBCOR Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Baseball Bats" } },
    { id: "bat-bag", sourceId: "ebay", title: "Marucci Baseball Bat Bag Backpack", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Baseball Bats" } },
  ]));
  const titleOnly = correctionFor(report, "title-only-bat");
  assert.equal(titleOnly?.proposedCanonicalEquipmentTypeId, "bb-bats");
  assert.equal(titleOnly?.confidence, "medium");
  assert.equal(titleOnly?.humanApprovalRequired, true);
  const structured = correctionFor(report, "structured-bat");
  assert.equal(structured?.confidence, "high");
  assert.equal(structured?.humanApprovalRequired, false);
  assert.ok((structured?.evidence.length ?? 0) >= 2);
  assert.ok(report.correctionGroups
    .filter((group) => group.confidence === "medium")
    .every((group) => group.humanApprovalRequired));
  assert.equal(correctionFor(report, "bat-bag")?.status, "pending");
  assert.equal(correctionFor(report, "bat-bag")?.proposedCanonicalEquipmentTypeId, null);
});

test("generic structured glove values do not imply Baseball fielding gloves", () => {
  const report = buildTaxonomyAuditReport(hardeningFixture([
    { id: "golf-gloves", sourceId: "ebay", title: "Titleist Players Golf Gloves", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Gloves" } },
    { id: "boxing-gloves", sourceId: "ebay", title: "Everlast Elite Boxing Training Gloves", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Gloves" } },
    { id: "work-gloves", sourceId: "ebay", title: "Mechanix Wear Heavy Duty Work Gloves", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Gloves" } },
    { id: "winter-gloves", sourceId: "ebay", title: "Insulated Waterproof Winter Gloves", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Gloves" } },
    { id: "batting-gloves", sourceId: "ebay", title: "Franklin CFX Pro Baseball Batting Gloves", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Gloves" } },
  ]));

  for (const id of ["golf-gloves", "boxing-gloves", "work-gloves", "winter-gloves", "batting-gloves"]) {
    const correction = correctionFor(report, id);
    assert.equal(correction?.status, "pending", id);
    assert.equal(correction?.proposedCanonicalEquipmentTypeId, null, id);
  }
});

test("generic structured bat values do not imply Baseball bats", () => {
  const report = buildTaxonomyAuditReport(hardeningFixture([
    { id: "cricket-bat", sourceId: "ebay", title: "Gray-Nicolls English Willow Cricket Bat", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Bats" } },
    { id: "fastpitch-bat", sourceId: "ebay", title: "Easton Ghost USSSA Fastpitch Bat", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Bats" } },
    { id: "slowpitch-bat", sourceId: "ebay", title: "Miken DC 41 USSSA Slowpitch Bat", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Bats" } },
  ]));

  for (const id of ["cricket-bat", "fastpitch-bat", "slowpitch-bat"]) {
    assert.notEqual(correctionFor(report, id)?.proposedCanonicalEquipmentTypeId, "bb-bats", id);
  }
  assert.equal(correctionFor(report, "cricket-bat")?.status, "pending");
  assert.equal(correctionFor(report, "cricket-bat")?.proposedCanonicalEquipmentTypeId, null);
  assert.equal(correctionFor(report, "fastpitch-bat")?.proposedCanonicalEquipmentTypeId, "fp-bats");
  assert.equal(correctionFor(report, "slowpitch-bat")?.proposedCanonicalEquipmentTypeId, "sp-bats");
});

test("Baseball-specific structured bat and fielding-glove evidence remains eligible", () => {
  const report = buildTaxonomyAuditReport(hardeningFixture([
    { id: "valid-baseball-bat", sourceId: "ebay", title: "2026 Louisville Slugger Atlas BBCOR Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Baseball Bats" } },
    { id: "valid-baseball-glove", sourceId: "ebay", title: "Wilson A2000 1786 11.5 Baseball Glove", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Baseball Fielding Gloves" } },
  ]));

  for (const [id, destination] of [
    ["valid-baseball-bat", "bb-bats"],
    ["valid-baseball-glove", "bb-gloves"],
  ] as const) {
    const correction = correctionFor(report, id);
    assert.equal(correction?.proposedCanonicalEquipmentTypeId, destination, id);
    assert.equal(correction?.confidence, "high", id);
    assert.equal(correction?.humanApprovalRequired, false, id);
    assert.ok(correction?.evidence.some((item) => item.includes("structured productType")), id);
  }
});

test("Fanatics apparel, collectibles, and memorabilia remain pending", () => {
  const report = buildTaxonomyAuditReport(hardeningFixture([
    { id: "fanatics-autograph", sourceId: "fanatics", title: "Riley Greene Detroit Tigers Autographed Baseball", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "fanatics-shirt", sourceId: "fanatics", title: "Mike Trout Baseball Card Tri-Blend T-Shirt", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "fanatics-jersey", sourceId: "fanatics", title: "USA Baseball World Baseball Classic Stadium Jersey", sportId: "baseball", equipmentTypeId: "bb-other", raw: { tags: "USA Baseball" } },
  ]));
  for (const id of ["fanatics-autograph", "fanatics-shirt", "fanatics-jersey"]) {
    const correction = correctionFor(report, id);
    assert.equal(correction?.status, "pending", id);
    assert.equal(correction?.proposedCanonicalEquipmentTypeId, null, id);
  }
});

test("identifier consensus requires two supported records that agree", () => {
  const report = buildTaxonomyAuditReport(hardeningFixture([
    { id: "bat-reference-1", sourceId: "justbats", title: "Marucci CATX USSSA Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-bats", raw: { sku: "CATX-CONSENSUS" } },
    { id: "bat-reference-2", sourceId: "justbats", title: "Marucci CATX BBCOR Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-bats", raw: { sku: "CATX-CONSENSUS" } },
    { id: "identity-only", sourceId: "ebay", title: "Marucci CATX Senior League Item", sportId: "baseball", equipmentTypeId: "bb-other", raw: { sku: "CATX-CONSENSUS" } },
    { id: "identity-plus-title", sourceId: "ebay", title: "Marucci CATX USSSA Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-other", raw: { sku: "CATX-CONSENSUS" } },
    { id: "conflict-bat-1", sourceId: "justbats", title: "Louisville Slugger BBCOR Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-bats", raw: { itemNumber: "CONFLICT-100" } },
    { id: "conflict-bat-2", sourceId: "justbats", title: "Easton USSSA Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-bats", raw: { itemNumber: "CONFLICT-100" } },
    { id: "conflict-ball-1", sourceId: "ebay", title: "Rawlings Baseballs Dozen", sportId: "baseball", equipmentTypeId: "bb-balls", raw: { itemNumber: "CONFLICT-100" } },
    { id: "conflict-ball-2", sourceId: "ebay", title: "Wilson Baseballs Dozen", sportId: "baseball", equipmentTypeId: "bb-balls", raw: { itemNumber: "CONFLICT-100" } },
    { id: "conflicted-target", sourceId: "ebay", title: "Rawlings Sporting Goods Item", sportId: "baseball", equipmentTypeId: "bb-other", raw: { itemNumber: "CONFLICT-100" } },
    { id: "wrong-reference-1", sourceId: "academy-sports", title: "Nike Sabrina Basketball Shoes", sportId: "baseball", equipmentTypeId: "bb-balls", raw: { upc: "123456789099" } },
    { id: "wrong-reference-2", sourceId: "academy-sports", title: "Under Armour Basketball Shoes", sportId: "baseball", equipmentTypeId: "bb-balls", raw: { upc: "123456789099" } },
    { id: "wrong-consensus-target", sourceId: "ebay", title: "Nike Sporting Goods Item", sportId: "baseball", equipmentTypeId: "bb-other", raw: { upc: "123456789099" } },
  ]));
  const identityOnly = correctionFor(report, "identity-only");
  assert.equal(identityOnly?.proposedCanonicalEquipmentTypeId, "bb-bats");
  assert.equal(identityOnly?.confidence, "medium");
  assert.equal(identityOnly?.humanApprovalRequired, true);
  const identityPlusTitle = correctionFor(report, "identity-plus-title");
  assert.equal(identityPlusTitle?.confidence, "high");
  assert.equal(identityPlusTitle?.humanApprovalRequired, false);
  assert.equal(correctionFor(report, "conflicted-target")?.status, "pending");
  assert.equal(correctionFor(report, "conflicted-target")?.proposedCanonicalEquipmentTypeId, null);
  assert.equal(correctionFor(report, "wrong-consensus-target")?.status, "pending");
  assert.equal(correctionFor(report, "wrong-consensus-target")?.proposedCanonicalEquipmentTypeId, null);
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
