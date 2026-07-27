import assert from "node:assert/strict";
import test from "node:test";
import { classifyDeterministicProduct } from "./deterministic-product-classifier";

test("fielding gloves are separated from batting, golf, rain, and sliding gloves", () => {
  assert.equal(classifyDeterministicProduct("Wilson Staff Model Golf Glove"), null);
  assert.equal(classifyDeterministicProduct("Wilson Rain Gloves"), null);
  assert.equal(classifyDeterministicProduct("Adult Baseball Batting Gloves"), null);
  assert.equal(classifyDeterministicProduct("Baseball Sliding Mitt"), null);
  assert.deepEqual(
    classifyDeterministicProduct("Wilson A2000 1786 11.5 Baseball Infield Glove"),
    { sportId: "baseball", equipmentTypeId: "bb-gloves", confidence: "high", reason: "explicit baseball fielding glove" },
  );
  assert.deepEqual(
    classifyDeterministicProduct("Mizuno MVP Prime Fastpitch Softball Fielding Glove"),
    { sportId: "fastpitch-softball", equipmentTypeId: "fp-gloves", confidence: "high", reason: "explicit softball fielding glove" },
  );
});

test("bats require explicit product-form evidence and preserve pitch type", () => {
  assert.equal(classifyDeterministicProduct("Ken Griffey Jr. Black Cincinnati Jersey"), null);
  assert.equal(classifyDeterministicProduct("Baseball Bat Display Case"), null);
  assert.deepEqual(classifyDeterministicProduct("Louisville Supra USSSA Baseball Bat"),
    { sportId: "baseball", equipmentTypeId: "bb-bats", confidence: "high", reason: "explicit baseball bat" });
  assert.deepEqual(classifyDeterministicProduct("Marucci ASURA Fastpitch Softball Bat -10"),
    { sportId: "fastpitch-softball", equipmentTypeId: "fp-bats", confidence: "high", reason: "explicit fastpitch bat" });
});

test("running shoes and golf club forms receive precise destinations", () => {
  assert.equal(classifyDeterministicProduct("MLB Fear of God Sport Hoodie"), null);
  assert.equal(classifyDeterministicProduct("Blade Putter Headcover"), null);
  assert.equal(classifyDeterministicProduct("Golf Driver Headcover"), null);
  assert.equal(classifyDeterministicProduct("Baseball Cleats"), null);
  assert.equal(classifyDeterministicProduct("Brooks Ghost Road Running Shoe")?.equipmentTypeId, "run-shoes");
  assert.equal(classifyDeterministicProduct("Titleist Vokey SM10 Golf Wedge 56 Degree")?.equipmentTypeId, "golf-wedges");
  assert.equal(classifyDeterministicProduct("Cleveland Launcher Golf Driver")?.equipmentTypeId, "golf-drivers");
  assert.equal(classifyDeterministicProduct("TaylorMade Spider Golf Putter")?.equipmentTypeId, "golf-putters");
});
