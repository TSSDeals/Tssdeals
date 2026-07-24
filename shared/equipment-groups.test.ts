import assert from "node:assert/strict";
import test from "node:test";
import {
  BASEBALL_BAT_GROUP_IDS,
  BASEBALL_GLOVE_GROUP_IDS,
  CANONICAL_BASEBALL_BAT_ID,
  SHOPPER_BASEBALL_ACCESSORIES_ID,
  SHOPPER_BASEBALL_APPAREL_ID,
  SHOPPER_BASEBALL_BATTING_HELMETS_ID,
  SHOPPER_BASEBALL_CATCHERS_GEAR_ID,
  SHOPPER_MEMORABILIA_EQUIPMENT,
  SHOPPER_MEMORABILIA_SPORT_ID,
  canonicalEquipmentTypeLabel,
  canonicalResultEquipmentTypeId,
  curateShopperSports,
  curateShopperEquipmentTypes,
  expandEquipmentTypeIds,
  isShopperMemorabiliaDeal,
  shopperMemorabiliaEquipmentId,
  shopperResultEquipmentTypeId,
} from "./equipment-groups";

test("canonical baseball bat selection expands to every live legacy ID", () => {
  assert.deepEqual(expandEquipmentTypeIds("baseball", [CANONICAL_BASEBALL_BAT_ID]), [...BASEBALL_BAT_GROUP_IDS]);
});

test("shopper taxonomy shows only concise baseball equipment families", () => {
  const result = curateShopperEquipmentTypes([
    { id: "baseball-bat", name: "Baseball Bat", sportId: "baseball" },
    { id: "bat", name: "Bat", sportId: "baseball" },
    { id: "bb-bats", name: "Bats", sportId: "baseball" },
    { id: "bb-gloves", name: "Gloves", sportId: "baseball" },
    { id: "bb-protective", name: "Protective Equipment", sportId: "baseball" },
    { id: "bb-cleats", name: "Cleats", sportId: "baseball" },
    { id: "bb-bags", name: "Bags", sportId: "baseball" },
    { id: "bb-balls", name: "Balls", sportId: "baseball" },
    { id: "bb-training", name: "Training Equipment", sportId: "baseball" },
    { id: "bb-shoes-apparel", name: "Shoe and Apparel", sportId: "baseball" },
    { id: "bb-batting-gloves", name: "Batting Gloves", sportId: "baseball" },
    { id: "bb-field-equipment", name: "Field Equipment", sportId: "baseball" },
    { id: "bb-care-accessories", name: "Care", sportId: "baseball" },
    { id: "golf-drivers", name: "Drivers", sportId: "golf" },
    { id: "bb-other", name: "Other", sportId: "baseball" },
  ], "baseball");
  assert.deepEqual(result.map(({ name }) => name), [
    "Bats",
    "Baseball Gloves",
    "Catcher's Gear",
    "Batting Helmets",
    "Protective Gear",
    "Cleats",
    "Bags",
    "Balls",
    "Training Equipment",
    "Apparel",
    "Accessories",
  ]);
  assert.equal(result.some(({ id }) => id === "golf-drivers" || id === "bb-other"), false);
});

test("fastpitch and slowpitch taxonomy remains separate", () => {
  const types = [
    { id: "fp-bats", name: "Bats", sportId: "fastpitch-softball" },
    { id: "sp-bats", name: "Bats", sportId: "slowpitch-softball" },
  ];
  assert.deepEqual(curateShopperEquipmentTypes(types, "fastpitch-softball"), types);
  assert.deepEqual(expandEquipmentTypeIds("fastpitch-softball", ["fp-bats"]), ["fp-bats"]);
});

test("canonical baseball glove selection expands legacy fielding-glove IDs only", () => {
  assert.deepEqual(expandEquipmentTypeIds("baseball", ["bb-gloves"]), [...BASEBALL_GLOVE_GROUP_IDS]);
  assert.deepEqual(expandEquipmentTypeIds("baseball", ["bb-batting-gloves"]), ["bb-batting-gloves"]);
  assert.deepEqual(expandEquipmentTypeIds("golf", ["gloves"]), ["gloves"]);
});

test("shopper taxonomy folds batting gloves and care rows into Accessories", () => {
  const result = curateShopperEquipmentTypes([
    { id: "glove", name: "Glove", sportId: "baseball" },
    { id: "baseball-glove", name: "Baseball Glove", sportId: "baseball" },
    { id: "baseball-gloves", name: "Baseball Gloves", sportId: "baseball" },
    { id: "bb-gloves", name: "Gloves", sportId: "baseball" },
    { id: "bb-batting-gloves", name: "Batting Gloves", sportId: "baseball" },
  ], "baseball");
  assert.equal(result.filter(({ id }) => id === "bb-gloves").length, 1);
  assert.equal(result.some(({ id, name }) => id === SHOPPER_BASEBALL_ACCESSORIES_ID && name === "Accessories"), true);
  assert.equal(result.some(({ id }) => id === "bb-batting-gloves"), false);
});

test("legacy baseball glove result IDs collapse to one canonical display group", () => {
  const keys = BASEBALL_GLOVE_GROUP_IDS.map((id) => canonicalResultEquipmentTypeId("baseball", id));
  assert.deepEqual(Array.from(new Set(keys)), ["bb-gloves"]);
  assert.equal(canonicalEquipmentTypeLabel(keys[0], "Gloves"), "Baseball Gloves");
  assert.equal(canonicalResultEquipmentTypeId("slowpitch-softball", "sp-gloves"), "sp-gloves");
});

test("virtual baseball families expand to existing canonical backing IDs", () => {
  assert.deepEqual(expandEquipmentTypeIds("baseball", [SHOPPER_BASEBALL_CATCHERS_GEAR_ID]), ["bb-protective"]);
  assert.deepEqual(expandEquipmentTypeIds("baseball", [SHOPPER_BASEBALL_BATTING_HELMETS_ID]), ["bb-protective"]);
  assert.deepEqual(expandEquipmentTypeIds("baseball", [SHOPPER_BASEBALL_APPAREL_ID]), ["bb-shoes-apparel"]);
  assert.deepEqual(expandEquipmentTypeIds("baseball", [SHOPPER_BASEBALL_ACCESSORIES_ID]), [
    "bb-batting-gloves",
    "bb-field-equipment",
    "bb-care-accessories",
  ]);
  assert.deepEqual(expandEquipmentTypeIds(undefined, [SHOPPER_BASEBALL_CATCHERS_GEAR_ID]), ["bb-protective"]);
});

test("shopper sports add one read-only Memorabilia path", () => {
  const sports = curateShopperSports([{ id: "baseball", name: "Baseball" }]);
  assert.deepEqual(sports.map(({ id, name }) => ({ id, name })), [
    { id: "baseball", name: "Baseball" },
    { id: SHOPPER_MEMORABILIA_SPORT_ID, name: "Memorabilia" },
  ]);
  assert.equal(curateShopperSports(sports as any).filter(({ id }) => id === SHOPPER_MEMORABILIA_SPORT_ID).length, 1);
});

test("an all-sports view never exposes the massive global equipment taxonomy", () => {
  assert.deepEqual(curateShopperEquipmentTypes([
    { id: "golf-drivers", name: "Drivers", sportId: "golf" },
    { id: "football-helmets", name: "Helmets", sportId: "football" },
  ]), []);
});

test("Memorabilia menu adapts Signed nesting into concise flat paths", () => {
  const result = curateShopperEquipmentTypes([], SHOPPER_MEMORABILIA_SPORT_ID);
  assert.deepEqual(result.map(({ id, name }) => ({ id, name })), [...SHOPPER_MEMORABILIA_EQUIPMENT]);
  assert.deepEqual(expandEquipmentTypeIds(SHOPPER_MEMORABILIA_SPORT_ID, [result[0].id]), []);
});

test("signed baseball, bat, and A2000 glove project into Memorabilia instead of playable equipment", () => {
  const signedBall = { title: "Aaron Judge Signed Baseball", sportId: "baseball", equipmentTypeId: "bb-balls" };
  const signedBat = { title: "Shohei Ohtani Signed Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-bats" };
  const signedGlove = { title: "Mookie Betts Signed Baseball Glove", sportId: "baseball", equipmentTypeId: "bb-gloves" };
  const signedCard = { title: "Aaron Judge Signed Baseball Card", sportId: "baseball", equipmentTypeId: "other" };
  assert.equal(shopperMemorabiliaEquipmentId(signedBall), "memorabilia-signed-balls");
  assert.equal(shopperMemorabiliaEquipmentId(signedBat), "memorabilia-signed-bats");
  assert.equal(shopperMemorabiliaEquipmentId(signedGlove), "memorabilia-signed-gloves");
  assert.equal(shopperMemorabiliaEquipmentId(signedCard), "memorabilia-signed-cards");
  assert.equal(shopperResultEquipmentTypeId(signedGlove), "memorabilia-signed-gloves");
});

test("ordinary playable equipment and branded Signature/Autograph models stay playable", () => {
  const ordinaryBall = { title: "Rawlings ROLB1 Practice Baseballs 12 Pack", sportId: "baseball", equipmentTypeId: "bb-balls" };
  const ordinaryBat = { title: "Louisville Slugger Supra USA Baseball Bat 29/19", sportId: "baseball", equipmentTypeId: "bb-bats" };
  const signatureBat = { title: "Marucci Signature Series Baseball Bat", sportId: "baseball", equipmentTypeId: "bb-bats" };
  const autographGlove = { title: "Wilson A2000 Autograph Model 1786 Baseball Glove", sportId: "baseball", equipmentTypeId: "bb-gloves" };
  for (const deal of [ordinaryBall, ordinaryBat, signatureBat, autographGlove]) {
    assert.equal(isShopperMemorabiliaDeal(deal), false);
  }
  assert.equal(shopperResultEquipmentTypeId(ordinaryBall), "bb-balls");
  assert.equal(shopperResultEquipmentTypeId(ordinaryBat), "bb-bats");
});

test("game-used, trading cards, display cases, and other collectibles receive stable shopper paths", () => {
  assert.equal(shopperMemorabiliaEquipmentId({ title: "Game-used Yankees jersey" }), "memorabilia-game-used");
  assert.equal(shopperMemorabiliaEquipmentId({ title: "2026 Topps Baseball Trading Card" }), "memorabilia-trading-cards");
  assert.equal(shopperMemorabiliaEquipmentId({ title: "Wall mount baseball bat display case" }), "memorabilia-display-cases");
  assert.equal(shopperMemorabiliaEquipmentId({ title: "Commemorative World Series baseball collectible" }), "memorabilia-other-collectibles");
});
