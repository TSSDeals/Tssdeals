export type FastpitchGloveAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

const NON_FIELDING_GLOVE_FORMS = [
  /\bbatting gloves?\b/i,
  /\b(?:golf|hockey|football|boxing|work|winter|ski)\s+gloves?\b/i,
  /\b(?:inner protective|pancake|paddle|training)\s+glove\b/i,
  /\b(?:glove locks?|glove care|glove conditioner|glove accessory)\b/i,
  /\b(?:signed|autograph(?:ed)?|memorabilia|display case)\b/i,
];

export function isApprovedHistoricalFastpitchGlove(
  proposal: FastpitchGloveAuditProposal,
): boolean {
  if (proposal.proposedSportId !== "fastpitch-softball"
      || proposal.proposedCanonicalEquipmentTypeId !== "fp-gloves"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (NON_FIELDING_GLOVE_FORMS.some((pattern) => pattern.test(proposal.title))) {
    return false;
  }
  return /\bfast\s*pitch\b/i.test(proposal.title)
    && /\b(?:glove|mitt)s?\b/i.test(proposal.title);
}
