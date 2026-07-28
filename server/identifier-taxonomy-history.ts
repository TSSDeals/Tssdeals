export type IdentifierTaxonomyRecord = {
  dealId: string;
  title: string;
  currentSportId: string | null;
  currentEquipmentTypeId: string | null;
};

export type IdentifierTaxonomyRecommendation = {
  sportId: string;
  canonicalEquipmentTypeId: string;
  supportingDealIds: string[];
  directEvidence: string[];
};

export type IdentifierTaxonomyReview = {
  kind: string;
  identifierType: string;
  confidence: string;
  humanApprovalRequired: boolean;
  consensusEligible: boolean;
  supportedRecommendation: IdentifierTaxonomyRecommendation | null;
  records: IdentifierTaxonomyRecord[];
};

export type IdentifierTaxonomyChange = {
  dealId: string;
  title: string;
  before: { sportId: string | null; equipmentTypeId: string | null };
  after: { sportId: string; equipmentTypeId: string };
};

const PROTECTED_MEMORABILIA_TITLE =
  /\b(?:autograph(?:ed)?|signed|authenticated|relic|card|collage|display\s+case|vitrine|ticket|photo|piece\s+of|game[- ]used)\b/i;

function destinationIsSafeForTitle(
  title: string,
  sportId: string,
  equipmentTypeId: string,
): boolean {
  if (!PROTECTED_MEMORABILIA_TITLE.test(title)) return true;
  return sportId === "memorabilia" || equipmentTypeId.includes("memorabilia");
}

export function approvedIdentifierTaxonomyChanges(
  reviews: IdentifierTaxonomyReview[],
): IdentifierTaxonomyChange[] {
  const qualified = reviews.filter((review) => {
    const recommendation = review.supportedRecommendation;
    return review.kind === "likely-same-product-conflict"
      && review.confidence === "high"
      && review.humanApprovalRequired
      && !review.consensusEligible
      && ["upc", "itemNumber"].includes(review.identifierType)
      && !!recommendation
      && new Set(recommendation.supportingDealIds).size >= 2
      && new Set(recommendation.directEvidence).size >= 2;
  });
  const destinationsByDeal = new Map<string, Set<string>>();
  for (const review of qualified) {
    const recommendation = review.supportedRecommendation!;
    const destination = `${recommendation.sportId}/${recommendation.canonicalEquipmentTypeId}`;
    for (const record of review.records) {
      const destinations = destinationsByDeal.get(record.dealId) ?? new Set<string>();
      destinations.add(destination);
      destinationsByDeal.set(record.dealId, destinations);
    }
  }
  const byDeal = new Map<string, IdentifierTaxonomyChange | null>();
  for (const review of qualified) {
    const recommendation = review.supportedRecommendation!;
    for (const record of review.records) {
      if ((destinationsByDeal.get(record.dealId)?.size ?? 0) !== 1) continue;
      if (!destinationIsSafeForTitle(
        record.title,
        recommendation.sportId,
        recommendation.canonicalEquipmentTypeId,
      )) {
        continue;
      }
      if (record.currentSportId === recommendation.sportId
          && record.currentEquipmentTypeId === recommendation.canonicalEquipmentTypeId) {
        continue;
      }
      const candidate: IdentifierTaxonomyChange = {
        dealId: record.dealId,
        title: record.title,
        before: {
          sportId: record.currentSportId,
          equipmentTypeId: record.currentEquipmentTypeId,
        },
        after: {
          sportId: recommendation.sportId,
          equipmentTypeId: recommendation.canonicalEquipmentTypeId,
        },
      };
      const existing = byDeal.get(record.dealId);
      if (existing === undefined) {
        byDeal.set(record.dealId, candidate);
      } else if (existing === null
          || existing.title !== candidate.title
          || existing.before.sportId !== candidate.before.sportId
          || existing.before.equipmentTypeId !== candidate.before.equipmentTypeId
          || existing.after.sportId !== candidate.after.sportId
          || existing.after.equipmentTypeId !== candidate.after.equipmentTypeId) {
        byDeal.set(record.dealId, null);
      }
    }
  }
  return Array.from(byDeal.values())
    .filter((change): change is IdentifierTaxonomyChange => change !== null)
    .sort((a, b) => a.dealId.localeCompare(b.dealId));
}
