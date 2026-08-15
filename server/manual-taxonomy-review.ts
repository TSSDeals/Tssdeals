import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { aiClassifications, deals, equipmentTypes, sports } from "@shared/schema";
import { db } from "./db";
import { classifyDealSubFilter } from "./sub-filter-classifier";
import { classifyDeterministicProduct } from "./deterministic-product-classifier";

export type ManualTaxonomyReviewRow = {
  id: string;
  title: string;
  brand: string | null;
  sourceId: string;
  imageUrl: string | null;
  priceCents: number;
  sportId: string | null;
  equipmentTypeId: string | null;
  classificationSource: string | null;
  classificationConfidence: string | null;
  classificationLocked: boolean | null;
};

export type ManualTaxonomySuggestion = {
  sportId: string | null;
  equipmentTypeId: string | null;
  confidence: string | null;
  reasoning: string | null;
};

export type ManualTaxonomyReviewItem = ManualTaxonomyReviewRow & {
  suggestion: ManualTaxonomySuggestion | null;
};

export function makeManualReviewSignature(title: string, brand: string | null): string {
  const normalizedBrand = (brand ?? "").toLowerCase().trim();
  const normalizedTitle = title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
  return `${normalizedBrand}|${normalizedTitle}`;
}

export function planManualTaxonomyReviewQueue(
  rows: ManualTaxonomyReviewRow[],
  suggestions: Map<string, ManualTaxonomySuggestion>,
  limit = 25,
): ManualTaxonomyReviewItem[] {
  return rows
    .filter((row) => !row.classificationLocked)
    .filter((row) => row.classificationSource !== "manual" && row.classificationSource !== "manual-skip")
    .filter((row) => !classifyDeterministicProduct(`${row.title} ${row.brand ?? ""}`))
    .map((row) => ({
      ...row,
      suggestion: suggestions.get(makeManualReviewSignature(row.title, row.brand)) ?? null,
    }))
    .sort((a, b) => {
      const aSuggested = a.suggestion?.sportId && a.suggestion?.equipmentTypeId ? 1 : 0;
      const bSuggested = b.suggestion?.sportId && b.suggestion?.equipmentTypeId ? 1 : 0;
      if (aSuggested !== bSuggested) return bSuggested - aSuggested;
      return b.priceCents - a.priceCents;
    })
    .slice(0, Math.max(1, Math.min(limit, 50)));
}

export async function listManualTaxonomyReviewQueue(limit = 25) {
  const candidates = await db
    .select({
      id: deals.id,
      title: deals.title,
      brand: deals.brand,
      sourceId: deals.sourceId,
      imageUrl: deals.imageUrl,
      priceCents: deals.priceCents,
      sportId: deals.sportId,
      equipmentTypeId: deals.equipmentTypeId,
      classificationSource: deals.classificationSource,
      classificationConfidence: deals.classificationConfidence,
      classificationLocked: deals.classificationLocked,
    })
    .from(deals)
    .where(and(
      sql`COALESCE(${deals.classificationLocked}, false) = false`,
      sql`${deals.classificationSource} IS DISTINCT FROM 'manual'`,
      sql`${deals.classificationSource} IS DISTINCT FROM 'manual-skip'`,
      or(
        isNull(deals.sportId),
        isNull(deals.equipmentTypeId),
        sql`${deals.equipmentTypeId} LIKE '%-other'`,
        eq(deals.classificationConfidence, "low"),
      ),
    ))
    .orderBy(sql`${deals.priceCents} DESC`)
    .limit(250);

  const signatures = Array.from(new Set(candidates.map((row) => makeManualReviewSignature(row.title, row.brand))));
  const cached = signatures.length
    ? await db.select().from(aiClassifications).where(inArray(aiClassifications.signature, signatures))
    : [];
  const suggestions = new Map<string, ManualTaxonomySuggestion>();
  for (const row of cached) {
    if (!row.isSportingGoods || !["high", "medium"].includes(row.confidence)) continue;
    suggestions.set(row.signature, {
      sportId: row.sportId,
      equipmentTypeId: row.equipmentTypeId,
      confidence: row.confidence,
      reasoning: row.reasoning,
    });
  }

  return {
    items: planManualTaxonomyReviewQueue(candidates, suggestions, limit),
    candidateCount: candidates.length,
    generatedAt: new Date().toISOString(),
  };
}

export async function approveManualTaxonomyReview(input: {
  dealId: string;
  sportId: string;
  equipmentTypeId: string;
  applyExactMatches?: boolean;
}) {
  const [deal] = await db.select().from(deals).where(eq(deals.id, input.dealId)).limit(1);
  if (!deal) throw new Error("Deal not found");
  if (deal.classificationLocked) throw new Error("This deal already has a locked manual classification");

  const [[sport], [equipment]] = await Promise.all([
    db.select({ id: sports.id }).from(sports).where(eq(sports.id, input.sportId)).limit(1),
    db.select({ id: equipmentTypes.id, sportId: equipmentTypes.sportId })
      .from(equipmentTypes).where(eq(equipmentTypes.id, input.equipmentTypeId)).limit(1),
  ]);
  if (!sport) throw new Error("Sport not found");
  if (!equipment || equipment.sportId !== input.sportId) throw new Error("Equipment category does not belong to the selected sport");

  const signature = makeManualReviewSignature(deal.title, deal.brand);
  let targetIds = [deal.id];
  if (input.applyExactMatches) {
    const possibleMatches = await db.select({
      id: deals.id,
      title: deals.title,
      brand: deals.brand,
      classificationLocked: deals.classificationLocked,
    }).from(deals).where(deal.brand === null ? isNull(deals.brand) : eq(deals.brand, deal.brand));
    targetIds = possibleMatches
      .filter((row) => !row.classificationLocked)
      .filter((row) => makeManualReviewSignature(row.title, row.brand) === signature)
      .map((row) => row.id)
      .slice(0, 1000);
  }

  const subFilterId = classifyDealSubFilter(deal.title, input.equipmentTypeId);
  await db.transaction(async (tx) => {
    await tx.update(deals).set({
      sportId: input.sportId,
      equipmentTypeId: input.equipmentTypeId,
      subFilterId,
      classificationSource: "manual",
      classificationConfidence: "high",
      classificationLocked: true,
      classificationUpdatedAt: new Date(),
    }).where(inArray(deals.id, targetIds));

    await tx.insert(aiClassifications).values({
      signature,
      sportId: input.sportId,
      equipmentTypeId: input.equipmentTypeId,
      isSportingGoods: true,
      confidence: "high",
      reasoning: "Approved in Justin Review Queue",
      aiResponse: { manualApproval: true },
    }).onConflictDoUpdate({
      target: aiClassifications.signature,
      set: {
        sportId: input.sportId,
        equipmentTypeId: input.equipmentTypeId,
        isSportingGoods: true,
        confidence: "high",
        reasoning: "Approved in Justin Review Queue",
        aiResponse: { manualApproval: true },
        updatedAt: new Date(),
      },
    });
  });

  return { success: true, updated: targetIds.length, learnedSignature: signature };
}

export async function skipManualTaxonomyReview(dealId: string) {
  const updated = await db.update(deals).set({
    classificationSource: "manual-skip",
    classificationUpdatedAt: new Date(),
  }).where(and(eq(deals.id, dealId), sql`COALESCE(${deals.classificationLocked}, false) = false`)).returning({ id: deals.id });
  return { success: updated.length === 1 };
}
