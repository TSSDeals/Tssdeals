# Baseball glove taxonomy and size audit

This is a read-only audit. The accompanying SQL contains only `SELECT` statements and must be run against production before any separately reviewed migration.

## Live taxonomy evidence

The public production taxonomy on 2026-07-20 returned two baseball glove-related records:

| ID | Label | Origin | Newest 10,000 visible deals | Decision |
|---|---|---|---:|---|
| `bb-gloves` | Gloves | seeded | 1,171 | canonical fielding-glove destination; display as **Baseball Gloves** |
| `bb-batting-gloves` | Batting Gloves | seeded | 131 | preserve as a separate category |

The reported labels `Glove`, `Baseball Glove`, and `Baseball Gloves` were not present in the public taxonomy response at audit time. The read group nevertheless accepts their predictable compatibility IDs—`glove`, `baseball-glove`, and `baseball-gloves`—plus `gloves`, because historical or environment-specific rows can otherwise fragment reads. Expansion occurs only with the Baseball sport constraint, so the live golf `gloves` ID is not merged into baseball browsing.

Other live glove records remain separate: fastpitch `fp-gloves`, slowpitch `sp-gloves`, baseball/softball batting-glove types, golf `gloves` and `golf-glove`, boxing `boxing-gloves`, and cricket `batting-glove`.

## Rule provenance

- `server/storage.ts` seeds `bb-gloves`.
- Startup classification in `server/index.ts` maps glove/mitt patterns to `bb-gloves` and has a non-baseball exclusion pass.
- Baseball resale, CJ, eBay, Shopify, Shopify multi-store, SidelineSwap, WooCommerce, Amazon/Rakuten/ShareASale search mappings, and route reclassification rules target `bb-gloves`.
- Generic collection mappings such as `glove` and `gloves` are normalized to `bb-gloves` by importers; no repository mapping intentionally emits the compatibility IDs.
- `bb-batting-gloves` and the fastpitch/slowpitch glove IDs are intentionally excluded from the canonical baseball fielding-glove group.

## Size root cause

The live `bb-gloves` sub-filter list uses UUID IDs and labels such as `11.5"`. The previous read path recognized numeric size labels only when they began with `Size `; otherwise it used punctuation-sensitive literal matching. Consequently `11.5`, `11.5"`, `11.5 inch`, and `11.5-inch` did not behave as one value, and missing tags discarded otherwise valid search hits.

The read fix normalizes the selected label, title evidence, and `size_number` to the same numeric value while retaining both the legacy `sub_filter_id` and joined `deal_sub_filters` matches. The authoritative production completeness counts are produced by `script/baseball-glove-taxonomy-audit.sql`.

## Bounded recovery and manual review

Positive recovery is limited to explicit fielding-glove language and a small set of strong fielding-model evidence, including Wilson A2000/A2K, A2000 1786, Heart of the Hide, and Pro Preferred. Recovery inspects title and brand, not arbitrary serialized retailer payloads.

Stored fastpitch, slowpitch, golf, boxing, and cricket classifications block recovery. Titles containing batting, golf, boxing, winter, work, garden, football/goalkeeper, hockey, lacrosse, motorcycle/cycling, ski/snow, fastpitch, slowpitch, or softball glove evidence also remain excluded. Glove accessories such as liners, dryers, oil, conditioner, and care kits are excluded.

No taxonomy record or deal assignment is changed by this PR.
