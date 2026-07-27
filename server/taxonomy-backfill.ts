export type BackfillProposal = {
  dealId: string;
  title: string;
  confidence: "high" | "medium" | "low";
  humanApprovalRequired: boolean;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
  proposedSportId: string | null;
  proposedCanonicalEquipmentTypeId: string | null;
  evidence: string[];
};

export type BackfillSnapshot = {
  id: string;
  title: string;
  sportId: string | null;
  equipmentTypeId: string | null;
  subFilterId: string | null;
  joinedSubFilterCount: number;
};

export type BackfillChange = {
  id: string;
  title: string;
  before: { sportId: string | null; equipmentTypeId: string | null };
  after: { sportId: string; equipmentTypeId: string };
};

export type BackfillSkip = { id: string; title: string; reason: string };

export function planGuardedTaxonomyBackfill(
  proposals: BackfillProposal[],
  snapshots: BackfillSnapshot[],
): { changes: BackfillChange[]; skipped: BackfillSkip[] } {
  const rows = new Map(snapshots.map((row) => [row.id, row]));
  const changes: BackfillChange[] = [];
  const skipped: BackfillSkip[] = [];

  for (const proposal of proposals) {
    const skip = (reason: string) =>
      skipped.push({ id: proposal.dealId, title: proposal.title, reason });
    if (proposal.confidence !== "high" || proposal.humanApprovalRequired) {
      skip("not an automatically eligible high-confidence proposal");
      continue;
    }
    if (!proposal.proposedSportId || !proposal.proposedCanonicalEquipmentTypeId) {
      skip("proposal has no complete destination");
      continue;
    }
    const row = rows.get(proposal.dealId);
    if (!row) {
      skip("deal no longer exists");
      continue;
    }
    if (row.title !== proposal.title
        || row.sportId !== proposal.currentSportId
        || row.equipmentTypeId !== proposal.currentEquipmentTypeId) {
      skip("live deal no longer matches the audited snapshot");
      continue;
    }
    if (row.subFilterId || row.joinedSubFilterCount > 0) {
      skip("existing sub-filter assignments require separate review");
      continue;
    }
    if (row.sportId === proposal.proposedSportId
        && row.equipmentTypeId === proposal.proposedCanonicalEquipmentTypeId) {
      skip("deal is already at the proposed destination");
      continue;
    }
    changes.push({
      id: row.id,
      title: row.title,
      before: { sportId: row.sportId, equipmentTypeId: row.equipmentTypeId },
      after: {
        sportId: proposal.proposedSportId,
        equipmentTypeId: proposal.proposedCanonicalEquipmentTypeId,
      },
    });
  }
  return { changes, skipped };
}
