import { sql } from "drizzle-orm";
import { STARTUP_MIGRATION_MANIFEST } from "./startup-migration-policy";

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
  count?: number;
}

export interface StartupPreflightReport {
  generatedAt: string;
  readOnly: true;
  ok: boolean;
  checks: PreflightCheck[];
  migrations: Array<{
    id: string;
    ledger: "matching" | "pending" | "checksum-mismatch";
    materiallySatisfied: boolean;
    detail: string;
  }>;
}

const REQUIRED_TABLES = [
  "deals", "sports", "equipment_types", "equipment_sub_filters", "sources",
  "promo_codes", "ai_classifications", "classification_review_queue",
] as const;

const STRUCTURAL_RELATIONS = [
  "deal_clicks", "user_visits", "msrp_lookups", "popular_products",
  "deal_sub_filters", "a2p_status_events", "hidden_deals", "invoices",
  "bb_teams", "bb_players", "bb_games", "bb_player_game",
  "maintenance_run_log",
] as const;

const REQUIRED_DEAL_COLUMNS = [
  "drop_weight", "size_number", "last_price_confirmed_at", "search_vector",
] as const;

const REQUIRED_UNIQUE_INDEXES = [
  "user_visits_session_uniq", "promo_codes_unique_idx",
  "popular_products_slug_unique", "ai_classifications_signature_idx",
  "classification_review_pending_deal_idx", "bb_player_game_uniq",
] as const;

const DUPLICATE_CHECKS = [
  { table: "user_visits", name: "user_visits(session_id)", group: "session_id" },
  { table: "promo_codes", name: "promo_codes(source, advertiser_name, code)", group: "source, advertiser_name, code" },
  { table: "popular_products", name: "popular_products(slug)", group: "slug" },
  { table: "ai_classifications", name: "ai_classifications(signature)", group: "signature" },
  { table: "classification_review_queue", name: "pending classification_review_queue(deal_id)", group: "deal_id", where: "status='pending'" },
  { table: "bb_player_game", name: "bb_player_game(game_id, player_id, source)", group: "game_id, player_id, source" },
  { table: "bb_player_fielding", name: "bb_player_fielding(game_id, player_id, position, source)", group: "game_id, player_id, position, source" },
  { table: "bb_team_fielding", name: "bb_team_fielding(game_id, position, source)", group: "game_id, position, source" },
] as const;

function resultRows(result: any): any[] {
  return result?.rows ?? (Array.isArray(result) ? result : []);
}

export async function runStartupPreflight(database: any): Promise<StartupPreflightReport> {
  const checks: PreflightCheck[] = [];
  const relationResult = await database.execute(sql.raw(`
    SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema() AND c.relkind IN ('r','p','i')
  `));
  const relations = new Set(resultRows(relationResult).map((row) => String(row.name)));

  for (const table of REQUIRED_TABLES) {
    checks.push({ name: `required table ${table}`, ok: relations.has(table), detail: relations.has(table) ? "present" : "missing" });
  }

  const columnResult = await database.execute(sql.raw(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema=current_schema()
  `));
  const columns = new Set(resultRows(columnResult).map((row) => `${row.table_name}.${row.column_name}`));
  for (const column of REQUIRED_DEAL_COLUMNS) {
    const present = columns.has(`deals.${column}`);
    checks.push({ name: `required column deals.${column}`, ok: present, detail: present ? "present" : "missing" });
  }

  const privilegeResult = await database.execute(sql.raw(`
    SELECT current_user AS role,
      has_schema_privilege(current_user,current_schema(),'USAGE') AS schema_usage,
      has_schema_privilege(current_user,current_schema(),'CREATE') AS schema_create,
      coalesce(bool_and(pg_get_userbyid(c.relowner)=current_user
        OR pg_has_role(current_user,c.relowner,'MEMBER')),true) AS owns_required_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema()
      AND c.relname IN ('deals','sports','equipment_types','sources')
    GROUP BY current_user
  `));
  const privilege = resultRows(privilegeResult)[0] ?? {};
  const ddlOk = privilege.schema_usage === true && privilege.schema_create === true
    && privilege.owns_required_tables === true;
  checks.push({
    name: "application-role DDL permissions",
    ok: ddlOk,
    detail: `role=${privilege.role ?? "unknown"}; schema_usage=${Boolean(privilege.schema_usage)}; schema_create=${Boolean(privilege.schema_create)}; owns_required_tables=${Boolean(privilege.owns_required_tables)}`,
  });

  for (const duplicate of DUPLICATE_CHECKS) {
    if (!relations.has(duplicate.table)) continue;
    const where = "where" in duplicate ? `WHERE ${duplicate.where}` : "";
    const result = await database.execute(sql.raw(`
      SELECT coalesce(sum(n-1),0)::int AS duplicate_count FROM (
        SELECT count(*) AS n FROM ${duplicate.table} ${where}
        GROUP BY ${duplicate.group} HAVING count(*) > 1
      ) duplicate_groups
    `));
    const count = Number(resultRows(result)[0]?.duplicate_count ?? 0);
    checks.push({
      name: `unique-index blocker ${duplicate.name}`,
      ok: count === 0,
      count,
      detail: count === 0 ? "no blocking duplicates" : `${count} duplicate rows would block the unique index`,
    });
  }

  const structuralSatisfied = STRUCTURAL_RELATIONS.every((name) => relations.has(name))
    && REQUIRED_DEAL_COLUMNS.every((name) => columns.has(`deals.${name}`))
    && REQUIRED_UNIQUE_INDEXES.every((name) => relations.has(name));

  let seedSatisfied = false;
  let seedDetail = "required taxonomy tables are missing";
  if (["sports", "equipment_types", "sources"].every((name) => relations.has(name))) {
    const result = await database.execute(sql.raw(`
      SELECT
        (SELECT count(*)::int FROM sports) AS sports_count,
        (SELECT count(*)::int FROM equipment_types) AS equipment_count,
        (SELECT count(*)::int FROM sources) AS sources_count,
        EXISTS(SELECT 1 FROM equipment_types WHERE id='bb-bats' AND sport_id='baseball') AS has_bb_bats,
        EXISTS(SELECT 1 FROM equipment_types WHERE id='bb-gloves' AND sport_id='baseball') AS has_bb_gloves
    `));
    const row = resultRows(result)[0] ?? {};
    seedSatisfied = Number(row.sports_count) > 0 && Number(row.equipment_count) > 0
      && Number(row.sources_count) > 0 && row.has_bb_bats === true && row.has_bb_gloves === true;
    seedDetail = `sports=${Number(row.sports_count ?? 0)}, equipment_types=${Number(row.equipment_count ?? 0)}, sources=${Number(row.sources_count ?? 0)}, bb-bats=${Boolean(row.has_bb_bats)}, bb-gloves=${Boolean(row.has_bb_gloves)}`;
  }

  const ledgerRows = new Map<string, string>();
  if (relations.has("app_schema_migrations")) {
    const result = await database.execute(sql.raw(`SELECT id, checksum FROM app_schema_migrations`));
    for (const row of resultRows(result)) ledgerRows.set(String(row.id), String(row.checksum));
  }

  const migrations = STARTUP_MIGRATION_MANIFEST.map((migration, index) => {
    const ledgerChecksum = ledgerRows.get(migration.id);
    const ledger = ledgerChecksum === undefined ? "pending"
      : ledgerChecksum === migration.checksum ? "matching" : "checksum-mismatch";
    const materiallySatisfied = index === 0 ? structuralSatisfied : seedSatisfied;
    return {
      id: migration.id,
      ledger,
      materiallySatisfied,
      detail: index === 0
        ? `structural artifacts ${structuralSatisfied ? "satisfied" : "incomplete"}; CREATE INDEX IF NOT EXISTS skips already-satisfied indexes`
        : `approved seed ${seedSatisfied ? "satisfied; startup will not reseed" : "not satisfied"}; ${seedDetail}`,
    } as const;
  });

  for (const migration of migrations) {
    checks.push({
      name: `migration ledger ${migration.id}`,
      ok: migration.ledger !== "checksum-mismatch",
      detail: `${migration.ledger}; materiallySatisfied=${migration.materiallySatisfied}`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    ok: checks.every((check) => check.ok),
    checks,
    migrations,
  };
}
