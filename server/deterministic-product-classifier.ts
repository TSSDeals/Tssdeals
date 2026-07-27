export type DeterministicProductCategory = {
  sportId: string;
  equipmentTypeId: string;
  confidence: "high";
  reason: string;
};

const SIGNED_OR_DISPLAY =
  /\b(?:autograph(?:ed)?|hand[ -]?signed|signed\s+by|memorabilia|collectible|display\s+(?:case|stand|mount)|wall\s+mount)\b/i;
const NON_FIELDING_GLOVE =
  /\b(?:batting|golf|boxing|work|winter|rain|football|receiver|goalkeeper)\s+gloves?\b|\bsliding\s+mitt\b|\b(?:glove|mitt)\s+(?:laces?|repair\s+kits?|care|conditioner|mallet|wrap|accessor(?:y|ies))\b/i;
const FIELDING_GLOVE =
  /\b(?:baseball|fielding|infield|outfield|pitcher(?:'s)?|catcher(?:'s)?|first[ -]?base)\b.{0,60}\b(?:glove|mitt)s?\b|\b(?:glove|mitt)s?\b.{0,60}\b(?:baseball|fielding|infield|outfield|pitcher(?:'s)?|catcher(?:'s)?|first[ -]?base)\b/i;
const FASTPITCH_BAT =
  /\bfast\s*pitch\b.{0,60}\bbats?\b|\bbats?\b.{0,60}\bfast\s*pitch\b/i;
const SLOWPITCH_BAT =
  /\bslow\s*pitch\b.{0,60}\bbats?\b|\bbats?\b.{0,60}\bslow\s*pitch\b/i;
const BASEBALL_BAT =
  /\b(?:baseball|bbcor|usssa|usa\s+baseball|tee[ -]?ball|t[ -]?ball)\b.{0,60}\bbats?\b|\bbats?\b.{0,60}\b(?:baseball|bbcor|usssa|usa\s+baseball)\b/i;
const RUNNING_SHOE =
  /\b(?:road|trail|cross[ -]?country)?\s*running\s+(?:shoes?|sneakers?)\b|\b(?:shoes?|sneakers?)\b.{0,30}\b(?:road|trail|cross[ -]?country)\s+running\b/i;

function category(
  sportId: string,
  equipmentTypeId: string,
  reason: string,
): DeterministicProductCategory {
  return { sportId, equipmentTypeId, confidence: "high", reason };
}

/**
 * A deliberately narrow classifier for product forms that can be proven from
 * retailer title/type/tag text. It never guesses from a retailer's default
 * sport and returns null when the evidence is ambiguous.
 */
export function classifyDeterministicProduct(text: string): DeterministicProductCategory | null {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value || SIGNED_OR_DISPLAY.test(value)) return null;

  if (!NON_FIELDING_GLOVE.test(value) && FIELDING_GLOVE.test(value)) {
    if (/\bfast\s*pitch\b/i.test(value)) {
      return category("fastpitch-softball", "fp-gloves", "explicit softball fielding glove");
    }
    if (/\bslow\s*pitch\b/i.test(value)) {
      return category("slowpitch-softball", "sp-gloves", "explicit slowpitch softball fielding glove");
    }
    return category("baseball", "bb-gloves", "explicit baseball fielding glove");
  }
  if (FASTPITCH_BAT.test(value)) {
    return category("fastpitch-softball", "fp-bats", "explicit fastpitch bat");
  }
  if (SLOWPITCH_BAT.test(value)) {
    return category("slowpitch-softball", "sp-bats", "explicit slowpitch bat");
  }
  if (BASEBALL_BAT.test(value) && !/\b(?:softball|cricket)\b/i.test(value)) {
    return category("baseball", "bb-bats", "explicit baseball bat");
  }
  if (RUNNING_SHOE.test(value)) {
    return category("running", "run-shoes", "explicit running shoe");
  }

  if (/\b(?:golf\s+)?drivers?\b/i.test(value) && !/\b(?:headcover|cover)\b/i.test(value)) {
    return category("golf", "golf-drivers", "explicit golf driver");
  }
  if (/\biron\s+sets?\b|\bsets?\s+of\s+\d+\s+irons?\b/i.test(value)) {
    return category("golf", "golf-iron-sets", "explicit golf iron set");
  }
  if (/\b(?:golf\s+)?wedges?\b|\b(?:48|50|52|54|56|58|60)\s*(?:°|degree)\b/i.test(value)) {
    return category("golf", "golf-wedges", "explicit golf wedge");
  }
  if (/\b(?:golf\s+)?putters?\b/i.test(value) && !/\b(?:headcover|cover)\b/i.test(value)) {
    return category("golf", "golf-putters", "explicit golf putter");
  }

  return null;
}
