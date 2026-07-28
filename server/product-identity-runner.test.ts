import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const runner = readFileSync(join(process.cwd(), "server", "product-identity-runner.ts"), "utf8");
const routes = readFileSync(join(process.cwd(), "server", "routes.ts"), "utf8");

test("production identity runner stores only high-confidence proposals", () => {
  assert.match(runner, /proposal\.confidence === "high"/);
  assert.match(runner, /for \(const proposal of highConfidence\)/);
  assert.doesNotMatch(runner, /UPDATE\s+deals/i);
  assert.doesNotMatch(runner, /DELETE\s+FROM\s+deals/i);
});

test("production identity controls are admin-only and backgrounded", () => {
  assert.match(routes, /product-identities\/run-status", isAdmin/);
  assert.match(routes, /product-identities\/run", isAdmin/);
  assert.match(runner, /void run\(mode\)/);
});

test("preview mode is transactionally read-only", () => {
  assert.match(runner, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(runner, /await client\.query\("ROLLBACK"\)/);
});
