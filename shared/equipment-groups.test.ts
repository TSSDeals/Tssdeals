import assert from "node:assert/strict";
import test from "node:test";
import {
  BASEBALL_BAT_GROUP_IDS,
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
    { id: "bb-gloves", name: "Gloves" },
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
