# Phase 0 startup mutation inventory and operating procedure

Date: 2026-07-21

Scope: stop uncontrolled mutation during ordinary application startup. This change does not reclassify deals, delete taxonomy, add canonical taxonomy tables, or execute production maintenance.

## Inventory and disposition

| Former startup operation | Category | Phase 0 disposition |
|---|---|---|
| Source display-name rewrites | Corrective maintenance | Removed from startup; `source-corrections` is preview-only and cannot execute in Phase 0. |
| Approved core sports/equipment/source/application seed (`storage.seed`) | Essential static seed | Retained under migration `20260721_002_approved_static_seed` only for a genuinely empty database; existing complete taxonomy is materially satisfied and skipped, while partial taxonomy fails for review. |
| Additional required equipment-type inserts in `server/index.ts` | Taxonomy creation | Removed. Existing approved seed remains; no per-restart taxonomy insert. |
| Broad `*-other` title reclassification | Deal reclassification | Removed; `legacy-taxonomy-reclassification` is preview-only pending approved rules. |
| Baseball Drip and negative-glove corrections | Deal reclassification | Removed; `baseball-taxonomy-corrections` is preview-only and cannot execute in Phase 0. |
| Deal-click/user-visit/MSRP/popular-products/A2P/hidden-deal tables | Structural schema | Retained once in `20260721_001_phase0_structural_compatibility`. |
| Drop/size/search/timestamp columns and search indexes | Structural schema | Retained once in the structural migration. |
| Team Stats and Invoice schema bootstrap | Structural schema | Removed from route registration/per-restart calls; invoked once by the structural migration. |
| `deal_sub_filters` table/index | Structural schema | Retained once; row backfill moved to `deal-sub-filter-backfill`. |
| `last_price_confirmed_at` and `search_vector` row backfills | Data backfill | Removed; separate dry-run maintenance commands. |
| AI classification duplicate deletion | Corrective cleanup | Removed; preview-only `ai-classification-deduplication`; unique indexes remain structural. |
| CJ affiliate URL rewriting | Corrective maintenance | Removed; `cj-url-rewrite` is preview-only pending transaction-safe execution, exact affected-row before/after logging, and a documented reversal. |
| Obsolete Baseball Resale source merge/deletion | Corrective maintenance | Removed; `source-corrections` reports affected deals but merge/delete is preview-only. |
| Stale deal deletion loops | Cleanup | Removed; `stale-deal-cleanup` is preview-only pending backup, per-record logging, and rollback. |
| eBay seller creation | Seed/maintenance | Removed; retired list is no longer automatic and sellers remain Admin-managed. |
| Global discount recalculation | Derived-data maintenance | Removed; explicit `discount-recalculation`. |
| Team `Knox Stars` seed/legacy slug correction | Seed/corrective maintenance | New-database seed is transaction-bound to the approved static-seed migration. The legacy slug rewrite was removed from automatic seed work. |
| Scheduler registration | Normal application function | Published schedules retained; the automatic full sync 10 seconds after every restart was removed. Sync is scheduled or explicitly Admin-invoked. |

`app_schema_migrations` is the sole bootstrap table created before the ledger exists. It contains immutable migration ID, kind, description, checksum, and applied time. An advisory transaction lock prevents concurrent instances from applying the same migration. Every retained migration helper (`storage.seed`, Team seed, Invoice schema, and Team Stats schema) receives the exact transaction used to insert the ledger row. A thrown error therefore rolls back partial migration work and the ledger row together. Startup refuses migration kinds outside `structural` and `approved-seed`.

## Taxonomy creation freeze

Importers do not call taxonomy creation methods. Storage creation for sports, equipment types, and sub-filters now requires a runtime `TaxonomyApprovalContext`. Only authenticated Admin API requests or explicit approval of an existing classification-review proposal supply that context. AI classification continues to create review proposals; it cannot silently publish a live category.

The existing Admin approval path is intentionally preserved. It supplies reviewer identity and proposal ID before any taxonomy row can be created. Unknown importer values remain in their existing unresolved/fallback state.

## Explicit maintenance invocation

All commands default to dry-run and print command, proposed counts, rule version, code version, requester, and notes:

```powershell
npm run maintenance:phase0 -- --command search-vector-backfill
```

Execution requires all three deliberate signals: `--execute`, an exact command-name confirmation, and Admin identity:

```powershell
npm run maintenance:phase0 -- --command search-vector-backfill `
  --execute --confirm search-vector-backfill --requested-by admin@example.com
```

The only Phase 0 commands eligible for the explicit execution path write `maintenance_run_log` with command, rule/code versions, proposed/affected counts, requester, status, and report. Preview-only operations reject `--execute` while parsing arguments, before preview queries, before a maintenance-run row, and before operation DML. Their executable SQL has also been removed as defense in depth. This includes legacy/baseball/negative-glove reclassification, classification-tag backfill, stale deletion, AI duplicate deletion, eBay seller seed, source merge/deletion and display/URL rewrites, and CJ URL rewrites. No command is imported or called from `server/index.ts`, route registration, deployment boot, or the scheduler.

Moving a preview-only command to executable status requires a separately reviewed change with approved rules, a verified backup reference, per-record before/after logging, transaction-safe execution, and complete rollback by run ID. URL/source rewrites additionally require a documented reversal procedure.

## Read-only production preflight

Run this against the deployment database before the first Phase 0 deployment:

```powershell
npm run preflight:phase0
```

The command begins a read-only transaction and reports required tables/columns, duplicate rows that could block every proposed unique index, application-role schema/ownership permissions, material satisfaction for each proposed migration, and expected migration-ledger/checksum state. It issues only catalog/data `SELECT` statements and never executes DDL or DML. A failed check exits nonzero; it does not repair data.

## Deployment startup verification

Automated checks prove:

1. Running the versioned runner twice applies each migration once.
2. The startup manifest contains only structural and approved-seed kinds.
3. `server/index.ts` contains no deal UPDATE/DELETE, taxonomy creation, classification, backfill, cleanup, or discount recalculation call.
4. Importer source files do not create sports/equipment taxonomy rows.
5. Live taxonomy creation without explicit approval throws.
6. Maintenance defaults to dry-run and execution requires exact confirmation plus identity.
7. A failure-injection test proves partial migration work and its ledger row roll back together.
8. Concurrent migration runners serialize and apply once.
9. Migration failure publishes failed readiness with the exact migration/error and requests nonzero process termination.
10. Every destructive/classification/source rewrite rejects execution before a write hook.
11. Existing Bat and Glove search regression suites pass without expectation changes.

The structural migration retains existing feature compatibility. The approved static taxonomy remains available on a new database. On an existing production database, the static-seed migration first classifies the state: complete seed data is skipped and ledgered, an empty database is seeded inside the ledger transaction, and a partial state fails without filling or rewriting taxonomy. Completed backfills are not in ordinary startup code. Existing unique indexes are guarded by `IF NOT EXISTS`; the preflight reports duplicate blockers before a missing index is attempted.

During migration, `/health` and `/ready` return 503 with `startup.phase=starting`. A migration failure changes the state to `failed`, includes the exact migration ID and error in structured readiness/log output, closes the HTTP server, and exits nonzero so Replit fails the deployment instead of serving an indefinite generic Loading page.

## Dependencies and follow-up risks

- Production is expected to already satisfy the unique AI-classification indexes because the former startup code created them. If an environment still has duplicate rows and no unique index, preflight fails and the structural migration will fail safely rather than delete records. Deduplication remains preview-only; any cleanup needs its own approved backup/logging/rollback PR.
- Team Stats and Invoice modules still implement their DDL functions, but those functions are no longer called by route registration or every restart. They are ledgered once for compatibility.
- All source and CJ URL rewrites are preview-only regardless of credentials in Phase 0.
- Validation now covers 68 focused tests: the original 55 Bat/Glove search tests plus 13 startup/governance tests.
- This PR does not execute or approve any maintenance command.
