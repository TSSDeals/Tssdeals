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
  {
    ...STARTUP_MIGRATION_MANIFEST[2],
    async up(context) {
      const statements = [
        `CREATE TABLE IF NOT EXISTS wholesale_imports (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          source_file_name TEXT NOT NULL UNIQUE,
          supplier VARCHAR NOT NULL,
          row_count INTEGER NOT NULL DEFAULT 0,
          status VARCHAR NOT NULL DEFAULT 'complete',
          imported_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS wholesale_products (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          import_id VARCHAR NOT NULL REFERENCES wholesale_imports(id) ON DELETE CASCADE,
          supplier VARCHAR NOT NULL,
          manufacturer VARCHAR,
          category VARCHAR,
          sku VARCHAR,
          upc VARCHAR,
          name TEXT NOT NULL,
          size VARCHAR,
          color VARCHAR,
          hand VARCHAR,
          wholesale_cents INTEGER NOT NULL,
          msrp_cents INTEGER,
          map_cents INTEGER,
          image_url TEXT,
          source_sheet VARCHAR NOT NULL,
          source_row INTEGER NOT NULL,
          raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          search_text TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS wholesale_products_search_trgm_idx
          ON wholesale_products USING gin(search_text gin_trgm_ops)`,
        `CREATE INDEX IF NOT EXISTS wholesale_products_sku_idx ON wholesale_products(sku)`,
        `CREATE INDEX IF NOT EXISTS wholesale_products_upc_idx ON wholesale_products(upc)`,
        `CREATE INDEX IF NOT EXISTS wholesale_products_category_idx ON wholesale_products(category)`,
        `CREATE TABLE IF NOT EXISTS business_ledger_imports (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          source_file_name TEXT NOT NULL UNIQUE,
          row_count INTEGER NOT NULL DEFAULT 0,
          status VARCHAR NOT NULL DEFAULT 'complete',
          imported_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS business_ledger_entries (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          import_id VARCHAR NOT NULL REFERENCES business_ledger_imports(id) ON DELETE CASCADE,
          source_row INTEGER NOT NULL,
          item_number VARCHAR,
          description TEXT NOT NULL,
          status VARCHAR,
          supplier VARCHAR,
          category VARCHAR,
          brand VARCHAR,
          model VARCHAR,
          sku VARCHAR,
          quantity INTEGER NOT NULL DEFAULT 1,
          purchase_date TIMESTAMP,
          sale_date TIMESTAMP,
          purchase_cost_cents INTEGER,
          delivered_cost_cents INTEGER,
          sale_price_cents INTEGER,
          revenue_cents INTEGER,
          profit_cents INTEGER,
          raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS business_ledger_item_idx ON business_ledger_entries(item_number)`,
        `CREATE INDEX IF NOT EXISTS business_ledger_sale_date_idx ON business_ledger_entries(sale_date)`,
        `CREATE INDEX IF NOT EXISTS business_ledger_status_idx ON business_ledger_entries(status)`,
      ];
      for (const statement of statements) await context.execute(sql.raw(statement));
    },
  },
  {
    ...STARTUP_MIGRATION_MANIFEST[3],
    async up(context) {
      const statements = [
        `CREATE TABLE IF NOT EXISTS wholesale_imports (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          source_file_name TEXT NOT NULL UNIQUE,
          supplier VARCHAR NOT NULL,
          row_count INTEGER NOT NULL DEFAULT 0,
          status VARCHAR NOT NULL DEFAULT 'complete',
          imported_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS wholesale_products (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          import_id VARCHAR NOT NULL REFERENCES wholesale_imports(id) ON DELETE CASCADE,
          supplier VARCHAR NOT NULL,
          manufacturer VARCHAR,
          category VARCHAR,
          sku VARCHAR,
          upc VARCHAR,
          name TEXT NOT NULL,
          size VARCHAR,
          color VARCHAR,
          hand VARCHAR,
          wholesale_cents INTEGER NOT NULL,
          msrp_cents INTEGER,
          map_cents INTEGER,
          image_url TEXT,
          source_sheet VARCHAR NOT NULL,
          source_row INTEGER NOT NULL,
          raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          search_text TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS wholesale_products_search_trgm_idx
          ON wholesale_products USING gin(search_text gin_trgm_ops)`,
        `CREATE INDEX IF NOT EXISTS wholesale_products_sku_idx ON wholesale_products(sku)`,
        `CREATE INDEX IF NOT EXISTS wholesale_products_upc_idx ON wholesale_products(upc)`,
        `CREATE INDEX IF NOT EXISTS wholesale_products_category_idx ON wholesale_products(category)`,
        `CREATE TABLE IF NOT EXISTS business_ledger_imports (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          source_file_name TEXT NOT NULL UNIQUE,
          row_count INTEGER NOT NULL DEFAULT 0,
          status VARCHAR NOT NULL DEFAULT 'complete',
          imported_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS business_ledger_entries (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          import_id VARCHAR NOT NULL REFERENCES business_ledger_imports(id) ON DELETE CASCADE,
          source_row INTEGER NOT NULL,
          item_number VARCHAR,
          description TEXT NOT NULL,
          status VARCHAR,
          supplier VARCHAR,
          category VARCHAR,
          brand VARCHAR,
          model VARCHAR,
          sku VARCHAR,
          quantity INTEGER NOT NULL DEFAULT 1,
          purchase_date TIMESTAMP,
          sale_date TIMESTAMP,
          purchase_cost_cents INTEGER,
          delivered_cost_cents INTEGER,
          sale_price_cents INTEGER,
          revenue_cents INTEGER,
          profit_cents INTEGER,
          raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS business_ledger_item_idx ON business_ledger_entries(item_number)`,
        `CREATE INDEX IF NOT EXISTS business_ledger_sale_date_idx ON business_ledger_entries(sale_date)`,
        `CREATE INDEX IF NOT EXISTS business_ledger_status_idx ON business_ledger_entries(status)`,
        `ALTER TABLE wholesale_products ADD COLUMN IF NOT EXISTS retail_name TEXT`,
        `ALTER TABLE wholesale_products ADD COLUMN IF NOT EXISTS retail_brand VARCHAR`,
        `ALTER TABLE wholesale_products ADD COLUMN IF NOT EXISTS retail_model VARCHAR`,
        `ALTER TABLE wholesale_products ADD COLUMN IF NOT EXISTS retail_category VARCHAR`,
        `ALTER TABLE wholesale_products ADD COLUMN IF NOT EXISTS identity_status VARCHAR NOT NULL DEFAULT 'needs_catalog'`,
        `ALTER TABLE wholesale_products ADD COLUMN IF NOT EXISTS identity_confidence INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE wholesale_products ADD COLUMN IF NOT EXISTS identity_source TEXT`,
        `ALTER TABLE wholesale_products ADD COLUMN IF NOT EXISTS identity_source_ref TEXT`,
        `CREATE INDEX IF NOT EXISTS wholesale_products_identity_status_idx ON wholesale_products(identity_status)`,
      ];
      for (const statement of statements) await context.execute(sql.raw(statement));
    },
  },
  {
    ...STARTUP_MIGRATION_MANIFEST[4],
    async up(context) {
      const statements = [
        `ALTER TABLE business_ledger_entries ADD COLUMN IF NOT EXISTS final_cog_cents INTEGER`,
        `ALTER TABLE business_ledger_entries ADD COLUMN IF NOT EXISTS ebay_break_even_cents INTEGER`,
        `ALTER TABLE business_ledger_entries ADD COLUMN IF NOT EXISTS in_person_minimum_cents INTEGER`,
        `CREATE INDEX IF NOT EXISTS business_ledger_profit_idx ON business_ledger_entries(profit_cents)`,
        `CREATE INDEX IF NOT EXISTS business_ledger_break_even_idx ON business_ledger_entries(ebay_break_even_cents)`,
      ];
      for (const statement of statements) await context.execute(sql.raw(statement));
    },
  },
  {
    ...STARTUP_MIGRATION_MANIFEST[5],
    async up(context) {
      const statements = [
        `CREATE TABLE IF NOT EXISTS product_identities (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          family_fingerprint VARCHAR(64) NOT NULL,
          variant_fingerprint VARCHAR(64) NOT NULL UNIQUE,
          canonical_brand TEXT NOT NULL,
          product_family TEXT NOT NULL,
          model_code TEXT,
          sport_id VARCHAR NOT NULL,
          equipment_type_id VARCHAR NOT NULL,
          variant JSONB NOT NULL DEFAULT '{}'::jsonb,
          confidence VARCHAR(16) NOT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'proposed',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS product_identities_family_idx
          ON product_identities(family_fingerprint)`,
        `CREATE INDEX IF NOT EXISTS product_identities_status_idx
          ON product_identities(status)`,
        `CREATE INDEX IF NOT EXISTS product_identities_brand_family_idx
          ON product_identities(canonical_brand, product_family)`,
        `CREATE TABLE IF NOT EXISTS deal_product_identities (
          deal_id VARCHAR PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
          product_identity_id VARCHAR NOT NULL REFERENCES product_identities(id) ON DELETE CASCADE,
          confidence VARCHAR(16) NOT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'proposed',
          match_method VARCHAR(32) NOT NULL DEFAULT 'deterministic',
          evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
          assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
          reviewed_by VARCHAR,
          reviewed_at TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS deal_product_identities_product_idx
          ON deal_product_identities(product_identity_id)`,
        `CREATE INDEX IF NOT EXISTS deal_product_identities_status_idx
          ON deal_product_identities(status)`,
      ];
      for (const statement of statements) await context.execute(sql.raw(statement));
    },
  },
  {
    ...STARTUP_MIGRATION_MANIFEST[6],
    async up(context) {
      const statements = [
        `CREATE TABLE IF NOT EXISTS demand_snapshot_runs (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          snapshot_date DATE NOT NULL UNIQUE,
          status VARCHAR(20) NOT NULL DEFAULT 'complete',
          trusted_listings INTEGER NOT NULL DEFAULT 0,
          proposed_listings INTEGER NOT NULL DEFAULT 0,
          identity_variants INTEGER NOT NULL DEFAULT 0,
          source_count INTEGER NOT NULL DEFAULT 0,
          captured_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS demand_snapshot_runs_date_idx
          ON demand_snapshot_runs(snapshot_date)`,
        `CREATE TABLE IF NOT EXISTS demand_market_snapshots (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          snapshot_date DATE NOT NULL,
          product_identity_id VARCHAR NOT NULL REFERENCES product_identities(id) ON DELETE CASCADE,
          source_id VARCHAR NOT NULL,
          active_listings INTEGER NOT NULL,
          priced_listings INTEGER NOT NULL,
          min_price_cents INTEGER,
          median_price_cents INTEGER,
          average_price_cents INTEGER,
          max_price_cents INTEGER,
          new_listings INTEGER NOT NULL DEFAULT 0,
          preowned_listings INTEGER NOT NULL DEFAULT 0,
          captured_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(snapshot_date, product_identity_id, source_id)
        )`,
        `CREATE INDEX IF NOT EXISTS demand_market_snapshot_date_idx
          ON demand_market_snapshots(snapshot_date)`,
        `CREATE INDEX IF NOT EXISTS demand_market_snapshot_identity_idx
          ON demand_market_snapshots(product_identity_id)`,
      ];
      for (const statement of statements) await context.execute(sql.raw(statement));
    },
  },
  {
    ...STARTUP_MIGRATION_MANIFEST[7],
    async up(context) {
      const statements = [
        `CREATE TABLE IF NOT EXISTS product_research_observations (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          source VARCHAR(40) NOT NULL DEFAULT 'ebay_product_research',
          observation_type VARCHAR(24) NOT NULL,
          product_identity_id VARCHAR REFERENCES product_identities(id) ON DELETE SET NULL,
          research_key VARCHAR(160) NOT NULL,
          label TEXT NOT NULL,
          marketplace VARCHAR(24) NOT NULL DEFAULT 'EBAY_US',
          query_text TEXT,
          category_id VARCHAR(32),
          category_label TEXT,
          window_days INTEGER NOT NULL,
          period_start DATE NOT NULL,
          period_end DATE NOT NULL,
          average_sold_price_cents INTEGER,
          minimum_sold_price_cents INTEGER,
          maximum_sold_price_cents INTEGER,
          average_shipping_cents INTEGER,
          free_shipping_percent INTEGER,
          sell_through_percent INTEGER,
          total_sold INTEGER,
          total_sellers INTEGER,
          notes TEXT,
          source_url TEXT NOT NULL,
          recorded_by VARCHAR,
          observed_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(source, research_key, window_days, period_end)
        )`,
        `CREATE INDEX IF NOT EXISTS product_research_observation_identity_idx
          ON product_research_observations(product_identity_id)`,
        `CREATE INDEX IF NOT EXISTS product_research_observation_window_idx
          ON product_research_observations(window_days, period_end)`,
      ];
      for (const statement of statements) await context.execute(sql.raw(statement));
    },
  },
  {
    ...STARTUP_MIGRATION_MANIFEST[8],
    async up(context) {
      const statements = [
        `CREATE TABLE IF NOT EXISTS product_research_reviews (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          research_key VARCHAR(160) NOT NULL,
          label TEXT NOT NULL,
          window_days INTEGER NOT NULL,
          outcome VARCHAR(32) NOT NULL,
          notes TEXT NOT NULL,
          source_url TEXT,
          reviewed_by VARCHAR,
          reviewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(research_key, window_days)
        )`,
        `CREATE INDEX IF NOT EXISTS product_research_review_window_idx
          ON product_research_reviews(window_days, reviewed_at)`,
      ];
      for (const statement of statements) await context.execute(sql.raw(statement));
    },
  },
  {
    ...STARTUP_MIGRATION_MANIFEST[9],
    async up(context) {
      const statements = [
        `CREATE TABLE IF NOT EXISTS financial_accounts (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(120) NOT NULL,
          institution VARCHAR(120),
          account_type VARCHAR(24) NOT NULL,
          last_four VARCHAR(4),
          current_balance_cents BIGINT NOT NULL DEFAULT 0,
          credit_limit_cents BIGINT,
          interest_rate_bps INTEGER,
          minimum_payment_cents BIGINT,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS financial_accounts_type_idx
          ON financial_accounts(account_type, is_active)`,
        `CREATE TABLE IF NOT EXISTS financial_imports (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          account_id VARCHAR NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
          source_file_name TEXT NOT NULL,
          file_checksum VARCHAR(64) NOT NULL,
          row_count INTEGER NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'complete',
          imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(account_id, file_checksum)
        )`,
        `CREATE TABLE IF NOT EXISTS financial_transactions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          import_id VARCHAR NOT NULL REFERENCES financial_imports(id) ON DELETE CASCADE,
          account_id VARCHAR NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
          fingerprint VARCHAR(64) NOT NULL,
          transaction_date DATE NOT NULL,
          posted_date DATE,
          description TEXT NOT NULL,
          amount_cents BIGINT NOT NULL,
          category VARCHAR(80) NOT NULL DEFAULT 'Uncategorized',
          category_source VARCHAR(24) NOT NULL DEFAULT 'rule',
          pending BOOLEAN NOT NULL DEFAULT false,
          raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(account_id, fingerprint)
        )`,
        `CREATE INDEX IF NOT EXISTS financial_transactions_date_idx
          ON financial_transactions(transaction_date DESC)`,
        `CREATE INDEX IF NOT EXISTS financial_transactions_account_idx
          ON financial_transactions(account_id, transaction_date DESC)`,
        `CREATE INDEX IF NOT EXISTS financial_transactions_category_idx
          ON financial_transactions(category, transaction_date DESC)`,
      ];
      for (const statement of statements) await context.execute(sql.raw(statement));
    },
  },
  {
    ...STARTUP_MIGRATION_MANIFEST[10],
    async up(context) {
      const statements = [
        `CREATE TABLE IF NOT EXISTS onedrive_ledger_connections (
          user_id VARCHAR PRIMARY KEY,
          access_token_ciphertext TEXT NOT NULL,
          refresh_token_ciphertext TEXT NOT NULL,
          token_expires_at TIMESTAMP NOT NULL,
          scope TEXT,
          file_path TEXT NOT NULL DEFAULT 'Desktop/TSS Ledger_Copy.xlsx',
          drive_item_id TEXT,
          etag TEXT,
          last_sync_at TIMESTAMP,
          last_success_at TIMESTAMP,
          last_error TEXT,
          last_row_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS onedrive_ledger_last_sync_idx
          ON onedrive_ledger_connections(last_sync_at)`,
      ];
      for (const statement of statements) await context.execute(sql.raw(statement));
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
