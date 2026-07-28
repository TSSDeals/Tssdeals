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
    condition: string | null;
  };
  confidence: "high" | "medium";
  status: "proposed";
  evidence: string[];
};

const FAMILY_PATTERNS: Array<[RegExp, string]> = [
  [/\ba\s?2000\b/i, "A2000"],
  [/\ba\s?2k\b/i, "A2K"],
  [/\ba\s?1000\b/i, "A1000"],
  [/\ba\s?500\b/i, "A500"],
  [/\ba\s?450\b/i, "A450"],
  [/\bheart of (?:the )?hide\b|\bhoh\b/i, "Heart of the Hide"],
  [/\bpro preferred\b/i, "Pro Preferred"],
  [/\bencore\b/i, "Encore"],
  [/\br9\b/i, "R9"],
  [/\bhype[\s-]?fire\b/i, "Hype Fire"],
  [/\bsupra\b/i, "Supra"],
  [/\bcat[\s-]?x2?\b/i, "CAT X"],
  [/\brawlings icon\b|\bicon\b/i, "Icon"],
  [/\bmeta\b/i, "Meta"],
  [/\batlas\b/i, "Atlas"],
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
      return { family: cleaned, evidence: "structured model or product-family field" };
    }
  }
  for (const [pattern, family] of FAMILY_PATTERNS) {
    if (pattern.test(title)) return { family, evidence: `recognized ${family} model family in title` };
  }
  return null;
}

function modelCode(title: string, raw: Record<string, unknown>, family: string): string | null {
  const structured = firstRaw(raw, [
    "modelNumber", "model_number", "mpn", "styleNumber", "style_number",
  ]);
  if (structured && structured.length <= 80) return structured.toUpperCase();
  if (/^A(?:2000|2K|1000|500|450)$/i.test(family)) {
    const match = title.match(/\b(?:1[5-9]\d{2}|2[5-9]\d{2}|[A-Z]{1,4}\d{3,}[A-Z0-9-]*)\b/i);
    return match?.[0]?.toUpperCase() ?? null;
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

export function proposeProductIdentity(input: ProductIdentityInput): ProductIdentityProposal | null {
  const title = normalizedText(input.title);
  const raw = rawObject(input.raw);
  const canonicalBrand = normalizeBrand(input.brand || firstRaw(raw, ["brand", "manufacturer"]));
  const sportId = normalizedText(input.sportId);
  const equipmentTypeId = normalizedText(input.equipmentTypeId);
  const familyMatch = identifyFamily(title, raw);
  if (!canonicalBrand || !sportId || !equipmentTypeId || !familyMatch) return null;
  if (/(?:^|-)other(?:-\d+)?$/i.test(equipmentTypeId)) return null;

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
  const variant = {
    size: gloveSize || normalizedText(input.sizeNumber) || null,
    throwHand: equipmentTypeId.includes("glove") ? throwHand(combined) : null,
    length: equipmentTypeId.includes("bat") ? dimensions.length : null,
    weight: equipmentTypeId.includes("bat") ? dimensions.weight : null,
    drop: equipmentTypeId.includes("bat") ? drop : null,
    certification: equipmentTypeId.includes("bat") ? certification(combined, raw) : null,
    condition: normalizedText(input.condition).toLowerCase() || null,
  };
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

  const familyKey = [
    canonicalToken(canonicalBrand), sportId, equipmentTypeId,
    canonicalToken(family), canonicalToken(code || ""),
  ];
  const variantKey = [
    ...familyKey, variant.size, variant.throwHand, variant.length, variant.weight,
    variant.drop, variant.certification, variant.condition,
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
