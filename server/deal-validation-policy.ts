import type { EbayPublicSyncStatus } from "./ebay-public-sync";

export const SCHEDULED_EBAY_VALIDATION_LIMIT = 25;
export const SCHEDULED_SIDELINESWAP_VALIDATION_LIMIT = 100;
export const EBAY_VALIDATION_SUCCESS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const MAX_MANUAL_VALIDATION_LIMIT = 100;

export function hasRecentSuccessfulEbaySnapshot(
  status: EbayPublicSyncStatus,
  now = new Date(),
  maxAgeMs = EBAY_VALIDATION_SUCCESS_MAX_AGE_MS,
): boolean {
  if (!status.lastSuccessfulAt) return false;
  const successfulAt = Date.parse(status.lastSuccessfulAt);
  if (!Number.isFinite(successfulAt)) return false;
  const age = now.getTime() - successfulAt;
  return age >= 0 && age <= maxAgeMs;
}

export function safeManualValidationLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? SCHEDULED_EBAY_VALIDATION_LIMIT), 10);
  if (!Number.isFinite(parsed)) return SCHEDULED_EBAY_VALIDATION_LIMIT;
  return Math.min(MAX_MANUAL_VALIDATION_LIMIT, Math.max(1, parsed));
}
