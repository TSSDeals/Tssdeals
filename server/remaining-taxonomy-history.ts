export type RemainingTaxonomyAuditProposal = {
  dealId: string;
  title: string;
  sourceName: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  confidence: "high" | "medium" | "low";
};

type Destination = {
  sportId: string;
  equipmentTypeId: string;
};

type Rule = Destination & {
  required: RegExp[];
  excluded: RegExp[];
};

const RULES: Rule[] = [
  {
    sportId: "basketball",
    equipmentTypeId: "bk-balls",
    required: [/\bbasketball\b/i],
    excluded: [/\b(?:holder|rack|bag|pump|keychain|ornament|signed|autograph)\b/i],
  },
  {
    sportId: "basketball",
    equipmentTypeId: "bk-shoes-apparel",
    required: [/\bbasketball shoes?\b/i],
    excluded: [/\b(?:shirt|jersey|hoodie|shorts|pants|sock|bag|laces?|insole)\b/i],
  },
  {
    sportId: "cycling",
    equipmentTypeId: "cyc-bikes",
    required: [/\b(?:mountain bike|mountain bicycle|speed mountain bicycle)\b/i],
    excluded: [/\b(?:rack|carrier|cover|lock|helmet|gloves?|accessor(?:y|ies))\b/i],
  },
  {
    sportId: "fastpitch-softball",
    equipmentTypeId: "fp-balls",
    required: [/\bfast\s*pitch\b/i, /\bsoftballs?\b/i],
    excluded: [/\b(?:training|holder|bucket|bag|case|signed|autograph)\b/i],
  },
  {
    sportId: "fastpitch-softball",
    equipmentTypeId: "fp-training",
    required: [/\bfast\s*pitch\b/i, /\btraining balls?\b/i],
    excluded: [/\b(?:holder|bucket|bag|case|signed|autograph)\b/i],
  },
  {
    sportId: "football",
    equipmentTypeId: "fb-balls",
    required: [/\bfootball\b/i],
    excluded: [/\b(?:holder|rack|bag|pump|tee|keychain|ornament|signed|autograph)\b/i],
  },
  {
    sportId: "hockey",
    equipmentTypeId: "hk-sticks",
    required: [/\bhockey stick\b/i],
    excluded: [/\b(?:bag|rack|holder|tape|blade cover|keychain|ornament)\b/i],
  },
  {
    sportId: "slowpitch-softball",
    equipmentTypeId: "sp-balls",
    required: [/\bslow\s*pitch\b/i, /\bsoftballs?\b/i],
    excluded: [/\b(?:holder|bucket|bag|case|signed|autograph)\b/i],
  },
  {
    sportId: "slowpitch-softball",
    equipmentTypeId: "sp-gloves",
    required: [/\bslow\s*pitch\b/i, /\b(?:glove|mitt)s?\b/i],
    excluded: [/\b(?:batting gloves?|training|pancake|paddle|care|conditioner|locks?)\b/i],
  },
  {
    sportId: "volleyball",
    equipmentTypeId: "vb-balls",
    required: [/\bvolleyballs?\b/i],
    excluded: [/\b(?:holder|rack|bag|case|pump only|keychain|ornament|signed|autograph)\b/i],
  },
];

export function approvedRemainingDestination(
  proposal: RemainingTaxonomyAuditProposal,
): Destination | null {
  if (!["high", "medium"].includes(proposal.confidence)) return null;
  const rule = RULES.find((candidate) =>
    candidate.sportId === proposal.proposedSportId
      && candidate.equipmentTypeId === proposal.proposedCanonicalEquipmentTypeId);
  if (!rule) return null;
  if (!rule.required.every((pattern) => pattern.test(proposal.title))) return null;
  if (rule.excluded.some((pattern) => pattern.test(proposal.title))) return null;
  return { sportId: rule.sportId, equipmentTypeId: rule.equipmentTypeId };
}
