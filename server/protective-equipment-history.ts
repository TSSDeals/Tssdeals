export type ProtectiveAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

const TARGETS = new Map([
  ["baseball", "bb-protective"],
  ["fastpitch-softball", "fp-protective"],
]);

const ACCESSORY_ONLY = [
  /\b(?:helmet|mask)\s+(?:decal|sticker|bag|case|cover|stand|rack|holder|mount)\b/i,
  /\b(?:replacement\s+)?(?:helmet\s+)?(?:padding|pad kit|chin strap|hardware|screws?|clips?|buckles?)\b/i,
  /\b(?:jaw|face)\s+guard\s+(?:only|replacement)\b/i,
  /\b(?:signed|autograph(?:ed)?)\b/i,
  /\b(?:mini|miniature|souvenir|novelty|toy|ornament)\b/i,
];

const PLAYABLE_PROTECTIVE_EQUIPMENT = [
  /\bcatcher(?:['’]s?)?\s+(?:gear|kit|set|box set|equipment|leg guards?)\b/i,
  /\b(?:catcher(?:['’]s?)?\s+)?(?:chest protector|leg guards?|shin guards?)\b/i,
  /\b(?:baseball\s+)?batting\s+helmet\b/i,
  /\bbaseball\s+helmet\b/i,
  /\bhelmet\b.{0,60}\b(?:baseball|batting|nocsae|face\s*mask)\b/i,
  /\b(?:fast\s*pitch|fastpitch|softball)\b.{0,60}\bfielders?(?:['’]s?)?\s+mask\b/i,
];

export function isApprovedHistoricalProtectiveEquipment(
  proposal: ProtectiveAuditProposal,
): boolean {
  const expectedEquipmentType = proposal.proposedSportId
    ? TARGETS.get(proposal.proposedSportId)
    : undefined;
  if (!expectedEquipmentType
      || proposal.proposedCanonicalEquipmentTypeId !== expectedEquipmentType
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (ACCESSORY_ONLY.some((pattern) => pattern.test(proposal.title))) return false;
  return PLAYABLE_PROTECTIVE_EQUIPMENT.some((pattern) => pattern.test(proposal.title));
}
