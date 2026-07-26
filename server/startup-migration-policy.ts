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
