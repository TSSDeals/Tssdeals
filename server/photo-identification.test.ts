import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhotoIdentification } from "./photo-identification";

test("builds a detailed high-confidence glove search from visible product evidence", () => {
  assert.deepEqual(normalizePhotoIdentification({
    sport: "Baseball",
    brand: "wilson",
    productType: "baseball glove",
    model: "A2000",
    modelNumber: "1786",
    size: "11.5 inch",
    throwHand: "left hand throw",
    visibleText: ["A2000", "1786", "A2000"],
    confidence: "high",
    identified: "Wilson A2000 1786 baseball glove",
  }), {
    q: 'Wilson A2000 1786 baseball glove 11.5" LHT',
    sport: "baseball",
    brand: "Wilson",
    productType: "baseball glove",
    model: "A2000",
    modelNumber: "1786",
    size: '11.5"',
    throwHand: "LHT",
    drop: "",
    certification: "",
    visibleText: ["A2000", "1786"],
    identified: "Wilson A2000 1786 baseball glove",
    confidence: "high",
    needsConfirmation: false,
  });
});

test("normalizes bat size, drop, certification, and brand aliases", () => {
  const result = normalizePhotoIdentification({
    sport: "baseball",
    brand: "Louisville",
    productType: "baseball bat",
    model: "Supra",
    size: "27 / 17",
    drop: "drop 10",
    certification: "usssa",
    confidence: "medium",
  });

  assert.equal(result.q, "Louisville Slugger Supra baseball bat 27/17 -10 USSSA");
  assert.equal(result.needsConfirmation, true);
});

test("low-confidence guesses search broadly instead of over-constraining by model", () => {
  const result = normalizePhotoIdentification({
    brand: "Rawlings",
    productType: "catcher's mitt",
    model: "Possibly PROCM33",
    size: "33",
    confidence: "low",
  });

  assert.equal(result.q, "Rawlings catcher's mitt");
  assert.equal(result.model, "Possibly PROCM33");
  assert.equal(result.needsConfirmation, true);
});

test("malformed model output becomes a safe empty identification", () => {
  const result = normalizePhotoIdentification("not an object");
  assert.equal(result.q, "");
  assert.equal(result.confidence, "low");
  assert.equal(result.identified, "Unable to identify a sporting goods item");
  assert.equal(result.needsConfirmation, true);
});

