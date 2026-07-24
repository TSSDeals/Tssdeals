import type { InsertDeal } from "@shared/schema";

export const EBAY_PUBLIC_SYNC_STATUS_KEY = "ebay_public_sync_status";

export type EbayPublicSyncState = "never_run" | "running" | "success" | "failed";

export interface EbayPublicSyncStatus {
  state: EbayPublicSyncState;
  lastAttemptStartedAt: string | null;
  lastAttemptCompletedAt: string | null;
  lastSuccessfulAt: string | null;
  lastSuccessfulItemCount: number | null;
  lastAttemptItemCount: number | null;
  lastAttemptErrorCount: number;
  message: string | null;
  preserveLastKnownGood: boolean;
}

export interface EbayPublicCollection {
  deals: InsertDeal[];
  errors: number;
  requestsAttempted: number;
  requestsSucceeded: number;
  stopped?: boolean;
  failureKind?: "rate_limited" | "interrupted";
}

export interface EbayPublicSyncResult {
  created: number;
  updated: number;
  errors: number;
}

export interface EbayPublicSnapshotDependencies {
  loadStatus(): Promise<EbayPublicSyncStatus>;
  saveStatus(status: EbayPublicSyncStatus): Promise<void>;
  collect(): Promise<EbayPublicCollection>;
  publish(deals: InsertDeal[]): Promise<{ created: number; updated: number }>;
  now?: () => Date;
}

export interface SingleFlightStart<T> {
  started: boolean;
  completion: Promise<T>;
}

export function createSingleFlightTask<T>() {
  let active: Promise<T> | null = null;

  return {
    start(task: () => Promise<T>): SingleFlightStart<T> {
      if (active) return { started: false, completion: active };
      const completion = Promise.resolve().then(task);
      active = completion;
      const clear = () => {
        if (active === completion) active = null;
      };
      void completion.then(clear, clear);
      return { started: true, completion };
    },
    isRunning(): boolean {
      return active !== null;
    },
  };
}

export function defaultEbayPublicSyncStatus(): EbayPublicSyncStatus {
  return {
    state: "never_run",
    lastAttemptStartedAt: null,
    lastAttemptCompletedAt: null,
    lastSuccessfulAt: null,
    lastSuccessfulItemCount: null,
    lastAttemptItemCount: null,
    lastAttemptErrorCount: 0,
    message: null,
    preserveLastKnownGood: false,
  };
}

export function parseEbayPublicSyncStatus(value: string | null | undefined): EbayPublicSyncStatus {
  if (!value) return defaultEbayPublicSyncStatus();
  try {
    const parsed = JSON.parse(value) as Partial<EbayPublicSyncStatus>;
    return {
      ...defaultEbayPublicSyncStatus(),
      ...parsed,
      preserveLastKnownGood: parsed.preserveLastKnownGood === true,
    };
  } catch {
    return defaultEbayPublicSyncStatus();
  }
}

function uniqueDealsByUrl(deals: InsertDeal[]): InsertDeal[] {
  const byUrl = new Map<string, InsertDeal>();
  for (const deal of deals) {
    if (deal.sourceId === "ebay" && deal.url) byUrl.set(deal.url, deal);
  }
  return Array.from(byUrl.values());
}

function failedStatus(
  previous: EbayPublicSyncStatus,
  startedAt: string,
  completedAt: string,
  itemCount: number,
  errorCount: number,
  message: string,
): EbayPublicSyncStatus {
  return {
    ...previous,
    state: "failed",
    lastAttemptStartedAt: startedAt,
    lastAttemptCompletedAt: completedAt,
    lastAttemptItemCount: itemCount,
    lastAttemptErrorCount: Math.max(1, errorCount),
    message,
    preserveLastKnownGood: true,
  };
}

function isRateLimitedFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; upstreamStatus?: unknown };
  return candidate.code === "rate_limited" || candidate.upstreamStatus === 429;
}

export async function runEbayPublicSnapshotSync(
  dependencies: EbayPublicSnapshotDependencies,
): Promise<EbayPublicSyncResult> {
  const previous = await dependencies.loadStatus();
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();

  await dependencies.saveStatus({
    ...previous,
    state: "running",
    lastAttemptStartedAt: startedAt,
    lastAttemptCompletedAt: null,
    lastAttemptItemCount: null,
    lastAttemptErrorCount: 0,
    message: "eBay public Browse snapshot retrieval is running.",
    // A running or interrupted attempt must never age out the prior snapshot.
    preserveLastKnownGood: true,
  });

  let collection: EbayPublicCollection;
  try {
    collection = await dependencies.collect();
  } catch (error) {
    await dependencies.saveStatus(failedStatus(
      previous,
      startedAt,
      now().toISOString(),
      0,
      1,
      isRateLimitedFailure(error)
        ? "eBay Browse quota is exhausted. No further requests were attempted; the last known-good snapshot was preserved."
        : "eBay public Browse retrieval failed. The last known-good snapshot was preserved.",
    ));
    return { created: 0, updated: 0, errors: 1 };
  }

  const candidates = uniqueDealsByUrl(collection.deals);
  const incomplete =
    collection.stopped === true ||
    collection.errors > 0 ||
    collection.requestsAttempted === 0 ||
    collection.requestsSucceeded !== collection.requestsAttempted;

  if (incomplete || candidates.length === 0) {
    const reason = collection.failureKind === "rate_limited"
      ? "eBay Browse quota is exhausted. No further requests were attempted; the last known-good snapshot was preserved."
      : collection.stopped
        ? "eBay public Browse retrieval was interrupted. The last known-good snapshot was preserved."
      : candidates.length === 0
        ? "eBay public Browse retrieval returned zero publishable items. The last known-good snapshot was preserved."
        : "eBay public Browse retrieval was incomplete. The last known-good snapshot was preserved.";
    await dependencies.saveStatus(failedStatus(
      previous,
      startedAt,
      now().toISOString(),
      candidates.length,
      collection.errors,
      reason,
    ));
    return { created: 0, updated: 0, errors: Math.max(1, collection.errors) };
  }

  try {
    const published = await dependencies.publish(candidates);
    const completedAt = now().toISOString();
    await dependencies.saveStatus({
      state: "success",
      lastAttemptStartedAt: startedAt,
      lastAttemptCompletedAt: completedAt,
      lastSuccessfulAt: completedAt,
      lastSuccessfulItemCount: candidates.length,
      lastAttemptItemCount: candidates.length,
      lastAttemptErrorCount: 0,
      message: `Published ${candidates.length} eBay items from a complete Browse snapshot.`,
      preserveLastKnownGood: false,
    });
    return { ...published, errors: 0 };
  } catch {
    await dependencies.saveStatus(failedStatus(
      previous,
      startedAt,
      now().toISOString(),
      candidates.length,
      1,
      "eBay public snapshot publishing failed. The previously published snapshot remains authoritative.",
    ));
    return { created: 0, updated: 0, errors: 1 };
  }
}

export function isCustomerMarketplaceDealVisible(input: {
  sourceId: string;
  lastSeenAt: Date;
  now: Date;
  preserveEbayLastKnownGood: boolean;
}): boolean {
  if (input.sourceId !== "ebay" && input.sourceId !== "sidelineswap") return true;
  if (input.lastSeenAt.getTime() >= input.now.getTime() - 24 * 60 * 60 * 1000) return true;
  return input.sourceId === "ebay" && input.preserveEbayLastKnownGood;
}
