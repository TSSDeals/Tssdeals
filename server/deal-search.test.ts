import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesDealClassificationFilters,
  matchesNormalizedDealSearch,
  normalizeDealSearch,
  type SearchableDeal,
} from "./deal-search";

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
    name: "does not recover a fastpitch-only listing",
    deal: { title: "Easton Ghost Fastpitch Bat Drop -10", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats", raw: { certification: "ASA" } },
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
