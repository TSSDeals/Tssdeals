/**
 * Explicit replacement for data maintenance previously executed at startup.
 *
 * Dry-run (default):
 *   tsx script/phase0-maintenance.ts --command search-vector-backfill
 *
 * Execute (must be deliberate):
 *   tsx script/phase0-maintenance.ts --command search-vector-backfill \
 *     --execute --confirm search-vector-backfill --requested-by admin@example.com
 */
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  parseMaintenanceInvocation,
  type Phase0MaintenanceCommand,
} from "../server/maintenance-policy";

const CODE_VERSION = process.env.REPLIT_DEPLOYMENT_ID
  || process.env.GIT_SHA
  || process.env.COMMIT_SHA
  || "local-unpublished";
const CJ_PID = process.env.CJ_PROPERTY_ID || process.env.CJ_COMPANY_ID || "";
const safeCjPid = CJ_PID.replaceAll("'", "''");

interface CommandOperation {
  previewSql: string;
  executeSql?: string;
  executeCustom?: () => Promise<number>;
  note: string;
}

const nonBaseballGloveTerms = [
  "golf", "lacrosse", "football", "hockey", "soccer", "tennis", "pickleball",
  "boxing", "ufc", "mma", "skiing", "fleece", "body glove", "mechanic", "garden",
  "cycling", "snowboard", "workout", "tactical", "winter", "taylormade", "titleist",
  "callaway", "footjoy", "srixon", "warrior ", "stx ",
];
const gloveNegativeSql = nonBaseballGloveTerms
  .map((term) => `lower(title) LIKE '%${term.replaceAll("'", "''")}%'`)
  .join(" OR ");

const legacyOtherEvidence = [
  "glove", "mitt", "bat ", " bats", "bbcor", "cleat", "spike", "helmet",
  "chest protector", "shin guard", "ball ", " bat bag", "equipment bag",
  "training", "pitching machine", "driver", "putter", "wedge", "iron set",
  "football", "basketball", "soccer", "lacrosse", "hockey", "volleyball",
];
const legacyOtherSql = legacyOtherEvidence
  .map((term) => `lower(title) LIKE '%${term.replaceAll("'", "''")}%'`)
  .join(" OR ");

function operationsFor(command: Phase0MaintenanceCommand): CommandOperation[] {
  switch (command) {
    case "legacy-taxonomy-reclassification":
      return [{
        previewSql: `SELECT count(*)::int AS proposed_count FROM deals
          WHERE equipment_type_id LIKE '%-other' AND (${legacyOtherSql})`,
        // The unsafe broad startup UPDATE is intentionally not reproduced as
        // one executable statement. Its proposed population is reportable,
        // but Phase 0 requires an approved per-rule dry run before execution.
        note: "Preview only: retired broad classifier requires a separately approved ruleset before execution.",
      }];
    case "baseball-taxonomy-corrections":
      return [
        {
          previewSql: `SELECT count(*)::int AS proposed_count FROM deals
            WHERE sport_id='baseball'
              AND equipment_type_id IN ('bb-other','bb-shoes-apparel','bb-protective','bb-care-accessories')
              AND lower(title) ~ '(necklace|chain|pendant|sunglasses|sliding (mitt|glove)|arm sleeve|wristband|eye black|phiten)'`,
          executeSql: `UPDATE deals SET equipment_type_id='bb-drip'
            WHERE sport_id='baseball'
              AND equipment_type_id IN ('bb-other','bb-shoes-apparel','bb-protective','bb-care-accessories')
              AND lower(title) ~ '(necklace|chain|pendant|sunglasses|sliding (mitt|glove)|arm sleeve|wristband|eye black|phiten)'`,
          note: "Legacy baseball drip correction, unchanged and no longer automatic.",
        },
        {
          previewSql: `SELECT count(*)::int AS proposed_count FROM deals
            WHERE sport_id='baseball' AND equipment_type_id='bb-gloves' AND (${gloveNegativeSql})`,
          executeSql: `UPDATE deals SET equipment_type_id='bb-other'
            WHERE sport_id='baseball' AND equipment_type_id='bb-gloves' AND (${gloveNegativeSql})`,
          note: "Legacy negative-glove correction; current read recovery remains independent.",
        },
      ];
    case "source-corrections":
      return [
        {
          previewSql: `SELECT count(*)::int AS proposed_count FROM sources
            WHERE (id='amazon-manual' AND name IS DISTINCT FROM 'Amazon')
               OR (id='dicks-sporting-goods' AND name IS DISTINCT FROM 'DICK''S Sporting Goods')`,
          executeSql: `UPDATE sources SET name=CASE id
            WHEN 'amazon-manual' THEN 'Amazon'
            WHEN 'dicks-sporting-goods' THEN 'DICK''S Sporting Goods' END
            WHERE id IN ('amazon-manual','dicks-sporting-goods')`,
          note: "Source display-name correction.",
        },
        {
          previewSql: `SELECT count(*)::int AS proposed_count FROM deals
            WHERE source_id IN ('baseball-resale-nunn','baseball-desale')`,
          note: "Preview only: source merge/deletion requires a separately reviewed maintenance change.",
        },
        {
          previewSql: `SELECT count(*)::int AS proposed_count FROM sources
            WHERE id='baseball-resale' AND base_url IS DISTINCT FROM 'https://nunnbaseball.shop'`,
          executeSql: `UPDATE sources SET base_url='https://nunnbaseball.shop'
            WHERE id='baseball-resale'`,
          note: "Baseball Resale public-domain correction.",
        },
      ];
    case "cj-url-rewrite": {
      if (!CJ_PID) {
        return [{
          previewSql: `SELECT 0::int AS proposed_count`,
          note: "CJ_PROPERTY_ID/CJ_COMPANY_ID is required before this command can propose changes.",
        }];
      }
      return [
        {
          previewSql: `SELECT count(*)::int AS proposed_count FROM deals
            WHERE source_id IN ('dicks-sporting-goods','golf-galaxy','academy-sports','playbaseball','soccergarage')
              AND url LIKE 'https://%'
              AND url NOT LIKE '%anrdoezrs.net%' AND url NOT LIKE '%dpbolvw.net%'
              AND url NOT LIKE '%jdoqocy.com%' AND url NOT LIKE '%tkqlhce.com%'
              AND url NOT LIKE '%kqzyfj.com%'`,
          executeSql: `UPDATE deals
            SET url='https://www.anrdoezrs.net/links/${safeCjPid}/type/dlg/'||url
            WHERE source_id IN ('dicks-sporting-goods','golf-galaxy','academy-sports','playbaseball','soccergarage')
              AND url LIKE 'https://%'
              AND url NOT LIKE '%anrdoezrs.net%' AND url NOT LIKE '%dpbolvw.net%'
              AND url NOT LIKE '%jdoqocy.com%' AND url NOT LIKE '%tkqlhce.com%'
              AND url NOT LIKE '%kqzyfj.com%'`,
          note: "Credential-scoped CJ wrapping for the original core source set.",
        },
        {
          previewSql: `SELECT count(*)::int AS proposed_count FROM deals
            WHERE url LIKE '%/links/7630058/%'`,
          executeSql: `UPDATE deals SET url=replace(url,'/links/7630058/','/links/${safeCjPid}/')
            WHERE url LIKE '%/links/7630058/%'`,
          note: "CJ property-ID correction.",
        },
      ];
    }
    case "ai-classification-deduplication":
      return [{
        previewSql: `SELECT coalesce(sum(n - 1),0)::int AS proposed_count FROM (
          SELECT count(*) AS n FROM ai_classifications GROUP BY signature HAVING count(*) > 1
        ) duplicates`,
        note: "Preview only: duplicate deletion requires separately reviewed survivor selection.",
      }];
    case "deal-sub-filter-backfill":
      return [{
        previewSql: `SELECT count(*)::int AS proposed_count FROM deals d
          WHERE d.sub_filter_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM deal_sub_filters dsf
            WHERE dsf.deal_id=d.id AND dsf.sub_filter_id=d.sub_filter_id
          )`,
        executeSql: `INSERT INTO deal_sub_filters(deal_id,sub_filter_id)
          SELECT id,sub_filter_id FROM deals WHERE sub_filter_id IS NOT NULL
          ON CONFLICT(deal_id,sub_filter_id) DO NOTHING`,
        note: "Legacy single-tag to join-table compatibility backfill.",
      }];
    case "deal-derived-field-backfill":
      return [{
        previewSql: `SELECT count(*)::int AS proposed_count FROM deals
          WHERE last_price_confirmed_at IS NULL AND last_seen_at IS NOT NULL`,
        executeSql: `UPDATE deals SET last_price_confirmed_at=last_seen_at
          WHERE id IN (SELECT id FROM deals
            WHERE last_price_confirmed_at IS NULL AND last_seen_at IS NOT NULL LIMIT 10000)`,
        note: "Batched timestamp compatibility backfill.",
      }];
    case "search-vector-backfill":
      return [{
        previewSql: `SELECT count(*)::int AS proposed_count FROM deals WHERE search_vector IS NULL`,
        executeSql: `UPDATE deals SET search_vector=to_tsvector('english',coalesce(title,'')||' '||coalesce(brand,''))
          WHERE id IN (SELECT id FROM deals WHERE search_vector IS NULL LIMIT 10000)`,
        note: "Batched full-text search-vector backfill.",
      }];
    case "stale-deal-cleanup":
      return [{
        previewSql: `SELECT count(*)::int AS proposed_count FROM deals
          WHERE (source_id IN ('ebay','sidelineswap') AND last_seen_at < now()-interval '7 days')
             OR (source_id NOT IN ('ebay','sidelineswap') AND last_seen_at < now()-interval '14 days')`,
        executeSql: `DELETE FROM deals WHERE id IN (SELECT id FROM deals
          WHERE (source_id IN ('ebay','sidelineswap') AND last_seen_at < now()-interval '7 days')
             OR (source_id NOT IN ('ebay','sidelineswap') AND last_seen_at < now()-interval '14 days')
          LIMIT 10000)`,
        note: "Batched stale-offer cleanup.",
      }];
    case "ebay-seller-seed":
      return [{
        previewSql: `SELECT 0::int AS proposed_count`,
        note: "Retired startup seller list; sellers are now managed explicitly through the Admin API.",
      }];
    case "discount-recalculation":
      return [{
        previewSql: `SELECT count(*)::int AS proposed_count FROM deals`,
        executeCustom: () => storage.recalculateDealDiscounts(),
        note: "Existing explicit discount recalculation.",
      }];
  }
}

function rowCount(result: unknown): number {
  const first = (result as any)?.rows?.[0] ?? (Array.isArray(result) ? result[0] : undefined);
  return Number(first?.proposed_count ?? (result as any)?.rowCount ?? 0);
}

const invocation = parseMaintenanceInvocation(process.argv.slice(2));
const operations = operationsFor(invocation.command);
const proposed: Array<{ note: string; count: number }> = [];
for (const operation of operations) {
  proposed.push({ note: operation.note, count: rowCount(await db.execute(sql.raw(operation.previewSql))) });
}

console.log(JSON.stringify({
  command: invocation.command,
  mode: invocation.dryRun ? "dry-run" : "execute",
  ruleVersion: invocation.ruleVersion,
  codeVersion: CODE_VERSION,
  requestedBy: invocation.requestedBy,
  proposed,
}, null, 2));

if (!invocation.dryRun) {
  const runId = randomUUID();
  await db.execute(sql`INSERT INTO maintenance_run_log
    (id,command,rule_version,code_version,status,proposed_count,requested_by)
    VALUES (${runId},${invocation.command},${invocation.ruleVersion},${CODE_VERSION},'running',
      ${proposed.reduce((sum, item) => sum + item.count, 0)},${invocation.requestedBy})`);
  try {
    let affected = 0;
    for (const operation of operations) {
      if (operation.executeSql) affected += rowCount(await db.execute(sql.raw(operation.executeSql)));
      else if (operation.executeCustom) affected += await operation.executeCustom();
      else throw new Error(operation.note);
    }
    await db.execute(sql`UPDATE maintenance_run_log SET status='complete',affected_count=${affected},
      finished_at=now(),report=${JSON.stringify({ proposed })}::jsonb WHERE id=${runId}`);
    console.log(JSON.stringify({ runId, affected }));
  } catch (error) {
    await db.execute(sql`UPDATE maintenance_run_log SET status='failed',finished_at=now(),
      report=${JSON.stringify({ proposed, error: String(error) })}::jsonb WHERE id=${runId}`);
    throw error;
  }
}
