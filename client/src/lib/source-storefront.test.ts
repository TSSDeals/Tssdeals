import assert from "node:assert/strict";
import test from "node:test";
import { compactStorefrontSlug, findStorefrontSource, sourceStorefrontSlug } from "./source-storefront";

const sources = [
  { id: "twin-seam-sports", name: "Twin Seam Sports" },
  { id: "ball-glove-blueprint", name: "Ball Glove Blueprint" },
  { id: "name-of-the-game", name: "Name of the Game" },
];

test("source storefront slugs are short and shareable", () => {
  assert.equal(sourceStorefrontSlug(sources[0]), "twinseamsports");
  assert.equal(sourceStorefrontSlug(sources[1]), "ballgloveblueprint");
  assert.equal(sourceStorefrontSlug(sources[2]), "nameofthegame");
});

test("source storefront lookup accepts compact names and stored IDs", () => {
  assert.equal(findStorefrontSource(sources, "twinseamsports")?.id, "twin-seam-sports");
  assert.equal(findStorefrontSource(sources, "ball-glove-blueprint")?.id, "ball-glove-blueprint");
  assert.equal(findStorefrontSource(sources, "Name%20of%20the%20Game")?.id, "name-of-the-game");
  assert.equal(findStorefrontSource(sources, "unknown"), undefined);
});

test("compact slugs remove punctuation without changing identity", () => {
  assert.equal(compactStorefrontSlug("Joe's Gloves & More"), "joesglovesmore");
});

