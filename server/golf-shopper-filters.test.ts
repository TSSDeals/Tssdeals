import assert from "node:assert/strict";
import test from "node:test";
import { api } from "../shared/routes";
import {
  GOLF_FLEX_PATTERNS,
  GOLF_HAND_PATTERNS,
  golfLoftPattern,
} from "./deal-search";

test("deals API accepts the visible golf shopper filters", () => {
  const parsed = api.deals.list.input?.parse({
    sportId: "golf",
    equipmentTypeId: "golf-drivers",
    golfHand: "left",
    golfFlex: "stiff",
    golfLoft: "10.5",
    sortBy: "delivered-low",
  });

  assert.equal(parsed?.golfHand, "left");
  assert.equal(parsed?.golfFlex, "stiff");
  assert.equal(parsed?.golfLoft, "10.5");
  assert.equal(parsed?.sortBy, "delivered-low");
});

test("golf filters reject unsupported values before querying", () => {
  assert.equal(api.deals.list.input?.safeParse({ golfHand: "either" }).success, false);
  assert.equal(api.deals.list.input?.safeParse({ golfFlex: "firm-ish" }).success, false);
  assert.equal(api.deals.list.input?.safeParse({ golfLoft: "ten" }).success, false);
});

test("golf title evidence recognizes common hand, flex, and loft notation", () => {
  const title = "TaylorMade Qi35 Driver 10.5 degree Stiff Flex Left Hand";
  assert.match(title, new RegExp(GOLF_HAND_PATTERNS.left, "i"));
  assert.match(title, new RegExp(GOLF_FLEX_PATTERNS.stiff, "i"));
  assert.match(title, new RegExp(golfLoftPattern("10.5"), "i"));
});
