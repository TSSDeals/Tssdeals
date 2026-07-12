import OpenAI from "openai";
import { db } from "./db";
import { deals, msrpLookups } from "@shared/schema";
import { eq, and, isNull, gt, isNotNull, sql, ilike, desc } from "drizzle-orm";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface MsrpLookupResult {
  brand: string;
  model: string;
  manufacturerMsrpCents: number | null;
  confidence: "high" | "medium" | "low" | "not_found";
  sourceUrl: string | null;
  reasoning: string;
}

interface AiMsrpResponse {
  brand: string;
  model: string;
  msrp_usd: number | null;
  confidence: "high" | "medium" | "low" | "not_found";
  source_url: string | null;
  reasoning: string;
}

async function lookupMsrpViaAI(
  title: string,
  brand: string | null,
  sportId: string | null,
): Promise<MsrpLookupResult> {
  const sportContext = sportId ? ` (sport: ${sportId.replace(/-/g, " ")})` : "";
  const brandContext = brand ? ` by ${brand}` : "";

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: `You are a sporting goods pricing expert. Given a product listing title, identify the exact product and provide the manufacturer's official MSRP (Manufacturer's Suggested Retail Price) in USD.

Rules:
- Only provide MSRP you are confident about based on your training data
- The MSRP should be the ORIGINAL retail price when the product was new/current, NOT a sale price
- For discontinued products, use the last known MSRP
- If you cannot determine the exact MSRP, set confidence to "not_found"
- Extract the specific brand and model from the title
- For items sold in sets (e.g., "iron set"), provide the set MSRP, not individual club price

Respond with ONLY a JSON object (no markdown):
{
  "brand": "extracted brand name",
  "model": "extracted model name/number",
  "msrp_usd": 299.99,
  "confidence": "high|medium|low|not_found",
  "source_url": "manufacturer URL if known, or null",
  "reasoning": "brief explanation of how you determined the MSRP"
}`,
      },
      {
        role: "user",
        content: `Product: "${title}"${brandContext}${sportContext}`,
      },
    ],
    max_tokens: 300,
  });

  const content = response.choices[0]?.message?.content?.trim() ?? "";
  let parsed: AiMsrpResponse;
  try {
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.log(`[msrp-lookup] Failed to parse AI response for "${title}": ${content.slice(0, 200)}`);
    return {
      brand: brand ?? "Unknown",
      model: title.slice(0, 100),
      manufacturerMsrpCents: null,
      confidence: "not_found",
      sourceUrl: null,
      reasoning: "Failed to parse AI response",
    };
  }

  return {
    brand: parsed.brand || brand || "Unknown",
    model: parsed.model || title.slice(0, 100),
    manufacturerMsrpCents: parsed.msrp_usd ? Math.round(parsed.msrp_usd * 100) : null,
    confidence: parsed.confidence || "not_found",
    sourceUrl: parsed.source_url || null,
    reasoning: parsed.reasoning || "",
  };
}

async function findCachedLookup(brand: string, model: string) {
  const normalizedBrand = brand.toLowerCase().trim();
  const normalizedModel = model.toLowerCase().trim();

  const results = await db
    .select()
    .from(msrpLookups)
    .where(
      and(
        sql`LOWER(${msrpLookups.brand}) = ${normalizedBrand}`,
        sql`LOWER(${msrpLookups.model}) = ${normalizedModel}`,
      )
    )
    .limit(1);

  return results[0] ?? null;
}

async function saveLookup(result: MsrpLookupResult, sportId: string | null) {
  const existing = await findCachedLookup(result.brand, result.model);

  if (existing) {
    await db
      .update(msrpLookups)
      .set({
        manufacturerMsrpCents: result.manufacturerMsrpCents ?? existing.manufacturerMsrpCents,
        confidence: result.confidence,
        sourceUrl: result.sourceUrl,
        aiResponse: { reasoning: result.reasoning } as any,
        lookupCount: sql`${msrpLookups.lookupCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(msrpLookups.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(msrpLookups)
    .values({
      brand: result.brand,
      model: result.model,
      sportId,
      manufacturerMsrpCents: result.manufacturerMsrpCents,
      confidence: result.confidence,
      sourceUrl: result.sourceUrl,
      aiResponse: { reasoning: result.reasoning } as any,
    })
    .returning({ id: msrpLookups.id });

  return inserted.id;
}

export async function verifyMsrpForDeal(dealId: number): Promise<{
  success: boolean;
  msrpCents: number | null;
  confidence: string;
  message: string;
}> {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!deal) {
    return { success: false, msrpCents: null, confidence: "not_found", message: "Deal not found" };
  }

  const result = await lookupMsrpViaAI(deal.title, deal.brand, deal.sportId);
  await saveLookup(result, deal.sportId);

  if (result.manufacturerMsrpCents && result.confidence !== "not_found") {
    const isVerified = result.confidence === "high";
    await applyMsrpToDeal(dealId, result.manufacturerMsrpCents, isVerified);

    const allBrandMatches = await findMatchingDeals(result.brand, result.model, deal.sportId);
    let extraUpdated = 0;
    for (const matchId of allBrandMatches) {
      if (matchId !== dealId) {
        await applyMsrpToDeal(matchId, result.manufacturerMsrpCents, isVerified);
        extraUpdated++;
      }
    }

    return {
      success: true,
      msrpCents: result.manufacturerMsrpCents,
      confidence: result.confidence,
      message: `Found MSRP: $${(result.manufacturerMsrpCents / 100).toFixed(2)} (${result.confidence} confidence)${extraUpdated > 0 ? ` — also applied to ${extraUpdated} similar deals` : ""} — ${result.reasoning}`,
    };
  }

  return {
    success: false,
    msrpCents: null,
    confidence: result.confidence,
    message: `Could not determine MSRP: ${result.reasoning}`,
  };
}

async function findMatchingDeals(brand: string, model: string, sportId: string | null): Promise<number[]> {
  if (!brand || !model || model.length < 3) return [];

  const conditions = [
    isNull(deals.manufacturerMsrpCents),
    ilike(deals.brand, `%${brand}%`),
    ilike(deals.title, `%${model}%`),
  ];
  if (sportId) conditions.push(eq(deals.sportId, sportId));

  const matches = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(...conditions))
    .limit(50);

  return matches.map((m) => m.id);
}

async function applyMsrpToDeal(dealId: number, msrpCents: number, verified: boolean) {
  await db
    .update(deals)
    .set({
      manufacturerMsrpCents: msrpCents,
      msrpVerified: verified,
      msrpSource: "manufacturer",
    })
    .where(eq(deals.id, dealId));
}

export interface BatchVerifyOptions {
  sportId?: string;
  brand?: string;
  limit?: number;
  minPriceCents?: number;
}

export async function batchVerifyMsrps(
  options: BatchVerifyOptions = {},
): Promise<{
  verified: number;
  skipped: number;
  failed: number;
  log: string[];
}> {
  const batchLimit = options.limit || 50;
  const minPrice = options.minPriceCents || 2000;

  const conditions = [
    eq(deals.msrpVerified, false),
    isNull(deals.manufacturerMsrpCents),
    isNotNull(deals.brand),
    gt(deals.priceCents, minPrice),
  ];

  if (options.sportId) {
    conditions.push(eq(deals.sportId, options.sportId));
  }
  if (options.brand) {
    conditions.push(ilike(deals.brand, `%${options.brand}%`));
  }

  const unverifiedDeals = await db
    .select({ id: deals.id, title: deals.title, brand: deals.brand, sportId: deals.sportId, priceCents: deals.priceCents })
    .from(deals)
    .where(and(...conditions))
    .orderBy(desc(deals.priceCents))
    .limit(batchLimit);

  let verified = 0;
  let skipped = 0;
  let failed = 0;
  const log: string[] = [];

  for (const deal of unverifiedDeals) {
    try {
      const result = await verifyMsrpForDeal(deal.id);
      if (result.success) {
        verified++;
        log.push(`✓ ${deal.brand} — ${deal.title.slice(0, 60)}: $${((result.msrpCents ?? 0) / 100).toFixed(2)} MSRP (${result.confidence})`);
      } else {
        skipped++;
        log.push(`— ${deal.brand} — ${deal.title.slice(0, 60)}: ${result.message}`);
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch (err: any) {
      failed++;
      log.push(`✗ ${deal.brand} — ${deal.title.slice(0, 60)}: ERROR - ${err.message}`);
    }
  }

  return { verified, skipped, failed, log };
}

export async function getMsrpVerificationStats() {
  // node-postgres driver: db.execute returns a QueryResult, NOT an iterable —
  // read .rows[0] rather than array-destructuring (which throws at runtime).
  const statsRes = await db.execute(sql`
    SELECT
      COUNT(*) as total_deals,
      COUNT(CASE WHEN msrp_verified = true THEN 1 END) as verified_count,
      COUNT(CASE WHEN manufacturer_msrp_cents IS NOT NULL THEN 1 END) as has_mfr_msrp,
      COUNT(CASE WHEN msrp_verified = false AND manufacturer_msrp_cents IS NULL AND brand IS NOT NULL AND price_cents > 2000 THEN 1 END) as pending_verification
    FROM deals
  `);

  const lookupRes = await db.execute(sql`
    SELECT COUNT(*) as total_lookups,
      COUNT(CASE WHEN manufacturer_msrp_cents IS NOT NULL THEN 1 END) as successful_lookups
    FROM msrp_lookups
  `);

  const stats = (statsRes.rows[0] ?? {}) as Record<string, unknown>;
  const lookupStats = (lookupRes.rows[0] ?? {}) as Record<string, unknown>;

  return {
    totalDeals: Number(stats.total_deals) || 0,
    verifiedCount: Number(stats.verified_count) || 0,
    hasMfrMsrp: Number(stats.has_mfr_msrp) || 0,
    pendingVerification: Number(stats.pending_verification) || 0,
    totalLookups: Number(lookupStats.total_lookups) || 0,
    successfulLookups: Number(lookupStats.successful_lookups) || 0,
  };
}

export async function getRecentLookups(limit: number = 50) {
  return db
    .select()
    .from(msrpLookups)
    .orderBy(desc(msrpLookups.updatedAt))
    .limit(limit);
}
