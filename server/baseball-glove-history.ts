export type GloveAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

const EXCLUDED_PRODUCT_FORMS = [
  /\bbatting gloves?\b/i,
  /\bgolf gloves?\b/i,
  /\bhockey\b/i,
  /\b(?:work|rain|winter|football|goalie|hockey|boxing|garden|cycling|ski|snow)\s+gloves?\b/i,
  /\b(?:oven mitt|hot glove tennis mitt)\b/i,
  /\binner protective glove\b/i,
  /\bglove locks?\b/i,
  /\bglove accessor/i,
  /\b(?:pancake|paddle)\b.*\bglove\b/i,
  /\bsigned\b.*\b(?:gold glove|glove logo)\b/i,
  /\b(?:inschrift|signiert)\b/i,
];

const EXPLICIT_FIELDING_FORM =
  /\b(?:baseball\b.*\bglove|hardball\b.*\bglove|fielding\s+glove|infield(?:er)?(?:'s)?\s+glove|outfield(?:er)?(?:'s)?\s+glove|first[- ]base\s+mitt|catcher(?:'s)?\s+mitt)\b/i;

const ESTABLISHED_GLOVE_FAMILY =
  /\b(?:a2000|a2k|heart of the hide|pro preferred|pro select|rawlings r9|r9 series|glovesmith field commander)\b/i;

export function isApprovedHistoricalBaseballGlove(proposal: GloveAuditProposal): boolean {
  if (proposal.proposedSportId !== "baseball"
      || proposal.proposedCanonicalEquipmentTypeId !== "bb-gloves"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (EXCLUDED_PRODUCT_FORMS.some((pattern) => pattern.test(proposal.title))) return false;
  return EXPLICIT_FIELDING_FORM.test(proposal.title)
    || ESTABLISHED_GLOVE_FAMILY.test(proposal.title);
}
