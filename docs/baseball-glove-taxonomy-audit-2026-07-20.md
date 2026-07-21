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

## 2026-07-21 focused A2000 findings

Live search confirmed that the remaining misses are evidence-normalization problems, not a reason for a broader taxonomy redesign:

- `2026 Wilson Spring A2000® 1786 11.5” Infield Baseball: WBW104133115` is stored under Baseball / `bb-training` and was not projected. The trademark symbol broke the prior literal `A2000 1786` pattern, while `infield baseball` was not recognized as an explicit fielding phrase.
- `2025 Wilson Tennis A2000® 1786SS 11.5” :WBW104177115` is stored under Baseball / `bb-other` and was not projected. The trademark symbol and `1786SS` suffix were not handled. “Tennis” is the special-edition theme, not the product sport.
- Equivalent Tennis and Spring listings from other sellers are already projected from `tennis`/`ten-other` or `bb-other`, proving that read projection is the correct bounded mechanism.
- The reported Evolusivo listing is assigned to a legacy `Gloves` view. Its explicit `Baseball Glove` phrase and A2000 + 1786 + 11.5 evidence qualify it for canonical projection.

The read evidence now accepts trademark punctuation, up to three intervening theme/collection words between A2000/A2K and the known 1786/1786SS glove pattern, and the explicit phrase `infield baseball`. A2K/family listings may also qualify through a valid glove size plus specific structured seller/category fields. Arbitrary raw JSON is not searched.

Theme words alone do not establish classification. For example, an A2000-labeled tennis racquet with an 11.5 value but no known glove pattern, explicit fielding phrase, or baseball-glove seller/category evidence remains excluded. The expanded audit query reports the stored sport/equipment IDs, proposed canonical read group, and evidence reason for later cleanup; it performs no updates.
