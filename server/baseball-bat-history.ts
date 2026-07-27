export type BatAuditProposal = {
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
  /\b(?:pine tar|bat wax|batting aid)\b/i,
  /\b(?:bat|barrel)\s+(?:grip|tape|wrap|sleeve|cover|bag|case|rack|holder|mount|display|stand|weight|donut|sensor|cleaner|brush|decal|sticker|keychain|key ring|bottle opener)\b/i,
  /\b(?:grip|tape|wrap|sleeve|cover|bag|case|rack|holder|mount|display|stand|weight|donut|sensor)\s+(?:for\s+)?(?:a\s+)?(?:baseball\s+)?bat\b/i,
  /\b(?:end cap|replacement knob|bat knob)\b/i,
  /\b(?:batting tee|hitting tee)\b/i,
  /\b(?:mini|miniature|souvenir|novelty|toy|ornament)\b.{0,60}\b(?:baseball\s+)?bat\b/i,
  /\b(?:signed|autograph(?:ed)?)\b.*\b(?:baseball\s+)?bat\b/i,
  /\b(?:baseball\s+)?bat\b.*\b(?:signed|autograph(?:ed)?)\b/i,
];

const EXPLICIT_PLAYABLE_BAT = [
  /\bbaseball\s+bat\b/i,
  /\bbaseball\s+(?:training\s+)?bat\b/i,
  /\b(?:bbcor|usssa|usa baseball)\b.*\bbat\b/i,
  /\b(?:t(?:ee)?[\s-]?ball|fungo|wood)\s+(?:baseball\s+)?bat\b/i,
];

const ESTABLISHED_BAT_MODEL =
  /\b(?:hype fire|cat\s*x2?|catx2?|cat 8|cat8|atlas|supra|meta|zen|the goods|zoa|icon|vibe|nova lit|omaha|select pwr|stealth|maxum|cf3|threat|avenge pro)\b/i;
const BAT_SIZE_OR_CERTIFICATION =
  /(?:\b(?:bbcor|usssa|usa baseball|drop\s*-?\d+)\b|(?:^|[\s(])-(?:3|5|8|10|11|12|13)\b|\b\d{2}(?:\.\d+)?\s*\/\s*\d{2}(?:\.\d+)?\b|\b\d{2}(?:\.\d+)?\s*(?:in(?:ch(?:es)?)?\b|["”]))/i;

export function isApprovedHistoricalBaseballBat(proposal: BatAuditProposal): boolean {
  if (proposal.proposedSportId !== "baseball"
      || proposal.proposedCanonicalEquipmentTypeId !== "bb-bats"
      || !["high", "medium"].includes(proposal.confidence)) {
    return false;
  }
  if (EXCLUDED_PRODUCT_FORMS.some((pattern) => pattern.test(proposal.title))) return false;
  return EXPLICIT_PLAYABLE_BAT.some((pattern) => pattern.test(proposal.title))
    || (/\bbat\b/i.test(proposal.title)
      && BAT_SIZE_OR_CERTIFICATION.test(proposal.title))
    || (ESTABLISHED_BAT_MODEL.test(proposal.title)
      && BAT_SIZE_OR_CERTIFICATION.test(proposal.title));
}
