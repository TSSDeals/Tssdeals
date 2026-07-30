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
    setComposition: null, clubComponent: null, condition: "new",
  });
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
