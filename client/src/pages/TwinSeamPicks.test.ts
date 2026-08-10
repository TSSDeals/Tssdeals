import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Twin Seam Picks exposes every requested collection", () => {
  const source = readFileSync(new URL("./TwinSeamPicks.tsx", import.meta.url), "utf8");
  assert.match(source, /Sent by Twin Seam/);
  assert.match(source, /From TwinSeamSports\.com/);
  assert.match(source, /Elite Glove Picks/);
  assert.match(source, /Premium Bats & Golf Clubs/);
});

test("app navigation places Twin Seam Picks after Top Deals", () => {
  const source = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /Top Deals[\s\S]*Twin Seam Picks[\s\S]*Buyer's Guide/);
});

test("every owner text submission enters Picks without a ranking gate", () => {
  const source = readFileSync(new URL("../../../server/storage.ts", import.meta.url), "utf8");
  assert.match(source, /const texted = textPool/);
  assert.doesNotMatch(source, /const texted = rankTopDeals\(textPool/);
});

test("TwinSeamSports inventory has a two-item fallback without a discount gate", () => {
  const source = readFileSync(new URL("../../../server/storage.ts", import.meta.url), "utf8");
  assert.match(source, /rankedTwinSeamSports\.length >= 2/);
  assert.match(source, /\.slice\(0, 2\)/);
  assert.match(source, /\["twin-seam-sports", "shopify-collective"\]/);
});
