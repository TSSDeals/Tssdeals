import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const storageSource = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");

test("Twin Seam inventory bypasses the affiliate discount threshold", () => {
  const discountBlock = storageSource.match(
    /const discountConditions:[\s\S]*?whereParts\.push\(or\(\.\.\.discountConditions\)\);/,
  )?.[0] ?? "";

  assert.match(discountBlock, /eq\(deals\.sourceId, "twin-seam-sports"\)/);
});

test("explicit Twin Seam source search has no vendor or markdown gate", () => {
  const sourceBlock = storageSource.match(
    /if \(params\.featured\)[\s\S]*?if \(params\.priceDropOnly\)/,
  )?.[0] ?? "";

  assert.match(sourceBlock, /whereParts\.push\(eq\(deals\.sourceId, params\.source\)\)/);
  assert.doesNotMatch(sourceBlock, /shopifyVendor/);
  assert.doesNotMatch(sourceBlock, /String\(45\)/);
});
