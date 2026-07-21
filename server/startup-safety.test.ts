import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  MigrationExecutionError,
  runVersionedMigrations,
  type MigrationLedger,
  type VersionedMigration,
} from "./migration-runner";
import {
  classifyApprovedSeedState,
  STARTUP_MIGRATION_MANIFEST,
  STARTUP_POLICY,
} from "./startup-migration-policy";
import { assertTaxonomyApproval } from "./taxonomy-approval";
import {
  parseMaintenanceInvocation,
  PHASE0_PREVIEW_ONLY_COMMANDS,
} from "./maintenance-policy";
import { bootstrapApplication, createStartupReadiness } from "./startup-readiness";

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

test("every Phase 0 preview-only command rejects execution before any write hook", () => {
  for (const command of PHASE0_PREVIEW_ONLY_COMMANDS) {
    let maintenanceWrites = 0;
    const attempt = () => {
      parseMaintenanceInvocation([
        "--command", command, "--execute", "--confirm", command,
        "--requested-by", "admin@example.com",
      ]);
      // This represents both maintenance_run_log insertion and operation DML.
      maintenanceWrites += 1;
    };
    assert.throws(attempt, /preview-only in Phase 0/);
    assert.equal(maintenanceWrites, 0, `${command} must fail before every write`);
  }
});

test("destructive and classification-changing SQL is not executable in the Phase 0 command file", () => {
  const source = readFileSync(join(process.cwd(), "script", "phase0-maintenance.ts"), "utf8");
  assert.doesNotMatch(source, /executeSql:\s*`DELETE\s+FROM\s+deals/i);
  assert.doesNotMatch(source, /executeSql:\s*`UPDATE\s+deals\s+SET\s+equipment_type_id/i);
  assert.doesNotMatch(source, /executeSql:\s*`UPDATE\s+sources/i);
  assert.doesNotMatch(source, /executeSql:\s*`UPDATE\s+deals[\s\S]{0,80}\burl=/i);
});

test("failed migration rolls back partial work and its ledger row together", async () => {
  const workRows: string[] = [];
  const ledgerRows = new Set<string>();
  const ledger: MigrationLedger<{ rows: string[] }> = {
    async ensure() {},
    async has(id) { return ledgerRows.has(id); },
    async applyOnce(migration, context) {
      const workSnapshot = [...workRows];
      const ledgerSnapshot = new Set(ledgerRows);
      try {
        await migration.up(context);
        ledgerRows.add(migration.id);
        return true;
      } catch (error) {
        workRows.splice(0, workRows.length, ...workSnapshot);
        ledgerRows.clear();
        for (const id of ledgerSnapshot) ledgerRows.add(id);
        throw error;
      }
    },
  };
  const migration: VersionedMigration<{ rows: string[] }> = {
    id: "atomic_001",
    checksum: "test",
    kind: "structural",
    description: "failure injection",
    async up(context) {
      context.rows.push("partial schema work");
      throw new Error("injected failure");
    },
  };

  await assert.rejects(
    runVersionedMigrations(ledger, [migration], { rows: workRows }),
    (error: unknown) => error instanceof MigrationExecutionError
      && error.migrationId === "atomic_001" && /injected failure/.test(error.message),
  );
  assert.deepEqual(workRows, []);
  assert.equal(ledgerRows.size, 0);

  const startupSource = readFileSync(join(process.cwd(), "server", "startup-migrations.ts"), "utf8");
  assert.match(startupSource, /ensureInvoicesSchema\(context\.database\)/);
  assert.match(startupSource, /ensureTeamStatsSchema\(context\.database\)/);
  assert.match(startupSource, /storage\.seed\(context\.database\)/);
  assert.match(startupSource, /seedKnoxStarsTeam\(context\.database\)/);
});

test("concurrent startup runners serialize and apply a migration once", async () => {
  const applied = new Set<string>();
  let mutationCalls = 0;
  let tail = Promise.resolve();
  const ledger: MigrationLedger<null> = {
    async ensure() {},
    async has(id) { return applied.has(id); },
    async applyOnce(migration, context) {
      let release!: () => void;
      const previous = tail;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        if (applied.has(migration.id)) return false;
        await migration.up(context);
        applied.add(migration.id);
        return true;
      } finally {
        release();
      }
    },
  };
  const migration: VersionedMigration<null> = {
    id: "serialized_001", checksum: "test", kind: "structural", description: "test",
    async up() {
      await new Promise<void>((resolve) => setImmediate(resolve));
      mutationCalls += 1;
    },
  };

  const results = await Promise.all([
    runVersionedMigrations(ledger, [migration], null),
    runVersionedMigrations(ledger, [migration], null),
  ]);
  assert.equal(mutationCalls, 1);
  assert.equal(results.flatMap((result) => result.applied).length, 1);
  const startupSource = readFileSync(join(process.cwd(), "server", "startup-migrations.ts"), "utf8");
  assert.match(startupSource, /pg_advisory_xact_lock/);
});

test("migration failure exposes failed readiness and requests nonzero termination", async () => {
  const readiness = createStartupReadiness();
  let initialized = false;
  let exitCode: number | undefined;
  let logged = "";
  const started = await bootstrapApplication({
    readiness,
    async migrate() { throw new MigrationExecutionError("20260721_001_test", new Error("boom")); },
    async initialize() { initialized = true; },
    logFailure(message) { logged = message; },
    async terminate(code) { exitCode = code; },
  });

  assert.equal(started, false);
  assert.equal(initialized, false);
  assert.equal(exitCode, 1);
  assert.deepEqual(readiness.get(), {
    phase: "failed",
    migrationId: "20260721_001_test",
    error: "Migration 20260721_001_test failed: boom",
  });
  assert.match(logged, /migration=20260721_001_test/);
});

test("existing production taxonomy is materially satisfied and is never reseeded", () => {
  assert.equal(classifyApprovedSeedState({
    sportsCount: 19, equipmentCount: 100, sourcesCount: 30,
    hasBaseballBats: true, hasBaseballGloves: true,
  }), "satisfied");
  assert.equal(classifyApprovedSeedState({
    sportsCount: 0, equipmentCount: 0, sourcesCount: 0,
    hasBaseballBats: false, hasBaseballGloves: false,
  }), "empty");
  assert.equal(classifyApprovedSeedState({
    sportsCount: 19, equipmentCount: 0, sourcesCount: 30,
    hasBaseballBats: false, hasBaseballGloves: false,
  }), "partial");
});

test("production preflight is explicitly read-only and reports migration material state", () => {
  const script = readFileSync(join(process.cwd(), "script", "phase0-preflight.ts"), "utf8");
  const implementation = readFileSync(join(process.cwd(), "server", "startup-preflight.ts"), "utf8");
  assert.match(script, /SET TRANSACTION READ ONLY/);
  assert.doesNotMatch(
    implementation,
    /execute\(sql\.raw\(`\s*(UPDATE|DELETE|INSERT|ALTER|DROP|CREATE)\b/i,
  );
  assert.match(implementation, /unique-index blocker/);
  assert.match(implementation, /application-role DDL permissions/);
  assert.match(implementation, /materiallySatisfied/);
});
