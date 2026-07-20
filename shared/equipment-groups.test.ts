import assert from "node:assert/strict";
import test from "node:test";
import {
  BASEBALL_BAT_GROUP_IDS,
  BASEBALL_GLOVE_GROUP_IDS,
  CANONICAL_BASEBALL_BAT_ID,
  curateShopperEquipmentTypes,
  expandEquipmentTypeIds,
} from "./equipment-groups";

test("canonical baseball bat selection expands to every live legacy ID", () => {
  assert.deepEqual(expandEquipmentTypeIds("baseball", [CANONICAL_BASEBALL_BAT_ID]), [...BASEBALL_BAT_GROUP_IDS]);
});

test("shopper taxonomy shows one curated Baseball Bats option", () => {
  const result = curateShopperEquipmentTypes([
    { id: "baseball-bat", name: "Baseball Bat", sportId: "baseball" },
    { id: "bat", name: "Bat", sportId: "baseball" },
    { id: "bb-bats", name: "Bats", sportId: "baseball" },
    { id: "bb-gloves", name: "Gloves", sportId: "baseball" },
  ], "baseball");
  assert.deepEqual(result.map(({ id, name }) => ({ id, name })), [
    { id: "bb-bats", name: "Baseball Bats" },
    { id: "bb-gloves", name: "Baseball Gloves" },
  ]);
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

test("shopper taxonomy curates fielding gloves but preserves batting gloves", () => {
  const result = curateShopperEquipmentTypes([
    { id: "glove", name: "Glove", sportId: "baseball" },
    { id: "baseball-glove", name: "Baseball Glove", sportId: "baseball" },
    { id: "baseball-gloves", name: "Baseball Gloves", sportId: "baseball" },
    { id: "bb-gloves", name: "Gloves", sportId: "baseball" },
    { id: "bb-batting-gloves", name: "Batting Gloves", sportId: "baseball" },
  ], "baseball");
  assert.deepEqual(result.map(({ id, name }) => ({ id, name })), [
    { id: "bb-gloves", name: "Baseball Gloves" },
    { id: "bb-batting-gloves", name: "Batting Gloves" },
  ]);
});
