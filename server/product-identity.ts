import { createHash } from "node:crypto";
import { normalizeBrand } from "./brand-normalizer";
import { normalizeGloveSize } from "./deal-search";

export type ProductIdentityInput = {
  id: string;
  title: string;
  brand?: string | null;
  sportId?: string | null;
  equipmentTypeId?: string | null;
  condition?: string | null;
  dropWeight?: number | null;
  sizeNumber?: string | null;
  raw?: unknown;
};

export type ProductIdentityProposal = {
  dealId: string;
  familyFingerprint: string;
  variantFingerprint: string;
  canonicalBrand: string;
  productFamily: string;
  modelCode: string | null;
  sportId: string;
  equipmentTypeId: string;
  variant: {
    size: string | null;
    throwHand: "LHT" | "RHT" | null;
    length: number | null;
    weight: number | null;
    drop: number | null;
    certification: string | null;
    golfHand: "LH" | "RH" | null;
    loft: number | null;
    shaftFlex: "L" | "A" | "R" | "S" | "X" | null;
    setComposition: string | null;
    clubComponent: "complete" | "head_only" | null;
    editionType: "stock" | "seasonal" | "gotm" | "exclusive";
    releaseSeason: "spring" | "summer" | "fall" | "winter" | null;
    releaseMonth: string | null;
    releaseYear: number | null;
    colorway: string | null;
    exclusiveTo: string | null;
    condition: string | null;
  };
  confidence: "high" | "medium";
  status: "proposed";
  evidence: string[];
};

type FamilyKind = "glove" | "bat" | "golf" | "any";

const FAMILY_PATTERNS: Array<[RegExp, string, FamilyKind]> = [
  [/\ba\s?2000\b/i, "A2000", "glove"],
  [/\ba\s?2k\b/i, "A2K", "glove"],
  [/\ba\s?1000\b/i, "A1000", "glove"],
  [/\ba\s?500\b/i, "A500", "glove"],
  [/\ba\s?450\b/i, "A450", "glove"],
  [/\bheart of (?:the )?hide\b|\bhoh\b/i, "Heart of the Hide", "glove"],
  [/\bpro preferred\b/i, "Pro Preferred", "glove"],
  [/\bencore\b/i, "Encore", "glove"],
  [/\br9\b/i, "R9", "glove"],
  [/\bhype[\s-]?fire\b/i, "Hype Fire", "bat"],
  [/\bsupra\b/i, "Supra", "bat"],
  [/\bcat[\s-]?x2?\b/i, "CAT X", "bat"],
  [/\brawlings icon\b|\bicon\b/i, "Icon", "bat"],
  [/\bmeta\b/i, "Meta", "bat"],
  [/\batlas\b/i, "Atlas", "bat"],
  [/\bqi[\s-]?35\b/i, "Qi35", "golf"],
  [/\bqi[\s-]?10\b/i, "Qi10", "golf"],
  [/\bstealth[\s-]?2\b/i, "Stealth 2", "golf"],
  [/\bparadym\s+ai\s+smoke\b/i, "Paradym Ai Smoke", "golf"],
  [/\bparadym\b/i, "Paradym", "golf"],
  [/\belyte\b/i, "Elyte", "golf"],
  [/\brogue\s+st\b/i, "Rogue ST", "golf"],
  [/\bg[\s-]?440\b/i, "G440", "golf"],
  [/\bg[\s-]?430\b/i, "G430", "golf"],
  [/\btsr[\s-]?[234]\b/i, "TSR", "golf"],
  [/\bgt[\s-]?[234]\b/i, "GT", "golf"],
  [/\bvokey\s+sm[\s-]?10\b|\bsm[\s-]?10\b/i, "Vokey SM10", "golf"],
  [/\bvokey\s+sm[\s-]?9\b|\bsm[\s-]?9\b/i, "Vokey SM9", "golf"],
  [/\bspider(?:\s+tour|\s+gt|\s+x)?\b/i, "Spider", "golf"],
  [/\bai[\s-]?one\b/i, "Ai-One", "golf"],
  [/\bscotty\s+cameron\s+phantom\b/i, "Scotty Cameron Phantom", "golf"],
  [/\bscotty\s+cameron\s+(?:studio\s+style\s+)?newport\b/i, "Scotty Cameron Newport", "golf"],
  [/\bp[\s-]?790\b/i, "P790", "golf"],
  [/\bp[\s-]?770\b/i, "P770", "golf"],
  [/\b(?:apex\s+pro|apex\s+dcb|apex)\b/i, "Apex", "golf"],
  [/\bt[\s-]?(?:100|150|200|250|350)\b/i, "Titleist T-Series", "golf"],
  [/\bi[\s-]?(?:230|530)\b/i, "PING i-Series", "golf"],
  [/\bjpx[\s-]?(?:923|925)(?:\s+hot\s+metal)?\b/i, "JPX 925/923", "golf"],
  [/\bzx[\s-]?(?:4|5|7)(?:\s+mk\s*ii)?\b/i, "Srixon ZX", "golf"],
  [/\bking\s+(?:tour|forged\s+tec|cb|mb)\b/i, "Cobra King", "golf"],
  [/\brtx[\s-]?(?:6|zipcore)\b/i, "RTX", "golf"],
  [/\bjaws\s+(?:raw|full\s+toe)\b/i, "Jaws", "golf"],
  [/\bwhite\s+hot\s+(?:og|versa)\b/i, "White Hot", "golf"],
  [/\bpld\s+(?:milled|anser|ds72)\b/i, "PING PLD", "golf"],
];

const GENERIC_MODEL_WORDS = new Set([
  "baseball", "softball", "glove", "mitt", "bat", "new", "used", "adult",
  "youth", "mens", "womens", "left", "right", "throw", "inch", "inches",
]);

function normalizedText(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim()
    : "";
}

function rawObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

function firstRaw(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizedText(raw[key]);
    if (value) return value;
  }
  return "";
}

function canonicalToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fingerprint(parts: unknown[]): string {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\u001f"))
    .digest("hex");
}

function identifyFamily(title: string, raw: Record<string, unknown>): {
  family: string;
  evidence: string;
  kind: FamilyKind;
} | null {
  const structured = firstRaw(raw, [
    "productFamily", "modelName", "model", "product_model", "styleName",
  ]);
  if (structured) {
    const cleaned = structured
      .split(/\s+/)
      .filter((word) => !GENERIC_MODEL_WORDS.has(canonicalToken(word)))
      .join(" ")
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 100) {
      return { family: cleaned, evidence: "structured model or product-family field", kind: "any" };
    }
  }
  for (const [pattern, family, kind] of FAMILY_PATTERNS) {
    if (pattern.test(title)) {
      return { family, evidence: `recognized ${family} model family in title`, kind };
    }
  }
  return null;
}

function modelCode(title: string, raw: Record<string, unknown>, family: string): string | null {
  const structured = firstRaw(raw, [
    "modelNumber", "model_number", "mpn", "styleNumber", "style_number",
  ]);
  if (
    structured
    && structured.length <= 80
    && canonicalToken(structured) !== canonicalToken(family)
  ) return structured.toUpperCase();
  if (/^A(?:2000|2K|1000|500|450)$/i.test(family)) {
    const match = title.match(/\b(?:1[5-9]\d{2}|2[5-9]\d{2}|[A-Z]{1,4}\d{3,}[A-Z0-9-]*)\b/i);
    const candidate = match?.[0]?.toUpperCase() ?? null;
    return candidate && canonicalToken(candidate) !== canonicalToken(family) ? candidate : null;
  }
  return null;
}

function throwHand(text: string): "LHT" | "RHT" | null {
  if (/\b(?:lht|left[- ]hand(?:ed)? throw|lefty)\b/i.test(text)) return "LHT";
  if (/\b(?:rht|right[- ]hand(?:ed)? throw)\b/i.test(text)) return "RHT";
  return null;
}

function batDimensions(text: string): { length: number | null; weight: number | null } {
  const pair = text.match(/\b(2[4-9]|3[0-5])\s*(?:\/|-)\s*(1[3-9]|2\d|3[0-2])\b/);
  if (pair) return { length: Number(pair[1]), weight: Number(pair[2]) };
  const length = text.match(/\b(2[4-9]|3[0-5])\s*(?:"|in(?:ch(?:es)?)?)\b/i);
  const weight = text.match(/\b(1[3-9]|2\d|3[0-2])\s*(?:oz|ounce(?:s)?)\b/i);
  return {
    length: length ? Number(length[1]) : null,
    weight: weight ? Number(weight[1]) : null,
  };
}

function certification(text: string, raw: Record<string, unknown>): string | null {
  const structured = firstRaw(raw, ["certification", "certifications", "cert"]);
  const candidate = structured || text.match(/\b(?:BBCOR|USSSA|USA BASEBALL|ASA|NSA)\b/i)?.[0] || "";
  return candidate ? candidate.toUpperCase() : null;
}

const MONTHS: Record<string, string> = {
  jan: "January", january: "January", feb: "February", february: "February",
  mar: "March", march: "March", apr: "April", april: "April", may: "May",
  jun: "June", june: "June", jul: "July", july: "July", aug: "August", august: "August",
  sep: "September", sept: "September", september: "September", oct: "October", october: "October",
  nov: "November", november: "November", dec: "December", december: "December",
};

function normalizedYear(value: string): number | null {
  const number = Number(value.replace(/^['’]/, ""));
  if (!Number.isInteger(number)) return null;
  if (number >= 20 && number <= 99) return 2000 + number;
  return number >= 2000 && number <= 2099 ? number : null;
}

function releaseMetadata(text: string, raw: Record<string, unknown>): {
  editionType: "stock" | "seasonal" | "gotm" | "exclusive";
  releaseSeason: "spring" | "summer" | "fall" | "winter" | null;
  releaseMonth: string | null;
  releaseYear: number | null;
  colorway: string | null;
  exclusiveTo: string | null;
} {
  const structuredEdition = firstRaw(raw, ["editionType", "edition", "collection", "releaseName"]);
  const structuredSeason = firstRaw(raw, ["releaseSeason", "season"]);
  const structuredYear = firstRaw(raw, ["releaseYear", "modelYear", "year"]);
  const structuredColorway = firstRaw(raw, ["colorway", "colorName", "colourName", "color"]);
  const structuredExclusive = firstRaw(raw, ["exclusiveTo", "retailerExclusive", "exclusiveRetailer"]);
  const value = `${text} ${structuredEdition} ${structuredSeason}`;

  const gotm = value.match(/\b(?:gotm|glove\s+of\s+the\s+month)\b(?:\s*[-:–—]?\s*)?(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))?(?:\s*[,/'’-]*\s*)((?:20)?\d{2})?/i);
  const season = value.match(/\b(spring|summer|fall|autumn|winter)\s*[-/'’ ]?\s*((?:20)?\d{2})\b/i);
  const exclusive = structuredExclusive || value.match(/\b(?:exclusive(?:ly)?\s+(?:for|to|at)|(?:store|retailer|dealer)\s+exclusive)\s+([A-Za-z0-9][A-Za-z0-9 &'’.-]{1,60})/i)?.[1]?.trim() || "";
  const releaseSeason = season
    ? (season[1].toLowerCase() === "autumn" ? "fall" : season[1].toLowerCase()) as "spring" | "summer" | "fall" | "winter"
    : null;
  const releaseMonth = gotm?.[1] ? MONTHS[gotm[1].toLowerCase()] ?? null : null;
  const releaseYear = normalizedYear(gotm?.[2] || season?.[2] || structuredYear);
  const editionType = gotm
    ? "gotm"
    : exclusive
      ? "exclusive"
      : releaseSeason
        ? "seasonal"
        : "stock";

  return {
    editionType,
    releaseSeason,
    releaseMonth,
    releaseYear,
    colorway: structuredColorway || null,
    exclusiveTo: exclusive || null,
  };
}

const GOLF_ACCESSORY =
  /\b(?:headcovers?|club covers?|grip kits?|adapters?|sleeves?|ferrules?|wrenches?|brushes?|towels?|cleaners?)\b|\b(?:grip|weight)\s+only\b/i;

function golfHand(text: string, raw: Record<string, unknown>): "LH" | "RH" | null {
  const value = `${firstRaw(raw, ["handedness", "hand", "dexterity"])} ${text}`;
  if (/\b(?:left[- ]hand(?:ed)?|lefty|lh)\b/i.test(value)) return "LH";
  if (/\b(?:right[- ]hand(?:ed)?|rh)\b/i.test(value)) return "RH";
  return null;
}

function golfLoft(text: string, raw: Record<string, unknown>): number | null {
  const structured = firstRaw(raw, ["loft", "clubLoft"]);
  const structuredNumber = Number(structured.replace(/[^\d.]/g, ""));
  if (structured && Number.isFinite(structuredNumber) && structuredNumber >= 7 && structuredNumber <= 64) {
    return structuredNumber;
  }
  const value = text;
  const match = value.match(/\b(7(?:\.5)?|8(?:\.5)?|9(?:\.5)?|10(?:\.5)?|11(?:\.5)?|12|13(?:\.5)?|14|15|16(?:\.5)?|17|18|19|20|21|22|23|24|25|26|27|28|30|32|34|35|36|38|40|42|44|46|48|50|52|54|56|58|60|62|64)\s*(?:°|deg(?:ree)?s?)\b/i);
  return match ? Number(match[1]) : null;
}

function golfShaftFlex(text: string, raw: Record<string, unknown>): "L" | "A" | "R" | "S" | "X" | null {
  const structured = firstRaw(raw, ["shaftFlex", "flex", "golfClubFlex"]).toLowerCase();
  if (/^(?:l|ladies|womens?)$/.test(structured)) return "L";
  if (/^(?:a|senior|lite)$/.test(structured)) return "A";
  if (/^(?:x|x-stiff|extra stiff)$/.test(structured)) return "X";
  if (/^(?:s|stiff)$/.test(structured)) return "S";
  if (/^(?:r|reg|regular)$/.test(structured)) return "R";
  const value = text;
  if (/\b(?:ladies|womens?|lady)\s+flex\b/i.test(value)) return "L";
  if (/\b(?:senior|lite|a)\s+flex\b/i.test(value)) return "A";
  if (/\b(?:extra[- ]?stiff|x[- ]?stiff|x)\s+flex\b/i.test(value)) return "X";
  if (/\b(?:stiff|s)\s+flex\b/i.test(value)) return "S";
  if (/\b(?:regular|reg|r)\s+flex\b/i.test(value)) return "R";
  return null;
}

function golfSetComposition(text: string, raw: Record<string, unknown>): string | null {
  const structured = firstRaw(raw, ["setMakeup", "setComposition", "clubSet"]);
  const value = structured || text;
  const match = value.match(/\b([3-9](?:\s*-\s*|\s+thru\s+|\s+through\s+)(?:[4-9]|PW|AW|GW|SW)(?:\s*[,/+&]\s*(?:PW|AW|GW|SW)){0,3})\b/i);
  return match ? match[1].toUpperCase().replace(/\s+/g, "") : null;
}

export function proposeProductIdentity(input: ProductIdentityInput): ProductIdentityProposal | null {
  const title = normalizedText(input.title);
  const raw = rawObject(input.raw);
  const canonicalBrand = normalizeBrand(input.brand || firstRaw(raw, ["brand", "manufacturer"]));
  const sportId = normalizedText(input.sportId);
  const equipmentTypeId = normalizedText(input.equipmentTypeId);
  const familyMatch = identifyFamily(title, raw);
  if (!canonicalBrand || !sportId || !equipmentTypeId || !familyMatch) return null;
  if (/(?:^|-)other(?:-\d+)?$/i.test(equipmentTypeId)) return null;
  if (
    sportId === "baseball"
    && /\b(?:fastpitch|slowpitch|softball)\b/i.test(title)
  ) return null;
  if (familyMatch.kind === "glove" && !equipmentTypeId.includes("glove")) return null;
  if (familyMatch.kind === "bat" && !equipmentTypeId.includes("bat")) return null;
  if (familyMatch.kind === "golf" && sportId !== "golf") return null;

  const family = familyMatch.family;
  const code = modelCode(title, raw, family);
  const combined = `${title} ${Object.values(raw).filter((value) => typeof value === "string").join(" ")}`;
  const titleGloveSize = combined.match(
    /\b(8(?:\.\d{1,2})?|9(?:\.\d{1,2})?|1[0-5](?:\.\d{1,2})?)\s*(?:["″]|in(?:ch(?:es)?)?)\b/i,
  )?.[1] ?? null;
  const gloveSize = equipmentTypeId.includes("glove")
    ? normalizeGloveSize(input.sizeNumber || firstRaw(raw, ["size", "gloveSize"]) || titleGloveSize)
    : null;
  const dimensions = batDimensions(combined);
  const drop = input.dropWeight
    ?? (dimensions.length && dimensions.weight ? dimensions.length - dimensions.weight : null);
  const release = releaseMetadata(combined, raw);
  const variant = {
    size: gloveSize || normalizedText(input.sizeNumber) || null,
    throwHand: equipmentTypeId.includes("glove") ? throwHand(combined) : null,
    length: equipmentTypeId.includes("bat") ? dimensions.length : null,
    weight: equipmentTypeId.includes("bat") ? dimensions.weight : null,
    drop: equipmentTypeId.includes("bat") ? drop : null,
    certification: equipmentTypeId.includes("bat") ? certification(combined, raw) : null,
    golfHand: sportId === "golf" ? golfHand(combined, raw) : null,
    loft: sportId === "golf" ? golfLoft(combined, raw) : null,
    shaftFlex: sportId === "golf" ? golfShaftFlex(combined, raw) : null,
    setComposition: sportId === "golf" && equipmentTypeId.includes("iron")
      ? golfSetComposition(combined, raw) : null,
    clubComponent: sportId === "golf"
      ? /\bhead\s*only\b|\bdriver\s*head\b|\bclub\s*head\b/i.test(combined)
        ? "head_only"
        : "complete"
      : null,
    ...release,
    condition: normalizedText(input.condition).toLowerCase() || null,
  };
  if (sportId === "golf" && GOLF_ACCESSORY.test(combined)) return null;
  if (sportId === "golf" && /\bshaft\s+only\b|\breplacement\s+shaft\b/i.test(combined)) return null;
  const evidence = [
    "canonical brand",
    familyMatch.evidence,
    "stored non-Other sport and equipment classification",
  ];
  if (code) evidence.push("model/style code");
  if (variant.size) evidence.push("size");
  if (variant.throwHand) evidence.push("throw hand");
  if (variant.length && variant.weight) evidence.push("bat length and weight");
  if (variant.certification) evidence.push("certification");
  if (variant.golfHand) evidence.push("golf handedness");
  if (variant.loft) evidence.push("golf loft");
  if (variant.shaftFlex) evidence.push("shaft flex");
  if (variant.setComposition) evidence.push("iron set composition");
  if (variant.clubComponent === "head_only") evidence.push("head-only club component");
  if (variant.editionType !== "stock") evidence.push(`${variant.editionType} edition`);
  if (variant.releaseSeason || variant.releaseMonth || variant.releaseYear) evidence.push("release period");
  if (variant.colorway) evidence.push("named colorway");
  if (variant.exclusiveTo) evidence.push("exclusive retailer or collection");

  const familyKey = [
    canonicalToken(canonicalBrand), sportId, equipmentTypeId,
    canonicalToken(family), canonicalToken(code || ""),
  ];
  const variantKey = [
    ...familyKey, variant.size, variant.throwHand, variant.length, variant.weight,
    variant.drop, variant.certification, variant.golfHand, variant.loft,
    variant.shaftFlex, variant.setComposition, variant.clubComponent, variant.condition,
    variant.editionType, variant.releaseSeason, variant.releaseMonth, variant.releaseYear,
    canonicalToken(variant.colorway || ""), canonicalToken(variant.exclusiveTo || ""),
  ];
  return {
    dealId: input.id,
    familyFingerprint: fingerprint(familyKey),
    variantFingerprint: fingerprint(variantKey),
    canonicalBrand,
    productFamily: family,
    modelCode: code,
    sportId,
    equipmentTypeId,
    variant,
    confidence: code || evidence.length >= 5 ? "high" : "medium",
    status: "proposed",
    evidence,
  };
}
