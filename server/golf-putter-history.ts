export type GolfPutterAuditProposal = {
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
  /\b(?:headcovers?|putter covers?|club covers?|replacement shafts?|shaft only|shaft adapters?|shaft sleeves?|ferrules?)\b/i,
  /\b(?:grips?|grip kits?|ball markers?|marker holders?|holders?|wrenches?|weights?|stickers?|decals?|accessor(?:y|ies))\b/i,
  /\b(?:bags?|racks?|organizers?|putting mats?|putting gates?|putting mirrors?|training aids?|training mats?|brushes?|towels?|cleaners?)\b/i,
  /\b(?:shirt|tee|hoodie|jacket|shorts|pants|hat|cap|sock|socks)\b/i,
  /\b(?:mini|miniature|souvenir|novelty|toy|ornament|keychain)\b/i,
  /\b(?:signed|autograph(?:ed)?)\b/i,
];

export function isApprovedHistoricalGolfPutter(
  proposal: GolfPutterAuditProposal,
): boolean {
  if (proposal.proposedSportId !== "golf"
      || proposal.proposedCanonicalEquipmentTypeId !== "golf-putters"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (NON_CLUB_PRODUCTS.some((pattern) => pattern.test(proposal.title))) return false;
  return /\bputter\b/i.test(proposal.title);
}
