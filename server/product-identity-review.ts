export type IdentityReviewCandidate = {
  deal_id: string;
  confidence: string;
  evidence: unknown;
  title: string;
  deal_sport_id: string | null;
  deal_equipment_type_id: string | null;
  canonical_brand: string;
  product_family: string;
  model_code: string | null;
  sport_id: string;
  equipment_type_id: string;
  identity_confidence: string;
  variant: unknown;
};

function evidenceList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function isSafeIdentityApproval(candidate: IdentityReviewCandidate): boolean {
  const evidence = evidenceList(candidate.evidence);
  if (candidate.confidence !== "high" || candidate.identity_confidence !== "high") return false;
  if (!candidate.canonical_brand || !candidate.product_family) return false;
  if (candidate.deal_sport_id !== candidate.sport_id) return false;
  if (candidate.deal_equipment_type_id !== candidate.equipment_type_id) return false;
  if (!evidence.some((item) => item.startsWith("recognized ") && item.endsWith(" model family in title"))) {
    return false;
  }

  const exactVariantEvidence = [
    "size",
    "throw hand",
    "bat length and weight",
    "certification",
    "golf handedness",
    "golf loft",
    "shaft flex",
    "iron set composition",
    "head-only club component",
  ].filter((item) => evidence.includes(item)).length;
  return evidence.includes("model/style code") || exactVariantEvidence >= 2;
}

export function safeIdentityApprovalBatch(
  candidates: IdentityReviewCandidate[],
  requestedLimit: number,
): IdentityReviewCandidate[] {
  const limit = Math.max(1, Math.min(25, Math.trunc(requestedLimit) || 10));
  return candidates.filter(isSafeIdentityApproval).slice(0, limit);
}
