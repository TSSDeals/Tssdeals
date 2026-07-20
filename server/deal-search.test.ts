import assert from "node:assert/strict";
import test from "node:test";
import {
  batSizeMatchSpecificity,
  matchesGloveSize,
  matchesDealClassificationFilters,
  matchesNormalizedDealSearch,
  normalizeDealSearch,
  type SearchableDeal,
} from "./deal-search";

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

const a2000: SearchableDeal = {
  title: "Wilson A2000 1786 11.5",
  brand: "Wilson",
  sportId: "baseball",
  equipmentTypeId: "bb-balls",
};

test("A2000 1786 11.5 survives search and redundant baseball glove filters", () => {
  const search = normalizeDealSearch("Wilson A2000 1786 11.5");
  assert.equal(matchesNormalizedDealSearch(search, a2000), true, "search only");
  assert.equal(matchesDealClassificationFilters(a2000, { sportId: "baseball" }), true, "Baseball");
  assert.equal(matchesDealClassificationFilters(a2000, { sportId: "baseball", equipmentTypeId: "bb-gloves" }), true, "Baseball Gloves");
  assert.equal(matchesGloveSize(a2000, '11.5"'), true, "11.5-inch sub-filter");
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
  { title: "A2000 Style Batting Gloves", sportId: "baseball", equipmentTypeId: "bb-gloves" },
]) {
  test(`Baseball Gloves excludes ${deal.title}`, () => {
    assert.equal(matchesDealClassificationFilters(deal, { sportId: "baseball", equipmentTypeId: "bb-gloves" }), false);
  });
}
