import { db } from "./db";
import { ebayPricingReports, ebayItemCosts } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { log } from "./index";
import { logEbayError } from "./ebay-errors";
import { pricingReportFailureFields } from "./ebay-pricing-status";
import {
  createEbayBrowseBudget,
  fetchEbayBrowseJson,
  isEbayRateLimitError,
  type EbayBrowseBudget,
} from "./ebay-browse-client";
import {
  calculateSuggestedPrice as auditedSuggestedPrice,
  determineCompetitiveness as auditedCompetitiveness,
  estimateEbayFees as auditedEbayFees,
  extractSearchKeywords as auditedSearchKeywords,
  isRelevantComparable as auditedComparableMatch,
  summarizeComparablePrices as auditedPriceSummary,
} from "./ebay-pricing-math";

const EBAY_AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const MY_SELLER_USERNAME = "twinseamsports";

interface EbayItemSummary {
  itemId: string;
  title: string;
  price: { value: string; currency: string };
  condition: string;
  conditionId: string;
  itemWebUrl: string;
  image?: { imageUrl: string };
  seller?: { username: string; feedbackPercentage: string; feedbackScore: number };
  buyingOptions?: string[];
  categories?: Array<{ categoryId: string; categoryName: string }>;
  marketingPrice?: {
    originalPrice: { value: string; currency: string };
    discountPercentage: string;
  };
}

interface EbaySearchResponse {
  total: number;
  limit: number;
  offset: number;
  itemSummaries?: EbayItemSummary[];
  warnings?: Array<{ message: string }>;
  errors?: Array<{ message: string; errorId: number }>;
}

export interface PricingReportItem {
  ebayItemId: string;
  title: string;
  myPriceCents: number;
  imageUrl: string | null;
  itemUrl: string;
  condition: string;
  categoryId: string | null;
  categoryName: string | null;
  avgListedPriceCents: number | null;
  medianListedPriceCents: number | null;
  avgSoldPriceCents: number | null;
  medianSoldPriceCents: number | null;
  lowestListedPriceCents: number | null;
  highestListedPriceCents: number | null;
  comparableCount: number;
  soldCount: number;
  suggestedPriceCents: number | null;
  procurementCostCents: number | null;
  estimatedProfitCents: number | null;
  profitMarginPercent: number | null;
  estimatedFeesCents: number | null;
  pricingConfidence: "none" | "low" | "medium" | "high";
  competitiveness: "underpriced" | "competitive" | "slightly_high" | "overpriced" | "no_data";
}

let cachedAppToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("eBay API credentials not configured");

  if (cachedAppToken && Date.now() < cachedAppToken.expiresAt - 60000) {
    return cachedAppToken.token;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(EBAY_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`eBay auth error ${response.status}: ${text}`);
  }

  const data = await response.json();
  cachedAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function searchEbay(
  token: string,
  params: URLSearchParams,
  budget: EbayBrowseBudget,
): Promise<EbaySearchResponse> {
  const url = `${EBAY_BROWSE_URL}?${params.toString()}`;
  return fetchEbayBrowseJson<EbaySearchResponse>(url, {
    token,
    operation: "pricing marketplace search",
    purpose: "pricing",
    budget,
    maxRetries: 0,
  });
}

export async function fetchMyStoreListings(
  budget = createEbayBrowseBudget("pricing report", 100),
): Promise<EbayItemSummary[]> {
  const token = await getAppToken();
  const allItems: EbayItemSummary[] = [];
  const seenIds = new Set<string>();
  const pageSize = 200;
  const maxPages = 1;
  const failures: unknown[] = [];

  const categoryIds = [
    "888",    // Sporting Goods
    "11450",  // Clothing, Shoes & Accessories
    "64482",  // Sports Mem, Cards & Fan Shop
    "159043", // Memorabilia, Fan Shop & Sports Cards
  ];

  for (const catId of categoryIds) {
    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      if (offset >= 10000) break;

      const params = new URLSearchParams({
        category_ids: catId,
        limit: String(pageSize),
        fieldgroups: "EXTENDED",
        filter: `sellers:{${MY_SELLER_USERNAME}},buyingOptions:{FIXED_PRICE},deliveryCountry:US`,
        sort: "newlyListed",
      });

      if (offset > 0) {
        params.set("offset", String(offset));
      }

      let data: EbaySearchResponse | null = null;
      try {
        data = await searchEbay(token, params, budget);
      } catch (e: any) {
        failures.push(e);
        logEbayError(e);
        log(`eBay store search (cat ${catId}) failed`, "ebay-pricing");
        break;
      }

      if (!data?.itemSummaries?.length) break;

      for (const item of data.itemSummaries) {
        if (!seenIds.has(item.itemId)) {
          seenIds.add(item.itemId);
          allItems.push(item);
        }
      }

      if ((offset + data.itemSummaries.length) >= (data.total || 0) || data.itemSummaries.length < pageSize) break;

      await delay(200);
    }
    await delay(100);
  }

  if (failures.length > 0) {
    throw failures[0];
  }

  return allItems;
}

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

type ComparableCandidate = Pick<EbayItemSummary, "title" | "condition" | "conditionId">;

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

  const distinctive = [...sourceWords].filter((word) =>
    /\d/.test(word) || word.length >= 5
  );
  const requiredOverlap = distinctive.length >= 3 ? 2 : 1;
  const overlap = distinctive.filter((word) => candidateWords.has(word)).length;
  return overlap >= requiredOverlap;
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
    const lower = sorted.slice(0, middle);
    const upper = sorted.slice(sorted.length % 2 ? middle + 1 : middle);
    const q1 = medianOf(lower);
    const q3 = medianOf(upper);
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

async function findComparableActiveListings(
  token: string,
  sourceItem: EbayItemSummary,
  categoryId: string | null,
  budget: EbayBrowseBudget,
  cache: Map<string, Promise<EbaySearchResponse>>,
): Promise<{ items: EbayItemSummary[]; avgPriceCents: number | null; medianPriceCents: number | null; lowestPriceCents: number | null; highestPriceCents: number | null }> {
  const keywords = auditedSearchKeywords(sourceItem.title);
  if (!keywords) return { items: [], avgPriceCents: null, medianPriceCents: null, lowestPriceCents: null, highestPriceCents: null };

  const params = new URLSearchParams({
    q: keywords,
    limit: "50",
    fieldgroups: "EXTENDED",
    filter: `buyingOptions:{FIXED_PRICE},deliveryCountry:US`,
    sort: "price",
  });

  if (categoryId) {
    params.set("category_ids", categoryId);
  }

  try {
    const cacheKey = params.toString();
    let request = cache.get(cacheKey);
    if (!request) {
      request = searchEbay(token, params, budget);
      cache.set(cacheKey, request);
    }
    const data = await request;
    const items = (data.itemSummaries || []).filter((item) =>
      item.seller?.username?.toLowerCase() !== MY_SELLER_USERNAME.toLowerCase()
      && auditedComparableMatch(sourceItem, item)
    );

    if (items.length === 0) {
      return { items: [], avgPriceCents: null, medianPriceCents: null, lowestPriceCents: null, highestPriceCents: null };
    }

    const summary = auditedPriceSummary(
      items.map((item) => Math.round(parseFloat(item.price.value) * 100)),
    );
    const retainedPrices = new Set(summary.prices);
    const retainedItems = items.filter((item) => retainedPrices.has(Math.round(parseFloat(item.price.value) * 100)));
    return {
      items: retainedItems,
      avgPriceCents: summary.average,
      medianPriceCents: summary.median,
      lowestPriceCents: summary.lowest,
      highestPriceCents: summary.highest,
    };
  } catch (err: any) {
    if (isEbayRateLimitError(err)) throw err;
    log(`Comparable search failed for "${keywords}": ${err.message}`, "ebay-pricing");
    return { items: [], avgPriceCents: null, medianPriceCents: null, lowestPriceCents: null, highestPriceCents: null };
  }
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
  const pricePoints: number[] = [];
  if (avgSoldCents) pricePoints.push(avgSoldCents);
  if (medianSoldCents) pricePoints.push(medianSoldCents);
  if (avgListedCents) pricePoints.push(avgListedCents);
  if (medianListedCents) pricePoints.push(medianListedCents);

  if (pricePoints.length === 0) return null;

  let weights: number[];
  if (avgSoldCents || medianSoldCents) {
    weights = pricePoints.map((_, i) => {
      if (i < (avgSoldCents && medianSoldCents ? 2 : 1)) return 3;
      return 1;
    });
  } else {
    weights = pricePoints.map(() => 1);
  }

  const weightedSum = pricePoints.reduce((sum, p, i) => sum + p * weights[i], 0);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let suggested = Math.round(weightedSum / totalWeight);

  if (procurementCostCents && suggested < procurementCostCents * 1.15) {
    suggested = Math.round(procurementCostCents * 1.15);
  }

  return Math.round(suggested / 100) * 100;
}

export function estimateEbayFees(priceCents: number): number {
  return Math.round(priceCents * 0.1325) + 40;
}

let reportGenerationInProgress = false;

export async function generatePricingReport(): Promise<string> {
  if (reportGenerationInProgress) {
    throw new Error("A pricing report is already being generated. Please wait for it to complete.");
  }
  reportGenerationInProgress = true;

  const [report] = await db
    .insert(ebayPricingReports)
    .values({ status: "pending", totalListings: 0 })
    .returning();

  try {
    log("Starting eBay pricing analysis report...", "ebay-pricing");
    const token = await getAppToken();
    const browseBudget = createEbayBrowseBudget("pricing report", 100);

    const myListings = await fetchMyStoreListings(browseBudget);
    log(`Found ${myListings.length} active listings for ${MY_SELLER_USERNAME}`, "ebay-pricing");

    if (myListings.length === 0) {
      await db
        .update(ebayPricingReports)
        .set({ status: "complete", totalListings: 0, reportData: [], completedAt: new Date() })
        .where(eq(ebayPricingReports.id, report.id));
      return report.id;
    }

    const existingCosts = await db.select().from(ebayItemCosts);
    const costMap = new Map(existingCosts.map(c => [c.ebayItemId, c.procurementCostCents]));

    const reportItems: PricingReportItem[] = [];
    const comparableCache = new Map<string, Promise<EbaySearchResponse>>();

    for (let i = 0; i < myListings.length; i++) {
      const item = myListings[i];
      const myPriceCents = Math.round(parseFloat(item.price.value) * 100);
      const categoryId = item.categories?.[0]?.categoryId || null;
      const categoryName = item.categories?.[0]?.categoryName || null;

      const comparables = await findComparableActiveListings(
        token,
        item,
        categoryId,
        browseBudget,
        comparableCache,
      );
      await delay(300);

      const procurementCostCents = costMap.get(item.itemId) || null;

      const suggestedPriceCents = auditedSuggestedPrice(
        comparables.avgPriceCents,
        comparables.medianPriceCents,
        null,
        null,
        procurementCostCents,
        comparables.items.length,
      );

      let estimatedProfitCents: number | null = null;
      let profitMarginPercent: number | null = null;
      const priceForProfit = suggestedPriceCents || myPriceCents;
      if (procurementCostCents) {
        const estimatedFeesCents = auditedEbayFees(priceForProfit);
        estimatedProfitCents = priceForProfit - procurementCostCents - estimatedFeesCents;
        profitMarginPercent = Math.round((estimatedProfitCents / priceForProfit) * 100);
      }

      const competitiveness = auditedCompetitiveness(
        myPriceCents,
        comparables.medianPriceCents,
        null,
        comparables.items.length,
      );
      const estimatedFeesCents = auditedEbayFees(priceForProfit);
      const pricingConfidence = comparables.items.length >= 10 ? "high"
        : comparables.items.length >= 5 ? "medium"
        : comparables.items.length >= 3 ? "low"
        : "none";

      reportItems.push({
        ebayItemId: item.itemId,
        title: item.title,
        myPriceCents,
        imageUrl: item.image?.imageUrl || null,
        itemUrl: item.itemWebUrl,
        condition: item.condition || "Unknown",
        categoryId,
        categoryName,
        avgListedPriceCents: comparables.avgPriceCents,
        medianListedPriceCents: comparables.medianPriceCents,
        lowestListedPriceCents: comparables.lowestPriceCents,
        highestListedPriceCents: comparables.highestPriceCents,
        comparableCount: comparables.items.length,
        soldCount: 0,
        avgSoldPriceCents: null,
        medianSoldPriceCents: null,
        suggestedPriceCents,
        procurementCostCents,
        estimatedProfitCents,
        profitMarginPercent,
        estimatedFeesCents,
        pricingConfidence,
        competitiveness,
      });

      if ((i + 1) % 10 === 0) {
        log(`Pricing analysis: ${i + 1}/${myListings.length} items processed`, "ebay-pricing");
      }
    }

    await db
      .update(ebayPricingReports)
      .set({
        status: "complete",
        totalListings: reportItems.length,
        reportData: reportItems,
        completedAt: new Date(),
      })
      .where(eq(ebayPricingReports.id, report.id));

    log(`eBay pricing report complete: ${reportItems.length} items analyzed`, "ebay-pricing");
    return report.id;
  } catch (err: any) {
    logEbayError(err);
    const failure = pricingReportFailureFields(err);
    log(`eBay pricing report failed: ${failure.errorMessage}`, "ebay-pricing");
    await db
      .update(ebayPricingReports)
      .set(failure)
      .where(eq(ebayPricingReports.id, report.id));
    return report.id;
  } finally {
    reportGenerationInProgress = false;
  }
}

export async function getLatestReport() {
  const [report] = await db
    .select()
    .from(ebayPricingReports)
    .orderBy(desc(ebayPricingReports.createdAt))
    .limit(1);
  return report || null;
}

export async function getReport(id: string) {
  const [report] = await db
    .select()
    .from(ebayPricingReports)
    .where(eq(ebayPricingReports.id, id));
  return report || null;
}

export async function listReports(limit = 20) {
  return db
    .select({
      id: ebayPricingReports.id,
      status: ebayPricingReports.status,
      totalListings: ebayPricingReports.totalListings,
      createdAt: ebayPricingReports.createdAt,
      completedAt: ebayPricingReports.completedAt,
      errorMessage: ebayPricingReports.errorMessage,
    })
    .from(ebayPricingReports)
    .orderBy(desc(ebayPricingReports.createdAt))
    .limit(limit);
}

export async function upsertItemCost(
  ebayItemId: string,
  title: string,
  procurementCostCents: number | null,
  notes?: string,
) {
  const existing = await db
    .select()
    .from(ebayItemCosts)
    .where(eq(ebayItemCosts.ebayItemId, ebayItemId))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(ebayItemCosts)
      .set({
        procurementCostCents,
        notes: notes ?? existing[0].notes,
        title,
        updatedAt: new Date(),
      })
      .where(eq(ebayItemCosts.ebayItemId, ebayItemId))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(ebayItemCosts)
    .values({ ebayItemId, title, procurementCostCents, notes })
    .returning();
  return created;
}

export async function listItemCosts() {
  return db.select().from(ebayItemCosts).orderBy(desc(ebayItemCosts.updatedAt));
}

export async function deleteItemCost(id: string) {
  await db.delete(ebayItemCosts).where(eq(ebayItemCosts.id, id));
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
