import { safeEbayError } from "./ebay-errors";

export function pricingReportFailureFields(error: unknown) {
  const safe = safeEbayError(error);
  return {
    status: "error" as const,
    errorMessage: safe.message,
    completedAt: new Date(),
  };
}
