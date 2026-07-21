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
