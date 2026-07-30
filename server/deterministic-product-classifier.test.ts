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
  assert.equal(classifyDeterministicProduct("Baseball Cleats")?.equipmentTypeId, "bb-cleats");
  assert.equal(classifyDeterministicProduct("Brooks Ghost Road Running Shoe")?.equipmentTypeId, "run-shoes");
  assert.equal(classifyDeterministicProduct("Titleist Vokey SM10 Golf Wedge 56 Degree")?.equipmentTypeId, "golf-wedges");
  assert.equal(classifyDeterministicProduct("Cleveland Launcher Golf Driver")?.equipmentTypeId, "golf-drivers");
  assert.equal(classifyDeterministicProduct("TaylorMade Spider Golf Putter")?.equipmentTypeId, "golf-putters");
});

test("sport-specific cleats are classified without guessing from generic footwear", () => {
  assert.equal(classifyDeterministicProduct("Nike Casual Baseball Lifestyle Shoe"), null);
  assert.equal(classifyDeterministicProduct("New Balance Metal Cleats"), null);
  assert.equal(classifyDeterministicProduct("Nike Football and Baseball Cleats"), null);
  assert.deepEqual(classifyDeterministicProduct("New Balance FuelCell 4040 Baseball Cleats"),
    { sportId: "baseball", equipmentTypeId: "bb-cleats", confidence: "high", reason: "explicit baseball cleat" });
  assert.deepEqual(classifyDeterministicProduct("Mizuno Fastpitch Softball Cleats"),
    { sportId: "fastpitch-softball", equipmentTypeId: "fp-cleats", confidence: "high", reason: "explicit fastpitch cleat" });
  assert.deepEqual(classifyDeterministicProduct("Boombah Slowpitch Turf Cleats"),
    { sportId: "slowpitch-softball", equipmentTypeId: "sp-cleats", confidence: "high", reason: "explicit slowpitch cleat" });
});

test("training equipment requires a complete product and explicit sport evidence", () => {
  assert.equal(classifyDeterministicProduct("Pitching Machine Replacement Wheel"), null);
  assert.equal(classifyDeterministicProduct("Portable Hitting Net"), null);
  assert.equal(classifyDeterministicProduct("Softball Pitching Machine"), null);
  assert.deepEqual(classifyDeterministicProduct("Louisville Slugger Baseball Pitching Machine"),
    { sportId: "baseball", equipmentTypeId: "bb-training", confidence: "high", reason: "explicit baseball training equipment" });
  assert.deepEqual(classifyDeterministicProduct("Fastpitch Softball Pitching Target Training Net"),
    { sportId: "fastpitch-softball", equipmentTypeId: "fp-training", confidence: "high", reason: "explicit fastpitch training equipment" });
  assert.deepEqual(classifyDeterministicProduct("Slowpitch Softball Batting Tee Swing Trainer"),
    { sportId: "slowpitch-softball", equipmentTypeId: "sp-training", confidence: "high", reason: "explicit slowpitch training equipment" });
});
