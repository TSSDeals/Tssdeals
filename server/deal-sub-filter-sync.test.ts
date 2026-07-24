import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  collectValidDealSubFilterCandidates,
  validPrimarySubFilterId,
  writeDealSubFilterCandidates,
} from "./deal-sub-filter-sync";

test("stale and wrong-equipment sub-filter IDs are excluded without blocking valid tags", () => {
  const mappings = new Map([
    ["bb-bats-drop-10", "bb-bats"],
    ["bb-gloves-infield", "bb-gloves"],
  ]);

  const candidates = collectValidDealSubFilterCandidates("deal-1", {
    title: "Easton Hype Fire 28/18 Drop 10 Baseball Bat",
    equipmentTypeId: "bb-bats",
    subFilterId: "deleted-sub-filter",
    subFilterIds: ["bb-gloves-infield", "bb-bats-drop-10"],
  }, mappings);

  assert.deepEqual(candidates, [{
    dealId: "deal-1",
    subFilterId: "bb-bats-drop-10",
    equipmentTypeId: "bb-bats",
  }]);
  assert.equal(validPrimarySubFilterId("deleted-sub-filter", "bb-bats", mappings), null);
  assert.equal(validPrimarySubFilterId("bb-gloves-infield", "bb-bats", mappings), null);
  assert.equal(validPrimarySubFilterId("bb-bats-drop-10", "bb-bats", mappings), "bb-bats-drop-10");
});

test("a failed batched tag write is swallowed and logged once instead of once per deal", async () => {
  const candidates = Array.from({ length: 1_200 }, (_, index) => ({
    dealId: `deal-${index}`,
    subFilterId: "bb-bats-drop-10",
    equipmentTypeId: "bb-bats",
  }));
  let writes = 0;
  const warnings: string[] = [];

  await writeDealSubFilterCandidates(
    candidates,
    async () => {
      writes++;
      throw new Error("simulated FK race");
    },
    (message) => warnings.push(message),
    500,
  );

  assert.equal(writes, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /left unchanged/);
});

test("candidate writes are deduplicated and chunked", async () => {
  const candidates = [
    { dealId: "deal-1", subFilterId: "sf-1", equipmentTypeId: "bb-bats" },
    { dealId: "deal-1", subFilterId: "sf-1", equipmentTypeId: "bb-bats" },
    { dealId: "deal-2", subFilterId: "sf-1", equipmentTypeId: "bb-bats" },
  ];
  const chunks: number[] = [];

  await writeDealSubFilterCandidates(
    candidates,
    async (chunk) => { chunks.push(chunk.length); },
    () => assert.fail("no warning expected"),
    1,
  );

  assert.deepEqual(chunks, [1, 1]);
});

test("classifier enrichment failure does not block a valid deal tag", () => {
  const mappings = new Map([["bb-bats-drop-10", "bb-bats"]]);

  const candidates = collectValidDealSubFilterCandidates(
    "deal-1",
    {
      title: "Easton Hype Fire",
      equipmentTypeId: "bb-bats",
      subFilterId: "bb-bats-drop-10",
    },
    mappings,
    () => { throw new Error("bad classifier rule"); },
  );

  assert.deepEqual(candidates, [{
    dealId: "deal-1",
    subFilterId: "bb-bats-drop-10",
    equipmentTypeId: "bb-bats",
  }]);
});

test("storage rechecks the live taxonomy mapping in one batched INSERT", () => {
  const source = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");

  assert.match(source, /INNER JOIN equipment_sub_filters current_sub_filter/);
  assert.match(source, /current_sub_filter\.id = candidate\.sub_filter_id/);
  assert.match(source, /current_sub_filter\.equipment_type_id = candidate\.equipment_type_id/);
  assert.doesNotMatch(source, /sync failed for \$\{dealId\}/);
});
