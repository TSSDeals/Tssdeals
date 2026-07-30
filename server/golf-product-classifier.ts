export type GolfClubClassification = {
  sportId: "golf";
  equipmentTypeId:
    | "golf-drivers"
    | "golf-irons"
    | "golf-iron-sets"
    | "golf-wedges"
    | "golf-putters"
    | "golf-other";
  reason: string;
};

const NON_GOLF_DRIVER =
  /\b(?:impact|drill|screw|torque|ratchet|socket|device|software|printer|audio|motor)\s+drivers?\b|\bdrivers?\s+(?:tool|bit|set|kit)\b/i;

const ACCESSORY_ONLY =
  /\b(?:head[\s-]?covers?|club[\s-]?covers?|(?:driver|fairway|wood|hybrid|iron|wedge|putter)\s+covers?|rain[\s-]?covers?|travel[\s-]?covers?|brush(?:es)?|clean(?:er|ing)\s+(?:kit|tool)|towels?|ball\s+markers?|divot\s+tools?|tees?|grip\s+(?:kit|tape|solvent|trainer)|replacement\s+grips?|shaft\s+adapters?|adapter\s+sleeves?|ferrules?|weight\s+(?:kit|screw)|torque\s+wrenches?|club\s+racks?|display\s+stands?)\b/i;

const SHAFT_ONLY =
  /\b(?:replacement|aftermarket)\s+shafts?\b|\b(?:driver|fairway|wood|hybrid|iron|wedge|putter)\s+shafts?\b|\bshafts?\s+(?:only|adapter|sleeve|pull|uncut)\b/i;

const NON_CLUB_GOLF_PRODUCT =
  /\b(?:golf\s+balls?|golf\s+bags?|cart\s+bags?|stand\s+bags?|carry\s+bags?|golf\s+gloves?|golf\s+shoes?|golf\s+shirts?|golf\s+polos?|golf\s+pants?|golf\s+shorts?|polo\s+shirts?|shirts?|jackets?|hoodies?|pants?|shorts?|apparel|rangefinders?|launch\s+monitors?|putting\s+mats?|training\s+aids?)\b/i;

export function isGolfClubAccessoryOnly(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return false;
  return ACCESSORY_ONLY.test(value)
    || SHAFT_ONLY.test(value)
    || NON_CLUB_GOLF_PRODUCT.test(value)
    || /\bdisc\s+golf\b|\bminiature\s+golf\b|\bmini\s+golf\b/i.test(value);
}

function result(
  equipmentTypeId: GolfClubClassification["equipmentTypeId"],
  reason: string,
): GolfClubClassification {
  return { sportId: "golf", equipmentTypeId, reason };
}

export function classifyGolfClubProduct(text: string): GolfClubClassification | null {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value || isGolfClubAccessoryOnly(value) || NON_GOLF_DRIVER.test(value)) return null;
  const nonGolfHybrid =
    /\b(?:baseball|softball|bbcor|usssa|usa\s+bat|bats?|batting\s+gloves?|jacket|hoodie|shirt|apparel)\b/i.test(value);
  const golfHybridContext =
    /\b(?:golf|fairway|woods?|clubs?|degree|loft|mens?|womens?|right\s+hand|left\s+hand|rh|lh)\b|[Â°Âº]/i.test(value);
  const knownGolfFamily =
    /\b(?:qi35|qi10|stealth\s*2|paradym|elyte|rogue\s*st|g440|g430|tsr[1234]?|gt[1234])\b/i.test(value);

  if (
    /\b(?:complete|full)\s+(?:golf\s+)?(?:club\s+)?sets?\b/i.test(value)
    || /\biron\s+sets?\b/i.test(value)
    || /\bsets?\s+of\s+\d+\s+irons?\b/i.test(value)
    || /\b[3-9]\s*[-–]\s*(?:pw|sw|aw|gw)\b/i.test(value)
    || /\b[4-9]\s*,?\s*(?:pw|sw|aw|gw)\b/i.test(value)
  ) {
    return result("golf-iron-sets", "explicit golf or iron set");
  }
  if (/\bdriving\s+irons?\b|\butility\s+irons?\b/i.test(value)) {
    return result("golf-irons", "explicit driving or utility iron");
  }
  if (
    /\b(?:golf\s+)?drivers?\b/i.test(value)
    || (
      /\b(?:qi35|qi10|stealth\s*2|paradym(?:\s+ai\s+smoke)?|elyte|rogue\s*st|g440|g430|tsr[1234]?|gt[1234])\b/i.test(value)
      && /\b(?:7(?:\.5)?|8(?:\.5)?|9|10(?:\.5)?|11|12|13(?:\.5)?)\s*(?:°|º|degree|deg)?\b/i.test(value)
      && !/\b(?:iron|wood|hybrid|wedge|putter)\b/i.test(value)
    )
  ) {
    return result("golf-drivers", "explicit golf driver");
  }
  if (
    /\bfairway\s+(?:woods?|clubs?)\b/i.test(value)
    || /\b[3-9]\s*woods?\b/i.test(value)
    || /\b[3-9]\s+[wh]\b/i.test(value)
    || (knownGolfFamily && /\b[3-9][wh]\b/i.test(value))
    || (/\bhybrids?\b/i.test(value) && golfHybridContext && !nonGolfHybrid)
    || /\brescue\s+clubs?\b/i.test(value)
  ) {
    return result("golf-irons", "explicit fairway wood or hybrid");
  }
  if (
    /\b(?:pitching|sand|gap|lob|approach|utility)\s+wedges?\b/i.test(value)
    || /\b(?:golf\s+)?wedges?\b/i.test(value)
    || /\b(?:46|48|50|52|54|56|58|60|62|64)\s*(?:°|º|degree)\b/i.test(value)
  ) {
    return result("golf-wedges", "explicit golf wedge");
  }
  if (
    /\b(?:golf\s+)?putters?\b/i.test(value)
    || /\b(?:spider(?:\s+tour)?|ai-one|scotty\s+cameron\s+(?:phantom|newport))\b/i.test(value)
  ) {
    return result("golf-putters", "explicit golf putter");
  }
  if (
    /\b(?:[2-9]|pw|aw|gw|sw|lw)\s*[- ]?irons?\b/i.test(value)
    || /\b(?:golf\s+)?irons?\b/i.test(value)
  ) {
    return result("golf-irons", "explicit individual golf iron");
  }
  if (/\bgolf\s+clubs?\b/i.test(value)) {
    return result("golf-other", "explicit golf club");
  }
  return null;
}
