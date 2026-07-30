import { and, eq, isNull, notExists, or, sql } from "drizzle-orm";
import { dealSubFilters, deals } from "@shared/schema";
import { db } from "./db";
import { classifyGolfClubProduct, isGolfClubAccessoryOnly } from "./golf-product-classifier";

export type GolfBackfillRow = {
  id: string;
  title: string;
  sportId: string | null;
  equipmentTypeId: string | null;
  subFilterId: string | null;
  joinedSubFilterCount: number;
};

export type GolfBackfillProposal = GolfBackfillRow & {
  proposedSportId: "golf";
  proposedEquipmentTypeId: string;
  reason: string;
};

export function planGolfTaxonomyBackfill(rows: GolfBackfillRow[]) {
  const proposals: GolfBackfillProposal[] = [];
  const counts: Record<string, number> = {};
  let accessoriesExcluded = 0;
  let ambiguous = 0;
  let alreadyCorrect = 0;
  let protectedBySubFilters = 0;

  for (const row of rows) {
    if (isGolfClubAccessoryOnly(row.title)) {
      accessoriesExcluded++;
      continue;
    }
    const classification = classifyGolfClubProduct(row.title);
    if (!classification) {
      ambiguous++;
      continue;
    }
    if (
      row.sportId === classification.sportId
      && row.equipmentTypeId === classification.equipmentTypeId
    ) {
      alreadyCorrect++;
      continue;
    }
    if (row.subFilterId || row.joinedSubFilterCount > 0) {
      protectedBySubFilters++;
      continue;
    }
    proposals.push({
      ...row,
      proposedSportId: classification.sportId,
      proposedEquipmentTypeId: classification.equipmentTypeId,
      reason: classification.reason,
    });
    counts[classification.equipmentTypeId] = (counts[classification.equipmentTypeId] ?? 0) + 1;
  }

  return {
    scanned: rows.length,
    proposed: proposals.length,
    alreadyCorrect,
    accessoriesExcluded,
    ambiguous,
    protectedBySubFilters,
    counts,
    proposals,
  };
}

async function loadGolfBackfillRows(): Promise<GolfBackfillRow[]> {
  const rows = await db
    .select({
      id: deals.id,
      title: deals.title,
      sportId: deals.sportId,
      equipmentTypeId: deals.equipmentTypeId,
      subFilterId: deals.subFilterId,
      joinedSubFilterCount: sql<number>`(
        SELECT count(*)::int FROM deal_sub_filters dsf WHERE dsf.deal_id = ${deals.id}
      )`,
    })
    .from(deals)
    .where(or(
      eq(deals.sportId, "golf"),
      sql`${deals.equipmentTypeId} LIKE 'golf-%'`,
      sql`lower(${deals.title}) ~ '(golf|driver|fairway|hybrid|rescue club|iron|wedge|putter|qi35|qi10|paradym|elyte|g440|g430|scotty cameron|ai-one)'`,
    ))
    .orderBy(deals.id);
  return rows.map((row) => ({
    ...row,
    joinedSubFilterCount: Number(row.joinedSubFilterCount) || 0,
  }));
}

export async function previewGolfTaxonomyBackfill(sampleLimit = 50) {
  const plan = planGolfTaxonomyBackfill(await loadGolfBackfillRows());
  return {
    ...plan,
    proposals: plan.proposals.slice(0, Math.max(1, Math.min(sampleLimit, 250))),
    generatedAt: new Date().toISOString(),
  };
}

export async function applyGolfTaxonomyBackfill(limit = 100) {
  const plan = planGolfTaxonomyBackfill(await loadGolfBackfillRows());
  const selected = plan.proposals.slice(0, Math.max(1, Math.min(limit, 250)));
  const applied: GolfBackfillProposal[] = [];

  await db.transaction(async (tx) => {
    for (const proposal of selected) {
      const updated = await tx
        .update(deals)
        .set({
          sportId: proposal.proposedSportId,
          equipmentTypeId: proposal.proposedEquipmentTypeId,
          classificationSource: "rule",
          classificationConfidence: "high",
        })
        .where(and(
          eq(deals.id, proposal.id),
          eq(deals.title, proposal.title),
          proposal.sportId === null ? isNull(deals.sportId) : eq(deals.sportId, proposal.sportId),
          proposal.equipmentTypeId === null
            ? isNull(deals.equipmentTypeId)
            : eq(deals.equipmentTypeId, proposal.equipmentTypeId),
          isNull(deals.subFilterId),
          notExists(
            tx.select({ dealId: dealSubFilters.dealId })
              .from(dealSubFilters)
              .where(eq(dealSubFilters.dealId, deals.id)),
          ),
        ))
        .returning({ id: deals.id });
      if (updated.length === 1) applied.push(proposal);
    }
  });

  return {
    attempted: selected.length,
    applied: applied.length,
    skippedAfterPreview: selected.length - applied.length,
    remainingSafe: Math.max(0, plan.proposed - applied.length),
    counts: applied.reduce<Record<string, number>>((result, item) => {
      result[item.proposedEquipmentTypeId] = (result[item.proposedEquipmentTypeId] ?? 0) + 1;
      return result;
    }, {}),
    generatedAt: new Date().toISOString(),
  };
}
