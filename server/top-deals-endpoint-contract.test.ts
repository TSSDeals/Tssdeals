import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { matchesTopDealCategoryBoundary, shopperTopDealCategory } from "./top-deals-ranking";

const serverDirectory = fileURLToPath(new URL(".", import.meta.url));
const routesSource = readFileSync(`${serverDirectory}/routes.ts`, "utf8");
const storageSource = readFileSync(`${serverDirectory}/storage.ts`, "utf8");

test("curated category endpoint applies the shared semantic ranking gate", () => {
  assert.match(
    routesSource,
    /app\.get\("\/api\/deal-categories\/:slug"[\s\S]*storage\.getCategoryDeals\(category,\s*40\)/,
  );
  assert.match(
    storageSource,
    /async getCategoryDeals\([\s\S]*return rankTopDeals\(pool,\s*\{[\s\S]*category,/,
  );
});

test("shopper category projection removes fixed-count promises without mutating stored rows", () => {
  const storedName = ["Top", String(10 + 10), "Baseball Bat Deals Today"].join(" ");
  const stored = { slug: "baseball-bats", name: storedName };
  const projected = shopperTopDealCategory(stored);
  assert.equal(projected.name, "Top Baseball Bat Deals");
  assert.equal(stored.name, storedName);
  assert.doesNotMatch(projected.name ?? "", /\b20\b/);
});

test("endpoint semantic gate matrix rejects exact production leaks across eight curated lists", () => {
  const candidate = (title: string, equipmentTypeId: string, extra: Record<string, unknown> = {}) => ({
    title,
    equipmentTypeId,
    sportId: "baseball",
    brand: null,
    raw: {},
    ...extra,
  }) as any;
  const matrix = [
    {
      slug: "baseball-softball-gloves",
      searchQuery: "glove mitt",
      valid: candidate("Rawlings Heart of the Hide Infield Baseball Glove", "bb-gloves"),
      leaks: [
        candidate("Staff Model® Glove", "bb-gloves"),
        candidate("Rain Gloves", "bb-gloves"),
        candidate("Wilson Men's Conform Glove", "bb-gloves"),
      ],
    },
    {
      slug: "baseball-bats",
      searchQuery: "bat bbcor",
      valid: candidate("Louisville Slugger Atlas BBCOR Baseball Bat", "bb-bats"),
      leaks: [
        candidate("Wilson SHIFT 99 V1.0 FRM CUSTOM", "bb-bats"),
        candidate("Ken Griffey Jr Baseball Jersey", "bb-bats"),
        candidate("Ultra 95 QZV5 Tennis Racket", "bb-bats"),
      ],
    },
    {
      slug: "fastpitch-softball-bats",
      searchQuery: "fastpitch bat",
      valid: candidate("Marucci Astura Fastpitch Softball Bat -10", "fp-bats", { sportId: "fastpitch-softball" }),
      leaks: [candidate("Louisville Slugger Genesis Slowpitch Softball Bat", "sp-bats", { sportId: "slowpitch-softball" })],
    },
    {
      slug: "running-shoes",
      searchQuery: "running shoes",
      valid: candidate("Brooks Ghost 17 Road Running Shoes", "running-shoes", { sportId: "running" }),
      leaks: [candidate("Fear of God MLB Athletics Hoodie", "running-shoes")],
    },
    {
      slug: "cleats",
      searchQuery: "cleats spikes",
      valid: candidate("Nike Alpha Huarache Baseball Cleats", "cleats"),
      leaks: [candidate("Baseball Shirt Designed to Match Cleats", "cleats")],
    },
    {
      slug: "premium-collector-gloves",
      searchQuery: "glove mitt",
      valid: candidate("Inaba 11.5 Infield Baseball Glove", "bb-gloves", { brand: "Inaba" }),
      leaks: [candidate("Mizuno Prospect Series PowerClose Baseball Glove", "bb-gloves", { brand: "Mizuno" })],
    },
    {
      slug: "elite-baseball-gloves",
      searchQuery: "glove",
      valid: candidate("Wilson A2K 1786 Baseball Glove", "bb-gloves", { brand: "Wilson" }),
      leaks: [candidate("Mizuno Prospect Series PowerClose Baseball Glove", "bb-gloves", { brand: "Mizuno" })],
    },
    {
      slug: "golf-clubs",
      searchQuery: "club driver iron wedge putter",
      valid: candidate("TaylorMade Qi10 Golf Driver", "golf-clubs", { sportId: "golf" }),
      leaks: [candidate("Titleist Golf Polo Shirt", "golf-clubs", { sportId: "golf" })],
    },
  ];

  for (const row of matrix) {
    const context = { category: { slug: row.slug, name: row.slug, searchQuery: row.searchQuery } };
    assert.equal(matchesTopDealCategoryBoundary(row.valid, context), true, `${row.slug}: valid control`);
    for (const leak of row.leaks) {
      assert.equal(matchesTopDealCategoryBoundary(leak, context), false, `${row.slug}: ${leak.title}`);
    }
  }
});

test("shopper UI uses honest sparse and empty-state copy", () => {
  const clientSource = readFileSync(
    fileURLToPath(new URL("../client/src/pages/TopDeals.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(clientSource, /No verified deals currently meet this category/);
  assert.match(clientSource, /Showing \{deals\.length\} verified/);
  assert.doesNotMatch(clientSource, /Showing[^\\n]*of \d+|Top\s+\d+/);
  assert.match(clientSource, /resolveTopDealsSlugFromLocation\(location\)/);
  assert.match(clientSource, /resolveTopDealsCategory\(data\?\.category,\s*categories,\s*slug\)/);
  assert.doesNotMatch(clientSource, /Always-on top 20/i);
});
