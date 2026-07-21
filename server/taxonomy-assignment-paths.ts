export type TaxonomyAssignmentStage =
  | "seed"
  | "ingestion"
  | "persistence"
  | "classification"
  | "admin"
  | "read-projection";

export interface TaxonomyAssignmentPath {
  id: string;
  stage: TaxonomyAssignmentStage;
  files: string[];
  assigns: Array<"sport" | "equipment" | "sub-filter" | "brand" | "display-group">;
  mechanism: string;
  noncanonicalEntryRisk: string;
  phase0Control: string;
}

/**
 * Source-controlled inventory of every path that can assign or project a
 * taxonomy value. Phase 1 reports this registry; it does not alter any path.
 */
export const TAXONOMY_ASSIGNMENT_PATHS: readonly TaxonomyAssignmentPath[] = [
  {
    id: "approved-static-seed",
    stage: "seed",
    files: ["server/storage.ts", "server/startup-migrations.ts"],
    assigns: ["sport", "equipment"],
    mechanism: "Approved code-owned seed, only for a materially empty database.",
    noncanonicalEntryRisk: "Seed labels are legacy display labels and are not a canonical registry.",
    phase0Control: "Versioned approved-seed migration; partial or existing taxonomy is never filled on restart.",
  },
  {
    id: "ebay-keyword-category-seller",
    stage: "ingestion",
    files: ["server/deal-sync-scheduler.ts", "server/ebay-api.ts"],
    assigns: ["sport", "equipment", "sub-filter"],
    mechanism: "Keyword, category, and seller-loop defaults followed by batting-glove and attribute rules.",
    noncanonicalEntryRisk: "Broad Baseball & Softball categories default to *-other; keyword loops use a live-taxonomy fallback.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "cj-affiliate",
    stage: "ingestion",
    files: ["server/deal-sync-scheduler.ts", "server/cj-affiliate.ts"],
    assigns: ["sport", "equipment", "sub-filter"],
    mechanism: "Partner sport scope, live-taxonomy default, title equipment rules, and shared attribute parser.",
    noncanonicalEntryRisk: "Live taxonomy supplies the fallback ID, so duplicate legacy rows can be selected upstream.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "impact-catalog",
    stage: "ingestion",
    files: ["server/deal-sync-scheduler.ts", "server/impact-api.ts"],
    assigns: ["sport", "equipment"],
    mechanism: "Category/title/advertiser detection and prefix-based lookup against live equipment IDs.",
    noncanonicalEntryRisk: "Unknown catalogs fall back to Baseball and then to the first matching live ID or bb-other.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "amazon",
    stage: "ingestion",
    files: ["server/deal-sync-scheduler.ts", "server/amazon-api.ts"],
    assigns: ["sport", "equipment", "sub-filter"],
    mechanism: "Scheduler sport/equipment fallback plus batting-glove and shared attribute rules.",
    noncanonicalEntryRisk: "The selected live-taxonomy default can be Other or a legacy first row.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "shareasale-rakuten",
    stage: "ingestion",
    files: ["server/deal-sync-scheduler.ts", "server/shareasale.ts", "server/rakuten-api.ts"],
    assigns: ["sport", "equipment"],
    mechanism: "Scheduler sport keyword and live-taxonomy default passed through source converters.",
    noncanonicalEntryRisk: "Generic *-other or first-row fallback persists when source evidence is weak.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "shopify",
    stage: "ingestion",
    files: ["server/shopify-sync.ts", "server/shopify-multi-store-sync.ts"],
    assigns: ["sport", "equipment", "sub-filter"],
    mechanism: "Collection/store mappings, category/title heuristics, batting-glove guard, and shared attributes.",
    noncanonicalEntryRisk: "Store defaults and independently maintained maps can diverge from other importers.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "woocommerce",
    stage: "ingestion",
    files: ["server/woocommerce-sync.ts"],
    assigns: ["sport", "equipment", "sub-filter"],
    mechanism: "WooCommerce category/tag/title rules followed by shared attribute parsing.",
    noncanonicalEntryRisk: "Source-specific rules are not backed by a shared canonical alias registry.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "playitagain",
    stage: "ingestion",
    files: ["server/playitagain-sync.ts"],
    assigns: ["sport", "equipment", "sub-filter"],
    mechanism: "Scrape category definition, batting-glove guard, and shared attribute parsing.",
    noncanonicalEntryRisk: "Category definitions are source-local and can preserve legacy IDs.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "sidelineswap",
    stage: "ingestion",
    files: ["server/sidelineswap.ts"],
    assigns: ["sport", "equipment", "sub-filter"],
    mechanism: "Marketplace category map followed by batting-glove and shared attribute rules.",
    noncanonicalEntryRisk: "Marketplace category vocabulary is translated by a separate static map.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "baseball-resale",
    stage: "ingestion",
    files: ["server/baseball-resale-sync.ts"],
    assigns: ["sport", "equipment"],
    mechanism: "Seller tags map directly to Baseball IDs, with bb-other fallback.",
    noncanonicalEntryRisk: "Unknown or incomplete tags accumulate in Other.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "fanatics-feed",
    stage: "ingestion",
    files: ["server/fanatics-sync.ts", "server/deal-sync-scheduler.ts"],
    assigns: ["sport", "equipment"],
    mechanism: "Sport keyword detection with downstream storage of the selected existing classification.",
    noncanonicalEntryRisk: "Merchandise/team terms can be mistaken for equipment or a sport.",
    phase0Control: "May assign existing IDs only; cannot create taxonomy rows.",
  },
  {
    id: "bulk-upsert-and-brand-normalization",
    stage: "persistence",
    files: ["server/storage.ts", "server/brand-normalizer.ts"],
    assigns: ["sport", "equipment", "sub-filter", "brand"],
    mechanism: "Persists importer values, canonicalizes known brand spellings, and drops unknown legacy single sub-filter IDs.",
    noncanonicalEntryRisk: "Existing sport/equipment IDs are not canonicalized; updates do not replace stored sport/equipment values.",
    phase0Control: "No taxonomy rows are created; startup does not call the upsert path.",
  },
  {
    id: "shared-sub-filter-classifier",
    stage: "classification",
    files: ["server/sub-filter-classifier.ts"],
    assigns: ["sub-filter"],
    mechanism: "Title rules derive multi-tags, sizeNumber, and dropWeight for supported equipment IDs.",
    noncanonicalEntryRisk: "Definitions are keyed to specific equipment IDs, so aliases can miss equivalent rules.",
    phase0Control: "Backfill/reclassification is explicit Admin or maintenance work, never startup work.",
  },
  {
    id: "ai-auto-classification",
    stage: "classification",
    files: ["server/ai-classifier.ts", "server/deal-sync-scheduler.ts"],
    assigns: ["sport", "equipment", "sub-filter"],
    mechanism: "Daily AI pass chooses from the complete live taxonomy; high-confidence decisions can update deals.",
    noncanonicalEntryRisk: "Duplicate live IDs are presented as valid vocabulary and can reinforce fragmentation.",
    phase0Control: "Unknown categories become review proposals; AI cannot publish live taxonomy rows.",
  },
  {
    id: "ai-review-approval",
    stage: "admin",
    files: ["server/ai-classifier.ts", "server/routes.ts", "server/taxonomy-approval.ts"],
    assigns: ["sport", "equipment", "sub-filter"],
    mechanism: "Authenticated Admin approval may create a proposed taxonomy row and update the originating deal.",
    noncanonicalEntryRisk: "Slug generation is label-based and does not check a canonical alias registry.",
    phase0Control: "Requires reviewer identity and a pending proposal; never automatic.",
  },
  {
    id: "admin-taxonomy-and-deal-edit",
    stage: "admin",
    files: ["server/routes.ts", "server/storage.ts"],
    assigns: ["sport", "equipment", "sub-filter", "brand"],
    mechanism: "Authenticated Admin taxonomy creation and direct deal classification editing.",
    noncanonicalEntryRisk: "Manual selection can preserve duplicates because no canonical registry exists yet.",
    phase0Control: "Authenticated, intentional request; not invoked by startup or importers.",
  },
  {
    id: "search-read-projection",
    stage: "read-projection",
    files: ["server/deal-search.ts", "server/routes.ts", "shared/equipment-groups.ts", "client/src/pages/Deals.tsx"],
    assigns: ["sport", "equipment", "display-group"],
    mechanism: "Bounded Bat/Glove recovery and result-only canonical grouping without database writes.",
    noncanonicalEntryRisk: "Projection aliases cover only curated Bat/Glove cases and can diverge from stored IDs.",
    phase0Control: "Read-only object projection; stored classification is never mutated.",
  },
] as const;
