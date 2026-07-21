import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { runVersionedMigrations, type MigrationLedger, type VersionedMigration } from "./migration-runner";
import { STARTUP_MIGRATION_MANIFEST, STARTUP_POLICY } from "./startup-migration-policy";
import { assertTaxonomyApproval } from "./taxonomy-approval";
import { parseMaintenanceInvocation } from "./maintenance-policy";

test("restart applies each versioned startup operation once", async () => {
  const applied = new Set<string>();
  let mutationCalls = 0;
  const ledger: MigrationLedger<null> = {
    async ensure() {},
    async has(id) { return applied.has(id); },
    async applyOnce(migration, context) {
      if (applied.has(migration.id)) return false;
      await migration.up(context);
      applied.add(migration.id);
      return true;
    },
  };
  const migrations: VersionedMigration<null>[] = [{
    id: "immutable_001",
    checksum: "test-checksum",
    kind: "structural",
    description: "test",
    async up() { mutationCalls += 1; },
  }];

  await runVersionedMigrations(ledger, migrations, null);
  await runVersionedMigrations(ledger, migrations, null);
  assert.equal(mutationCalls, 1);
});

test("startup list contains only structural and approved static seed operations", () => {
  assert.ok(STARTUP_MIGRATION_MANIFEST.some((migration) => migration.kind === "approved-seed"));
  for (const migration of STARTUP_MIGRATION_MANIFEST) {
    assert.match(migration.id, /^\d{8}_\d{3}_[a-z0-9_]+$/);
    assert.match(migration.checksum, /^[a-f0-9]{64}$/);
    assert.ok(STARTUP_POLICY.allowedKinds.includes(migration.kind));
    assert.ok(!STARTUP_POLICY.forbiddenKinds.includes(migration.kind as never));
  }
  assert.equal(new Set(STARTUP_MIGRATION_MANIFEST.map((migration) => migration.id)).size,
    STARTUP_MIGRATION_MANIFEST.length);
});

test("approved Bat and Glove taxonomy remains in the one-time static seed", () => {
  const storageSource = readFileSync(join(process.cwd(), "server", "storage.ts"), "utf8");
  assert.match(storageSource, /id:\s*"bb-bats",\s*name:\s*"Bats"/);
  assert.match(storageSource, /id:\s*"bb-gloves",\s*name:\s*"Gloves"/);
  assert.ok(STARTUP_MIGRATION_MANIFEST.some((migration) => migration.kind === "approved-seed"));
});

test("ordinary application startup contains no deal reclassification or dynamic taxonomy creation", () => {
  const indexSource = readFileSync(join(process.cwd(), "server", "index.ts"), "utf8");
  const schedulerSource = readFileSync(join(process.cwd(), "server", "deal-sync-scheduler.ts"), "utf8");
  assert.doesNotMatch(indexSource, /UPDATE\s+deals|DELETE\s+FROM\s+deals|createSport\(|createEquipmentType\(/i);
  assert.doesNotMatch(indexSource, /recalculateDealDiscounts|applyAutoIncludeRules|seedKnoxStarsTeam/);
  assert.doesNotMatch(schedulerSource, /Running initial deal sync on startup|setTimeout\(\(\) =>[\s\S]{0,300}runFullSync/);
});

test("importers cannot create an unapproved live category", () => {
  const importerFiles = [
    "baseball-resale-sync.ts", "cj-affiliate.ts", "ebay-api.ts", "fanatics-sync.ts",
    "shopify-sync.ts", "shopify-multi-store-sync.ts", "sidelineswap.ts", "woocommerce-sync.ts",
  ];
  for (const file of importerFiles) {
    const source = readFileSync(join(process.cwd(), "server", file), "utf8");
    assert.doesNotMatch(source, /createSport\(|createEquipmentType\(|insert\(sports\)|insert\(equipmentTypes\)/);
  }
  assert.throws(() => assertTaxonomyApproval(undefined), /explicit Admin approval/);
  assert.doesNotThrow(() => assertTaxonomyApproval({ source: "admin-api", approvedBy: "admin@example.com" }));
});

test("maintenance defaults to dry-run and execution requires exact confirmation and identity", () => {
  const dryRun = parseMaintenanceInvocation(["--command", "search-vector-backfill"]);
  assert.equal(dryRun.dryRun, true);
  assert.throws(
    () => parseMaintenanceInvocation(["--command", "search-vector-backfill", "--execute"]),
    /--confirm search-vector-backfill/,
  );
  assert.throws(
    () => parseMaintenanceInvocation([
      "--command", "search-vector-backfill", "--execute", "--confirm", "search-vector-backfill",
    ]),
    /--requested-by/,
  );
  const execute = parseMaintenanceInvocation([
    "--command", "search-vector-backfill", "--execute", "--confirm", "search-vector-backfill",
    "--requested-by", "admin@example.com",
  ]);
  assert.equal(execute.dryRun, false);
});
