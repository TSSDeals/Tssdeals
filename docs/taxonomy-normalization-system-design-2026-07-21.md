# Taxonomy normalization and database-reclassification system

Date: 2026-07-21

Status: assessment and design only. No production records, tables, or taxonomy values were changed.

## 1. Scope and evidence quality

This assessment combines:

1. Read-only calls to the live public production API at `www.tssdeals.com`.
2. A read-only sample of preserved `raw` supplier payloads obtained through individual deal reads.
3. Static inspection of the current repository's schema, startup code, importers, AI classifier, Admin routes, search recovery, and Bat/Glove regression tests.
4. A production SQL audit in `script/taxonomy-normalization-production-audit.sql` for authoritative all-row counts.

The public list endpoint caps `limit=all` at the newest 10,000 visible deals. Therefore, taxonomy row counts are live and complete, while deal-quality counts in this document are a production sample, not full-table totals. The repository checkout has no `DATABASE_URL` and no read-only production database credential. The SQL audit must be run through a separately provisioned SELECT-only role before any backfill is approved. Its first query proves `transaction_read_only=on` and identifies the database and role used.

This distinction is material: the public list response omits `raw`, applies visibility behavior, and can project recovered search classifications. Direct deal reads were used only to sample supplier fields. The full SQL report is the source of truth for backfill sizing.

## 2. Read-only production findings

### 2.1 Live taxonomy and visible-deal inventory

Captured at 2026-07-21 16:06 UTC:

| Entity | Live count | Finding |
|---|---:|---|
| Sports | 39 | 17 are core seeded sports; many long-tail/user-created sports coexist with them. |
| Equipment types | 737 | Far too many for a curated shopper taxonomy. |
| Baseball equipment types | 319 | The clearest indication that dynamic taxonomy creation has escaped governance. |
| Sub-filters | 54 | Sparse relative to 737 equipment types; 17 belong to `bb-gloves`, 16 to `bb-bats`. |
| Sources | 223 | Only 13 contributed records to the newest visible 10,000. |
| Visible deals sampled | 10,000 | Endpoint cap; not total production rows. |

Visible deals by stored sport were led by Baseball 7,800; Golf 751; Basketball 389; Soccer 386; Fastpitch Softball 217; Lacrosse 203; Slowpitch Softball 126; Cycling 52; Football 49; Tennis 21. The remaining visible sports had two or fewer records.

The taxonomy is highly asymmetric: Baseball has 319 equipment types, Golf 79, Tennis 40, Cycling 35, Running 22, Rugby 20, Gymnastics and Swimming 18 each. This is not explained by catalog volume alone and is consistent with unbounded user/AI-created category slugs.

### 2.2 Other and generic classifications

In the newest 10,000 visible deals:

| Stored equipment | Count |
|---|---:|
| `bb-other` | 5,204 |
| `golf-other` | 252 |
| `lax-other` | 55 |
| `soc-other` | 54 |
| `fp-other` | 35 |
| `bk-other` | 21 |
| `ten-other` | 17 |
| `cyc-other` | 12 |
| `sp-other` | 10 |
| Other remaining sport buckets | 7 |

There are 7,403 visible deals in an Other or generic Bat/Bats/Glove/Gloves class. The Baseball figure is partly inflated by licensed apparel and memorabilia intentionally stored in `bb-other`, but it also contains obvious equipment and non-baseball leakage. `bb-other` must be split into actionable exception cohorts rather than bulk-remapped.

Generic/legacy taxonomy confirmed live:

- `bat` / Bat / Baseball / user-created / zero visible assignments.
- `baseball-bat` / Baseball Bat / Baseball / user-created / zero visible assignments.
- `bb-bats` / Bats / Baseball / seeded / 508 visible assignments.
- `bb-gloves` / Gloves / Baseball / seeded / 1,030 visible assignments.
- `gloves` / Gloves / Golf / user-created / one visible assignment.
- `protective-equipment` duplicates seeded `bb-protective` within Baseball.
- Numerous singular/plural or generic user-created IDs exist within the same sport. The production SQL enumerates every exact-label and singularized-label duplicate with assignment counts.

Same display labels across different sports are often valid (`Balls`, `Bags`, `Training Equipment`) and must not be globally merged. Alias resolution is always scoped by canonical sport and semantic product type.

### 2.3 Null, orphan, and owner conflicts in the visible sample

The public 10,000-deal sample had:

- zero null stored sport IDs;
- zero null stored equipment IDs;
- zero equipment IDs missing from the public taxonomy;
- zero cases where an equipment row's owning sport differed from the deal's sport;
- 738 null/blank brands;
- 10,000 null legacy `subFilterId` values in the list response;
- 9,155 missing `sizeNumber` values;
- 9,671 missing `dropWeight` values.

The zero structural-conflict result does not mean semantic classifications are correct. It means foreign-key-shaped assignments are internally consistent. Title evidence identified hundreds of semantic conflicts.

### 2.4 Strong title/stored-classification conflicts

A deliberately high-precision, single-sport title pass found 543 visible records whose explicit title evidence conflicts with stored sport. It is a candidate count, not an auto-update count; theme and team merchandise terms can create false positives (for example, “Driver” in a hat name).

The strongest cohort is Baseball/Softball leakage: 329 visible records have explicit Baseball, Fastpitch, or Slowpitch wording conflicting with their stored member of that family. Representative confirmed records include:

- `RAWLINGS Gold Glove Elite White 12" Fastpitch Softball Glove...` stored `baseball` / `bb-gloves`.
- `Wilson 2021 A360 SP13 13'' Slowpitch Softball Glove...` stored `baseball` / `bb-gloves`.
- `2025 Miken Slowpitch Softball Bat... 34/26` stored `baseball` / `bb-other`.
- `Louisville Slugger 2027 Kryo2 (-11) Fastpitch Softball Bat - 32/21` stored `baseball` / `bb-other`.
- `2027 DeMarini Zenith -13 Fastpitch Softball Bat` stored `baseball` / `bb-bats`.
- `Rawlings Women's HIVIZ Fast Pitch Softball Fielders' Mask` stored `slowpitch-softball` / `sp-other`.

There is also clear cross-sport leakage in the sampled `bb-other` pile: football cleats and helmets, soccer cleats, basketball protective apparel, golf accessories, hockey equipment, and lacrosse products. A separate theme/merchandise exception rule is required so terms such as a baseball-team “putter cover” are not treated the same as a golf club.

### 2.5 Bat and Glove regression baseline

The established regression records remain the first safety suite:

- Louisville Slugger Supra `27/17`, including Louisville/LS aliases and `-10`/drop-10 equivalence. Exact length/weight must outrank generic drop matches.
- Bat legacy IDs `bat`, `baseball-bat`, and `bb-bats` read as one Baseball Bats group while Fastpitch and Slowpitch remain separate.
- Wilson A2000/A2K and pattern 1786/1786SS fielding gloves, including the live Exclusive record stored `slowpitch-softball` / `sp-gloves` only when explicit baseball-glove evidence safely overrides the stored conflict.
- Marucci Capitol Series MFG2CP45A3 baseball glove stored `baseball` / `bb-other`, projected from deal evidence even when the query omits “glove”.
- Negative controls: Easton Ghost fastpitch, USSSA softball bat, batting gloves, golf/boxing/work/winter gloves, explicit fastpitch/slowpitch/softball wording, and unrelated tennis equipment.

These cases prove two distinct operations are needed: candidate retrieval and display projection. Projection may use strong evidence on an already-retrieved deal; candidate expansion must remain more conservative.

### 2.6 Brands, product identities, sizes, and drops

The visible sample has 738 missing brands. Existing `server/brand-normalizer.ts` is a code-owned map and already covers many aliases, but normalization is not governed as data and is incomplete. Same normalized spelling still appears as:

- `All-Star` (47) and `All Star` (1).
- `Axe` (28) and `AXE` (7).
- `Net Playz` (3) and `NetPlayz` (1).
- `Wilson Staff` (1) and `WILSON STAFF` (3).
- `Hey Dude` (1) and `HEYDUDE` (2).

Some superficially similar brands must not be merged (`Fanatics`, `Fanatics Authentic`, `Fanatics MTO Label`). Canonical-brand changes therefore require alias rows with scope, source, and review status rather than punctuation-only automatic merging.

Of 845 populated `sizeNumber` values and 329 populated `dropWeight` values in the visible sample, none failed the current simple storage-format check. Completeness, not syntax, is the main visible issue. The current schema cannot distinguish glove inches, shoe sizes, apparel alpha sizes, ball sizes, bat length, or weight. It also cannot preserve multiple sizes from variants.

### 2.7 Preserved supplier fields

A read-only sample of 271 raw payloads across all 13 active sources showed these recurring source-native identifiers and categories:

- Shopify: `shopifySku`, `shopifyTags`, `shopifyHandle`, `shopifyVendor`, `shopifyProductId`, `shopifyVariantId`, `shopifyProductType`.
- Impact/CJ: `impactAsin`, `impactGtin`, `impactCatalogItemId`, `cjAdId`, `cjGtin`, `cjCatalogId`, `cjProductId`, `cjAdvertiser`.
- eBay: `ebayItemId`, `ebaySeller`, `ebayCondition`, `ebayConditionId`, `ebaySellerFeedback`.
- Play It Again Sports: `piasUrl`, `piasCategory`.
- WooCommerce: `wcSlug`, `wcTags`, `wcOnSale`, `wcInStock`, `wcProductId`, `wcCategories`.

The existing normalized deals table has no dedicated UPC, SKU, MPN/model, item number, product-family, certification, handedness, position, or subtype columns. Those values exist inconsistently inside source-specific JSON and titles. The authoritative SQL inventories all top-level raw keys and category values and checks collisions across known identifier keys.

### 2.8 Rule-provenance risks found in code

Classification logic is fragmented across startup migrations, source importers, `sub-filter-classifier.ts`, `ai-classifier.ts`, Admin endpoints, and search-time recovery.

The most serious operational issue is `runStartupMigrations()` in `server/index.ts`: normal application startup performs taxonomy inserts and broad title-based `UPDATE deals` statements. It includes generic patterns such as `glove`, `bat`, `ball`, `driver`, and `hat`, plus corrective updates. These rules are not versioned per decision, are not restartable by run ID, do not write an immutable change log, and cannot be rolled back as a unit. Future taxonomy work must first move all data mutation out of startup.

Other findings:

- Importers do not call one shared product classifier; each owns mappings and fallbacks.
- eBay category `181355` (“Other Baseball & Softball”) defaults to Baseball/`bb-other`, explaining substantial softball leakage.
- The AI classifier uses the live 737-row taxonomy as its allowed vocabulary. Taxonomy duplication therefore reinforces itself.
- AI auto-applies only high confidence and has a review queue for taxonomy gaps, which is a sound starting control, but decision provenance is insufficient and manual overrides are not protected by a durable precedence mechanism.
- The brand alias map is compiled code; no approval history, effective dates, or source-specific exceptions exist.
- Sub-filter classification is centralized better than sport/equipment classification, but its output is still tied to legacy equipment IDs and a single `sizeNumber`/`dropWeight` representation.

## 3. Proposed canonical taxonomy

### 3.1 Principles

1. Canonical IDs are stable semantic identifiers, never display labels.
2. Display labels may change without changing IDs.
3. Aliases are scoped and versioned; no legacy row is deleted in the initial program.
4. Sport, equipment type, subtype, and attributes are separate dimensions.
5. `Other` is a temporary unresolved state, not a product type.
6. Original title, source category, source identifiers, and full raw payload remain immutable source facts.
7. Fastpitch and Slowpitch remain distinct canonical sports from Baseball.
8. Merchandise/memorabilia is explicitly modeled instead of overloading Baseball equipment.

### 3.2 Canonical sport layer

Initial canonical sports should preserve the current seeded competitive sports: Baseball, Fastpitch Softball, Slowpitch Softball, Basketball, Football, Soccer, Golf, Lacrosse, Hockey, Volleyball, Fishing, Cycling, Gymnastics, Cheerleading, Rugby, Swimming, Running, Tennis, Pickleball, Badminton, Squash, and Wrestling. User-created candidates such as Cricket, Boxing, Fitness, Hiking, Archery, Table Tennis, and Racquetball can become canonical after confirming volume and equipment coverage.

`Baseball Memorabilia`, `Casual Wear`, `Outdoor`, `Camping`, and similar concepts are not necessarily sports. Model them as catalog domains/product uses or merchandising collections unless governance explicitly approves them as shopper sports.

### 3.3 Canonical equipment and subtype layer

Use sport-neutral product concepts plus sport applicability. Examples:

| Canonical type | Shopper label in Baseball | Example subtypes/attributes |
|---|---|---|
| `bat` | Baseball Bats | youth/adult/wood/composite; length, weight, drop, certification |
| `fielding_glove` | Baseball Gloves | infield/outfield/catcher/first-base/pitcher; size, throw hand |
| `batting_glove` | Batting Gloves | size, handed pair/single |
| `ball` | Baseballs | league/use, circumference/size, pack count |
| `cleat` | Cleats | shoe size, width, gender/age, surface |
| `protective_gear` | Protective Equipment | helmet, chest protector, leg guard, face mask, elbow guard |
| `training_aid` | Training Equipment | tee, net, pitching machine, rebounder, trainer |
| `equipment_bag` | Equipment Bags | bat bag, backpack, catcher bag, wheeled |
| `care_accessory` | Care & Accessories | glove care, bat grip, replacement parts |
| `apparel` | Apparel | garment subtype and size |
| `memorabilia` | Memorabilia | autographed/game-used/type/authentication |

The same concept may apply to multiple sports, but the shopper grouping key is `(canonical_sport_id, canonical_equipment_type_id)`. This avoids 319 Baseball-only type records without accidentally merging golf gloves with baseball gloves.

### 3.4 Initial alias decisions

| Legacy scope | Legacy IDs/labels | Canonical destination | Guard |
|---|---|---|---|
| Baseball | `bb-bats`, `bat`, `baseball-bat`; Bat/Bats/Baseball Bat | Baseball + `bat` | Exclude explicit fastpitch/slowpitch/softball/cricket. |
| Baseball | `bb-gloves`, `glove`, `gloves`, `baseball-glove`, `baseball-gloves` | Baseball + `fielding_glove` | Exclude batting and non-fielding glove evidence. |
| Baseball | `bb-batting-gloves` | Baseball + `batting_glove` | Never alias to fielding glove. |
| Fastpitch | `fp-bats`, `fp-gloves`, `fp-batting-gloves` | Fastpitch equivalents | Preserve sport boundary. |
| Slowpitch | `sp-bats`, `sp-gloves`, `sp-batting-gloves` | Slowpitch equivalents | Preserve sport boundary. |
| Baseball | `protective-equipment`, `bb-protective` | Baseball + `protective_gear` | Map subtype from evidence. |
| Baseball | `ball`, `bb-balls` | Baseball + `ball` | Require baseball scope/evidence. |
| Golf | `wedge`, `golf-wedges` | Golf + club/wedge subtype | Do not map team-branded putter covers. |
| Any sport | numbered/generic Other | unresolved | Classify evidence; never blind-alias. |

All remaining 737 legacy rows must receive one of four dispositions from the full SQL audit: `canonical`, `alias`, `deprecated_unresolved`, or `manual_review`. No row is deleted.

### 3.5 Canonical product attributes

Each normalized product may carry:

- canonical sport and equipment type;
- subtype(s);
- canonical brand;
- product family and model/style code;
- size values as typed dimensions with unit, system, audience, and raw text;
- weight with unit and bat drop as a derived/observed value;
- certification(s) such as BBCOR, USSSA, USA Baseball, ASA/USA Softball, NSA;
- handedness/throw hand/bat hand;
- position(s);
- UPC/GTIN, SKU, MPN, supplier item number, source product ID, and variant ID.

Exact `27/17` is represented as length 27 inches + weight 17 ounces + derived drop 10. `-10`, `drop 10`, and `27/17` can match the same drop constraint, but ranking can prefer two exact observed dimensions over derived drop-only evidence.

## 4. Proposed schema changes

These are designs only; no migration was executed.

### 4.1 Taxonomy and aliases

- `canonical_sports(id, name, status, sort_order, created_at, updated_at)`.
- `canonical_equipment_types(id, name, status, created_at, updated_at)`.
- `canonical_sport_equipment(sport_id, equipment_type_id, shopper_label, status, sort_order)`.
- `canonical_subtypes(id, equipment_type_id, name, status)`.
- `taxonomy_aliases(id, alias_kind, source_scope, raw_sport_id, raw_equipment_type_id, normalized_alias, canonical_sport_id, canonical_equipment_type_id, canonical_subtype_id, rule_version_id, status, approved_by, approved_at)`.
- `canonical_brands(id, name, status)` and `brand_aliases(id, canonical_brand_id, alias, normalized_alias, source_scope, status, approved_by, approved_at)`.
- `product_families(id, canonical_brand_id, name, normalized_name)` and `product_model_aliases(id, product_family_id, alias, normalized_alias, model_code, sport_scope)`.

Unique constraints must prevent two active aliases with the same kind/scope/normalized value from targeting different destinations.

### 4.2 Source facts and canonical projection

- Keep `deals.title`, `deals.brand`, `deals.raw`, and source-owned fields unchanged.
- Add `deal_source_facts(deal_id, source_id, source_category, source_sport, source_brand, source_model, source_size, source_drop, source_certification, extracted_identifiers_json, observed_at)`. This is append/update-by-source evidence, not canonical truth.
- Add `deal_canonical_classifications(deal_id PK, canonical_sport_id, canonical_equipment_type_id, canonical_subtype_id, canonical_brand_id, product_family_id, model_text, confidence, status, rule_version_id, decision_id, manual_override_id, classified_at)`.
- Add `deal_identifiers(deal_id, kind, value, normalized_value, source_id, is_primary, confidence)` with uniqueness scoped carefully; retailer SKUs are only unique per source/seller, while UPC/GTIN can be global after check-digit validation.
- Add `deal_attribute_values(deal_id, attribute_type, numeric_value, text_value, unit, normalized_value, source_text, confidence, rule_version_id)` for length, weight, drop, size, handedness, position, certification, and audience.
- Add `deal_taxonomy_tags(deal_id, canonical_subtype_id or attribute_id, confidence, decision_id)` to replace the overloaded sub-filter representation gradually.

### 4.3 Rules, decisions, runs, and overrides

- `classification_rule_versions(id, semantic_version, code_sha, ruleset_hash, status, created_by, created_at, activated_at)`.
- `classification_rules(id, rule_version_id, rule_key, priority, input_scope, condition_json, output_json, confidence_policy, negative_conditions_json, enabled)`.
- `classification_decisions(id, deal_id, run_id, rule_version_id, mode, before_json, proposed_json, evidence_json, confidence, disposition, created_at)`; append-only.
- `classification_runs(id, mode, rule_version_id, status, requested_by, started_at, finished_at, snapshot_at, cursor, totals_json, backup_reference, error)`.
- `classification_change_log(id, run_id, decision_id, deal_id, before_json, after_json, changed_by, changed_at, rollback_of_id)`; append-only.
- `classification_manual_overrides(id, deal_id, canonical fields, reason, created_by, created_at, superseded_at)`; active override always wins.
- `classification_review_items(id, decision_id, status, assigned_to, reviewed_by, review_reason, resolution_json, created_at, resolved_at)` and `classification_review_events(...)` for immutable approval/rejection history.

Admin-only reasoning, raw payload excerpts, collisions, and review metadata stay behind existing Admin authorization. Public APIs expose only approved canonical IDs/labels and safe `classificationRecovered` metadata.

## 5. Shared classification engine

### 5.1 One pure decision contract

Implement a deterministic core:

```text
classify(ProductEvidence, RuleSet, ExistingState, Mode) -> ClassificationDecision
```

`Mode` is `ingest`, `update`, `backfill_dry_run`, `backfill_apply`, `admin_preview`, or `search_projection`. The engine is pure: it performs no database writes and no network calls. Adapters collect evidence, call it, validate the result, then persist or project according to mode.

`ClassificationDecision` includes canonical outputs, normalized attributes, evidence items, negative evidence, rule keys, rule version, confidence score and band, conflicts, and recommended disposition. Identical evidence + ruleset must produce byte-equivalent decisions.

### 5.2 Evidence priority and scoring

Evaluate in this order:

1. Active manual override: terminal; automation cannot overwrite it.
2. Exact verified identity mapping: valid UPC/GTIN, source-scoped SKU/item number/variant ID, or approved model code. Conflicting identifiers lower confidence and create a collision exception.
3. Known brand + product family + model/pattern mapping.
4. Structured supplier sport/category/product type from an approved source mapping.
5. Normalized attributes: size, length/weight/drop, certification, handedness, position.
6. Explicit title phrases and bounded token/model evidence.
7. Broad title terms and legacy stored classification as supporting evidence only.
8. Negative/conflicting evidence, evaluated before final confidence and capable of vetoing an otherwise positive rule.

Strong negative evidence includes explicit fastpitch/slowpitch/softball/cricket title wording, a trusted structured sport, batting-glove phrases, and incompatible product-type terms. Arbitrary words elsewhere in serialized JSON are not negative evidence. Only named structured raw fields are inspected.

Suggested scoring: identity +100; approved brand/model +70; trusted structured category +50; explicit product phrase +45; compatible attributes +10 each; legacy assignment +10; explicit incompatible sport/product phrase -100; trusted structured conflict -70; weak ambiguity -20. A rule may also declare a hard veto.

### 5.3 Confidence and disposition

- High: score at least 90, no hard conflict, one destination, and either verified identity or two independent strong evidence classes. Eligible for automatic ingestion/update and an approved backfill run.
- Medium: score 60–89, or one recoverable conflict. Persist proposal only; Admin review required.
- Low/conflicting: below 60, collision, multiple plausible destinations, or hard negative. Leave canonical state unchanged and emit an exception.

Confidence is not merely an AI label. It is recomputed from recorded evidence by policy. An AI suggestion can be one evidence item but cannot bypass destination ownership, aliases, negative rules, or manual overrides.

### 5.4 Usage by every path

- New ingestion: preserve source payload, extract facts, classify, store source and canonical records atomically.
- Product update: refresh source facts; reclassify only if evidence fingerprint or ruleset changed; retain history.
- Historical backfill: stream snapshot IDs through the same engine; first generate decisions only.
- Admin reclassification: show the engine preview, allow explicit override, and write an immutable override/event.
- Search fallback: call the same engine in projection mode on already-returned deals. It may project canonical response fields but cannot write or expand retrieval from weak evidence.

## 6. Dry-run and backfill procedure

### 6.1 Read-only audit gate

1. Create a database login with only CONNECT/USAGE/SELECT and `default_transaction_read_only=on`, preferably against a replica.
2. Run `script/taxonomy-normalization-production-audit.sql` with `psql -X -v ON_ERROR_STOP=1`.
3. Archive stdout, query version, git SHA, capture time, database identity, and row counts in access-controlled storage.
4. Complete every legacy taxonomy row's disposition and approve the canonical/alias seed set.

### 6.2 Application dry run

1. Pin `snapshot_at`, code SHA, and ruleset version.
2. Insert a `classification_runs` row in `backfill_dry_run` mode only after the schema/change-log migration is separately approved.
3. Read deals in stable `id` batches; never use offset pagination.
4. Write proposed `classification_decisions`, not deal classifications.
5. Produce before/after counts by source, stored sport/equipment, proposed canonical sport/equipment, confidence, rule, and conflict type.
6. Produce identity-collision, manual-override, unresolved, and possible false-positive reports.
7. Compare Bat/Glove regression counts and sampled results before approval.
8. Require explicit approval of the ruleset version and dry-run run ID. Any rule change invalidates approval and requires a new dry run.

Each dry-run record contains deal ID, original source facts, stored classification, proposed canonical classification/attributes, all evidence and negatives, applied rules, confidence, collision keys, and disposition.

## 7. Safe execution and rollback

No execution belongs in the present task. A later apply procedure should be:

1. Stop startup-time classification writes and deploy the versioned engine in observe-only mode.
2. Take a provider snapshot plus a logical backup of affected tables. Restore the backup into a disposable database and verify row counts/checksums before proceeding.
3. Confirm the approved dry-run snapshot and rule version still match. Re-dry-run records updated since `snapshot_at`.
4. Process 500–2,000 IDs per transaction, using `FOR UPDATE SKIP LOCKED` only in the worker and a stable run cursor.
5. For each changed deal, lock the current canonical row, recheck no active manual override and no evidence-version drift, append the immutable change log, then update canonical tables.
6. Commit the batch; record cursor, counts, duration, and checksum. A failed worker resumes after the last committed cursor.
7. Enforce source/category and global error-rate circuit breakers. Pause on unexpected collision or negative-control failure.
8. Expose no decision evidence or raw supplier data through public endpoints.

Rollback by run ID reverses change-log entries in reverse order, in transactional batches, only when the current value still equals that run's `after_json`. Drifted/manual-overridden records are skipped into a rollback exception report. Rollback itself creates a new run and append-only log; history is never deleted. Restoring the whole database is the disaster-recovery fallback, not the normal rollback mechanism.

## 8. Ongoing controls

- Classify every new or materially updated deal before canonical storage, with the source payload and decision committed together.
- Nightly audit: new aliases, unresolved Other, null canonical fields, semantic conflicts, identifier collisions, source category drift, and manual-override violations.
- Admin queue ordered by impact: active deal count, high-value identity collision, shopper-visible group fragmentation, confidence, and age.
- Record approval/rejection/reassignment events and reviewer rationale immutably.
- Dashboard metrics: classified percentage, Other/unresolved percentage, conflict rate, high/medium/low decisions, manual overrides, queue age, source drift, alias hit rate, projection rate, backfill/rollback status, and negative-control failures.
- Golden regression corpus for every sport/equipment family, not just Bat/Glove. Every rule version must pass it before activation.
- Taxonomy creation requires an approved canonical proposal; importers and AI may not create live taxonomy rows directly.
- Nightly reports are Admin-only. Public metrics must be aggregated and contain no raw supplier data or reviewer details.

## 9. Phased implementation plan

### Phase 0 — safety and authoritative assessment

- Provision SELECT-only production/replica access and run the attached audit.
- Remove data-changing startup migrations into explicit, versioned maintenance jobs (separate reviewed change).
- Freeze dynamic shopper taxonomy creation; retain review proposals.
- Approve taxonomy governance owner and manual-override policy.

### Phase 1 — canonical registry and engine in shadow mode

- Add canonical taxonomy, aliases, ruleset, decision, run, review, override, and change-log tables.
- Seed approved Bat/Glove mappings plus canonical core sports/equipment.
- Implement the pure shared engine and source adapters.
- Run on ingestion/search in observe-only comparison mode; no canonical behavior change.

### Phase 2 — ingestion and Admin controls

- Make new/updated deals populate source facts and canonical classifications.
- Add Admin preview, review queue, immutable events, and protected manual overrides.
- Add nightly audits and metrics.

### Phase 3 — full dry run

- Run historical classification on the pinned production snapshot.
- Review collisions, medium confidence, and each legacy alias destination.
- Expand golden tests across all active sports and product families.

### Phase 4 — approved batched backfill

- Verify backup restore, apply in transactional batches, monitor circuit breakers, and retain rollback readiness.
- Initially switch reads to canonical fields behind a feature flag for Admin/canary traffic.

### Phase 5 — canonical read path

- Move shopper filters/grouping/search facets to canonical IDs.
- Retain legacy aliases for inbound URLs and historical records.
- Reduce search-time recovery as stored canonical coverage approaches the target.

## 10. Risks and unresolved decisions

1. Authoritative totals remain unresolved until the SELECT-only SQL runs against the full database.
2. Baseball merchandise versus sporting equipment needs a product-domain decision; blindly classifying apparel/memorabilia as equipment would worsen taxonomy.
3. Multi-sport products need a policy: one primary sport plus secondary applicability, or genuinely many-to-many sports.
4. Retailer SKU uniqueness scope varies by seller/store. Treating SKU as global would cause false identity merges.
5. UPC/GTIN quality needs check-digit validation and pack/variant semantics before automatic identity mapping.
6. Product versus offer identity is currently conflated in `deals`. A future catalog-product/offer split may be warranted but is not required for the first safe normalization phase.
7. Size semantics require sport/equipment-specific unit and audience rules; `12` cannot be interpreted globally.
8. AI taxonomy suggestions must use only the curated canonical vocabulary and must never create a live category automatically.
9. Current public read projection can obscure stored-error counts; audits must query stored database columns directly.
10. The 319 Baseball equipment records require human disposition review; string similarity alone is insufficient.
11. Startup mutation removal is a prerequisite to reliable rollback because otherwise a restart can reapply unversioned changes.
12. Retention and access policy for raw supplier payloads and Admin decision evidence must be confirmed.

## 11. Approval gates before any material architecture or data change

Do not proceed to migration/backfill until all are true:

- full SQL output is archived and reviewed;
- every legacy ID has a disposition and canonical destination or manual-review status;
- source identifier uniqueness rules are approved;
- manual override precedence and Admin authorization are tested;
- backup restoration is demonstrated;
- dry-run and rollback are exercised on a production-sized clone;
- every sport has positive, negative, ambiguity, and cross-sport regression cases;
- Bat and Glove live regressions pass unchanged;
- an approved run ID and ruleset version are recorded.
