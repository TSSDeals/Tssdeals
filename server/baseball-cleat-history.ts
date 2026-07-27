export type BaseballCleatAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

const NON_CLEAT_PRODUCTS = [
  /\b(?:replacement|replaceable)\b.{0,30}\b(?:cleats?|spikes?|studs?)\b/i,
  /\b(?:cleat|shoe)\s+(?:covers?|bags?|laces?|inserts?|insoles?|deodorizers?|cleaners?|brushes?)\b/i,
  /\b(?:spike|stud)\s+(?:kits?|packs?|wrenches?|tools?)\b/i,
  /\b(?:laces?|insoles?|inserts?|heel cups?|shoe trees?)\b/i,
  /\b(?:shirt|tee|hoodie|jacket|shorts|pants|hat|cap|sock|socks)\b/i,
  /\b(?:mini|miniature|souvenir|novelty|toy|ornament|keychain)\b/i,
  /\b(?:signed|autograph(?:ed)?|display case)\b/i,
];

export function isApprovedHistoricalBaseballCleat(
  proposal: BaseballCleatAuditProposal,
): boolean {
  if (proposal.proposedSportId !== "baseball"
      || proposal.proposedCanonicalEquipmentTypeId !== "bb-cleats"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (NON_CLEAT_PRODUCTS.some((pattern) => pattern.test(proposal.title))) return false;
  return /\bbaseball\b/i.test(proposal.title)
    && /\bcleats?\b/i.test(proposal.title);
}
