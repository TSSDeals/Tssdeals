import { normalizeBrand } from "./brand-normalizer";
import { normalizeGloveSize } from "./deal-search";

export type PhotoIdentificationConfidence = "high" | "medium" | "low";

export interface PhotoIdentification {
  q: string;
  sport: string;
  brand: string;
  productType: string;
  model: string;
  modelNumber: string;
  size: string;
  throwHand: string;
  drop: string;
  certification: string;
  visibleText: string[];
  identified: string;
  confidence: PhotoIdentificationConfidence;
  needsConfirmation: boolean;
}

const text = (value: unknown, maxLength = 120): string =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";

const confidence = (value: unknown): PhotoIdentificationConfidence => {
  const normalized = text(value, 12).toLowerCase();
  return normalized === "high" || normalized === "medium" ? normalized : "low";
};

const unique = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.toLowerCase())))
    .map((lower) => values.find((value) => value.toLowerCase() === lower)!)
    .filter(Boolean);

function normalizedHand(value: unknown): string {
  const valueText = text(value, 40).toLowerCase();
  if (/\b(?:lht|left(?:[- ]hand)? throw)\b/.test(valueText)) return "LHT";
  if (/\b(?:rht|right(?:[- ]hand)? throw)\b/.test(valueText)) return "RHT";
  return "";
}

function normalizedDrop(value: unknown): string {
  const match = text(value, 20).match(/-?\s*(\d{1,2})/);
  if (!match) return "";
  const amount = Number(match[1]);
  return amount >= 3 && amount <= 15 ? `-${amount}` : "";
}

function normalizedSize(value: unknown): string {
  const valueText = text(value, 30);
  const gloveSize = normalizeGloveSize(valueText);
  if (gloveSize) return `${gloveSize}"`;

  const batSize = valueText.match(/\b(\d{2})\s*(?:["/x-]\s*)?(\d{2})\b/);
  if (batSize) return `${batSize[1]}/${batSize[2]}`;

  return valueText;
}

export function normalizePhotoIdentification(raw: unknown): PhotoIdentification {
  const item = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const resultConfidence = confidence(item.confidence);
  const brand = normalizeBrand(text(item.brand, 80)) ?? "";
  const sport = text(item.sport, 50).toLowerCase();
  const productType = text(item.productType, 80);
  const model = text(item.model, 100);
  const modelNumber = text(item.modelNumber, 100);
  const size = normalizedSize(item.size);
  const throwHand = normalizedHand(item.throwHand);
  const drop = normalizedDrop(item.drop);
  const certification = text(item.certification, 50).toUpperCase();
  const visibleText = unique(
    (Array.isArray(item.visibleText) ? item.visibleText : [])
      .map((value) => text(value, 80))
      .filter(Boolean),
  ).slice(0, 12);

  // Low-confidence vision may provide broad search context, but uncertain
  // model/variant guesses must not make the search artificially return zero.
  const queryParts = resultConfidence === "low"
    ? [brand, productType]
    : [brand, model, modelNumber, productType, size, throwHand, drop, certification];
  const q = unique(queryParts.filter(Boolean)).join(" ").slice(0, 240);

  const fallbackLabel = [brand, model || modelNumber, productType].filter(Boolean).join(" ");
  const identified = text(item.identified, 180)
    || fallbackLabel
    || "Unable to identify a sporting goods item";

  return {
    q,
    sport,
    brand,
    productType,
    model,
    modelNumber,
    size,
    throwHand,
    drop,
    certification,
    visibleText,
    identified,
    confidence: resultConfidence,
    needsConfirmation: resultConfidence !== "high" || (!model && !modelNumber),
  };
}

