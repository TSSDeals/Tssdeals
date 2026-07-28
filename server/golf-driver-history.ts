export type GolfDriverAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

const NON_GOLF_DRIVER_PRODUCTS = [
  /\bdriver[- ]side\b/i,
  /\b(?:rearview|side view|heated)?\s*mirror(?:\s+glass)?\b/i,
  /\b(?:screwdriver|drill driver|impact driver|device driver|printer driver)\b/i,
  /\b(?:motor|speaker|subwoofer|vehicle|automotive|car|truck)\b/i,
  /\b(?:head\s*cover|headcover|club cover|driver cover)\b/i,
  /\b(?:shaft|adapter|sleeve|weight|wrench|grip)\s+(?:only|replacement)\b/i,
  /\b(?:team logo|hometown brands|novelty|souvenir|miniature|toy)\b/i,
  /\b(?:signed|autograph(?:ed)?|display case)\b/i,
];

const VERIFIED_GOLF_DRIVER_FAMILIES =
  /\b(?:dynapwr|dynapower|qi35|zxi|tsr[1234]?|gt[234]|hibore)\b/i;

export function isApprovedHistoricalGolfDriver(
  proposal: GolfDriverAuditProposal,
): boolean {
  if (proposal.proposedSportId !== "golf"
      || proposal.proposedCanonicalEquipmentTypeId !== "golf-drivers"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (!/\bdrivers?\b/i.test(proposal.title)) return false;
  if (NON_GOLF_DRIVER_PRODUCTS.some((pattern) => pattern.test(proposal.title))) return false;
  return proposal.currentSportId === "golf"
    || VERIFIED_GOLF_DRIVER_FAMILIES.test(proposal.title);
}
