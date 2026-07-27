export type SoftballBatAuditProposal = {
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
  ["fastpitch-softball", "fp-bats"],
  ["slowpitch-softball", "sp-bats"],
]);

const ACCESSORY_OR_COLLECTIBLE = [
  /\b(?:bat|barrel)\s+(?:grip|tape|wrap|sleeve|cover|bag|case|rack|holder|mount|display|stand|weight|donut|sensor|cleaner|brush|decal|sticker|keychain|key ring|bottle opener)\b/i,
  /\b(?:grip|tape|wrap|sleeve|cover|bag|case|rack|holder|mount|display|stand|weight|donut|sensor)\s+(?:for\s+)?(?:a\s+)?(?:softball\s+)?bat\b/i,
  /\b(?:end cap|replacement knob|bat knob|batting tee|hitting tee)\b/i,
  /\b(?:mini|miniature|souvenir|novelty|toy|ornament)\b.{0,60}\b(?:softball\s+)?bat\b/i,
  /\b(?:signed|autograph(?:ed)?)\b.*\b(?:softball\s+)?bat\b/i,
  /\b(?:softball\s+)?bat\b.*\b(?:signed|autograph(?:ed)?)\b/i,
];

const FASTPITCH_BAT = [
  /\b(?:fast\s*pitch|fastpitch)\b.{0,80}\b(?:softball\s+)?bat\b/i,
  /\b(?:softball\s+)?bat\b.{0,80}\b(?:fast\s*pitch|fastpitch)\b/i,
];

const SLOWPITCH_BAT = [
  /\b(?:slow\s*pitch|slowpitch)\b.{0,80}\b(?:softball\s+)?bat\b/i,
  /\b(?:softball\s+)?bat\b.{0,80}\b(?:slow\s*pitch|slowpitch)\b/i,
];

export function isApprovedHistoricalSoftballBat(
  proposal: SoftballBatAuditProposal,
): boolean {
  const expectedEquipmentType = proposal.proposedSportId
    ? TARGETS.get(proposal.proposedSportId)
    : undefined;
  if (!expectedEquipmentType
      || proposal.proposedCanonicalEquipmentTypeId !== expectedEquipmentType
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (ACCESSORY_OR_COLLECTIBLE.some((pattern) => pattern.test(proposal.title))) return false;
  const patterns = proposal.proposedSportId === "fastpitch-softball"
    ? FASTPITCH_BAT
    : SLOWPITCH_BAT;
  return patterns.some((pattern) => pattern.test(proposal.title));
}
