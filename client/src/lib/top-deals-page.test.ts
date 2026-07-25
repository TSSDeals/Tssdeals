import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveTopDealsCategory,
  resolveTopDealsRouteSlug,
  resolveTopDealsSlugFromLocation,
} from "./top-deals-page";

test("direct running-shoes route resolves immediately from the URL", () => {
  assert.equal(resolveTopDealsRouteSlug(true, { slug: "running-shoes" }), "running-shoes");
  assert.equal(resolveTopDealsRouteSlug(false, { slug: "running-shoes" }), null);
  assert.equal(resolveTopDealsSlugFromLocation("/app/top-deals/running-shoes"), "running-shoes");
  assert.equal(resolveTopDealsSlugFromLocation("/app/top-deals/running-shoes/"), "running-shoes");
  assert.equal(resolveTopDealsSlugFromLocation("/app/top-deals/running-shoes?from=card"), "running-shoes");
});

test("running-shoes keeps a visible category title when detail data is empty or unavailable", () => {
  const listed = [{ slug: "running-shoes", name: "Top Running Shoe Deals" }];
  assert.deepEqual(resolveTopDealsCategory(undefined, listed, "running-shoes"), listed[0]);
  assert.equal(resolveTopDealsCategory(undefined, [], "running-shoes").name, "Running Shoes");
});
