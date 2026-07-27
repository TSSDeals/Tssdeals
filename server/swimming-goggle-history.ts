export type SwimmingGoggleAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

const NON_GOGGLE_PRODUCTS = [
  /\bgoggles?\s+(?:case|pouch|bag|strap|bungee|lens|lenses|replacement)\b/i,
  /\b(?:case|pouch|bag|strap|bungee|lens|lenses)\s+(?:for\s+)?(?:swim(?:ming)?\s+)?goggles?\b/i,
  /\b(?:replacement|spare)\b.{0,30}\b(?:lens|lenses|strap|bungee|nose piece|nose bridge)\b/i,
  /\b(?:anti[- ]?fog|defogger)\s+(?:spray|solution|drops|wipes?|cloth)\b/i,
  /\b(?:swim cap|snorkel|fins?|ear plugs?|nose clips?)\b/i,
  /\b(?:toy|novelty|ornament|keychain|signed|autograph(?:ed)?)\b/i,
];

export function isApprovedHistoricalSwimmingGoggle(
  proposal: SwimmingGoggleAuditProposal,
): boolean {
  if (proposal.proposedSportId !== "swimming"
      || proposal.proposedCanonicalEquipmentTypeId !== "swim-goggles"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (NON_GOGGLE_PRODUCTS.some((pattern) => pattern.test(proposal.title))) return false;
  return /\b(?:swim|swimming)\s+goggles?\b/i.test(proposal.title);
}
