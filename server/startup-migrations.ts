import { sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { ensureInvoicesSchema } from "./invoices";
import { ensureTeamStatsSchema, seedKnoxStarsTeam } from "./team-stats";
import {
  runVersionedMigrations,
  type MigrationLedger,
  type VersionedMigration,
} from "./migration-runner";
import {
  classifyApprovedSeedState,
  STARTUP_MIGRATION_MANIFEST,
  STARTUP_POLICY,
  type ApprovedSeedState,
} from "./startup-migration-policy";

interface StartupContext {
  database: any;
  execute(statement: ReturnType<typeof sql.raw>): Promise<unknown>;
}

export async function inspectApprovedSeedState(database: any): Promise<ApprovedSeedState> {
  const result = await database.execute(sql.raw(`
    SELECT
      (SELECT count(*)::int FROM sports) AS sports_count,
      (SELECT count(*)::int FROM equipment_types) AS equipment_count,
      (SELECT count(*)::int FROM sources) AS sources_count,
      EXISTS (SELECT 1 FROM equipment_types WHERE id='bb-bats' AND sport_id='baseball') AS has_bb_bats,
      EXISTS (SELECT 1 FROM equipment_types WHERE id='bb-gloves' AND sport_id='baseball') AS has_bb_gloves
  `));
  const row = (result as any).rows?.[0] ?? (result as any)[0];
  const sportsCount = Number(row?.sports_count ?? 0);
  const equipmentCount = Number(row?.equipment_count ?? 0);
  const sourcesCount = Number(row?.sources_count ?? 0);
  return classifyApprovedSeedState({
    sportsCount,
    equipmentCount,
    sourcesCount,
    hasBaseballBats: row?.has_bb_bats === true,
    hasBaseballGloves: row?.has_bb_gloves === true,
  });
}

export const STARTUP_MIGRATIONS: readonly VersionedMigration<StartupContext>[] = [
  {
    ...STARTUP_MIGRATION_MANIFEST[0],
    async up(context) {
      const statements = [
        `CREATE TABLE IF NOT EXISTS deal_clicks (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          deal_id VARCHAR NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
          user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
          source_id VARCHAR, sport_id VARCHAR, clicked_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS deal_clicks_clicked_at_idx ON deal_clicks(clicked_at)`,
        `CREATE INDEX IF NOT EXISTS deal_clicks_deal_idx ON deal_clicks(deal_id)`,
        `CREATE INDEX IF NOT EXISTS deal_clicks_user_idx ON deal_clicks(user_id)`,
        `CREATE TABLE IF NOT EXISTS user_visits (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
          session_id VARCHAR NOT NULL, started_at TIMESTAMP NOT NULL DEFAULT NOW(),
          ended_at TIMESTAMP, duration_seconds INTEGER, pages_viewed INTEGER NOT NULL DEFAULT 1,
          user_agent TEXT, ip_hash VARCHAR
        )`,
        `CREATE INDEX IF NOT EXISTS user_visits_user_idx ON user_visits(user_id)`,
        `CREATE INDEX IF NOT EXISTS user_visits_started_idx ON user_visits(started_at)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS user_visits_session_uniq ON user_visits(session_id)`,
        `CREATE TABLE IF NOT EXISTS msrp_lookups (
          id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY, brand VARCHAR NOT NULL,
          model VARCHAR NOT NULL, sport_id VARCHAR, manufacturer_msrp_cents INTEGER,
          confidence VARCHAR(16), source_url TEXT, ai_response JSONB,
          lookup_count INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS msrp_lookups_brand_model_idx ON msrp_lookups(brand, model)`,
        `CREATE INDEX IF NOT EXISTS msrp_lookups_sport_idx ON msrp_lookups(sport_id)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_unique_idx ON promo_codes(source, advertiser_name, code)`,
        `CREATE TABLE IF NOT EXISTS popular_products (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL,
          sport VARCHAR(100) NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS popular_products_slug_unique ON popular_products(slug)`,
        `ALTER TABLE deals ADD COLUMN IF NOT EXISTS drop_weight INTEGER`,
        `ALTER TABLE deals ADD COLUMN IF NOT EXISTS size_number VARCHAR(20)`,
        `ALTER TABLE deals ALTER COLUMN size_number TYPE VARCHAR(20) USING size_number::text`,
        `CREATE INDEX IF NOT EXISTS deals_drop_weight_idx ON deals (drop_weight) WHERE drop_weight IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS deals_size_number_idx ON deals (size_number) WHERE size_number IS NOT NULL`,
        `CREATE TABLE IF NOT EXISTS deal_sub_filters (
          deal_id VARCHAR NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
          sub_filter_id VARCHAR NOT NULL REFERENCES equipment_sub_filters(id) ON DELETE CASCADE,
          PRIMARY KEY (deal_id, sub_filter_id)
        )`,
        `CREATE INDEX IF NOT EXISTS deal_sub_filters_sub_idx ON deal_sub_filters(sub_filter_id)`,
        `CREATE TABLE IF NOT EXISTS a2p_status_events (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), event_type VARCHAR NOT NULL,
          resource_sid VARCHAR, status VARCHAR, failure_reason TEXT, payload JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS hidden_deals (
          user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          deal_id VARCHAR NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
          hidden_at TIMESTAMP NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, deal_id)
        )`,
        `ALTER TABLE deals ADD COLUMN IF NOT EXISTS last_price_confirmed_at TIMESTAMP`,
        `ALTER TABLE deals ADD COLUMN IF NOT EXISTS search_vector TSVECTOR`,
        `CREATE INDEX IF NOT EXISTS deals_last_seen_at_idx ON deals(last_seen_at)`,
        `CREATE INDEX IF NOT EXISTS deals_sport_equip_idx ON deals(sport_id, equipment_type_id)`,
        `CREATE INDEX IF NOT EXISTS deals_source_sport_idx ON deals(source_id, sport_id)`,
        `CREATE INDEX IF NOT EXISTS deals_condition_idx ON deals(condition)`,
        `CREATE INDEX IF NOT EXISTS deals_sport_equip_pct_idx
          ON deals(sport_id, equipment_type_id, percent_off DESC NULLS LAST)
          WHERE percent_off IS NOT NULL`,
        `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
        `CREATE INDEX IF NOT EXISTS deals_title_trgm_idx ON deals USING gin(title gin_trgm_ops)`,
        `CREATE INDEX IF NOT EXISTS deals_brand_trgm_idx ON deals USING gin(brand gin_trgm_ops)`,
        `CREATE INDEX IF NOT EXISTS deals_fts_idx ON deals USING gin(search_vector)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS ai_classifications_signature_idx
          ON ai_classifications(signature)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS classification_review_pending_deal_idx
          ON classification_review_queue(deal_id) WHERE status = 'pending'`,
        `CREATE TABLE IF NOT EXISTS maintenance_run_log (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(), command VARCHAR NOT NULL,
          rule_version VARCHAR NOT NULL, code_version VARCHAR NOT NULL,
          status VARCHAR NOT NULL, proposed_count INTEGER, affected_count INTEGER,
          requested_by VARCHAR, started_at TIMESTAMP NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMP, report JSONB
        )`,
      ];

      for (const statement of statements) await context.execute(sql.raw(statement));

      // These feature modules formerly bootstrapped their schema on every
      // registration/restart. The migration ledger now invokes them once.
      await ensureInvoicesSchema(context.database);
      await ensureTeamStatsSchema(context.database);
    },
  },
  {
    ...STARTUP_MIGRATION_MANIFEST[1],
    async up(context) {
      const seedState = await inspectApprovedSeedState(context.database);
      if (seedState === "satisfied") return;
      if (seedState === "partial") {
        throw new Error(
          "Approved seed is partially present; refusing to add or rewrite live taxonomy. Run the read-only Phase 0 preflight and review the mismatch.",
        );
      }
      await storage.seed(context.database);
      await seedKnoxStarsTeam(context.database);
    },
  },
] as const;

const ledger: MigrationLedger<StartupContext> = {
  async ensure() {
    // The ledger is the sole unavoidable bootstrap DDL. It contains no product,
    // taxonomy, or shopper data and makes every subsequent startup write finite.
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
      id VARCHAR PRIMARY KEY,
      kind VARCHAR NOT NULL,
      description TEXT NOT NULL,
      checksum VARCHAR NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`));
  },
  async has(id) {
    const result = await db.execute(
      sql`SELECT checksum FROM app_schema_migrations WHERE id = ${id} LIMIT 1`,
    );
    const row = (result as any).rows?.[0];
    if (!row) return false;
    const migration = STARTUP_MIGRATIONS.find((candidate) => candidate.id === id);
    if (!migration || row.checksum !== migration.checksum) {
      throw new Error(`Applied migration ${id} does not match its immutable checksum`);
    }
    return true;
  },
  async applyOnce(migration, _context) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('tssdeals-app-schema-migrations'))`);
      const existing = await tx.execute(
        sql`SELECT checksum FROM app_schema_migrations WHERE id = ${migration.id} LIMIT 1`,
      );
      const existingRow = (existing as any).rows?.[0];
      if (existingRow) {
        if (existingRow.checksum !== migration.checksum) {
          throw new Error(`Applied migration ${migration.id} does not match its immutable checksum`);
        }
        return false;
      }

      await migration.up({ database: tx, execute: (statement) => tx.execute(statement) });
      await tx.execute(sql`
        INSERT INTO app_schema_migrations (id, kind, description, checksum)
        VALUES (${migration.id}, ${migration.kind}, ${migration.description}, ${migration.checksum})
      `);
      return true;
    });
  },
};

export async function runVersionedStartupMigrations(): Promise<void> {
  const invalid = STARTUP_MIGRATIONS.filter(
    (migration) => !STARTUP_POLICY.allowedKinds.includes(migration.kind),
  );
  if (invalid.length > 0) {
    throw new Error(`Forbidden startup migration kinds: ${invalid.map((m) => m.id).join(", ")}`);
  }

  const result = await runVersionedMigrations(ledger, STARTUP_MIGRATIONS, {
    database: db,
    execute: (statement) => db.execute(statement),
  });
  if (result.applied.length > 0) {
    console.log(`[startup-migrations] applied: ${result.applied.join(", ")}`);
  }
}
