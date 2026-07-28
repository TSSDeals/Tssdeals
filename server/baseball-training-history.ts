export type BaseballTrainingAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

const BASEBALL_TRAINING_FAMILIES = [
  /\b(?:baseball\s+)?batting\s+tees?\b/i,
  /\btee\s*ball\s+set\b/i,
  /\bbaseball\s+pitching\s+machines?\b/i,
  /\bpitching\s+machine\s+baseballs?\b/i,
  /\bdimpled\s+baseballs?\b/i,
];

const NON_BASEBALL_TRAINING_PRODUCTS = [
  /\b(?:golf|football|soccer|basketball|lacrosse|hockey)\b/i,
  /\b(?:replacement|spare)\s+(?:part|net|motor|spring|wheel|tube)\b/i,
  /\b(?:cover|case|bag|holder|stand|rack)\s+(?:only|replacement)\b/i,
  /\b(?:shirt|jersey|hoodie|hat|cap|poster|card|collectible)\b/i,
  /\b(?:signed|autograph(?:ed)?|memorabilia|novelty|souvenir)\b/i,
];

export function isApprovedHistoricalBaseballTraining(
  proposal: BaseballTrainingAuditProposal,
): boolean {
  if (proposal.proposedSportId !== "baseball"
      || proposal.proposedCanonicalEquipmentTypeId !== "bb-training"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (NON_BASEBALL_TRAINING_PRODUCTS.some((pattern) => pattern.test(proposal.title))) {
    return false;
  }
  return BASEBALL_TRAINING_FAMILIES.some((pattern) => pattern.test(proposal.title));
}
