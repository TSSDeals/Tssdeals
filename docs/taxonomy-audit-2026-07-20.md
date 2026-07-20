# Taxonomy reliability audit and migration dry run

This report is read-only. The accompanying SQL contains no mutations. Counts below are a live public-API sample of the newest 10,000 visible deals on 2026-07-20; run `script/taxonomy-audit.sql` against production for authoritative all-row counts before approving a separate migration.

## Root cause and baseball-bat decision

Production exposes 737 equipment-type rows, including 319 under baseball. The seeded and importer-owned baseball-bat ID is `bb-bats` (`Bats`). Two user-created records fragment the same shopper concept: `baseball-bat` (`Baseball Bat`) and `bat` (`Bat`). No startup/importer mapping found in this repository emits either legacy ID; startup classification and the baseball-resale, CJ, eBay, Shopify, WooCommerce, SidelineSwap, and scheduled sync paths emit `bb-bats`.

Canonical destination: `bb-bats`, displayed to shoppers as **Baseball Bats**. Fastpitch `fp-bats` and slowpitch `sp-bats` remain separate and are never members of this group.

| ID | Live label | Origin | Visible sample deals | Proposal |
|---|---|---:|---:|---|
| `bb-bats` | Bats | seeded | 414 | canonical; no migration |
| `baseball-bat` | Baseball Bat | user-created | 0 | migrate to `bb-bats` after full dry run |
| `bat` | Bat | user-created | 0 | migrate to `bb-bats` after full dry run |

The observed UI counts (1, 0, and about 50) are filtered/recovered result counts, not raw assignment counts. This distinction is why the SQL audit uses a direct `LEFT JOIN` instead of the shopper search endpoint.

## Duplicate equipment types by sport

The live taxonomy contains these exact or singular/plural duplicate candidates. Counts are from the 10,000-deal sample.

| Sport | Records (sample count) | Proposed destination | Review status |
|---|---|---|---|
| Baseball | `ball` Ball (0), `bb-balls` Balls (5) | `bb-balls` | migration candidate |
| Baseball | `baseball-bat` Baseball Bat (0), `bat` Bat (0), `bb-bats` Bats (414) | `bb-bats` | handled on read path; migration candidate |
| Baseball | `bb-drip` Baseball Drip (57), `drip` Drip (0) | `bb-drip` | migration candidate |
| Baseball | `baseball-equipment` Baseball Equipment (0), `equipment` Equipment (0) | none | manual review; labels are too broad |
| Slowpitch softball | `batting-gloves` (0), `sp-batting-gloves` (1) | `sp-batting-gloves` | migration candidate |
| Baseball | `bib` (0), `bibs` (0) | none | manual review |
| Golf | `blade-cover` (0), `blade-covers` (0) | none | manual review |
| Baseball | `decal` (0), `decals` (0) | none | manual review |
| Baseball | `flag` (0), `flags` (0) | none | manual review |
| Baseball | `hat` (0), `hats` (0) | none | manual review |
| Baseball | `ornament` (0), `ornaments` (0) | none | manual review |
| Baseball | `bb-protective` Protective Equipment (223), `protective-equipment` (0) | `bb-protective` | migration candidate |
| Rugby | `training-equipment` (0), `rug-training` (0) | `rug-training` | manual review then migration |
| Baseball | `tumbler` (0), `tumblers` (0) | none | manual review |
| Golf | `wedge` Wedge (0), `golf-wedges` Wedges (87) | `golf-wedges` | migration candidate |

## Unclassified and conflicting assignments

The visible 10,000-deal sample contained zero missing sport IDs, zero missing equipment IDs, and zero sport/equipment-owner conflicts. This is not proof that the full deals table is clean: the public endpoint applies visibility and search read-path rules. The second and third queries in `script/taxonomy-audit.sql` provide authoritative production counts and conflict records.

## Rule provenance and manual review

- Seed/startup: `server/storage.ts` seeds `bb-bats`; `server/index.ts` maps bat/BBCOR patterns to it.
- Importers: `server/baseball-resale-sync.ts`, `cj-affiliate.ts`, `ebay-api.ts`, `shopify-sync.ts`, `woocommerce-sync.ts`, `sidelineswap.ts`, and scheduler classification map baseball bats to `bb-bats`.
- Dynamic creation: equipment-type creation and AI-classification approval can create slugged user taxonomy rows, matching the live `baseball-bat` and `bat` records. These creation paths need a later canonicalization guard.
- High-priority manual review: `server/shopify-multi-store-sync.ts` currently includes fastpitch, slowpitch, and softball terms in a broad rule that maps to baseball/`bb-bats`, and maps legacy `slowpitch` collections to `bb-bats`. Do not migrate those records blindly; title and stored sport evidence must be reviewed and routed to `fp-bats` or `sp-bats` as appropriate.
- Bat-like specialty IDs (`used-bat`, `mural-series-bat`) are not included in the canonical group because their semantics are not proven equivalent.

## Separate migration gate

Before any production write: run the audit SQL, archive its output, manually review every non-eligible baseball-bat row and every sport conflict, approve the destination map, and implement a separately reviewed transaction with rollback counts. This PR performs none of those writes.
