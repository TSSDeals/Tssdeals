import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseTaxonomyAuditInvocation } from "./taxonomy-audit-cli";
import { TAXONOMY_ASSIGNMENT_PATHS } from "./taxonomy-assignment-paths";
import {
  buildTaxonomyAuditReport,
  isValidGtin,
  taxonomyAuditCorrectionsCsv,
  taxonomyAuditIdentifierFindingsCsv,
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
      { id: "bb-bags", name: "Bat Bags / Equipment Bags", sportId: "baseball", userCreated: false },
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

function phase12Fixture(deals: TaxonomyAuditDataset["deals"]): TaxonomyAuditDataset {
  const base = hardeningFixture(deals);
  return {
    ...base,
    sports: [
      ...base.sports,
      { id: "fastpitch-softball", name: "Fastpitch Softball", userCreated: false },
      { id: "slowpitch-softball", name: "Slowpitch Softball", userCreated: false },
      { id: "golf", name: "Golf", userCreated: false },
      { id: "running", name: "Running", userCreated: false },
    ],
    equipmentTypes: [
      ...base.equipmentTypes,
      { id: "fp-balls", name: "Balls", sportId: "fastpitch-softball", userCreated: false },
      { id: "fp-bats", name: "Bats", sportId: "fastpitch-softball", userCreated: false },
      { id: "fp-gloves", name: "Gloves", sportId: "fastpitch-softball", userCreated: false },
      { id: "fp-protective", name: "Protective Equipment", sportId: "fastpitch-softball", userCreated: false },
      { id: "fp-training", name: "Training Equipment", sportId: "fastpitch-softball", userCreated: false },
      { id: "fp-other", name: "Other", sportId: "fastpitch-softball", userCreated: false },
      { id: "sp-balls", name: "Balls", sportId: "slowpitch-softball", userCreated: false },
      { id: "sp-bats", name: "Bats", sportId: "slowpitch-softball", userCreated: false },
      { id: "sp-gloves", name: "Gloves", sportId: "slowpitch-softball", userCreated: false },
      { id: "sp-protective", name: "Protective Equipment", sportId: "slowpitch-softball", userCreated: false },
      { id: "sp-training", name: "Training Equipment", sportId: "slowpitch-softball", userCreated: false },
      { id: "sp-other", name: "Other", sportId: "slowpitch-softball", userCreated: false },
      { id: "golf-shoes-apparel", name: "Shoes / Apparel", sportId: "golf", userCreated: false },
      { id: "run-apparel", name: "Apparel", sportId: "running", userCreated: false },
      { id: "run-shorts", name: "Shorts", sportId: "running", userCreated: false },
      { id: "run-socks", name: "Socks", sportId: "running", userCreated: false },
    ],
  };
}

function phase13Fixture(deals: TaxonomyAuditDataset["deals"]): TaxonomyAuditDataset {
  const base = phase12Fixture(deals);
  return {
    ...base,
    sports: [
      ...base.sports,
      { id: "cycling", name: "Cycling", userCreated: false },
      { id: "soccer", name: "Soccer", userCreated: false },
    ],
    equipmentTypes: [
      ...base.equipmentTypes,
      { id: "cyc-bikes", name: "Bicycles", sportId: "cycling", userCreated: false },
      { id: "cyc-other", name: "Other", sportId: "cycling", userCreated: false },
      { id: "soc-balls", name: "Balls", sportId: "soccer", userCreated: false },
      { id: "soc-nets", name: "Nets", sportId: "soccer", userCreated: false },
      { id: "soc-other", name: "Other", sportId: "soccer", userCreated: false },
    ],
  };
}

function phase14Fixture(deals: TaxonomyAuditDataset["deals"]): TaxonomyAuditDataset {
  const base = phase13Fixture(deals);
  return {
    ...base,
    sports: [
      ...base.sports,
      { id: "swimming", name: "Swimming", userCreated: false },
      { id: "tennis", name: "Tennis", userCreated: false },
    ],
    equipmentTypes: [
      ...base.equipmentTypes,
      { id: "run-shoes", name: "Shoes", sportId: "running", userCreated: false },
      { id: "swim-goggles", name: "Goggles", sportId: "swimming", userCreated: false },
      { id: "swim-other", name: "Other", sportId: "swimming", userCreated: false },
      { id: "ten-accessories", name: "Accessories", sportId: "tennis", userCreated: false },
      { id: "ten-other", name: "Other", sportId: "tennis", userCreated: false },
    ],
    sources: [
      ...base.sources,
      { id: "direct-sports", name: "Direct Sports", category: "multi-sport" },
      { id: "impact-wilson", name: "Wilson Sporting Goods Co", category: "multi-sport" },
    ],
  };
}

test("bat holders, racks, organizers, and grip products do not become Bats", () => {
  const report = buildTaxonomyAuditReport(phase13Fixture([
    { id: "bat-holder", sourceId: "ebay", title: "Heavy Duty Baseball Bat Holder - Wall Mounted Dugout Rack for 14 Bats", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "bat-rack-organizer", sourceId: "ebay", title: "Baseball Bat Rack Organizer for Dugout", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "bulk-grip-wrap", sourceId: "ebay", title: "40 Bat Grip Tape 1.75mm Soft Non Slip Baseball Bat Grip Wrap", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "pushglossy-grips", sourceId: "ebay", title: "Pushglossy Baseball Bat Grip Tapes", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "horizontal-rack", sourceId: "ebay", title: "Baseball Bat Horizontal Rack", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "bat-grip-tape", sourceId: "ebay", title: "Baseball Bat Grip Tape", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "new-grip-bat", sourceId: "ebay", title: "Easton Hype Fire 27/17 USSSA Baseball Bat New Grip", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "bad-grip-bat", sourceId: "ebay", title: "Louisville Slugger Supra 27/17 Baseball Bat Bad Grip", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "grip-brand-bat", sourceId: "ebay", title: "Marucci CATX BBCOR Baseball Bat with Lizard Skins Grip", sportId: "baseball", equipmentTypeId: "bb-other" },
  ]));

  for (const id of [
    "bat-holder", "bat-rack-organizer", "bulk-grip-wrap",
    "pushglossy-grips", "horizontal-rack",
  ]) {
    const correction = correctionFor(report, id);
    assert.equal(correction?.status, "pending", id);
    assert.equal(correction?.outcome, "ambiguous-evidence", id);
    assert.equal(correction?.proposedCanonicalEquipmentTypeId, null, id);
  }
  const gripTapeOnly = buildTaxonomyAuditReport(phase13Fixture([
    { id: "bat-grip-tape", sourceId: "ebay", title: "Baseball Bat Grip Tape", sportId: "baseball", equipmentTypeId: "bb-other" },
  ]));
  assert.equal(correctionFor(gripTapeOnly, "bat-grip-tape")?.status, "pending");
  assert.equal(correctionFor(gripTapeOnly, "bat-grip-tape")?.outcome, "ambiguous-evidence");
  assert.equal(correctionFor(gripTapeOnly, "bat-grip-tape")?.proposedCanonicalEquipmentTypeId, null);
  for (const id of ["new-grip-bat", "bad-grip-bat", "grip-brand-bat"]) {
    assert.equal(correctionFor(report, id)?.proposedCanonicalEquipmentTypeId, "bb-bats", id);
  }
});

test("softball product form distinguishes protective gear, bats, balls, and training equipment", () => {
  const report = buildTaxonomyAuditReport(phase13Fixture([
    { id: "rawlings-mask", sourceId: "ebay", title: "Rawlings HIVIZ Fast Pitch Softball Fielders' Mask", sportId: "fastpitch-softball", equipmentTypeId: "fp-balls" },
    { id: "rawlings-mask-curly", sourceId: "ebay", title: "Rawlings HIVIZ Fast Pitch Softball Fielders’ Mask", sportId: "fastpitch-softball", equipmentTypeId: "fp-balls" },
    { id: "easton-dimensioned-bat", sourceId: "ebay", title: "Easton Stealth Clarity SSR1B VCT Composite Fastpitch Softball 33\" 23oz -10", sportId: "fastpitch-softball", equipmentTypeId: "fp-balls" },
    { id: "miken-dimensioned-bat", sourceId: "ebay", title: "Miken Maniac Slowpitch Softball 34in 27oz Alloy", sportId: "slowpitch-softball", equipmentTypeId: "sp-balls" },
    { id: "eleven-inch-softball", sourceId: "ebay", title: "Rawlings Fastpitch Softball 11 inch", sportId: "fastpitch-softball", equipmentTypeId: "fp-other" },
    { id: "twelve-inch-softball", sourceId: "ebay", title: "Wilson Fastpitch Softball 12 inch", sportId: "fastpitch-softball", equipmentTypeId: "fp-other" },
    { id: "sixteen-inch-softball", sourceId: "ebay", title: "DeMarini Slowpitch Softball 16 inch", sportId: "slowpitch-softball", equipmentTypeId: "sp-other" },
    { id: "generic-fastpitch-structured", sourceId: "ebay", title: "Easton Fastpitch Softball Equipment", sportId: "fastpitch-softball", equipmentTypeId: "fp-other", raw: { productType: "Fastpitch Softball" } },
    { id: "training-softballs", sourceId: "ebay", title: "Fastpitch Softball Training Balls", sportId: "fastpitch-softball", equipmentTypeId: "fp-balls" },
  ]));

  for (const id of ["rawlings-mask", "rawlings-mask-curly"]) {
    const correction = correctionFor(report, id);
    assert.notEqual(correction?.proposedCanonicalEquipmentTypeId, "fp-balls", id);
    assert.equal(correction?.proposedCanonicalEquipmentTypeId, "fp-protective", id);
  }
  assert.equal(correctionFor(report, "easton-dimensioned-bat")?.proposedCanonicalEquipmentTypeId, "fp-bats");
  assert.equal(correctionFor(report, "miken-dimensioned-bat")?.proposedCanonicalEquipmentTypeId, "sp-bats");
  for (const id of ["eleven-inch-softball", "twelve-inch-softball", "sixteen-inch-softball"]) {
    assert.ok(!["fp-bats", "sp-bats"].includes(
      correctionFor(report, id)?.proposedCanonicalEquipmentTypeId ?? ""), id);
  }
  assert.notEqual(correctionFor(report, "generic-fastpitch-structured")?.proposedCanonicalEquipmentTypeId, "fp-balls");
  assert.equal(correctionFor(report, "training-softballs")?.proposedCanonicalEquipmentTypeId, "fp-training");
});

test("ball containers, holders, novelty references, and training products do not become ordinary Balls", () => {
  const report = buildTaxonomyAuditReport(phase13Fixture([
    { id: "a1030-bucket", sourceId: "ebay", title: "Wilson Bucket Combo With 3 Dozen A1030B Baseballs", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "a1010-bucket", sourceId: "ebay", title: "Wilson Bucket Combo With 3 Dozen A1010S Blem Baseballs", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "practice-balls-bucket", sourceId: "ebay", title: "Official League Youth Baseballs Practice Balls Bucket", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "baseballs-bucket", sourceId: "ebay", title: "Official Baseballs Bucket", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "baseballs-with-bucket-phase13", sourceId: "ebay", title: "Official Baseballs With Bucket", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "ball-holder", sourceId: "ebay", title: "Small Hand-Sculptured Ball Holder & Stand", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Baseball Balls" } },
    { id: "stadium-horns", sourceId: "ebay", title: "Stadium Horns Noisemakers for Games Soccer Ball Party", sportId: "soccer", equipmentTypeId: "soc-other" },
    { id: "fastpitch-training", sourceId: "ebay", title: "Fastpitch Softball Training Balls", sportId: "fastpitch-softball", equipmentTypeId: "fp-other" },
  ]));

  for (const id of [
    "a1030-bucket", "a1010-bucket", "practice-balls-bucket", "baseballs-bucket",
    "baseballs-with-bucket-phase13", "ball-holder", "stadium-horns",
  ]) {
    assert.ok(!["bb-balls", "fp-balls", "sp-balls", "soc-balls"].includes(
      correctionFor(report, id)?.proposedCanonicalEquipmentTypeId ?? ""), id);
  }
  assert.equal(correctionFor(report, "fastpitch-training")?.proposedCanonicalEquipmentTypeId, "fp-training");
});

test("bicycle accessories stay pending while an actual bicycle remains eligible", () => {
  const report = buildTaxonomyAuditReport(phase13Fixture([
    { id: "bike-pedals", sourceId: "ebay", title: "Bell Kicks Mountain Bike Pedals", sportId: "cycling", equipmentTypeId: "cyc-other" },
    { id: "bike-grips", sourceId: "ebay", title: "Bell Pump BMX Bicycle Grips", sportId: "cycling", equipmentTypeId: "cyc-other" },
    { id: "bike-pegs", sourceId: "ebay", title: "Bell BMX Bike Pegs", sportId: "cycling", equipmentTypeId: "cyc-other" },
    { id: "huffy-bicycle", sourceId: "ebay", title: "Huffy Granite Mountain Bicycle", sportId: "cycling", equipmentTypeId: "cyc-other" },
  ]));

  for (const id of ["bike-pedals", "bike-grips", "bike-pegs"]) {
    const correction = correctionFor(report, id);
    assert.equal(correction?.status, "pending", id);
    assert.notEqual(correction?.proposedCanonicalEquipmentTypeId, "cyc-bikes", id);
  }
  assert.equal(correctionFor(report, "huffy-bicycle")?.proposedCanonicalEquipmentTypeId, "cyc-bikes");
});

test("goal and hoop accessories stay pending while genuine goals, hoops, rims, backboards, and nets remain eligible", () => {
  const report = buildTaxonomyAuditReport(phase13Fixture([
    { id: "goal-target", sourceId: "ebay", title: "Soccer Goal Target Silicone Hockey Shooting Targets", sportId: "soccer", equipmentTypeId: "soc-other" },
    { id: "hoop-weight", sourceId: "ebay", title: "GoSports Basketball Hoop Weight All-Weather Sandbag Cover", sportId: "basketball", equipmentTypeId: "bk-other" },
    { id: "soccer-goal", sourceId: "ebay", title: "Portable Soccer Goal Net", sportId: "soccer", equipmentTypeId: "soc-other" },
    { id: "basketball-hoop-genuine", sourceId: "ebay", title: "Spalding Portable Basketball Hoop", sportId: "basketball", equipmentTypeId: "bk-other" },
    { id: "basketball-rim", sourceId: "ebay", title: "Lifetime Basketball Rim", sportId: "basketball", equipmentTypeId: "bk-other" },
    { id: "basketball-backboard", sourceId: "ebay", title: "Goalsetter Basketball Backboard", sportId: "basketball", equipmentTypeId: "bk-other" },
    { id: "basketball-net", sourceId: "ebay", title: "Champion Sports Basketball Net", sportId: "basketball", equipmentTypeId: "bk-other" },
  ]));

  assert.notEqual(correctionFor(report, "goal-target")?.proposedCanonicalEquipmentTypeId, "soc-nets");
  assert.notEqual(correctionFor(report, "hoop-weight")?.proposedCanonicalEquipmentTypeId, "bk-hoops-nets");
  assert.equal(correctionFor(report, "goal-target")?.status, "pending");
  assert.equal(correctionFor(report, "hoop-weight")?.status, "pending");
  assert.equal(correctionFor(report, "soccer-goal")?.proposedCanonicalEquipmentTypeId, "soc-nets");
  for (const id of [
    "basketball-hoop-genuine", "basketball-rim", "basketball-backboard", "basketball-net",
  ]) {
    assert.equal(correctionFor(report, id)?.proposedCanonicalEquipmentTypeId, "bk-hoops-nets", id);
  }
});

test("gift, souvenir, signature, and autograph-oriented balls stay pending", () => {
  const report = buildTaxonomyAuditReport(phase14Fixture([
    { id: "ice-cream-ball", sourceId: "ebay", title: "6 Pack Ice Cream Drip Theme Baseball Ball 9 Inch Themed Gift Lifestyle Standard", sportId: "baseball", equipmentTypeId: "bb-other", raw: { ebaySeller: "all_about_you" } },
    { id: "signature-baseball", sourceId: "ebay", title: "Franklin Official Leauge Baseball Ball MLB Sports Unidentified Signature", sportId: "baseball", equipmentTypeId: "bb-other", raw: { ebaySeller: "retrodelphia" } },
    { id: "signature-soccer", sourceId: "ebay", title: "England FA Soccer Ball Signature (TA5139)", sportId: "football", equipmentTypeId: "fb-other", raw: { ebaySeller: "pertemba" } },
    { id: "signed-baseball", sourceId: "ebay", title: "Commemorative Signed Baseball", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "souvenir-soccer", sourceId: "ebay", title: "World Cup Souvenir Soccer Ball", sportId: "soccer", equipmentTypeId: "soc-other" },
  ]));

  for (const id of [
    "ice-cream-ball", "signature-baseball", "signature-soccer",
    "signed-baseball", "souvenir-soccer",
  ]) {
    const correction = correctionFor(report, id);
    assert.equal(correction?.status, "pending", id);
    assert.equal(correction?.outcome, "ambiguous-evidence", id);
    assert.equal(correction?.proposedCanonicalEquipmentTypeId, null, id);
  }
});

test("batting-tee replacement toppers, tubes, cups, and components stay pending", () => {
  const report = buildTaxonomyAuditReport(phase14Fixture([
    { id: "replacement-tube", sourceId: "ebay", title: "MacGregor® Batting Tee - Replacement Tube", sportId: "baseball", equipmentTypeId: "bb-other", raw: { ebaySeller: "betzmil-0" } },
    { id: "replacement-topper", sourceId: "ebay", title: "Sumind Batting Tee Topper Replacement Batting Tee Basic Ball Rest Rubber Cup", sportId: "baseball", equipmentTypeId: "bb-bats", raw: { ebaySeller: "dhcinvestments" } },
    { id: "replacement-top-tube", sourceId: "ebay", title: "Baseball Ball Stand Replacement Rubber Topper Top Tube Batting Tee Topper", sportId: "baseball", equipmentTypeId: "bb-bats", raw: { ebaySeller: "leosportry" } },
  ]));

  for (const id of ["replacement-tube", "replacement-topper", "replacement-top-tube"]) {
    const correction = correctionFor(report, id);
    assert.equal(correction?.status, "pending", id);
    assert.notEqual(correction?.proposedCanonicalEquipmentTypeId, "bb-training", id);
  }
});

test("ordinary equipment and narrow autograph-model controls remain eligible", () => {
  const report = buildTaxonomyAuditReport(phase14Fixture([
    { id: "ordinary-baseballs", sourceId: "ebay", title: "Rawlings Official Game Baseballs One Dozen", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "ordinary-soccer-ball", sourceId: "ebay", title: "Adidas FIFA Practice Soccer Ball", sportId: "soccer", equipmentTypeId: "soc-other" },
    { id: "commemorative-practice-ball", sourceId: "ebay", title: "Commemorative Practice Soccer Ball", sportId: "soccer", equipmentTypeId: "soc-other" },
    { id: "complete-tee", sourceId: "ebay", title: "Tanner Complete Baseball Batting Tee", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "pitching-machine", sourceId: "ebay", title: "JUGS M1 Baseball Pitching Machine", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "training-balls-positive", sourceId: "ebay", title: "Rawlings Weighted Baseball Training Balls", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "bat-positive", sourceId: "ebay", title: "Marucci CATX BBCOR Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "glove-positive", sourceId: "ebay", title: "Wilson A2000 1786 11.5 Baseball Glove", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "cleats-positive", sourceId: "ebay", title: "Nike Alpha Huarache Baseball Cleats", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "running-shoes-positive", sourceId: "ebay", title: "Brooks Ghost Running Shoes", sportId: "running", equipmentTypeId: "run-apparel" },
    { id: "swim-goggles-positive", sourceId: "ebay", title: "Speedo Adult Swimming Goggles", sportId: "swimming", equipmentTypeId: "swim-other" },
    { id: "bicycle-positive", sourceId: "ebay", title: "Huffy Granite Mountain Bicycle", sportId: "cycling", equipmentTypeId: "cyc-other" },
    { id: "goal-positive", sourceId: "ebay", title: "Portable Soccer Goal Net", sportId: "soccer", equipmentTypeId: "soc-other" },
    { id: "hoop-positive", sourceId: "ebay", title: "Spalding Portable Basketball Hoop", sportId: "basketball", equipmentTypeId: "bk-other" },
    { id: "autograph-model-glove", sourceId: "ebay", title: "Wilson Catfish Hunter A2161 Baseball Glove Nylon Stitched Autograph Model", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "signature-series-glove", sourceId: "ebay", title: "Rawlings Signature Series Baseball Glove 11.5 inch", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "signature-series-bat", sourceId: "ebay", title: "Ken Griffey Jr Signature Series Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-other" },
  ]));

  const expected = new Map([
    ["ordinary-baseballs", "bb-balls"], ["ordinary-soccer-ball", "soc-balls"],
    ["commemorative-practice-ball", "soc-balls"], ["complete-tee", "bb-training"],
    ["pitching-machine", "bb-training"], ["training-balls-positive", "bb-training"],
    ["bat-positive", "bb-bats"], ["glove-positive", "bb-gloves"],
    ["cleats-positive", "bb-cleats"], ["running-shoes-positive", "run-shoes"],
    ["swim-goggles-positive", "swim-goggles"], ["bicycle-positive", "cyc-bikes"],
    ["goal-positive", "soc-nets"], ["hoop-positive", "bk-hoops-nets"],
    ["autograph-model-glove", "bb-gloves"], ["signature-series-glove", "bb-gloves"],
    ["signature-series-bat", "bb-bats"],
  ]);
  for (const [id, destination] of expected) {
    assert.equal(correctionFor(report, id)?.proposedCanonicalEquipmentTypeId, destination, id);
  }
});

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

test("softball, mixed-use, training-form, and accessory products do not become Baseball categories", () => {
  const report = buildTaxonomyAuditReport(phase12Fixture([
    { id: "jen-schro-gear", sourceId: "ebay", title: "Easton Jen Schro The Very Best Catcher's Box Set | Softball Catcher's Gear", sportId: "fastpitch-softball", equipmentTypeId: "fp-other" },
    { id: "wilson-fastpitch-kit", sourceId: "ebay", title: "Wilson Fastpitch Softball C200 Youth Catcher's Gear Kit", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
    { id: "cif-fastpitch-softballs", sourceId: "ebay", title: "CIF-SS Fastpitch Softballs 12 inch", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats", raw: { wcCategories: "Baseball > Balls" } },
    { id: "dream-seam-softballs", sourceId: "ebay", title: "USA Dream Seam Softballs 12 inch", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats", raw: { wcCategories: "Baseball > Balls" } },
    { id: "mixed-ball-bucket", sourceId: "ebay", title: "Easton Ball Bucket With Cushioned Seat | Baseball/Softball Ball Bucket", sportId: "fastpitch-softball", equipmentTypeId: "fp-balls", raw: { productType: "Baseball Balls" } },
    { id: "weighted-softballs", sourceId: "ebay", title: "Used Markwort 4 PACK WEIGHTED SOFTBALLS BB/SB Training Aid", sportId: "baseball", equipmentTypeId: "bb-training", raw: { piasCategory: "Baseball Balls" } },
    { id: "mixed-training-aid", sourceId: "ebay", title: "Used Rawlings PROTAC TRAINING BALL BB/SB Training Aid", sportId: "baseball", equipmentTypeId: "bb-training", raw: { piasCategory: "Baseball Balls" } },
    { id: "liberty-fastpitch-mitt", sourceId: "ebay", title: "Rawlings Liberty Advanced 34 Fastpitch Softball Catcher's Mitt", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "mixed-glove-lace", sourceId: "ebay", title: "Softball/Baseball Glove Lace, Mitt Lace Repair Kit Includes 2 Leather Laces", sportId: "baseball", equipmentTypeId: "bb-other", raw: { productType: "Baseball Gloves" } },
    { id: "baseball-weighted-ball", sourceId: "ebay", title: "Markwort Weighted Baseball Training Ball", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "baseball-machine-balls", sourceId: "ebay", title: "Tater Foam Baseball Pitching Machine Balls", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "baseball-ball-container", sourceId: "ebay", title: "Rawlings Baseball Ball Bucket With Lid", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "baseballs-with-bucket", sourceId: "ebay", title: "Rawlings 24 ROLB1X Baseballs With Bucket", sportId: "baseball", equipmentTypeId: "bb-other" },
  ]));

  const forbiddenBaseballDestinations = new Set(["bb-balls", "bb-gloves", "bb-protective"]);
  for (const id of [
    "jen-schro-gear", "wilson-fastpitch-kit", "cif-fastpitch-softballs",
    "dream-seam-softballs", "mixed-ball-bucket", "weighted-softballs",
    "mixed-training-aid", "liberty-fastpitch-mitt", "mixed-glove-lace",
    "baseball-ball-container", "baseballs-with-bucket",
  ]) {
    assert.ok(!forbiddenBaseballDestinations.has(
      correctionFor(report, id)?.proposedCanonicalEquipmentTypeId ?? ""), id);
  }

  assert.equal(correctionFor(report, "jen-schro-gear")?.proposedCanonicalEquipmentTypeId, "fp-protective");
  assert.equal(correctionFor(report, "wilson-fastpitch-kit")?.proposedCanonicalEquipmentTypeId, "fp-protective");
  assert.equal(correctionFor(report, "cif-fastpitch-softballs")?.proposedCanonicalEquipmentTypeId, "fp-balls");
  assert.equal(correctionFor(report, "liberty-fastpitch-mitt")?.proposedCanonicalEquipmentTypeId, "fp-gloves");
  for (const id of ["mixed-ball-bucket", "weighted-softballs", "mixed-training-aid", "mixed-glove-lace"]) {
    const correction = correctionFor(report, id);
    assert.equal(correction?.status, "pending", id);
    assert.equal(correction?.outcome, "ambiguous-evidence", id);
    assert.equal(correction?.proposedCanonicalEquipmentTypeId, null, id);
  }
  assert.equal(correctionFor(report, "baseball-weighted-ball")?.proposedCanonicalEquipmentTypeId, "bb-training");
  assert.equal(correctionFor(report, "baseball-machine-balls")?.proposedCanonicalEquipmentTypeId, "bb-training");
  assert.equal(correctionFor(report, "baseball-ball-container")?.status, "pending");
  assert.equal(correctionFor(report, "baseballs-with-bucket")?.status, "pending");
});

test("canonical stored sport equipment families are compatible no-action records", () => {
  const deals: TaxonomyAuditDataset["deals"] = [
    { id: "golf-shoes", sourceId: "ebay", title: "FootJoy Pro SL Golf Shoes", sportId: "golf", equipmentTypeId: "golf-shoes-apparel" },
    { id: "golf-apparel", sourceId: "ebay", title: "FootJoy Men's Golf Polo Shirt", sportId: "golf", equipmentTypeId: "golf-shoes-apparel" },
    { id: "running-socks", sourceId: "ebay", title: "Balega Hidden Comfort Running Socks", sportId: "running", equipmentTypeId: "run-socks" },
    { id: "running-shorts", sourceId: "ebay", title: "Brooks Running Shorts", sportId: "running", equipmentTypeId: "run-shorts" },
    { id: "running-apparel", sourceId: "ebay", title: "Saucony Running Shirt", sportId: "running", equipmentTypeId: "run-apparel" },
    { id: "basketball-shoes-canonical", sourceId: "ebay", title: "Nike Sabrina Basketball Shoes", sportId: "basketball", equipmentTypeId: "bk-shoes-apparel" },
    { id: "basketball-apparel-canonical", sourceId: "ebay", title: "Nike Basketball Shorts", sportId: "basketball", equipmentTypeId: "bk-shoes-apparel" },
    { id: "baseball-bag-canonical", sourceId: "ebay", title: "Easton Walk-Off Baseball Bat Bag", sportId: "baseball", equipmentTypeId: "bb-bags" },
    { id: "baseball-equipment-bag-canonical", sourceId: "ebay", title: "Champro Baseball Equipment Bag", sportId: "baseball", equipmentTypeId: "bb-bags" },
    { id: "baseball-protective-canonical", sourceId: "ebay", title: "Wilson Baseball C1K Catcher's Gear Kit", sportId: "baseball", equipmentTypeId: "bb-protective" },
    { id: "baseball-training-canonical", sourceId: "ebay", title: "Markwort Weighted Baseball Training Ball", sportId: "baseball", equipmentTypeId: "bb-training" },
    { id: "baseball-ball-canonical", sourceId: "ebay", title: "Rawlings Official League Baseballs One Dozen", sportId: "baseball", equipmentTypeId: "bb-balls" },
    { id: "baseball-bat-canonical", sourceId: "ebay", title: "Marucci CATX USSSA Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-bats" },
    { id: "baseball-glove-canonical", sourceId: "ebay", title: "Wilson A2000 1786 Baseball Glove", sportId: "baseball", equipmentTypeId: "bb-gloves" },
    { id: "baseball-cleats-canonical", sourceId: "ebay", title: "Nike Alpha Huarache Baseball Cleats", sportId: "baseball", equipmentTypeId: "bb-cleats" },
    { id: "fanatics-apparel-canonical", sourceId: "fanatics", title: "Los Angeles Dodgers Baseball T-Shirt", sportId: "baseball", equipmentTypeId: "bb-shoes-apparel" },
  ];
  const report = buildTaxonomyAuditReport(phase12Fixture(deals));

  assert.equal(report.correctionGroups.length, 0, JSON.stringify(report.correctionGroups, null, 2));
  assert.equal(report.summary.compatibleNoActionRecords, deals.length);
  assert.equal(report.summary.pendingRecords, 0);
  assert.equal(report.summary.proposedRecords, 0);
});

test("genuine stored conflicts remain review outcomes", () => {
  const report = buildTaxonomyAuditReport(phase12Fixture([
    { id: "fanatics-apparel-in-bats", sourceId: "fanatics", title: "USA Baseball Stadium Jersey", sportId: "baseball", equipmentTypeId: "bb-bats" },
    { id: "fanatics-apparel-in-balls", sourceId: "fanatics", title: "Detroit Tigers Baseball T-Shirt", sportId: "baseball", equipmentTypeId: "bb-balls" },
    { id: "golf-glove-in-baseball", sourceId: "ebay", title: "FootJoy StaSof Golf Glove", sportId: "baseball", equipmentTypeId: "bb-gloves" },
    { id: "work-glove-in-baseball", sourceId: "ebay", title: "Mechanix Heavy Duty Work Gloves", sportId: "baseball", equipmentTypeId: "bb-gloves" },
    { id: "batting-glove-in-baseball", sourceId: "ebay", title: "Franklin CFX Pro Baseball Batting Gloves", sportId: "baseball", equipmentTypeId: "bb-gloves" },
    { id: "softball-glove-in-baseball", sourceId: "ebay", title: "Rawlings Liberty Advanced Fastpitch Softball Glove", sportId: "baseball", equipmentTypeId: "bb-gloves" },
  ]));

  for (const id of [
    "fanatics-apparel-in-bats", "fanatics-apparel-in-balls", "golf-glove-in-baseball",
    "work-glove-in-baseball", "batting-glove-in-baseball", "softball-glove-in-baseball",
  ]) {
    const correction = correctionFor(report, id);
    assert.equal(correction?.status, "pending", id);
    assert.equal(correction?.outcome, "genuine-conflict-review", id);
  }
  assert.equal(report.summary.conflictReviewRecords, 6);
  assert.equal(report.summary.compatibleNoActionRecords, 0);
});

test("report separates proposed, conflict, unresolved, ambiguous, and no-action outcomes", () => {
  const report = buildTaxonomyAuditReport(phase12Fixture([
    { id: "outcome-proposed", sourceId: "ebay", title: "Marucci CATX BBCOR Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "outcome-conflict", sourceId: "ebay", title: "FootJoy Golf Glove", sportId: "baseball", equipmentTypeId: "bb-gloves" },
    { id: "outcome-unresolved", sourceId: "ebay", title: "Unidentified Sporting Goods Item", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "outcome-ambiguous", sourceId: "ebay", title: "Baseball/Softball Ball Bucket", sportId: "baseball", equipmentTypeId: "bb-other" },
    { id: "outcome-no-action", sourceId: "ebay", title: "Rawlings Official Baseballs One Dozen", sportId: "baseball", equipmentTypeId: "bb-balls" },
  ]));

  assert.equal(correctionFor(report, "outcome-proposed")?.outcome, "proposed-correction");
  assert.equal(correctionFor(report, "outcome-conflict")?.outcome, "genuine-conflict-review");
  assert.equal(correctionFor(report, "outcome-unresolved")?.outcome, "unresolved-other");
  assert.equal(correctionFor(report, "outcome-ambiguous")?.outcome, "ambiguous-evidence");
  assert.equal(correctionFor(report, "outcome-no-action"), undefined);
  assert.deepEqual({
    proposed: report.summary.proposedCorrectionRecords,
    conflict: report.summary.conflictReviewRecords,
    unresolved: report.summary.unresolvedOtherRecords,
    ambiguous: report.summary.ambiguousEvidenceRecords,
    noAction: report.summary.compatibleNoActionRecords,
  }, { proposed: 1, conflict: 1, unresolved: 1, ambiguous: 1, noAction: 1 });
  assert.equal(report.summary.pendingRecords, 3);
  assert.equal(
    report.summary.proposedCorrectionRecords
      + report.summary.conflictReviewRecords
      + report.summary.unresolvedOtherRecords
      + report.summary.ambiguousEvidenceRecords
      + report.summary.compatibleNoActionRecords,
    report.summary.deals,
  );
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
    { id: "bat-reference-1", sourceId: "justbats", title: "Marucci CATX USSSA Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-bats", raw: { seller: "catalog", sku: "CATX-CONSENSUS-42" } },
    { id: "bat-reference-2", sourceId: "justbats", title: "Marucci CATX BBCOR Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-bats", raw: { seller: "catalog", sku: "CATX-CONSENSUS-42" } },
    { id: "identity-only", sourceId: "justbats", title: "Marucci CATX Senior League Item", sportId: "baseball", equipmentTypeId: "bb-other", raw: { seller: "catalog", sku: "CATX-CONSENSUS-42" } },
    { id: "identity-plus-title", sourceId: "justbats", title: "Marucci CATX USSSA Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-other", raw: { seller: "catalog", sku: "CATX-CONSENSUS-42" } },
    { id: "different-seller", sourceId: "justbats", title: "Marucci CATX Senior League Item", sportId: "baseball", equipmentTypeId: "bb-other", raw: { seller: "marketplace", sku: "CATX-CONSENSUS-42" } },
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
  assert.equal(identityOnly?.proposedCanonicalEquipmentTypeId, null);
  assert.equal(identityOnly?.confidence, "low");
  assert.equal(identityOnly?.humanApprovalRequired, true);
  const identityPlusTitle = correctionFor(report, "identity-plus-title");
  assert.equal(identityPlusTitle?.confidence, "high");
  assert.equal(identityPlusTitle?.humanApprovalRequired, false);
  assert.equal(correctionFor(report, "different-seller")?.proposedCanonicalEquipmentTypeId, null);
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

test("identifier analysis scopes SKUs, validates GTINs, and separates collision kinds", () => {
  assert.equal(isValidGtin("036000291452"), true);
  assert.equal(isValidGtin("036000291453"), false);
  assert.equal(isValidGtin("12345"), false);

  const report = buildTaxonomyAuditReport(phase14Fixture([
    { id: "numeric-sku-shorts", sourceId: "direct-sports", title: "Miken Men's Slowpitch Shorts: MSPSM20", sportId: "baseball", equipmentTypeId: "bb-bats", raw: { sku: "23576" } },
    { id: "numeric-sku-aerator", sourceId: "direct-sports", title: "Franklin MLB Glove Aerator: 2357", sportId: "baseball", equipmentTypeId: "bb-training", raw: { sku: "23576" } },
    { id: "numeric-sku-bat", sourceId: "direct-sports", title: "Marucci CATX BBCOR Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-other", raw: { sku: "23576" } },
    { id: "luxilon-en", sourceId: "impact-wilson", title: "LUXILON ALU Power 115 Set", sportId: "baseball", equipmentTypeId: "bb-other", raw: { itemNumber: "WR8302001115" } },
    { id: "luxilon-fr", sourceId: "impact-wilson", title: "Jeu de cordage ALU Power 115", sportId: "tennis", equipmentTypeId: "ten-accessories", raw: { itemNumber: "WR8302001115" } },
    { id: "wilson-upc-en", sourceId: "impact-wilson", title: "Wilson A2000 1786 11.5 Baseball Glove", sportId: "baseball", equipmentTypeId: "bb-gloves", raw: { upc: "036000291452" } },
    { id: "wilson-upc-es", sourceId: "impact-wilson", title: "Wilson Guante Baseball A2000 1786 11.5", sportId: "baseball", equipmentTypeId: "bb-other", raw: { upc: "036000291452" } },
    { id: "invalid-upc", sourceId: "impact-wilson", title: "Wilson Product", sportId: "baseball", equipmentTypeId: "bb-other", raw: { upc: "036000291453" } },
    { id: "unresolved-one", sourceId: "impact-wilson", title: "Wilson Sporting Goods Item", sportId: "baseball", equipmentTypeId: "bb-other", raw: { itemNumber: "AMBIG-100" } },
    { id: "unresolved-two", sourceId: "impact-wilson", title: "Wilson Equipment Product", sportId: "tennis", equipmentTypeId: "ten-accessories", raw: { itemNumber: "AMBIG-100" } },
  ]));

  const numericReuse = report.identifierFindings.find((finding) =>
    finding.kind === "unsafe-identifier-reuse"
    && finding.identifierType === "sku"
    && finding.identifierValue === "23576");
  assert.ok(numericReuse);
  assert.match(numericReuse.scope, /source:direct-sports\|seller:unknown-seller/);
  assert.ok(numericReuse.examples.every((example) =>
    example.sourceId === "direct-sports" && example.sourceName === "Direct Sports"));
  assert.equal(correctionFor(report, "numeric-sku-bat")?.confidence, "medium");

  const translated = report.identifierFindings.find((finding) =>
    finding.kind === "likely-same-product-conflict"
    && finding.identifierValue === "WR8302001115");
  assert.ok(translated);
  assert.equal(translated.identifierType, "itemNumber");
  assert.equal(translated.scope, "source:impact-wilson");
  assert.deepEqual(translated.currentIds, ["baseball/bb-other", "tennis/ten-accessories"]);
  assert.ok(translated.examples.some((example) => example.title === "LUXILON ALU Power 115 Set"));
  assert.ok(translated.examples.some((example) => example.title === "Jeu de cordage ALU Power 115"));

  assert.ok(report.identifierFindings.some((finding) =>
    finding.kind === "likely-same-product-conflict"
    && finding.identifierType === "upc"
    && finding.identifierValue === "036000291452"));
  assert.ok(report.identifierFindings.some((finding) =>
    finding.kind === "invalid-identifier"
    && finding.identifierType === "upc"
    && finding.identifierValue === "036000291453"));
  assert.ok(report.identifierFindings.some((finding) =>
    finding.kind === "unresolved-collision"
    && finding.identifierValue === "AMBIG-100"));
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
  assert.ok(report.identifierFindings.some((finding) =>
    finding.kind === "unsafe-identifier-reuse"
    && finding.identifierType === "upc"
    && finding.identifierValue === "123456789012"));
});

test("emits machine-readable CSV and a concise Markdown summary", () => {
  const report = buildTaxonomyAuditReport(fixture(), { generatedAt: "2026-07-21T00:00:00.000Z" });
  const csv = taxonomyAuditCorrectionsCsv(report);
  const identifierCsv = taxonomyAuditIdentifierFindingsCsv(report);
  const markdown = taxonomyAuditMarkdown(report);
  assert.match(csv, /^sportId,equipmentFamily,sourceId,/);
  assert.match(csv, /bb-bats/);
  assert.match(csv, /humanApprovalRequired,status,outcome,examples/);
  assert.match(identifierCsv, /^kind,identifierType,identifierValue,scope,/);
  assert.match(identifierCsv, /unsafe-identifier-reuse/);
  assert.match(markdown, /Read-only report/);
  assert.match(markdown, /all 5 deals across 2 sports/);
  assert.match(markdown, /Already compatible \/ no action/);
  assert.match(markdown, /Identifier findings/);
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
  const auditScript = readFileSync(join(process.cwd(), "script", "phase1-taxonomy-audit.ts"), "utf8");
  assert.match(auditScript, /taxonomy-identifiers\.csv/);
  assert.doesNotMatch(auditScript, /\.insert\(|\.update\(|\.delete\(|\bALTER\b|\bTRUNCATE\b/i);
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
