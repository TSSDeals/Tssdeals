import assert from "node:assert/strict";
import test from "node:test";
import { classifyDeterministicProduct } from "./deterministic-product-classifier";

test("recognizes trusted baseball glove model names without requiring the word glove", () => {
  for (const title of [
    "Marucci Cypress",
    "Wilson A2000 1810",
    "Rawlings Foundation Aaron Judge 12.5",
  ]) {
    assert.deepEqual(classifyDeterministicProduct(title)?.equipmentTypeId, "bb-gloves");
  }
});

for (const title of [
  'NEW RAWLINGS PRO PREFERRED OA1 WOODY 33" 11835-S000210986',
  'NEW RAWLINGS PRO PREFERRED FL12 WOODY 32" 11835-S000210987',
  'NEW RAWLINGS PRO PREFERRED CR29T TORPEDO 33" WOODY 11835-S000210988',
  'Used Rawlings PRO PREFERRED MM13Y BB/SB Wood Bat 31" 11613-S000186984',
]) {
  test(`explicit bat form overrides the Pro Preferred glove-family name: ${title}`, () => {
    assert.deepEqual(classifyDeterministicProduct(title), {
      sportId: "baseball",
      equipmentTypeId: "bb-bats",
      confidence: "high",
      reason: "explicit baseball bat",
    });
  });
}

test("fielding gloves are separated from batting, golf, rain, and sliding gloves", () => {
  assert.equal(classifyDeterministicProduct("Wilson Staff Model Golf Glove"), null);
  assert.equal(classifyDeterministicProduct("Wilson Rain Gloves"), null);
  assert.equal(classifyDeterministicProduct("Adult Baseball Batting Gloves")?.equipmentTypeId, "bb-batting-gloves");
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

test("separates common cross-category contaminants from fielding gloves", () => {
  assert.equal(classifyDeterministicProduct("Wilson Adult Baseball Batting Gloves")?.equipmentTypeId, "bb-batting-gloves");
  assert.equal(classifyDeterministicProduct("Easton Fastpitch Batting Gloves")?.equipmentTypeId, "fp-batting-gloves");
  assert.equal(classifyDeterministicProduct("Easton Baseball Batting Helmet")?.equipmentTypeId, "bb-protective");
  assert.equal(classifyDeterministicProduct("Rawlings Official League Baseballs 12 Pack")?.equipmentTypeId, "bb-balls");
  assert.equal(classifyDeterministicProduct("Marucci Baseball Bat Equipment Bag")?.equipmentTypeId, "bb-bags");
  assert.equal(classifyDeterministicProduct("Rawlings Autographed Baseball Display Case"), null);
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

test("live audit contaminants do not become clubs, gloves, bats, or balls", () => {
  const titles = [
    "Nike Mens Vapor Edge Pro Black/Iron Grey Football Cleats",
    "Professional Baseball Glove Break-in Conditioning Kit - 5 Piece Set",
    "Rawlings Baseball Glove Pounding Molding Shaping Pad",
    "5pcs Baseball Lacing Needles Glove Repair Kit",
    "Mizuno Pro 17.5 in Adult Leg Guards",
    "Hot Glove Tacky Baseball Bat Handle Grip Wrap",
    "Jugs Lite-Flite Pitching Machine w Softballs and Baseballs",
    "Vintage Gray Wood Home Plate-Shaped Wall Mounted Baseball and Bat Storage",
    "4pcs Baseball Glove Shelf: Acrylic Display Rack - Softball Glove Stand",
    "Used Rawlings GREAT HANDS BBBS2 Baseball Training Pancake Glove",
    "54cm EVA Foam Baseball Bat Comfy Grip For Indoor Outdoor Play Yellow",
    "Rawlings Baseball Stitch Crossbody Bag",
    "Softball Pitcher's Screen 7x7 FT Fast Pitch Net with Carry Bag Portable Practice",
    "Used PRO VELOCITY BAT 32 NO KNOB BB/SB Training Aid 11682-S000136770",
    "Wilson T- Ball Batting Helmet Facemask for A5280 NOCSAE Compliant | A3089",
  ];
  for (const title of titles) assert.equal(classifyDeterministicProduct(title), null, title);
  assert.equal(
    classifyDeterministicProduct("Nike Youth Baseball Softball Cleats US Size 6Y Red Black White")?.equipmentTypeId,
    "bb-cleats",
  );
  assert.equal(
    classifyDeterministicProduct("Marucci 12.5 in. Oxbow Series 43A5 Fast-Pitch Fielding Glove")?.equipmentTypeId,
    "fp-gloves",
  );
  assert.equal(classifyDeterministicProduct("Champro Weighted Training Baseball Set")?.equipmentTypeId, "bb-training");
  assert.equal(classifyDeterministicProduct("Wilson Staff Tab III Set of 8 Irons")?.equipmentTypeId, "golf-iron-sets");
  assert.equal(classifyDeterministicProduct("Mizuno Pro T1 Wedge 60 Degree")?.equipmentTypeId, "golf-wedges");
});
