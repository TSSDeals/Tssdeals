import { and, eq, isNull, notExists } from "drizzle-orm";
import { dealSubFilters, deals } from "@shared/schema";
import { db } from "./db";
import { classifyDeterministicProduct } from "./deterministic-product-classifier";

export type CrossCategoryRow = {
  id: string;
  title: string;
  brand: string | null;
  sportId: string | null;
  equipmentTypeId: string | null;
  subFilterId: string | null;
  joinedSubFilterCount: number;
  classificationLocked: boolean | null;
};

export type CrossCategoryProposal = CrossCategoryRow & {
  proposedSportId: string;
  proposedEquipmentTypeId: string;
  reason: string;
};

export function planCrossCategoryBackfill(rows: CrossCategoryRow[]) {
  const proposals: CrossCategoryProposal[] = [];
  const counts: Record<string, number> = {};
  let alreadyCorrect = 0;
  let ambiguous = 0;
  let protectedByReview = 0;

  for (const row of rows) {
    const classification = classifyDeterministicProduct(`${row.title} ${row.brand ?? ""}`);
    if (!classification) {
      ambiguous++;
      continue;
    }
    if (row.sportId === classification.sportId && row.equipmentTypeId === classification.equipmentTypeId) {
      alreadyCorrect++;
      continue;
    }
    if (row.classificationLocked || row.subFilterId || row.joinedSubFilterCount > 0) {
      protectedByReview++;
      continue;
    }
    proposals.push({
      ...row,
      proposedSportId: classification.sportId,
      proposedEquipmentTypeId: classification.equipmentTypeId,
      reason: classification.reason,
    });
    const key = `${row.equipmentTypeId ?? "unassigned"} -> ${classification.equipmentTypeId}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return { scanned: rows.length, proposed: proposals.length, alreadyCorrect, ambiguous, protectedByReview, counts, proposals };
}

async function loadCrossCategoryRows(): Promise<CrossCategoryRow[]> {
  const [rows, joinedRows] = await Promise.all([
    db.select({
    id: deals.id,
    title: deals.title,
    brand: deals.brand,
    sportId: deals.sportId,
    equipmentTypeId: deals.equipmentTypeId,
    subFilterId: deals.subFilterId,
    classificationLocked: deals.classificationLocked,
    }).from(deals).orderBy(deals.id),
    db.selectDistinct({ dealId: dealSubFilters.dealId }).from(dealSubFilters),
  ]);
  const joinedDealIds = new Set(joinedRows.map((row) => row.dealId));
  return rows.map((row) => ({ ...row, joinedSubFilterCount: joinedDealIds.has(row.id) ? 1 : 0 }));
}

export async function previewCrossCategoryBackfill(sampleLimit = 100) {
  const plan = planCrossCategoryBackfill(await loadCrossCategoryRows());
  return { ...plan, proposals: plan.proposals.slice(0, Math.max(1, Math.min(sampleLimit, 250))), generatedAt: new Date().toISOString() };
}

export async function applyCrossCategoryBackfill(limit = 100) {
  const plan = planCrossCategoryBackfill(await loadCrossCategoryRows());
  const selected = plan.proposals.slice(0, Math.max(1, Math.min(limit, 250)));
  const applied: CrossCategoryProposal[] = [];

  await db.transaction(async (tx) => {
    for (const proposal of selected) {
      const updated = await tx.update(deals).set({
        sportId: proposal.proposedSportId,
        equipmentTypeId: proposal.proposedEquipmentTypeId,
        classificationSource: "rule",
        classificationConfidence: "high",
        classificationUpdatedAt: new Date(),
      }).where(and(
        eq(deals.id, proposal.id),
        eq(deals.title, proposal.title),
        proposal.sportId === null ? isNull(deals.sportId) : eq(deals.sportId, proposal.sportId),
        proposal.equipmentTypeId === null ? isNull(deals.equipmentTypeId) : eq(deals.equipmentTypeId, proposal.equipmentTypeId),
        sql`COALESCE(${deals.classificationLocked}, false) = false`,
        isNull(deals.subFilterId),
        notExists(tx.select({ dealId: dealSubFilters.dealId }).from(dealSubFilters).where(eq(dealSubFilters.dealId, deals.id))),
      )).returning({ id: deals.id });
      if (updated.length === 1) applied.push(proposal);
    }
  });

  return {
    attempted: selected.length,
    applied: applied.length,
    skippedAfterPreview: selected.length - applied.length,
    remainingSafe: Math.max(0, plan.proposed - applied.length),
    counts: applied.reduce<Record<string, number>>((result, item) => {
      const key = `${item.equipmentTypeId ?? "unassigned"} -> ${item.proposedEquipmentTypeId}`;
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {}),
    generatedAt: new Date().toISOString(),
  };
}
