const COMPARABLE_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "this", "that", "was", "are",
  "new", "used", "pre-owned", "nwt", "nib", "size", "sz", "mens", "womens",
  "youth", "kids", "boys", "girls", "adult", "osfm", "osfa", "ships", "ship",
  "shipping", "free", "brand", "tags", "tag", "without", "w", "wo",
]);

function normalizedTitleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/(\d)\s*["”]/g, "$1 inch ")
    .replace(/[^a-z0-9.\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length > 1 && !COMPARABLE_STOP_WORDS.has(word));
}

export function extractSearchKeywords(title: string): string {
  const words = normalizedTitleWords(title);
  const distinctive = words.filter((word) => /\d/.test(word) || word.length >= 4);
  return Array.from(new Set([...distinctive, ...words])).slice(0, 9).join(" ");
}

export type ComparableCandidate = {
  title: string;
  condition?: string;
  conditionId?: string;
};

function equipmentFamily(title: string): string | null {
  const value = ` ${title.toLowerCase()} `;
  if (/\b(batting gloves?|batting mitts?)\b/.test(value)) return "batting-gloves";
  if (/\b(first base mitt|catcher'?s? mitt|baseball glove|softball glove|fielding glove|a2000|a2k|heart of the hide|pro preferred)\b/.test(value)) return "fielding-gloves";
  if (/\b(baseball bat|softball bat|fastpitch bat|slowpitch bat|bbcor|usssa)\b/.test(value)) return "bats";
  if (/\b(cleats?|shoes?|footwear)\b/.test(value)) return "footwear";
  if (/\b(helmet|catcher'?s? gear|chest protector|leg guards?)\b/.test(value)) return "protective";
  return null;
}

function conditionGroup(condition: string | undefined): "new" | "used" | null {
  const value = (condition || "").toLowerCase();
  if (/\b(new|new other)\b/.test(value)) return "new";
  if (/\b(used|pre-owned|preowned|refurbished)\b/.test(value)) return "used";
  return null;
}

export function isRelevantComparable(source: ComparableCandidate, candidate: ComparableCandidate): boolean {
  const sourceWords = new Set(normalizedTitleWords(source.title));
  const candidateWords = new Set(normalizedTitleWords(candidate.title));
  const sourceFamily = equipmentFamily(source.title);
  const candidateFamily = equipmentFamily(candidate.title);
  if (sourceFamily && candidateFamily && sourceFamily !== candidateFamily) return false;

  const sourceCondition = conditionGroup(source.condition);
  const candidateCondition = conditionGroup(candidate.condition);
  if (sourceCondition && candidateCondition && sourceCondition !== candidateCondition) return false;

  const sourceHand = /\b(lht|left hand throw|left-handed throw)\b/i.test(source.title) ? "lht"
    : /\b(rht|right hand throw|right-handed throw)\b/i.test(source.title) ? "rht" : null;
  const candidateHand = /\b(lht|left hand throw|left-handed throw)\b/i.test(candidate.title) ? "lht"
    : /\b(rht|right hand throw|right-handed throw)\b/i.test(candidate.title) ? "rht" : null;
  if (sourceHand && candidateHand && sourceHand !== candidateHand) return false;

  const distinctive = [...sourceWords].filter((word) => /\d/.test(word) || word.length >= 5);
  const requiredOverlap = distinctive.length >= 3 ? 2 : 1;
  return distinctive.filter((word) => candidateWords.has(word)).length >= requiredOverlap;
}

export function summarizeComparablePrices(prices: number[]) {
  const sorted = prices.filter((price) => Number.isFinite(price) && price > 0).sort((a, b) => a - b);
  if (!sorted.length) return { prices: [], average: null, median: null, lowest: null, highest: null };
  const medianOf = (values: number[]) => {
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2);
  };
  let retained = sorted;
  if (sorted.length >= 5) {
    const middle = Math.floor(sorted.length / 2);
    const q1 = medianOf(sorted.slice(0, middle));
    const q3 = medianOf(sorted.slice(sorted.length % 2 ? middle + 1 : middle));
    const iqr = q3 - q1;
    retained = sorted.filter((price) => price >= q1 - 1.5 * iqr && price <= q3 + 1.5 * iqr);
  }
  return {
    prices: retained,
    average: Math.round(retained.reduce((sum, price) => sum + price, 0) / retained.length),
    median: medianOf(retained),
    lowest: retained[0],
    highest: retained[retained.length - 1],
  };
}

export function determineCompetitiveness(
  myPriceCents: number,
  medianListedCents: number | null,
  avgSoldCents: number | null,
  comparableCount = 0,
): "underpriced" | "competitive" | "slightly_high" | "overpriced" | "no_data" {
  const referencePrice = avgSoldCents || medianListedCents;
  if (!referencePrice || (!avgSoldCents && comparableCount < 3)) return "no_data";
  const ratio = myPriceCents / referencePrice;
  if (ratio < 0.85) return "underpriced";
  if (ratio <= 1.10) return "competitive";
  if (ratio <= 1.25) return "slightly_high";
  return "overpriced";
}

export function calculateSuggestedPrice(
  avgListedCents: number | null,
  medianListedCents: number | null,
  avgSoldCents: number | null,
  medianSoldCents: number | null,
  procurementCostCents: number | null,
  comparableCount = 0,
): number | null {
  if (!avgSoldCents && !medianSoldCents && comparableCount < 3) return null;
  const pricePoints = [avgSoldCents, medianSoldCents, avgListedCents, medianListedCents]
    .filter((price): price is number => price !== null);
  if (!pricePoints.length) return null;
  const soldCount = Number(avgSoldCents !== null) + Number(medianSoldCents !== null);
  const weights = pricePoints.map((_, index) => soldCount && index < soldCount ? 3 : 1);
  let suggested = Math.round(
    pricePoints.reduce((sum, price, index) => sum + price * weights[index], 0)
      / weights.reduce((sum, weight) => sum + weight, 0),
  );
  if (procurementCostCents && suggested < procurementCostCents * 1.15) {
    suggested = Math.round(procurementCostCents * 1.15);
  }
  return Math.round(suggested / 100) * 100;
}

export function estimateEbayFees(priceCents: number): number {
  return Math.round(priceCents * 0.1325) + 40;
}
