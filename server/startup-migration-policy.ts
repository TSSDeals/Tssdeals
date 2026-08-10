export const STARTUP_POLICY = Object.freeze({
  allowedKinds: ["structural", "approved-seed"] as const,
  forbiddenKinds: [
    "deal-classification",
    "deal-reclassification",
    "dynamic-taxonomy",
    "corrective-maintenance",
    "backfill",
    "cleanup",
  ] as const,
});

export const STARTUP_MIGRATION_MANIFEST = [
  {
    id: "20260721_001_phase0_structural_compatibility",
    checksum: "80e8e383054890fc103fa980748ec5df5a4c8fb7258fa1212da82c7a552e360f",
    kind: "structural",
    description: "Existing application compatibility tables, columns, and indexes",
  },
  {
    id: "20260721_002_approved_static_seed",
    checksum: "f611bfa028bfcf58a259344ad25c7efb65f5ff715305b53826a08063a88cc1a6",
    kind: "approved-seed",
    description: "Existing approved static taxonomy/application seed",
  },
  {
    id: "20260726_003_private_operations_tables",
    checksum: "2a18a96ab7c519045792abdc179e7fb41acd613ab7d5a7ccf9f341a6b4c8df21",
    kind: "structural",
    description: "Private wholesale catalog and business ledger tables",
  },
  {
    id: "20260726_004_wholesale_retail_identity",
    checksum: "92cda15aa66c5f99994aa90654061e21fe8f118711bb575912f104ae89202731",
    kind: "structural",
    description: "Evidence-backed retail identity fields for private wholesale products",
  },
  {
    id: "20260726_005_business_ledger_financial_fields",
    checksum: "3d4955b05d6533b616650db739d4dc8fe0b5f606cf9276aef05d5d1dd82e5e88",
    kind: "structural",
    description: "Sortable ledger fields using workbook net profit and break-even values",
  },
  {
    id: "20260728_006_product_identity_foundation",
    checksum: "1356a1df06c892bda17cbb43184f85956079bc0348183543b21c182dcff08d7e",
    kind: "structural",
    description: "Persistent review-first product family and exact variant identities",
  },
  {
    id: "20260728_007_demand_brain_foundation",
    checksum: "fa05fb1ef08bed341de39ca39dfd74f647a3d44f2c8365e53abaed714169b99e",
    kind: "structural",
    description: "Daily approved-identity market observations for rolling demand intelligence",
  },
  {
    id: "20260728_008_product_research_observations",
    checksum: "ac275fa86d46f9421ed79570a54b7c0d902993a22d81f71c52091e6d4de74cff",
    kind: "structural",
    description: "Aggregate-only authenticated product research observations",
  },
  {
    id: "20260729_009_product_research_reviews",
    checksum: "640cd1ba097a70f24d5e3bbfbf27bbf2ba9418204e2b0c4d845ea67c9bce83f4",
    kind: "structural",
    description: "Reviewed Product Research targets with insufficient trustworthy market data",
  },
  {
    id: "20260730_010_private_financial_foundation",
    checksum: "d8bf75a6073f51ae382444188a16535978524db410d419318232025d9579f62d",
    kind: "structural",
    description: "Private read-only financial accounts, statement imports, and transactions",
  },
  {
    id: "20260803_011_onedrive_ledger_connection",
    checksum: "d41da6868b8d1791a3a44ce46a3ff50d2e5fd487f9c4e9a9615bc948f35f8c7c",
    kind: "structural",
    description: "Encrypted private OneDrive authorization and ledger sync state",
  },
  {
    id: "20260810_012_email_deal_inbox_media",
    checksum: "97867aa5c96aecce57d7520c618d076d54584cb2a3feab27aaf2870051fa25f7",
    kind: "structural",
    description: "Durable media storage for owner-approved emailed deal submissions",
  },
  {
    id: "20260810_013_repair_email_deal_inbox_media",
    checksum: "8a3fefc67125d4dd7e3b9b933133e98448972c0e0e6aa65f41dbe87d9f6d968d",
    kind: "structural",
    description: "Idempotently repair missing emailed-deal media storage",
  },
] as const;

export type ApprovedSeedState = "empty" | "satisfied" | "partial";

export function classifyApprovedSeedState(facts: {
  sportsCount: number;
  equipmentCount: number;
  sourcesCount: number;
  hasBaseballBats: boolean;
  hasBaseballGloves: boolean;
}): ApprovedSeedState {
  if (facts.sportsCount === 0 && facts.equipmentCount === 0 && facts.sourcesCount === 0) {
    return "empty";
  }
  if (facts.sportsCount > 0 && facts.equipmentCount > 0 && facts.sourcesCount > 0
      && facts.hasBaseballBats && facts.hasBaseballGloves) {
    return "satisfied";
  }
  return "partial";
}
