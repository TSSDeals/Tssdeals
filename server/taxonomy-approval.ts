export interface TaxonomyApprovalContext {
  source: "admin-api" | "classification-review";
  approvedBy: string;
  proposalId?: string;
}

export function assertTaxonomyApproval(
  approval: TaxonomyApprovalContext | null | undefined,
): asserts approval is TaxonomyApprovalContext {
  if (!approval?.approvedBy?.trim()) {
    throw new Error("Live taxonomy creation requires an explicit Admin approval context");
  }
  if (approval.source === "classification-review" && !approval.proposalId) {
    throw new Error("Classification-review taxonomy creation requires a proposal ID");
  }
}
