import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("unified taxonomy report uses mutually exclusive status precedence", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /app\.get\("\/api\/admin\/taxonomy-status", isAdmin/);
  assert.match(routes, /WHEN pr\.deal_id IS NOT NULL THEN 'pending_review'/);
  assert.match(routes, /THEN 'needs_correction'/);
  assert.match(routes, /THEN 'pending_classification'/);
  assert.match(routes, /THEN 'confirmed_ai'/);
  assert.match(routes, /ELSE 'source_assigned'/);
  assert.match(routes, /taxonomy_status IN \('confirmed_ai', 'source_assigned'\)/);
});

test("admin renders unified totals and explains their accounting", () => {
  const admin = readFileSync(new URL("../client/src/pages/Admin.tsx", import.meta.url), "utf8");
  assert.match(admin, /queryKey: \["\/api\/admin\/taxonomy-status"\]/);
  assert.match(admin, /Unified Taxonomy Status/);
  assert.match(admin, /five status buckets add exactly to Total items/i);
  assert.match(admin, /Product identities awaiting review/);
});
