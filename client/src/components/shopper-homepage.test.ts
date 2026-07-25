import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const componentDirectory = fileURLToPath(new URL(".", import.meta.url));
const heroSource = readFileSync(`${componentDirectory}/DealsSearchHero.tsx`, "utf8");
const cardSource = readFileSync(`${componentDirectory}/DealCard.tsx`, "utf8");
const shellSource = readFileSync(`${componentDirectory}/AppShell.tsx`, "utf8");
const dealsSource = readFileSync(
  fileURLToPath(new URL("../pages/Deals.tsx", import.meta.url)),
  "utf8",
);

test("homepage search is the primary accessible shopping action", () => {
  assert.match(heroSource, /data-testid="search-hero"/);
  assert.match(heroSource, /data-testid="hero-search-form"/);
  assert.match(heroSource, /Label htmlFor="hero-q" className="sr-only"/);
  assert.match(heroSource, /aria-label="Search by photo"/);
  assert.match(heroSource, /min-h-11/);
});

test("deal search hydrates and synchronizes direct URL queries", () => {
  assert.match(dealsSource, /useState<FilterState>\(initialFiltersFromUrl\)/);
  assert.match(dealsSource, /dealsQueryFromSearch\(window\.location\.search\)/);
  assert.match(dealsSource, /syncQueryUrl\(next\.q\)/);
  assert.match(dealsSource, /addEventListener\("popstate", handlePopState\)/);
});

test("shopper categories come from the curated taxonomy projection", () => {
  assert.match(heroSource, /curateShopperEquipmentTypes/);
  assert.match(heroSource, /SHOPPER_MEMORABILIA_SPORT_ID/);
  assert.doesNotMatch(heroSource, /useEquipmentTypes|\/api\/equipment-types/);
});

test("Memorabilia participates in the responsive category grid", () => {
  const categorySection = heroSource.slice(
    heroSource.indexOf('data-testid="baseball-category-browser"'),
  );
  const gridIndex = categorySection.indexOf("grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6");
  const memorabiliaIndex = categorySection.indexOf('data-testid="browse-sport-memorabilia"');

  assert.ok(gridIndex >= 0, "expected the responsive category grid");
  assert.ok(memorabiliaIndex > gridIndex, "Memorabilia should render inside the category grid");
  assert.match(
    categorySection.slice(Math.max(0, memorabiliaIndex - 450), memorabiliaIndex),
    /min-h-14 rounded-2xl/,
    "Memorabilia should use the same touch-target hierarchy as the category choices",
  );
});

test("advanced filters are collapsed by default while primary filters stay visible", () => {
  assert.match(dealsSource, /useState\(false\)/);
  assert.match(dealsSource, /data-testid="primary-filters"/);
  assert.match(dealsSource, /aria-expanded=\{advancedFiltersOpen\}/);
  assert.match(dealsSource, /data-testid="advanced-filters-panel"/);
  assert.match(dealsSource, /useEbaySellers\(advancedFiltersOpen\)/);
});

test("promotions no longer lead the shopping journey", () => {
  const heroPosition = dealsSource.indexOf("<DealsSearchHero");
  const visibleEditorPicksPosition = dealsSource.indexOf("More gear to explore");
  assert.ok(heroPosition >= 0);
  assert.ok(visibleEditorPicksPosition > heroPosition);
  assert.doesNotMatch(dealsSource, /<RetailerBanner|<BrandStoreStrip/);
});

test("mobile shell and product actions meet the compact touch-first contract", () => {
  assert.match(shellSource, /lg:hidden/);
  assert.match(shellSource, /hidden lg:sticky[\s\S]*lg:block/);
  assert.match(cardSource, /flex flex-col gap-3/);
  assert.match(cardSource, /min-h-11 w-full/);
  assert.match(cardSource, /loading="lazy"/);
  assert.match(cardSource, /object-contain/);
});

test("shipping is displayed only when the source supplies it", () => {
  assert.match(cardSource, /formatKnownShipping/);
  assert.match(cardSource, /data-testid="deal-shipping"/);
  assert.doesNotMatch(cardSource, /estimated shipping|shipping estimate/i);
});
