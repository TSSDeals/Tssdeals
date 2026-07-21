import assert from "node:assert/strict";
import test from "node:test";
import {
  batSizeMatchSpecificity,
  hasBaseballGloveEvidence,
  hasStrongBaseballGloveSearchIntent,
  matchesGloveSize,
  matchesDealClassificationFilters,
  matchesNormalizedDealSearch,
  normalizeDealSearch,
  projectDealSearchClassification,
  type SearchableDeal,
} from "./deal-search";
import { canonicalResultEquipmentTypeId } from "../shared/equipment-groups";

for (const equipmentTypeId of ["baseball-bat", "bat", "bb-bats"]) {
  test(`canonical Baseball Bats filter includes ${equipmentTypeId}`, () => {
    assert.equal(matchesDealClassificationFilters(
      { title: "Generic bat listing", sportId: "baseball", equipmentTypeId },
      { sportId: "baseball", equipmentTypeId: "bb-bats" },
    ), true);
  });
}

test("exact 27/17 outranks a generic drop-10 fallback", () => {
  const search = normalizeDealSearch("Louisville Supra 27/17");
  const exact = { title: "Louisville Supra 27/17 USSSA Bat", dropWeight: 10 };
  const fallback = { title: "Louisville Supra USSSA Bat Drop -10", dropWeight: 10 };
  assert.equal(matchesNormalizedDealSearch(search, fallback), true);
  assert.ok(batSizeMatchSpecificity(search, exact) > batSizeMatchSpecificity(search, fallback));
});

const searchCases: Array<{ name: string; queries: string[]; deal: SearchableDeal }> = [
  {
    name: "Louisville Slugger Supra",
    queries: ["27/17 Louisville Supra", "27 / 17 LS Supra", "Louisville Slugger Supra drop 10"],
    deal: { title: "2024 LS Supra USSSA Bat Drop -10", brand: "Louisville Slugger", dropWeight: 10 },
  },
  {
    name: "Marucci CAT X",
    queries: ["30/20 Marucci CATX", "Marucci CAT X -10", "CATX drop 10"],
    deal: { title: "Marucci CAT X 30 x 20 USSSA Baseball Bat", brand: "Marucci", dropWeight: 10 },
  },
  {
    name: "Easton Hype Fire",
    queries: ["28/18 Easton HypeFire", "28in 18oz Easton HypeFire", "Easton Hype Fire -10", "Hype-Fire drop 10"],
    deal: { title: "Easton Hype Fire 28/18 USSSA", brand: "Easton", dropWeight: 10 },
  },
];

for (const { name, queries, deal } of searchCases) {
  for (const query of queries) {
    test(`${name} matches ${query}`, () => {
      assert.equal(matchesNormalizedDealSearch(normalizeDealSearch(query), deal), true);
    });
  }
}

const filteredCases: Array<{ name: string; deal: SearchableDeal; expected: boolean }> = [
  {
    name: "keeps an exactly classified baseball bat",
    deal: { title: "Victus Vandal Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-bats" },
    expected: true,
  },
  {
    name: "recovers a CAT X listing with missing classification",
    deal: { title: "Marucci CATX 27/17 USSSA", sportId: null, equipmentTypeId: null },
    expected: true,
  },
  {
    name: "recovers a Hype Fire listing in an inconsistent category",
    deal: { title: "Easton HypeFire -10", sportId: "football", equipmentTypeId: "fb-other", raw: { certification: "USSSA" } },
    expected: true,
  },
  {
    name: "recovers certification evidence from raw data",
    deal: { title: "Louisville Supra 27/17", sportId: "baseball", equipmentTypeId: "bb-other", raw: { certification: "USA Baseball" } },
    expected: true,
  },
  {
    name: "recovers an unclassified Louisville Supra without certification metadata",
    deal: { title: "Louisville Supra 27/17", brand: "Louisville Slugger", sportId: null, equipmentTypeId: null },
    expected: true,
  },
  {
    name: "ignores broad softball breadcrumbs for an unclassified Louisville Supra",
    deal: {
      title: "Louisville Supra 27/17",
      brand: "Louisville Slugger",
      sportId: null,
      equipmentTypeId: null,
      raw: { breadcrumbs: ["Sports", "Baseball & Softball", "Bats"] },
    },
    expected: true,
  },
  {
    name: "does not recover a USSSA fastpitch listing",
    deal: { title: "Easton Ghost USSSA Fastpitch Bat", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats" },
    expected: false,
  },
  {
    name: "does not recover a USSSA softball listing",
    deal: { title: "USSSA Softball Bat", sportId: "slowpitch-softball", equipmentTypeId: "sp-bats" },
    expected: false,
  },
  {
    name: "honors a stored fastpitch equipment ID even when the title is ambiguous",
    deal: { title: "Easton Ghost USSSA Bat", sportId: null, equipmentTypeId: "fp-bats" },
    expected: false,
  },
  {
    name: "honors a stored slowpitch sport ID even when the title is ambiguous",
    deal: { title: "USSSA Tournament Bat", sportId: "slowpitch-softball", equipmentTypeId: null },
    expected: false,
  },
  {
    name: "does not recover a cricket bat",
    deal: { title: "USSSA Style Cricket Bat", sportId: "cricket", equipmentTypeId: "cricket-bats" },
    expected: false,
  },
];

for (const { name, deal, expected } of filteredCases) {
  test(`Baseball → Baseball Bats ${name}`, () => {
    assert.equal(matchesDealClassificationFilters(deal, { sportId: "baseball", equipmentTypeId: "bb-bats" }), expected);
  });
}

test("baseball evidence does not bypass a different explicit equipment filter", () => {
  const deal = { title: "Marucci CAT X USSSA Baseball Bat", sportId: null, equipmentTypeId: null };
  assert.equal(matchesDealClassificationFilters(deal, { sportId: "baseball", equipmentTypeId: "bb-gloves" }), false);
});

test("short aliases are boundary matched", () => {
  const unrelated = { title: "Wilson Supra-style Bat Drop -10", brand: "Wilson", dropWeight: 10 };
  assert.equal(matchesNormalizedDealSearch(normalizeDealSearch("LS Supra -10"), unrelated), false);
});

const gloveQuery = "Wilson A2000 1786 11.5";
const misclassifiedA2000Deals: Array<SearchableDeal & { id: string }> = [
  { id: "missing-sport", title: gloveQuery, brand: "Wilson", sportId: null, equipmentTypeId: "bb-balls" },
  { id: "wrong-sport", title: gloveQuery, brand: "Wilson", sportId: "football", equipmentTypeId: "other" },
  { id: "wrong-equipment", title: gloveQuery, brand: "Wilson", sportId: "baseball", equipmentTypeId: "bb-balls" },
];

test("strong A2000 query recovers missing and incorrect classifications for Baseball only", () => {
  for (const deal of misclassifiedA2000Deals) {
    assert.equal(matchesDealClassificationFilters(deal, { q: gloveQuery, sportId: "baseball" }), true, deal.id);
  }
});

test("Baseball-only recovery requires strong fielding-glove query intent", () => {
  assert.equal(matchesDealClassificationFilters(misclassifiedA2000Deals[0], { sportId: "baseball" }), false);
  assert.equal(matchesDealClassificationFilters(misclassifiedA2000Deals[1], { q: "football gloves", sportId: "baseball" }), false);
  assert.equal(matchesDealClassificationFilters(misclassifiedA2000Deals[2], { sportId: "baseball" }), true);
});

test("search display projects recovered A2000 deals under Baseball Gloves without mutation", () => {
  for (const deal of misclassifiedA2000Deals) {
    const projected = projectDealSearchClassification(gloveQuery, deal);
    assert.equal(projected.sportId, "baseball");
    assert.equal(projected.equipmentTypeId, "bb-gloves");
    assert.notEqual(projected, deal);
  }
  assert.equal(misclassifiedA2000Deals[0].sportId, null);
  assert.equal(misclassifiedA2000Deals[0].equipmentTypeId, "bb-balls");
  const batting = { title: `${gloveQuery} Batting Gloves`, sportId: "baseball", equipmentTypeId: "bb-batting-gloves" };
  assert.equal(projectDealSearchClassification(gloveQuery, batting), batting);
});

test("end-to-end A2000 filter stack retains equal IDs and counts at every stage", () => {
  const search = normalizeDealSearch(gloveQuery);
  const stages = {
    searchOnly: misclassifiedA2000Deals.filter((deal) => matchesNormalizedDealSearch(search, deal)),
    baseball: misclassifiedA2000Deals.filter((deal) =>
      matchesNormalizedDealSearch(search, deal)
      && matchesDealClassificationFilters(deal, { q: gloveQuery, sportId: "baseball" })),
    baseballGloves: misclassifiedA2000Deals.filter((deal) =>
      matchesNormalizedDealSearch(search, deal)
      && matchesDealClassificationFilters(deal, { q: gloveQuery, sportId: "baseball", equipmentTypeId: "bb-gloves" })),
    size115: misclassifiedA2000Deals.filter((deal) =>
      matchesNormalizedDealSearch(search, deal)
      && matchesDealClassificationFilters(deal, { q: gloveQuery, sportId: "baseball", equipmentTypeId: "bb-gloves" })
      && matchesGloveSize(deal, '11.5"')),
  };
  const expectedIds = misclassifiedA2000Deals.map((deal) => deal.id);
  for (const [stage, deals] of Object.entries(stages)) {
    assert.deepEqual(deals.map((deal) => deal.id), expectedIds, stage);
  }
});

const themedA2000Regressions: Array<SearchableDeal & { id: string }> = [
  {
    id: "evolusivo-gloves",
    title: "Wilson Evolusivo A2000® 1786 11.5 Baseball Glove",
    sportId: "baseball",
    equipmentTypeId: "gloves",
  },
  {
    id: "tennis-theme-other",
    title: "2025 Wilson Tennis A2000® 1786SS 11.5”",
    sportId: "tennis",
    equipmentTypeId: "ten-other",
  },
  {
    id: "spring-training",
    title: "2026 Wilson Spring A2000® 1786 11.5” Infield Baseball",
    sportId: "baseball",
    equipmentTypeId: "bb-training",
  },
];

for (const deal of themedA2000Regressions) {
  test(`projects ${deal.id} into canonical Baseball Gloves`, () => {
    assert.equal(hasBaseballGloveEvidence(deal), true);
    const projected = projectDealSearchClassification(gloveQuery, deal);
    assert.equal(projected.sportId, "baseball");
    assert.equal(projected.equipmentTypeId, "bb-gloves");
    assert.equal(deal.equipmentTypeId === "bb-gloves", false, "stored synthetic classification remains unchanged");
  });
}

test("A2K family plus size and structured baseball-glove category is strong evidence", () => {
  assert.equal(hasBaseballGloveEvidence({
    title: "Wilson A2K 11.75",
    sizeNumber: "11.75",
    raw: { categoryName: "Baseball Gloves & Mitts" },
  }), true);
  assert.equal(hasBaseballGloveEvidence({
    title: "Wilson A2K 11.75",
    sourceId: "justgloves",
  }), true);
});

test("unrelated tennis equipment is not recovered from family and size alone", () => {
  const racquet = {
    title: "Wilson A2000 11.5 Tennis Racquet",
    sportId: "tennis",
    equipmentTypeId: "ten-racquets",
    raw: { categoryName: "Tennis Racquets" },
  };
  assert.equal(hasBaseballGloveEvidence(racquet), false);
  assert.equal(projectDealSearchClassification(gloveQuery, racquet), racquet);
});

test("Exclusive A2000 stored as slowpitch projects into the canonical Baseball Gloves group", () => {
  const exclusive = {
    id: "eb3f5c0a-efa3-4044-8f0c-95747bd06d0a",
    sourceId: "playbaseball",
    title: 'Wilson Exclusive A2000 1786 11.5" Baseball Glove (WBW103447115)',
    brand: "Wilson",
    sportId: "slowpitch-softball",
    equipmentTypeId: "sp-gloves",
    sizeNumber: "11.5",
  };
  const search = normalizeDealSearch(gloveQuery);
  assert.equal(matchesNormalizedDealSearch(search, exclusive), true);
  assert.equal(matchesDealClassificationFilters(exclusive, {
    q: gloveQuery,
    sportId: "baseball",
    equipmentTypeId: "bb-gloves",
  }), true);
  const projected = projectDealSearchClassification(gloveQuery, exclusive);
  assert.equal(projected.sportId, "baseball");
  assert.equal(projected.equipmentTypeId, "bb-gloves");
  assert.equal(canonicalResultEquipmentTypeId(projected.sportId, projected.equipmentTypeId), "bb-gloves");
  assert.equal(exclusive.sportId, "slowpitch-softball", "stored classification is unchanged");
});

test("explicit softball A2000 glove remains excluded despite stored-softball override", () => {
  const softball = {
    title: 'Wilson A2000 1786 11.5" Slowpitch Softball Glove',
    sportId: "slowpitch-softball",
    equipmentTypeId: "sp-gloves",
  };
  assert.equal(hasBaseballGloveEvidence(softball), false);
  assert.equal(projectDealSearchClassification(gloveQuery, softball), softball);
});

test("explicit eBay baseball-glove evidence projects without glove-specific query intent", () => {
  const query = 'Marucci Capitol Series 12"';
  const ebay = {
    id: "592b05f7-c149-4a98-a82f-d063fe7f30df",
    sourceId: "ebay",
    title: 'MARUCCI CAPITOL SERIES MFG2CP45A3-MT/R BASEBALL GLOVE 12" RH -  $359.99',
    sportId: "baseball",
    equipmentTypeId: "bb-other",
    sizeNumber: null,
  };
  assert.equal(hasStrongBaseballGloveSearchIntent(query), false, "candidate recovery stays bounded");
  assert.equal(matchesNormalizedDealSearch(normalizeDealSearch(query), ebay), true, "deal was already retrieved by search");
  const projected = projectDealSearchClassification(query, ebay);
  assert.equal(projected.sportId, "baseball");
  assert.equal(projected.equipmentTypeId, "bb-gloves");
  assert.equal(canonicalResultEquipmentTypeId(projected.sportId, projected.equipmentTypeId), "bb-gloves");
  assert.equal(ebay.equipmentTypeId, "bb-other", "stored classification remains unchanged");
});

for (const notation of ["11.5", '11.5"', "11.5 inch", "11.5-inch"]) {
  test(`normalizes glove size notation ${notation}`, () => {
    assert.equal(matchesGloveSize({ title: `Wilson A2000 1786 ${notation}` }, '11.5"'), true);
  });
}

test("glove size matches stored size and assigned sub-filter tags", () => {
  assert.equal(matchesGloveSize({ title: "Wilson A2000 1786", sizeNumber: '11.5"' }, "11.5"), true);
  assert.equal(matchesGloveSize({ title: "Wilson A2000 1786", subFilterIds: ["size-uuid"] }, "11.5", "size-uuid"), true);
});

for (const deal of [
  { title: "Wilson Adult Batting Gloves", sportId: "baseball", equipmentTypeId: "bb-batting-gloves" },
  { title: "Title Boxing Training Gloves", sportId: "boxing", equipmentTypeId: "boxing-gloves" },
  { title: "FootJoy Golf Glove", sportId: "golf", equipmentTypeId: "golf-glove" },
  { title: "Insulated Winter Work Gloves", sportId: null, equipmentTypeId: null },
  { title: `${gloveQuery} Batting Gloves`, sportId: "baseball", equipmentTypeId: "bb-gloves" },
]) {
  test(`Baseball Gloves excludes ${deal.title}`, () => {
    assert.equal(matchesDealClassificationFilters(deal, { sportId: "baseball", equipmentTypeId: "bb-gloves" }), false);
  });
}
