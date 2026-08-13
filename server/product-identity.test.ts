import assert from "node:assert/strict";
import test from "node:test";
import { proposeProductIdentity } from "./product-identity";

test("groups equivalent A2000 listings into one family while preserving variants", () => {
  const common = {
    brand: "Wilson Sporting Goods",
    sportId: "baseball",
    equipmentTypeId: "bb-gloves",
    condition: "new",
  };
  const left = proposeProductIdentity({
    ...common,
    id: "left",
    title: "Wilson A2000 1786 11.5 LHT Baseball Glove",
    sizeNumber: "11.5",
  });
  const right = proposeProductIdentity({
    ...common,
    id: "right",
    title: "Wilson A2000 1786 11.5 RHT Fielding Glove",
    sizeNumber: "11.5",
  });
  assert.ok(left && right);
  assert.equal(left.familyFingerprint, right.familyFingerprint);
  assert.notEqual(left.variantFingerprint, right.variantFingerprint);
  assert.equal(left.variant.throwHand, "LHT");
  assert.equal(right.variant.throwHand, "RHT");
});

test("normalizes equivalent Supra bat dimensions without collapsing condition", () => {
  const base = {
    brand: "Louisville",
    sportId: "baseball",
    equipmentTypeId: "bb-bats",
    dropWeight: 10,
    raw: { certification: "USSSA", modelNumber: "SUPRA" },
  };
  const first = proposeProductIdentity({
    ...base, id: "new", condition: "new", title: "Louisville Slugger Supra 27/17 -10",
  });
  const second = proposeProductIdentity({
    ...base, id: "used", condition: "preowned", title: "LS Supra 27 / 17 USSSA",
  });
  assert.ok(first && second);
  assert.equal(first.familyFingerprint, second.familyFingerprint);
  assert.notEqual(first.variantFingerprint, second.variantFingerprint);
  assert.deepEqual(first.variant, {
    size: null, throwHand: null, length: 27, weight: 17, drop: 10,
    certification: "USSSA", golfHand: null, loft: null, shaftFlex: null,
    setComposition: null, clubComponent: null, editionType: "stock",
    releaseSeason: null, releaseMonth: null, releaseYear: null, colorway: null,
    exclusiveTo: null, condition: "new",
  });
});

test("keeps model family stable while separating seasonal, GOTM, and exclusive glove variants", () => {
  const common = {
    brand: "Wilson", sportId: "baseball", equipmentTypeId: "bb-gloves", condition: "new",
  };
  const stock = proposeProductIdentity({
    ...common, id: "stock", title: "Wilson A2000 1786 11.5 RHT Baseball Glove",
  });
  const spring = proposeProductIdentity({
    ...common, id: "spring", title: "Wilson A2000 1786 Spring '26 11.5 RHT Baseball Glove",
    raw: { colorway: "Blonde / Saddle Tan" },
  });
  const gotm = proposeProductIdentity({
    ...common, id: "gotm", title: "Wilson A2000 1786 GOTM March 2026 11.5 RHT",
  });
  const exclusive = proposeProductIdentity({
    ...common, id: "exclusive", title: "Wilson A2000 1786 11.5 RHT Store Exclusive",
    raw: { exclusiveRetailer: "Ball Glove Blueprint", colorName: "Carolina Blue / Pink" },
  });
  assert.ok(stock && spring && gotm && exclusive);
  assert.equal(new Set([stock, spring, gotm, exclusive].map((item) => item.familyFingerprint)).size, 1);
  assert.equal(new Set([stock, spring, gotm, exclusive].map((item) => item.variantFingerprint)).size, 4);
  assert.deepEqual({
    type: spring.variant.editionType, season: spring.variant.releaseSeason,
    year: spring.variant.releaseYear, colorway: spring.variant.colorway,
  }, { type: "seasonal", season: "spring", year: 2026, colorway: "Blonde / Saddle Tan" });
  assert.deepEqual({
    type: gotm.variant.editionType, month: gotm.variant.releaseMonth, year: gotm.variant.releaseYear,
  }, { type: "gotm", month: "March", year: 2026 });
  assert.equal(exclusive.variant.editionType, "exclusive");
  assert.equal(exclusive.variant.exclusiveTo, "Ball Glove Blueprint");
});

test("golf identities preserve loft, handedness, flex, and component differences", () => {
  const common = {
    brand: "TaylorMade Golf",
    sportId: "golf",
    equipmentTypeId: "golf-drivers",
    condition: "preowned",
  };
  const complete = proposeProductIdentity({
    ...common,
    id: "complete",
    title: "TaylorMade Qi10 Driver 10.5 Degree RH Ventus Blue Stiff Flex",
  });
  const headOnly = proposeProductIdentity({
    ...common,
    id: "head",
    title: "TaylorMade Qi10 10.5 Degree RH Driver Head Only",
  });
  assert.ok(complete && headOnly);
  assert.equal(complete.familyFingerprint, headOnly.familyFingerprint);
  assert.notEqual(complete.variantFingerprint, headOnly.variantFingerprint);
  assert.deepEqual({
    golfHand: complete.variant.golfHand,
    loft: complete.variant.loft,
    shaftFlex: complete.variant.shaftFlex,
    clubComponent: complete.variant.clubComponent,
  }, {
    golfHand: "RH",
    loft: 10.5,
    shaftFlex: "S",
    clubComponent: "complete",
  });
  assert.equal(headOnly.variant.clubComponent, "head_only");

  const structured = proposeProductIdentity({
    ...common,
    id: "structured-golf",
    title: "TaylorMade Qi10 Driver with Golf Pride Grip",
    raw: { loft: "9", shaftFlex: "X", handedness: "LH" },
  });
  assert.ok(structured);
  assert.equal(structured.variant.loft, 9);
  assert.equal(structured.variant.shaftFlex, "X");
  assert.equal(structured.variant.golfHand, "LH");
});

test("golf identities preserve iron set makeup and reject club accessories", () => {
  const irons = proposeProductIdentity({
    id: "irons",
    title: "Callaway Paradym Iron Set 5-PW, AW Right Hand Regular Flex",
    brand: "Callaway Golf",
    sportId: "golf",
    equipmentTypeId: "golf-iron-sets",
    raw: { setMakeup: "5-PW, AW" },
  });
  assert.ok(irons);
  assert.equal(irons.variant.setComposition, "5-PW,AW");
  assert.equal(irons.variant.golfHand, "RH");
  assert.equal(irons.variant.shaftFlex, "R");

  assert.equal(proposeProductIdentity({
    id: "cover",
    title: "TaylorMade Qi10 Driver Headcover",
    brand: "TaylorMade",
    sportId: "golf",
    equipmentTypeId: "golf-drivers",
  }), null);
  assert.equal(proposeProductIdentity({
    id: "shaft",
    title: "TaylorMade Qi10 Ventus Blue Stiff Replacement Shaft Only",
    brand: "TaylorMade",
    sportId: "golf",
    equipmentTypeId: "golf-drivers",
  }), null);
});

test("golf identity recognizes major current club families across sellers", () => {
  const cases = [
    ["TaylorMade P790 Iron Set 4-PW RH Stiff", "TaylorMade", "golf-iron-sets", "P790"],
    ["Callaway Apex Pro Iron Set 5-PW", "Callaway", "golf-iron-sets", "Apex"],
    ["Titleist T150 Iron Set 4-PW", "Titleist", "golf-iron-sets", "Titleist T-Series"],
    ["Mizuno JPX 925 Hot Metal Iron Set 5-GW", "Mizuno", "golf-iron-sets", "JPX 925/923"],
    ["Cleveland RTX 6 ZipCore 56 Degree Wedge", "Cleveland", "golf-wedges", "RTX"],
    ["Callaway Jaws Raw 52 Degree Wedge", "Callaway", "golf-wedges", "Jaws"],
    ["Odyssey White Hot OG #7 Putter", "Odyssey", "golf-putters", "White Hot"],
    ["PING PLD Milled Anser Putter", "PING", "golf-putters", "PING PLD"],
  ] as const;

  for (const [title, brand, equipmentTypeId, family] of cases) {
    const proposal = proposeProductIdentity({
      id: title,
      title,
      brand,
      sportId: "golf",
      equipmentTypeId,
      condition: "new",
    });
    assert.ok(proposal, title);
    assert.equal(proposal.productFamily, family, title);
  }
});

test("refuses generic, Other, and brandless products instead of guessing", () => {
  assert.equal(proposeProductIdentity({
    id: "generic", title: "Premium Baseball Glove", brand: "Wilson",
    sportId: "baseball", equipmentTypeId: "bb-gloves",
  }), null);
  assert.equal(proposeProductIdentity({
    id: "other", title: "Wilson A2000 1786", brand: "Wilson",
    sportId: "baseball", equipmentTypeId: "bb-other",
  }), null);
  assert.equal(proposeProductIdentity({
    id: "brandless", title: "A2000 1786", sportId: "baseball",
    equipmentTypeId: "bb-gloves",
  }), null);
});

test("structured model evidence supports less famous product families", () => {
  const proposal = proposeProductIdentity({
    id: "structured",
    title: "2026 Mizuno Pro Select 11.75 RHT",
    brand: "Mizuno",
    sportId: "baseball",
    equipmentTypeId: "bb-gloves",
    condition: "new",
    sizeNumber: "11.75",
    raw: { productFamily: "Pro Select", modelNumber: "GPS1-600R" },
  });
  assert.ok(proposal);
  assert.equal(proposal.productFamily, "Pro Select");
  assert.equal(proposal.modelCode, "GPS1-600R");
  assert.equal(proposal.confidence, "high");
});

test("recognized families must match their equipment kind", () => {
  assert.equal(proposeProductIdentity({
    id: "batting-glove",
    title: "Wilson A2000 Adult Batting Gloves",
    brand: "Wilson",
    sportId: "baseball",
    equipmentTypeId: "bb-accessories",
  }), null);
  assert.equal(proposeProductIdentity({
    id: "meta-shirt",
    title: "Louisville Slugger Meta Graphic Shirt",
    brand: "Louisville Slugger",
    sportId: "baseball",
    equipmentTypeId: "bb-apparel",
  }), null);
});

test("family name alone is never promoted to a style code", () => {
  const proposal = proposeProductIdentity({
    id: "a2000-family-only",
    title: "Wilson A2000 11.5 Baseball Glove RHT",
    brand: "Wilson",
    sportId: "baseball",
    equipmentTypeId: "bb-gloves",
    sizeNumber: "11.5",
  });
  assert.equal(proposal?.productFamily, "A2000");
  assert.equal(proposal?.modelCode, null);
});

test("explicit softball language cannot inherit a stale baseball identity", () => {
  assert.equal(proposeProductIdentity({
    id: "stale-baseball",
    title: "Rawlings Heart of the Hide 12 inch Fastpitch Softball Glove",
    brand: "Rawlings",
    sportId: "baseball",
    equipmentTypeId: "bb-gloves",
    sizeNumber: "12",
  }), null);
});
