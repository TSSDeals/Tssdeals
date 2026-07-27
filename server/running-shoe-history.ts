export type RunningShoeAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

const NON_SHOE_PRODUCTS = [
  /\b(?:insoles?|inserts?|orthotics?|laces?|shoelaces?|shoe laces?|shoe bags?|shoe cases?|shoe covers?|shoe cleaners?|shoe deodorizers?|replacement soles?|outsoles?|spike wrenches?)\b/i,
  /\b(?:shirt|tee|hoodie|jacket|shorts|pants|hat|cap|sock|socks)\b/i,
  /\b(?:mini|miniature|souvenir|novelty|toy|ornament|keychain)\b/i,
  /\b(?:signed|autograph(?:ed)?)\b/i,
];

const EXPLICIT_RUNNING_SHOE = [
  /\b(?:road|trail)?\s*running\s+(?:shoe|shoes|sneaker|sneakers)\b/i,
  /\b(?:shoe|shoes|sneaker|sneakers)\b.{0,35}\b(?:road|trail)\s+running\b/i,
];

export function isApprovedHistoricalRunningShoe(
  proposal: RunningShoeAuditProposal,
): boolean {
  if (proposal.proposedSportId !== "running"
      || proposal.proposedCanonicalEquipmentTypeId !== "run-shoes"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (NON_SHOE_PRODUCTS.some((pattern) => pattern.test(proposal.title))) return false;
  return EXPLICIT_RUNNING_SHOE.some((pattern) => pattern.test(proposal.title));
}
