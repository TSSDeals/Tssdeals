# Phase 0 startup mutation inventory and operating procedure

Date: 2026-07-21

Scope: stop uncontrolled mutation during ordinary application startup. This change does not reclassify deals, delete taxonomy, add canonical taxonomy tables, or execute production maintenance.

## Inventory and disposition

| Former startup operation | Category | Phase 0 disposition |
|---|---|---|
| Source display-name rewrites | Corrective maintenance | Removed from startup; `source-corrections` dry run. |
| Approved core sports/equipment/source/application seed (`storage.seed`) | Essential static seed | Retained once under migration `20260721_002_approved_static_seed`; auto-inclusion recalculation removed. |
| Additional required equipment-type inserts in `server/index.ts` | Taxonomy creation | Removed. Existing approved seed remains; no per-restart taxonomy insert. |
| Broad `*-other` title reclassification | Deal reclassification | Removed; `legacy-taxonomy-reclassification` is preview-only pending approved rules. |
| Baseball Drip and negative-glove corrections | Deal reclassification | Removed; `baseball-taxonomy-corrections`, dry-run by default. |
| Deal-click/user-visit/MSRP/popular-products/A2P/hidden-deal tables | Structural schema | Retained once in `20260721_001_phase0_structural_compatibility`. |
| Drop/size/search/timestamp columns and search indexes | Structural schema | Retained once in the structural migration. |
| Team Stats and Invoice schema bootstrap | Structural schema | Removed from route registration/per-restart calls; invoked once by the structural migration. |
| `deal_sub_filters` table/index | Structural schema | Retained once; row backfill moved to `deal-sub-filter-backfill`. |
| `last_price_confirmed_at` and `search_vector` row backfills | Data backfill | Removed; separate dry-run maintenance commands. |
| AI classification duplicate deletion | Corrective cleanup | Removed; preview-only `ai-classification-deduplication`; unique indexes remain structural. |
| CJ affiliate URL rewriting | Corrective maintenance | Removed; explicit credential-scoped `cj-url-rewrite`, dry-run by default. |
| Obsolete Baseball Resale source merge/deletion | Corrective maintenance | Removed; `source-corrections` reports affected deals but merge/delete is preview-only. |
| Stale deal deletion loops | Cleanup | Removed; explicit batched `stale-deal-cleanup`. |
| eBay seller creation | Seed/maintenance | Removed; retired list is no longer automatic and sellers remain Admin-managed. |
| Global discount recalculation | Derived-data maintenance | Removed; explicit `discount-recalculation`. |
| Team `Knox Stars` seed/legacy slug correction | Essential static seed | Retained once under the approved static-seed migration. |
| Scheduler registration | Normal application function | Published schedules retained; the automatic full sync 10 seconds after every restart was removed. Sync is scheduled or explicitly Admin-invoked. |

`app_schema_migrations` is the sole bootstrap table created before the ledger exists. It contains immutable migration ID, kind, description, checksum, and applied time. An advisory transaction lock prevents concurrent instances from applying the same migration. Startup refuses migration kinds outside `structural` and `approved-seed`.

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

Executed commands write `maintenance_run_log` with command, rule/code versions, proposed/affected counts, requester, status, and report. Preview-only retired operations throw instead of mutating if execution is requested. No command is imported or called from `server/index.ts`, route registration, deployment boot, or the scheduler.

## Deployment startup verification

Automated checks prove:

1. Running the versioned runner twice applies each migration once.
2. The startup manifest contains only structural and approved-seed kinds.
3. `server/index.ts` contains no deal UPDATE/DELETE, taxonomy creation, classification, backfill, cleanup, or discount recalculation call.
4. Importer source files do not create sports/equipment taxonomy rows.
5. Live taxonomy creation without explicit approval throws.
6. Maintenance defaults to dry-run and execution requires exact confirmation plus identity.
7. Existing Bat and Glove search regression suites pass without expectation changes.

The structural migration retains existing feature compatibility. The approved static taxonomy remains available on a new database, but the ledger prevents re-seeding on every restart. Production deployment must use the application role already required for the retained compatibility DDL; a later database-migration deployment step should replace runtime DDL entirely.

## Dependencies and follow-up risks

- Production is expected to already satisfy the unique AI-classification indexes because the former startup code created them. If an environment still has duplicate rows and no unique index, the structural migration will fail safely rather than delete records. Run the deduplication preview, review survivor selection, then execute a separately approved cleanup.
- Team Stats and Invoice modules still implement their DDL functions, but those functions are no longer called by route registration or every restart. They are ledgered once for compatibility.
- The CJ URL rewrite is credential-dependent; without `CJ_PROPERTY_ID`/`CJ_COMPANY_ID` its explicit command reports zero and cannot mutate URLs.
- This PR does not execute or approve any maintenance command.
