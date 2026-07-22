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
- a mutually exclusive outcome for each audited deal: proposed correction, genuine conflict requiring review, unresolved/Other, ambiguous evidence, or already compatible/no action;
- evidence, reason, confidence, human-approval requirement, record count, and representative deal IDs/titles for every cohort;
- compatible no-action records counted in the summary but deliberately excluded from correction groups and pending totals;
- every unresolved/Other deal that lacks unique strong evidence as a low-confidence pending cohort rather than a guessed correction;
- raw source-category values by source and raw-key coverage;
- brand stored values and the current brand normalizer's proposed alias value;
- model, size, drop, certification, UPC, SKU, and item-number coverage, missing counts, malformed counts, and representative values;
- identical normalized UPC/SKU/item-number values that occur under conflicting classifications;
- the complete code-owned inventory of assignment and display-projection paths.

The CSV is the flattened correction/pending cohort table. The Markdown file summarizes the total scope, duplicate/group fragmentation counts, Other/pending counts, and the twenty largest cohorts.

## Evidence and confidence policy

Phase 1.1 replaces the original one-match policy. A sport name alone (`baseball`, `basketball`, `football`, `softball`, or another sport) is never ball evidence. Specific equipment matches and explicit apparel, footwear, protective-equipment, bag, glove, bat, hoop/net, memorabilia, and multi-product conflicts are evaluated before conservative ball rules.

The audit collects independent signals from specific title/model evidence, structured retailer category/product-type/tag fields, validated UPC/SKU/item-number consensus, and compatible stored taxonomy. High confidence requires at least two independent compatible signal types and no stored or protected-family conflict. A single compatible signal is medium confidence and always requires human approval. Legacy Bat/Glove aliases without a second compatible signal are also medium confidence.

Identifier consensus is emitted only when at least two distinct records have a valid, non-Other stored classification, their conservative direct evidence supports that classification, and every qualifying record for the normalized identifier agrees. Conflicted identifiers and identifiers backed only by incorrectly classified records produce no consensus signal.

Fanatics apparel, collectibles, autographs, memorabilia, and other ambiguous merchandise remain pending. Generic `ball`, `bag`, `glove`, `driver`, sport, merchandise, or theme wording is not sufficient by itself.

Null, orphaned, generic Other, numbered Other, and conflicting records without one unique strong destination remain low-confidence pending records. Phase 1 never converts a pending record into a proposed destination.

Phase 1.2 adds product-form and sport-conflict precedence. Explicit fastpitch, slowpitch, or softball evidence blocks Baseball destinations. Mixed `Baseball/Softball` and `BB/SB` titles remain ambiguous pending records until a shared-category policy is approved. Ball buckets/containers, weighted or limited-flight balls, pitching-machine balls, training aids, glove laces, repair kits, and glove accessories cannot become ordinary Balls or fielding Gloves. Sport-specific training-ball evidence may produce a reviewable Training Equipment candidate; ambiguous and mixed forms remain pending.

Stored taxonomy compatibility is now explicit rather than inferred from exact family-string equality. Canonical Shoes/Apparel, socks, shorts, bags, protective equipment, training equipment, Balls, Bats, Gloves, Cleats, and corresponding sport-owned categories are no-action when their stored sport/equipment owner and product evidence agree. Explicit sport or product-family conflicts still override compatibility.

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

Phase 1.1 adds report-derived regressions for Baseball apparel, cleats, helmets, gloves, bags and bats; Basketball shoes and hoops; Football facemasks; FIFA/soccer-style football wording; Fanatics autographs, apparel and memorabilia; two-signal high-confidence gating; and agreeing, conflicting, or incorrectly classified identifier cohorts.

Phase 1.2 adds production-report regressions for Easton Jen Schro and Wilson C200 fastpitch catcher gear, CIF-SS and Dream Seam softballs, a mixed Easton ball bucket, Play It Again weighted softball and `BB/SB` training aids, a Liberty Advanced fastpitch catcher's mitt, and a mixed glove-lace repair kit. It also covers canonical Golf, Running, Basketball, and Baseball no-action families plus Fanatics apparel, non-fielding gloves, and dedicated softball equipment that must remain genuine review conflicts.

## Phase 1.2 production evidence and expected pending effect

The supplied Phase 1.1 read-only report (`phase1.1-read-only-v2`, generated 2026-07-22T17:08:06.805Z) covered 179,972 deals. It reported 6,003 proposed records, 75,401 pending records, 40,090 records in Other, and zero high-confidence proposals. It was reviewed offline; this implementation did not connect to or rerun the production audit.

The inflated pending population includes correctly stored cohorts whose labels did not match the audit's protected-family vocabulary, including Golf Shoes/Apparel, Running Socks and Shorts, Basketball Shoes/Apparel, and Baseball Bags, Protective Equipment, and Training Equipment. Phase 1.2 counts compatible stored records as `already-compatible-no-action` and omits them from correction groups and pending totals. The expected effect is a material pending-count reduction without converting those records into proposals. Exact production-wide after-counts are intentionally not claimed because the supplied report retains grouped representative examples rather than every deal's complete raw evidence, and production execution is outside this PR.

An offline replay reconstructed the 16,271 unique representative examples retained in the supplied correction groups. The prior report labeled 1,405 of those examples proposed and 14,866 pending. Phase 1.2 classified 4,410 as compatible no-action, leaving 11,299 pending across conflict, unresolved, and ambiguous outcomes; 562 remained proposed corrections. This is directional evidence only: the reconstruction lacks the omitted production rows and raw retailer fields, so these sample counts must not be extrapolated into a production after-count.

## Phase 1.1 baseline and representative replay

The supplied read-only Phase 1 report (`phase1-read-only-v1`, generated 2026-07-22T14:54:16.321Z) covered 178,888 deals. It reported 20,435 proposed records and 37,161 pending records. Unsafe destination totals included:

- 12,959 records proposed as `bb-balls`;
- 1,241 proposed as `bk-balls`;
- 876 proposed as `fb-balls`;
- 500 high-confidence records proposed as `bb-bats`.

The report stores at most five examples per correction cohort and does not retain every deal's raw evidence, so it cannot reproduce an exact full-database Phase 1.1 run. No local/test database or `DATABASE_URL` was available, and production was deliberately not queried. Instead, both engines were replayed over the 15,570 unique representative examples in the supplied report:

| Representative-example metric | Phase 1 v1 | Phase 1.1 v2 |
|---|---:|---:|
| Proposed records | 11,786 | 1,245 |
| Pending records | 3,775 | 6,802 |
| `bb-balls` proposals | 9,409 | 70 |
| `bk-balls` proposals | 750 | 0 |
| `fb-balls` proposals | 556 | 1 |
| `bb-bats` proposals | 392 | 291 |

The remaining sampled Baseball-ball proposals are medium-confidence titles that explicitly say `baseballs`, `dozen`, or equivalent ball packaging. The one remaining Football-ball proposal is an explicit `Game Football` title and remains medium-confidence review-only. The remaining sampled Baseball-bat proposals are predominantly explicit bat titles; absent their original raw retailer fields, the replay conservatively keeps title-only matches at medium confidence. Exact production-wide after-counts require a separately supplied non-production database snapshot.

## Remaining limitations

- The classifier is intentionally an explicit, bounded audit ruleset rather than a complete canonical taxonomy engine; unsupported product families remain pending.
- Structured evidence currently reads the audited top-level retailer aliases. Supplier-specific evidence nested under unrecognized raw objects is inventoried but does not become a classification signal.
- Identifier consensus requires two supported agreeing records. This avoids propagating bad classifications but leaves many legitimate one-record UPC/SKU/item-number matches review-only.
- Bundles and titles containing multiple protected equipment families remain pending even when one component appears dominant.
- The representative replay cannot preserve raw category, tag, UPC, SKU, or item-number fields omitted from the Phase 1 correction examples, so its after-counts are deliberately more conservative than a full non-production snapshot run.

The existing Bat/Glove and Phase 0 startup-safety suites are run unchanged. No new audit was run against production; the baseline counts above come only from the user-supplied completed read-only report.
