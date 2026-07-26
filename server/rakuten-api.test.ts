import assert from "node:assert/strict";
import test from "node:test";
import { RAKUTEN_MERCHANTS } from "./rakuten-api";

test("dedicated Rakuten sync covers every approved sports advertiser", () => {
  const merchants = new Map(RAKUTEN_MERCHANTS.map((merchant) => [merchant.mid, merchant]));

  assert.equal(merchants.get("43729")?.name, "Hoka");
  assert.equal(merchants.get("38663")?.name, "Orvis");
  assert.deepEqual(merchants.get("53974"), {
    mid: "53974",
    name: "Cannondale Bicycles",
    brand: "Cannondale",
    sourceId: "rak-cannondale-bicycles",
    keywords: [
      "mountain bike",
      "road bike",
      "gravel bike",
      "electric bike",
      "kids bike",
      "bicycle",
      "cycling",
    ],
    sportIds: ["cycling"],
    equipmentTypeId: "cyc-bikes",
  });
});

test("non-sport Rakuten advertisers are not added to the sports catalog", () => {
  assert.equal(
    RAKUTEN_MERCHANTS.some((merchant) => merchant.mid === "53552"),
    false,
  );
});
