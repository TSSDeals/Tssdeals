export type BaseballBallAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

const NON_PLAYABLE_BASEBALLS = [
  /\b(?:signed|autograph(?:ed|s)?|signature|facsimile)\b/i,
  /\b(?:display|holder|cube|case|stand|rack|basket|bag|bucket)\b/i,
  /\b(?:novelty|souvenir|ornament|keychain|toy|miniature|replica)\b/i,
  /\b(?:safe[- ]?t(?:[- ]?ball)?|safe[- ]?t[- ]?soft|safety\s+t[- ]?ball|plastic|vented|foam|wiffle)\b/i,
  /\b(?:training|reaction|weighted|pitching machine)\b.*\b(?:base)?balls?\b/i,
  /\b(?:blank|unmarked)\b.*\bautog/i,
];

export function isApprovedHistoricalBaseballBall(
  proposal: BaseballBallAuditProposal,
): boolean {
  if (proposal.proposedSportId !== "baseball"
      || proposal.proposedCanonicalEquipmentTypeId !== "bb-balls"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (!/\bbaseballs?\b/i.test(proposal.title)) return false;
  if (NON_PLAYABLE_BASEBALLS.some((pattern) => pattern.test(proposal.title))) {
    return false;
  }
  return true;
}
