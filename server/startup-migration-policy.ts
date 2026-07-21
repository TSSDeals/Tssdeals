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
    checksum: "6fb9ac49ce4fccdda49293a4f79327849ffdebd4da0badf6fec891d84123e2b9",
    kind: "structural",
    description: "Existing application compatibility tables, columns, and indexes",
  },
  {
    id: "20260721_002_approved_static_seed",
    checksum: "1de41c870a7cc8edc6693ac29f02815ddfd0a14f8d5c0d2d4858de0f30946c9e",
    kind: "approved-seed",
    description: "Existing approved static taxonomy/application seed",
  },
] as const;
