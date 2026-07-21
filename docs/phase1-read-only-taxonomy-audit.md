# Phase 1 database-wide taxonomy audit

Date: 2026-07-21

Status: implementation and test fixtures only. The command was **not** run against production, and this phase contains no database mutation mode.

## Architectural review before implementation

Phase 0 correctly moved restart-time classification, taxonomy creation, broad corrective updates, and destructive maintenance out of ordinary startup. It retained only versioned structural compatibility and a guarded approved seed for a materially empty database.

Taxonomy assignment itself is still distributed across source-specific maps and fallbacks, the shared sub-filter parser, storage upserts, AI auto-classification, AI/Admin approval, direct Admin edits, and search-time display projection. Several ingestion paths choose an `*-other` or first matching equipment row from the fragmented live taxonomy. The AI classifier also treats every current live equipment row as allowed vocabulary. Those behaviors can preserve or reinforce duplicate IDs without creating a new taxonomy row.

The materially broader recommendation remains a later, separately reviewed canonical taxonomy registry plus one provenance-aware classification engine shared by ingestion, AI, Admin review, backfill, and read projection. Phase 1 deliberately does not implement that architecture. It introduces an audit-only report contract and a source-controlled assignment-path inventory so the production evidence can be reviewed before schema or classifier changes.

## Command and database safety

Default JSON to stdout:

```powershell
npm run audit:taxonomy
```

JSON, correction CSV, and concise Markdown summary in an explicit directory:

```powershell
npm run audit:taxonomy -- --format bundle --output-dir .\taxonomy-audit-output
```

The command:

- starts one `REPEATABLE READ, READ ONLY` PostgreSQL transaction;
- pages through every deal instead of using the public API limit;
- reads all sport, equipment-type, sub-filter, source, raw source-field, and deal assignment data in the same snapshot;
- supports only `json`, `csv`, `markdown`, and `bundle` output;
- rejects `--apply`, `--execute`, `--write-db`, `--update`, `--delete`, `--merge`, and `--recategorize` before opening the database audit;
- has no import from application startup, scheduler registration, maintenance execution, or migration code.

PostgreSQL enforces the read-only boundary in addition to the CLI parser. The output-directory option writes report files only; it does not write a maintenance-run row or any application data.

## Report contents

The JSON report contains:

- exact-label duplicates and singular/plural or sport-prefix synonyms, scoped so same labels in different sports are not blindly merged;
- known legacy Baseball Bat and Baseball Glove IDs and their current read-path canonical destination;
- orphaned sports, equipment parents, sub-filter parents, and deal assignments;
- result grouping keys that render with the same UI label, including separate `Bats` keys;
- deal correction cohorts grouped by proposed sport, equipment family, source, seller, current sport/equipment IDs, and proposed canonical ID;
- evidence, reason, confidence, human-approval requirement, record count, and representative deal IDs/titles for every cohort;
- every unresolved/Other deal that lacks unique strong evidence as a low-confidence pending cohort rather than a guessed correction;
- raw source-category values by source and raw-key coverage;
- brand stored values and the current brand normalizer's proposed alias value;
- model, size, drop, certification, UPC, SKU, and item-number coverage, missing counts, malformed counts, and representative values;
- identical normalized UPC/SKU/item-number values that occur under conflicting classifications;
- the complete code-owned inventory of assignment and display-projection paths.

The CSV is the flattened correction/pending cohort table. The Markdown file summarizes the total scope, duplicate/group fragmentation counts, Other/pending counts, and the twenty largest cohorts.

## Evidence and confidence policy

Known Bat/Glove alias groups and the already-reviewed bounded Bat/Glove evidence helpers are high confidence. Their negative controls remain authoritative, including Fastpitch, Slowpitch, Softball, cricket, batting gloves, golf, boxing, work, winter, and unrelated glove products.

Other sports use deliberately explicit title evidence (for example, `soccer ball`, `hockey stick`, `fishing rod`, or `running shoe`). These are medium-confidence report proposals and require human approval. Generic `ball`, `bag`, `glove`, `driver`, or merchandise/theme wording is not sufficient by itself.

Null, orphaned, generic Other, numbered Other, and conflicting records without one unique strong destination remain low-confidence pending records. Phase 1 never converts a pending record into a proposed destination.

## Ingestion and classification findings

The executable assignment-path inventory identifies these continuing entry mechanisms:

1. eBay keyword/category/seller defaults, including broad Baseball & Softball buckets.
2. CJ, Amazon, ShareASale, and Rakuten live-taxonomy fallback selection.
3. Impact category/title/advertiser detection, including a Baseball fallback for unknown catalogs.
4. Shopify, WooCommerce, Play It Again Sports, SidelineSwap, Baseball Resale, and Fanatics source-local mappings.
5. Storage persistence, which normalizes brand and tags but does not canonicalize sport/equipment IDs.
6. AI auto-classification against the complete live taxonomy.
7. AI review approval and direct Admin taxonomy/deal edits.
8. Search/API/client read projection, which is non-mutating but covers only the reviewed Bat/Glove groups.

Importers remain unable to create live taxonomy rows after Phase 0. The audit does not modify any of these paths; it reports their mechanism, fragmentation risk, and current safety control.

## Regression fixtures

Tests cover:

- `bb-bats`, `baseball-bat`, `bat`, and `bats`, including two IDs with the exact `Bats` display label;
- a Louisville Supra on a legacy Bat ID;
- an Easton Hype Fire stored in `bb-other` with source/seller/category evidence;
- a correctly classified Marucci CATX that must produce no correction;
- an ambiguous Easton Other record that must remain pending;
- an explicit Basketball product stored in Basketball Other, proving the engine is not Baseball-only;
- duplicate source identifiers with conflicting classification;
- brand aliases, raw categories, field coverage, CSV, and Markdown rendering;
- mutation-flag rejection and the database transaction's read-only declaration;
- every inventoried assignment path pointing to a real source file.

The existing Bat/Glove and Phase 0 startup-safety suites are run unchanged. No production counts appear in this document because the user explicitly prohibited running the new audit against production in this task.
