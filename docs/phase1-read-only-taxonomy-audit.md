# Phase 1 database-wide taxonomy audit

Date: 2026-07-22

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

JSON, audit CSVs, approval-review CSVs, and concise audit/review Markdown summaries in an explicit directory:

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
- validated/scoped UPC, SKU, and item-number findings separated into likely same-product conflicts, unsafe reuse, invalid identifiers, and unresolved collisions, with source/seller/title evidence;
- the complete code-owned inventory of assignment and display-projection paths.

The bundle retains the machine-readable audit cohort files (`taxonomy-corrections.csv`, `taxonomy-identifiers.csv`, `taxonomy-audit.json`, and `taxonomy-audit-summary.md`). Phase 1.5 adds `taxonomy-review-packet.json`, per-deal proposed and unresolved/manual CSVs, supported-identifier and quarantine CSVs, and `taxonomy-review-summary.md`. The full audit JSON also embeds the review packet.

## Evidence and confidence policy

Phase 1.1 replaces the original one-match policy. A sport name alone (`baseball`, `basketball`, `football`, `softball`, or another sport) is never ball evidence. Specific equipment matches and explicit apparel, footwear, protective-equipment, bag, glove, bat, hoop/net, memorabilia, and multi-product conflicts are evaluated before conservative ball rules.

The audit collects independent signals from specific title/model evidence, structured retailer category/product-type/tag fields, validated UPC/SKU/item-number consensus, and compatible stored taxonomy. High confidence requires at least two independent compatible signal types and no stored or protected-family conflict. A single compatible signal is medium confidence and always requires human approval. Legacy Bat/Glove aliases without a second compatible signal are also medium confidence.

Identifier consensus is emitted only when at least two distinct records have a valid, non-Other stored classification, their conservative direct evidence supports that classification, and every qualifying record for the normalized identifier agrees. Phase 1.4 additionally requires a structurally valid UPC/GTIN check digit and rejects repeated-digit placeholder GTINs; scopes ordinary SKUs by source and a known seller; treats sellerless, numeric, and generic SKUs as ineligible for consensus; scopes item numbers by source; and requires matching direct product-family evidence on the target record. There is no source-only ordinary-SKU policy. Identity can improve confidence but cannot create a taxonomy candidate by itself.

Fanatics apparel, collectibles, autographs, memorabilia, and other ambiguous merchandise remain pending. Generic `ball`, `bag`, `glove`, `driver`, sport, merchandise, or theme wording is not sufficient by itself.

Null, orphaned, generic Other, numbered Other, and conflicting records without one unique strong destination remain low-confidence pending records. Phase 1 never converts a pending record into a proposed destination.

Phase 1.2 adds product-form and sport-conflict precedence. Explicit fastpitch, slowpitch, or softball evidence blocks Baseball destinations. Mixed `Baseball/Softball` and `BB/SB` titles remain ambiguous pending records until a shared-category policy is approved. Ball buckets/containers, weighted or limited-flight balls, pitching-machine balls, training aids, glove laces, repair kits, and glove accessories cannot become ordinary Balls or fielding Gloves. Sport-specific training-ball evidence may produce a reviewable Training Equipment candidate; ambiguous and mixed forms remain pending.

Phase 1.3 tightens product form again. Bat holders, racks, organizers, display/storage products, and grip tape/wrap are protected accessories rather than Bats; incidental phrases such as `new grip`, `bad grip`, or a grip brand do not block an otherwise explicit bat. Fastpitch/slowpitch Balls now require a discrete ball term instead of the sport phrase alone. A bounded adult/youth bat-dimension rule requires a 26–35 inch length, a 15–31 ounce weight, and drop, barrel, alloy, or composite evidence before a fastpitch/slowpitch title that omits `bat` can become a Bat. That range deliberately excludes 11-inch, 12-inch, and 16-inch softball sizes.

Ball buckets and containers are detected in either word order with intervening product wording; holders, stands, racks, novelty/noisemaker references, and explicit training-ball forms cannot become ordinary Balls. Cycling accessories such as pedals, grips, pegs, pumps, tires, tubes, wheels, racks, helmets, and replacement parts cannot become Bicycles. Goal/hoop shooting targets, weights, sandbag covers, and replacement weights cannot become Nets or Hoops/Nets. Genuine bicycles, goals, hoops, rims, backboards, and nets remain eligible.

Phase 1.4 protects decorative, themed-gift, souvenir, commemorative, signed, signature, and autograph-oriented ball products from ordinary Baseball/Soccer Ball proposals unless explicit game/practice/match-ball wording independently establishes playable product form. The protection is ball-specific: `autograph model` and `signature series` bats or gloves retain their equipment evidence. Batting-tee replacement toppers, tubes, cups, ball rests, and similar components are training accessories rather than complete Training Equipment.

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

Phase 1.3 adds production-report regressions for six bat-holder/rack/grip products; real bats with incidental grip wording; straight and curly possessive HIVIZ fielder-mask titles; 33-inch/23-ounce/-10 fastpitch and 34-inch/27-ounce slowpitch bats that omit `bat`; 11-inch, 12-inch, and 16-inch softball sizes; bucket combinations, ball holders, party horns, and training balls; Bell bike pedals/grips/pegs and a genuine Huffy bicycle; and goal-target and hoop-weight accessories alongside genuine goals, hoops, rims, backboards, and nets.

Phase 1.4 adds exact report-derived regressions for the Ice Cream Drip themed-gift baseball, unidentified-signature baseball, England FA Signature soccer ball, MacGregor replacement tee tube, Sumind replacement topper/cup, and replacement top tube. Positive controls cover ordinary baseballs and soccer balls, complete batting tees, pitching machines, training balls, bats, gloves, cleats, running shoes, swim goggles, bicycles, goals, hoops, autograph-model gloves, and signature-series bats/gloves. Identifier tests cover valid GTIN-8, UPC-A, EAN-13, and GTIN-14 values; invalid checksums and repeated-digit placeholders; sellerless, numeric, and generic SKU rejection; known-seller/source SKU isolation; translated Wilson/Luxilon records sharing item numbers and UPCs; all four identifier-finding kinds; CSV output; and exact outcome reconciliation.

Phase 1.5 adds multilingual Fanatics source-item-number conflicts; translated Wilson A2000 listings sharing source item numbers and validated GTINs; repeated-digit and check-digit-invalid GTIN quarantine; unrelated-product identifier reuse; sellerless and generic SKU quarantine; matching identifiers with conflicting Bat/Glove direct evidence; and matching Wilson identifiers that safely reinforce independently established Baseball Glove evidence. Packet tests also verify per-deal evidence, negative evidence, identifier evidence, approval status, availability, priority factors, JSON/CSV/Markdown output, and the immutable read-only boundary.

## Phase 1.5 approval-review packet

Phase 1.5 converts each correction decision retained during the read-only snapshot into a per-deal review row. Proposed rows contain the deal ID/title, source/seller, current and proposed taxonomy, positive and negative evidence, identifier evidence, confidence/reason, approval requirement, availability when a structured raw field exists, and deterministic review priority. Pending conflict, unresolved Other, and ambiguous-evidence decisions are emitted separately as per-deal unresolved/manual-review rows.

Priority is review ordering only; it does not authorize execution. The score combines correction-cohort size, shopper-visible fragmentation, evidence strength, source review volume, and structured current availability. Every component is included in the output so reviewers can reproduce the ordering.

Identifier findings remain consensus-ineligible and human-review-only. A likely same-product conflict receives a supported recommendation only when at least two records independently produce the same single compatible direct product-family destination. Identifier agreement alone never supplies a destination. Likely conflicts without that support join invalid identifiers, unsafe reuse, unresolved collisions, sellerless SKUs, and numeric/generic SKUs in the quarantine export.

The bundle adds these approval files:

- `taxonomy-review-proposed-corrections.csv`;
- `taxonomy-review-supported-identifier-conflicts.csv`;
- `taxonomy-review-identifier-quarantine.csv`;
- `taxonomy-review-unresolved-manual.csv`;
- `taxonomy-review-packet.json`;
- `taxonomy-review-summary.md`.

## Phase 1.5 supplied Phase 1.4 evidence

The supplied archive SHA-256 is `4B0A75C1A535AAF49DA211ED66DD2E38FE0DFD310517E3984B3BA6D92D916335`. Its `phase1.4-read-only-v6` report was generated at `2026-07-23T01:08:48.264Z` and covered 181,358 deals. It reported 1,283 proposed-correction records across 396 cohorts, 75,303 pending/review records, 104,772 compatible/no-action records, and 40,449 records in Other.

The identifier baseline contains 2,472 findings: 1,959 likely-same-product conflicts, 12 unsafe identifier-reuse findings, 296 invalid identifiers, and 205 unresolved collisions. The archive was inspected and replayed only as offline evidence; this change did not connect to production or execute another production audit.

The largest proposed cohorts are 430 Holabird running shoes stored in Swimming Other, 109 stored in Cycling Other, 92 stored in Cheerleading Other, and 91 Academy swim goggles stored in Swimming Other. Likely-same-product findings are concentrated in 1,066 Fanatics source-item-number scopes, 726 validated global-GTIN scopes, and 164 Wilson Impact source-item-number scopes. These concentrations motivate review priority and the multilingual Fanatics/Wilson fixtures; they do not authorize a destination or prove that every member of a cohort is correct.

The Phase 1.4 correction JSON stores group counts plus at most five representative examples, not all underlying deal rows. It therefore proves the 1,283 baseline count but cannot itself be expanded into a complete per-deal export. Phase 1.5 generates that export during a future explicit read-only snapshot. No production-wide Phase 1.5 output count is claimed in this change.

## Phase 1.4 supplied Phase 1.3 evidence and representative replay

The supplied Phase 1.3 read-only report (`phase1.3-read-only-v4`, generated 2026-07-22T20:51:02.233Z) covered 181,188 deals. It reported 1,295 medium-confidence proposals across 401 groups, 76,194 pending/review records, 103,699 compatible/no-action records, 40,353 records in Other, and 2,267 generic identifier-conflict findings. The archive was verified and reviewed offline only; Phase 1.4 did not connect to production or run another production audit.

The report retained 15,558 unique representative correction examples. The Phase 1.3 sample contained 548 proposed and 15,010 pending examples. Replaying only those titles, stored IDs, source IDs, and retained seller values through Phase 1.4 produced 538 proposed, 14,849 pending, and 171 compatible/no-action examples. This is directional representative evidence, not a production-wide after-count: correction groups retain at most five examples and omit structured categories, tags, UPCs, SKUs, and item numbers.

The replay moved the Ice Cream Drip gift baseball, unidentified-signature baseball, England FA Signature soccer ball, MacGregor replacement tee tube, and a proposed replacement topper/cup from proposed destinations to ambiguous pending with no destination. Existing pending topper/tube examples remained pending. Two Catfish Hunter `Autograph Model` baseball gloves remained eligible for `bb-gloves`.

The legacy identifier findings do not retain source/seller scope or the mapping from each example to its stored classification, so a complete identifier before/after replay is impossible from the bundle. A bounded replay of the exact retained examples classified numeric SKU `23576` (Miken slowpitch shorts versus a Franklin glove aerator) as `unsafe-identifier-reuse`, while Wilson item number `WR8302001115` across English/French Luxilon ALU Power 115 titles became `likely-same-product-conflict`. No production-wide Phase 1.4 identifier count is claimed.

## Phase 1.3 supplied Phase 1.2 evidence and representative replay

The supplied Phase 1.2 read-only report (`phase1.2-read-only-v3`, generated 2026-07-22T19:31:21.733Z) covered 179,997 deals. It reported 1,317 proposed corrections, 75,272 pending/review records, 103,408 compatible/no-action records, 40,093 records in Other, and zero high-confidence proposals. The archive was reviewed and replayed offline only; this change did not connect to production or run another production audit.

The report retained 15,429 unique representative deal examples across its correction groups. Replaying those titles and stored sport/equipment IDs through Phase 1.3 changed the representative sample from 570 proposed and 14,859 pending records to 543 proposed, 14,780 pending, and 106 compatible/no-action records. This is directional fixture evidence, not a production-wide after-count: correction groups retain at most five examples, and their examples omit most original structured retailer fields.

The replay specifically removed the unsafe Bat destination from the requested holder/rack/grip examples; removed ordinary Ball destinations from the two Wilson bucket combinations, practice-ball bucket, ball holder, stadium horns, and training-ball forms; removed Bicycle from Bell pedals, grips, and pegs while retaining `cyc-bikes` for the Huffy Granite; and removed Nets/Hoops destinations from the shooting-target and sandbag-cover examples. Both Rawlings HIVIZ masks resolved to `fp-protective`; the Easton 33-inch/23-ounce/-10 product resolved to `fp-bats`; and the Miken 34-inch/27-ounce alloy product resolved to `sp-bats`.

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
