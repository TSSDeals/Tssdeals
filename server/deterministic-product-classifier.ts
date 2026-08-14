import {
  classifyGolfClubProduct,
  isGolfClubAccessoryOnly,
} from "./golf-product-classifier";

export type DeterministicProductCategory = {
  sportId: string;
  equipmentTypeId: string;
  confidence: "high";
  reason: string;
};

const SIGNED_OR_DISPLAY =
  /\b(?:autograph(?:ed)?|hand[ -]?signed|signed\s+by|memorabilia|collectible|display\s+(?:case|stand|rack|shelf|mount)|wall\s+mount(?:ed|ing)?|(?:glove|mitt)\s+(?:stand|rack|shelf))\b/i;
const NON_FIELDING_GLOVE =
  /\b(?:batting|golf|boxing|work|winter|rain|football|receiver|goalkeeper|pancake|training|trainer)\s+gloves?\b|\bsliding\s+mitt\b|\b(?:glove|mitt)\b.{0,45}\b(?:laces?|lacing|repair|care|condition(?:er|ing)?|break[ -]?in|mallet|wrap|kit|pad|pounding|molding|shaping|accessor(?:y|ies))\b|\b(?:laces?|lacing|repair|care|condition(?:er|ing)?|break[ -]?in|mallet|wrap|kit|pad|pounding|molding|shaping)\b.{0,45}\b(?:glove|mitt)\b/i;
const FIELDING_GLOVE =
  /\b(?:baseball|fielding|infield|outfield|pitcher(?:'s)?|catcher(?:'s)?|first[ -]?base)\b.{0,60}\b(?:glove|mitt)s?\b|\b(?:glove|mitt)s?\b.{0,60}\b(?:baseball|fielding|infield|outfield|pitcher(?:'s)?|catcher(?:'s)?|first[ -]?base)\b/i;
const KNOWN_BASEBALL_GLOVE_MODEL =
  /\b(?:wilson\s+(?:a2000|a2k|staff)|a2000\s+\d{3,4}|marucci\s+cypress|rawlings\s+(?:foundation|pro\s+preferred|heart\s+of\s+the\s+hide|hoh|r9|gg\s+elite))\b/i;
const BAT_ACCESSORY_ONLY =
  /\b(?:bat\s+grips?|grip\s+wraps?|handle\s+grips?|replacement\s+grips?|bat\s+racks?|bat\s+holders?|bat\s+storage|bat\s+cases?|bat\s+sleeves?|velocity\s+bats?|no[ -]?knob|training\s+aids?|(?:foam|plastic)\s+(?:baseball\s+)?bats?)\b/i;

// Some Rawlings wood-bat lines reuse names that are otherwise strong glove-family
// evidence (notably "Pro Preferred"). Product-form evidence must win over family
// names or those bats are projected into Baseball Gloves during broad searches.
const EXPLICIT_BASEBALL_BAT =
  /\b(?:baseball|bb\/sb|wood(?:en)?|maple|ash|birch)\s+bats?\b|\bbats?\b.{0,60}\b(?:baseball|bb\/sb|wood(?:en)?|maple|ash|birch)\b|\b(?:woody|torpedo)\b.{0,35}\b(?:2[7-9]|3[0-4])\s*(?:["”]|in(?:ch(?:es)?)?\b)/i;

export function hasExplicitBaseballBatEvidence(text: string): boolean {
  return EXPLICIT_BASEBALL_BAT.test(text)
    && !BAT_ACCESSORY_ONLY.test(text)
    && !/\b(?:softball|fast[ -]?pitch|slow\s*pitch|cricket)\b/i.test(text);
}

export function isKnownBaseballFieldingGloveModel(text: string): boolean {
  return KNOWN_BASEBALL_GLOVE_MODEL.test(text)
    && !SIGNED_OR_DISPLAY.test(text)
    && !NON_FIELDING_GLOVE.test(text)
    && !classifyGolfClubProduct(text);
}
const FASTPITCH_BAT =
  /\bfast[ -]?pitch\b.{0,60}\bbats?\b|\bbats?\b.{0,60}\bfast[ -]?pitch\b/i;
const SLOWPITCH_BAT =
  /\bslow\s*pitch\b.{0,60}\bbats?\b|\bbats?\b.{0,60}\bslow\s*pitch\b/i;
const BASEBALL_BAT =
  /\b(?:baseball|bbcor|usssa|usa\s+baseball|tee[ -]?ball|t[ -]?ball)\b.{0,60}\bbats?\b|\bbats?\b.{0,60}\b(?:baseball|bbcor|usssa|usa\s+baseball)\b/i;
const BATTING_GLOVE = /\bbatting\s+gloves?\b/i;
const BATTING_HELMET = /\b(?:baseball|softball|fast[ -]?pitch|slow\s*pitch)?\s*batting\s+helmets?\b/i;
const BASEBALL_BALL = /\bbaseballs\b|\b(?:official|practice|game|training)\s+baseball\b|\bbaseball\s+(?:balls?|dozen|packs?|buckets?)\b/i;
const SOFTBALL_BALL = /\bsoftballs\b|\b(?:official|practice|game|training)\s+softball\s+(?:balls?|dozen|packs?|buckets?)\b|\bsoftball\s+(?:balls?|dozen|packs?|buckets?)\b/i;
const BASEBALL_BAG = /\b(?:baseball|softball|fast[ -]?pitch|slow\s*pitch|bat)\b.{0,35}\b(?:equipment\s+)?bags?\b|\b(?:equipment\s+)?bags?\b.{0,35}\b(?:baseball|softball|fast[ -]?pitch|slow\s*pitch|bat)\b/i;
const NON_EQUIPMENT_BAG = /\b(?:crossbody|purse|handbag|tote|lunch\s+bag|wallet|pitcher(?:'s)?\s+screens?|practice\s+screens?|pitching\s+nets?|hitting\s+nets?)\b/i;
const HELMET_ACCESSORY_ONLY = /\b(?:face\s*mask|facemask|chin\s*strap|jaw\s+guard|replacement\s+pad|hardware|attachment)\b/i;
const RUNNING_SHOE =
  /\b(?:road|trail|cross[ -]?country)?\s*running\s+(?:shoes?|sneakers?)\b|\b(?:shoes?|sneakers?)\b.{0,30}\b(?:road|trail|cross[ -]?country)\s+running\b/i;
const CASUAL_OR_NON_SPORT_FOOTWEAR =
  /\b(?:dress|casual|lifestyle|fashion|walking|work|hiking)\s+(?:shoes?|boots?|sneakers?)\b/i;
const BASEBALL_CLEAT =
  /\bbaseball\b.{0,45}\b(?:cleats?|spikes?)\b|\b(?:cleats?|spikes?)\b.{0,45}\bbaseball\b/i;
const FASTPITCH_CLEAT =
  /\bfast[ -]?pitch\b.{0,45}\b(?:cleats?|spikes?)\b|\b(?:cleats?|spikes?)\b.{0,45}\bfast[ -]?pitch\b/i;
const SLOWPITCH_CLEAT =
  /\bslow\s*pitch\b.{0,45}\b(?:cleats?|spikes?)\b|\b(?:cleats?|spikes?)\b.{0,45}\bslow\s*pitch\b/i;
const TRAINING_PRODUCT =
  /\b(?:batting\s+tees?|pitching\s+machines?|pitching\s+targets?|pitching\s+nets?|hitting\s+nets?|baseball\s+rebounders?|softball\s+rebounders?|swing\s+trainers?|batting\s+trainers?|weighted\s+(?:training\s+)?(?:baseballs?|softballs?)|training\s+(?:baseball|softball)\s+sets?)\b/i;
const TRAINING_ACCESSORY_ONLY =
  /\b(?:replacement|parts?|covers?|wheels?|motors?|cords?|adapters?|hardware|attachments?)\b/i;
const BASEBALL_TRAINING =
  /\bbaseball\b.{0,70}\b(?:training|practice|batting|pitching|hitting|fielding)\b|\b(?:training|practice|batting|pitching|hitting|fielding)\b.{0,70}\bbaseball\b/i;
const FASTPITCH_TRAINING =
  /\bfast[ -]?pitch\b.{0,70}\b(?:training|practice|batting|pitching|hitting|fielding)\b|\b(?:training|practice|batting|pitching|hitting|fielding)\b.{0,70}\bfast[ -]?pitch\b/i;
const SLOWPITCH_TRAINING =
  /\bslow\s*pitch\b.{0,70}\b(?:training|practice|batting|pitching|hitting|fielding)\b|\b(?:training|practice|batting|pitching|hitting|fielding)\b.{0,70}\bslow\s*pitch\b/i;

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

  // Product containers use the contained equipment word in their title. They
  // must be resolved before bat/ball rules so "baseball bat equipment bag"
  // is not mistaken for the product it carries.
  if (BASEBALL_BAG.test(value)) {
    if (NON_EQUIPMENT_BAG.test(value)) return null;
    if (/\bbaseball\b/i.test(value) && /\b(?:softball|fast[ -]?pitch|slow\s*pitch)\b/i.test(value)) return null;
    if (/\bfast[ -]?pitch\b/i.test(value)) return category("fastpitch-softball", "fp-bags", "explicit fastpitch equipment bag");
    if (/\bslow\s*pitch\b/i.test(value)) return category("slowpitch-softball", "sp-bags", "explicit slowpitch equipment bag");
    if (/\bsoftball\b/i.test(value) && !/\bbaseball\b/i.test(value)) return null;
    return category("baseball", "bb-bags", "explicit baseball equipment bag");
  }
  if (hasExplicitBaseballBatEvidence(value)) {
    return category("baseball", "bb-bats", "explicit baseball bat");
  }
  if (BATTING_GLOVE.test(value)) {
    if (/\bfast[ -]?pitch\b/i.test(value)) return category("fastpitch-softball", "fp-batting-gloves", "explicit fastpitch batting glove");
    if (/\bslow\s*pitch\b/i.test(value)) return category("slowpitch-softball", "sp-batting-gloves", "explicit slowpitch batting glove");
    return category("baseball", "bb-batting-gloves", "explicit batting glove");
  }
  if (BATTING_HELMET.test(value)) {
    if (HELMET_ACCESSORY_ONLY.test(value)) return null;
    if (/\bfast[ -]?pitch\b/i.test(value)) return category("fastpitch-softball", "fp-protective", "explicit fastpitch batting helmet");
    if (/\bslow\s*pitch\b/i.test(value)) return category("slowpitch-softball", "sp-protective", "explicit slowpitch batting helmet");
    return category("baseball", "bb-protective", "explicit batting helmet");
  }
  if (!NON_FIELDING_GLOVE.test(value) && (FIELDING_GLOVE.test(value) || isKnownBaseballFieldingGloveModel(value))) {
    if (/\bfast[ -]?pitch\b/i.test(value)) {
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
    if (BAT_ACCESSORY_ONLY.test(value)) return null;
    return category("baseball", "bb-bats", "explicit baseball bat");
  }
  // Training product form wins over the ball it launches or contains. This
  // keeps pitching-machine balls and similar purpose-built training products
  // out of the ordinary game-ball category.
  if (TRAINING_PRODUCT.test(value) && !TRAINING_ACCESSORY_ONLY.test(value)) {
    if (FASTPITCH_TRAINING.test(value)) {
      return category("fastpitch-softball", "fp-training", "explicit fastpitch training equipment");
    }
    if (SLOWPITCH_TRAINING.test(value)) {
      return category("slowpitch-softball", "sp-training", "explicit slowpitch training equipment");
    }
    if (BASEBALL_TRAINING.test(value) && !/\bsoftball\b/i.test(value)) {
      return category("baseball", "bb-training", "explicit baseball training equipment");
    }
    return null;
  }
  if (SOFTBALL_BALL.test(value) && !/\b(?:signed|autograph|display|holder|case|bucket|bag)\b/i.test(value)) {
    if (/\bslow\s*pitch\b/i.test(value)) return category("slowpitch-softball", "sp-balls", "explicit slowpitch softball");
    return category("fastpitch-softball", "fp-balls", "explicit softball");
  }
  if (BASEBALL_BALL.test(value) && !/\b(?:signed|autograph|display|holder|case|bucket|bag)\b/i.test(value)) {
    return category("baseball", "bb-balls", "explicit baseball");
  }
  if (RUNNING_SHOE.test(value)) {
    return category("running", "run-shoes", "explicit running shoe");
  }
  if (!CASUAL_OR_NON_SPORT_FOOTWEAR.test(value)) {
    if (FASTPITCH_CLEAT.test(value)) {
      return category("fastpitch-softball", "fp-cleats", "explicit fastpitch cleat");
    }
    if (SLOWPITCH_CLEAT.test(value)) {
      return category("slowpitch-softball", "sp-cleats", "explicit slowpitch cleat");
    }
    if (BASEBALL_CLEAT.test(value) && !/\b(?:football|soccer|lacrosse|golf)\b/i.test(value)) {
      return category("baseball", "bb-cleats", "explicit baseball cleat");
    }
  }
  const golf = classifyGolfClubProduct(value);
  if (golf) {
    return category(golf.sportId, golf.equipmentTypeId, golf.reason);
  }
  if (
    isGolfClubAccessoryOnly(value)
    || /\b(?:impact|drill|screw|torque|ratchet|socket)\s+drivers?\b/i.test(value)
  ) {
    return null;
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
