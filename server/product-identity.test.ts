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
    certification: "USSSA", condition: "new",
  });
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
