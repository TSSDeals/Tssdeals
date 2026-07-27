export type GolfWedgeAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

const NON_CLUB_PRODUCTS = [
  /\b(?:headcovers?|club covers?|replacement shafts?|shaft adapters?|shaft sleeves?|ferrules?|grips?|grip kits?|wrenches?|weights?|stickers?|decals?)\b/i,
  /\b(?:bags?|racks?|organizers?|brushes?|towels?|cleaners?)\b/i,
  /\b(?:shirt|tee|hoodie|jacket|shorts|pants|hat|cap|sock|socks)\b/i,
  /\b(?:mini|miniature|souvenir|novelty|toy|ornament|keychain)\b/i,
  /\b(?:signed|autograph(?:ed)?)\b/i,
];

const EXPLICIT_WEDGE = [
  /\b(?:golf\s+)?(?:pitching|sand|gap|lob|approach|utility)\s+wedge\b/i,
  /\bwedge\b/i,
];

export function isApprovedHistoricalGolfWedge(
  proposal: GolfWedgeAuditProposal,
): boolean {
  if (proposal.proposedSportId !== "golf"
      || proposal.proposedCanonicalEquipmentTypeId !== "golf-wedges"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (NON_CLUB_PRODUCTS.some((pattern) => pattern.test(proposal.title))) return false;
  return EXPLICIT_WEDGE.some((pattern) => pattern.test(proposal.title));
}
