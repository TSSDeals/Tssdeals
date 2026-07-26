import assert from "node:assert/strict";
import test from "node:test";
import { isUsdImpactCatalog, isUsdImpactItem } from "./impact-api";
import { classifyFanaticsItem } from "./fanatics-classification";

const equipmentTypes = [
  { id: "bb-other", name: "Other", sportId: "baseball" },
  { id: "bb-shoes-apparel", name: "Shoes and Apparel", sportId: "baseball" },
  { id: "baseball-memorabilia-other", name: "Other", sportId: "baseball-memorabilia" },
];

test("Impact catalog and item gates keep the default affiliate feed in USD", () => {
  assert.equal(isUsdImpactCatalog({ Currency: "USD" } as any), true);
  assert.equal(isUsdImpactCatalog({ Currency: " usd " } as any), true);
  assert.equal(isUsdImpactCatalog({ Currency: "EUR" } as any), false);
  assert.equal(isUsdImpactCatalog({ Currency: "GBP" } as any), false);
  assert.equal(isUsdImpactItem({ Currency: "USD" } as any), true);
  assert.equal(isUsdImpactItem({ Currency: "CAD" } as any), false);
});

test("Wilson-family US catalogs are retained while international catalogs are excluded", () => {
  const catalogs = [
    { Name: "Wilson Catalog", Currency: "USD" },
    { Name: "Louisville Slugger Catalog", Currency: "USD" },
    { Name: "DeMarini Catalog", Currency: "USD" },
    { Name: "EvoShield Catalog", Currency: "USD" },
    { Name: "ATEC Catalog", Currency: "USD" },
    { Name: "Luxilon Catalog", Currency: "USD" },
    { Name: "Wilson UK Catalog", Currency: "GBP" },
    { Name: "Wilson DE Catalog", Currency: "EUR" },
  ];

  assert.deepEqual(
    catalogs.filter(isUsdImpactCatalog).map((catalog) => catalog.Name),
    [
      "Wilson Catalog",
      "Louisville Slugger Catalog",
      "DeMarini Catalog",
      "EvoShield Catalog",
      "ATEC Catalog",
      "Luxilon Catalog",
    ],
  );
});

test("Fanatics game-used and signed products route to memorabilia", () => {
  const gameUsed = classifyFanaticsItem({
    Name: "Minnesota Twins Stadium Collage with a Piece of Game-Used Baseball",
    Description: "",
    Manufacturer: "Fanatics Authentic",
    Category: "Home and Office",
    SubCategory: "Collectibles",
  }, equipmentTypes);

  const signed = classifyFanaticsItem({
    Name: "Aaron Judge Autographed Baseball with COA",
    Description: "",
    Manufacturer: "Fanatics Authentic",
    Category: "Collectibles",
    SubCategory: "Memorabilia",
  }, equipmentTypes);

  assert.deepEqual(gameUsed, {
    sportId: "baseball-memorabilia",
    equipmentTypeId: "baseball-memorabilia-other",
  });
  assert.deepEqual(signed, {
    sportId: "baseball-memorabilia",
    equipmentTypeId: "baseball-memorabilia-other",
  });
});

test("ordinary Fanatics jerseys remain baseball apparel", () => {
  const classification = classifyFanaticsItem({
    Name: "Houston Astros Nike City Connect Jersey - Youth",
    Description: "",
    Manufacturer: "Nike",
    Category: "MLB",
    SubCategory: "Jerseys",
  }, equipmentTypes);

  assert.deepEqual(classification, {
    sportId: "baseball",
    equipmentTypeId: "bb-shoes-apparel",
  });
});
