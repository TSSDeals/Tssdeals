import {
  EbayIntegrationError,
  ebayErrorFromResponse,
  logEbayError,
} from "./ebay-errors";

export type EbayBrowsePurpose = "public_feed" | "pricing" | "other";

export interface EbayBrowseBudget {
  readonly name: string;
  readonly limit: number;
  used: number;
}

export interface EbayBrowseRequestOptions {
  token: string;
  operation: string;
  purpose?: EbayBrowsePurpose;
  budget?: EbayBrowseBudget;
  maxRetries?: number;
  maxRetryDelayMs?: number;
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const DEFAULT_RETRY_MS = 30_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
let publicFeedDepth = 0;
let rateLimitedUntil = 0;

export function createEbayBrowseBudget(name: string, limit: number): EbayBrowseBudget {
  return { name, limit, used: 0 };
}

export function isEbayRateLimitError(error: unknown): boolean {
  return error instanceof EbayIntegrationError &&
    (error.code === "rate_limited" || error.upstreamStatus === 429);
}

export async function withEbayPublicBrowsePriority<T>(operation: () => Promise<T>): Promise<T> {
  publicFeedDepth++;
  try {
    return await operation();
  } finally {
    publicFeedDepth--;
  }
}

export function parseRetryAfterMs(
  value: string | null,
  nowMs: number,
  fallbackMs = DEFAULT_RETRY_MS,
): number {
  if (!value?.trim()) return fallbackMs;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : fallbackMs;
}

function rateLimitError(operation: string, message: string): EbayIntegrationError {
  return new EbayIntegrationError({
    code: "rate_limited",
    operation,
    message,
    upstreamStatus: 429,
  });
}

function consumeBudget(budget: EbayBrowseBudget | undefined, operation: string): void {
  if (!budget) return;
  if (budget.used >= budget.limit) {
    throw rateLimitError(
      operation,
      `The ${budget.name} Browse request budget is exhausted. The last known-good eBay data was preserved.`,
    );
  }
  budget.used++;
}

export async function fetchEbayBrowseJson<T>(
  url: string,
  options: EbayBrowseRequestOptions,
): Promise<T> {
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cached = responseCache.get(url);
  if (cached && cached.expiresAt > now()) {
    return cached.value as T;
  }
  if (cached) responseCache.delete(url);

  const existing = inFlight.get(url);
  if (existing) return existing as Promise<T>;

  const request = (async () => {
    const purpose = options.purpose ?? "other";
    const maxRetries = Math.max(0, options.maxRetries ?? (purpose === "pricing" ? 0 : 1));
    const maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    const fetchImpl = options.fetchImpl ?? fetch;
    const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

    if (purpose === "pricing" && publicFeedDepth > 0) {
      throw rateLimitError(
        options.operation,
        "eBay pricing analysis is paused while the public marketplace feed is using Browse capacity. Try again after the feed completes.",
      );
    }

    if (rateLimitedUntil > now()) {
      if (purpose === "pricing") {
        throw rateLimitError(
          options.operation,
          "eBay Browse is currently rate-limited. The pricing report was stopped to preserve capacity for the public marketplace feed.",
        );
      }
      const remainingMs = rateLimitedUntil - now();
      if (remainingMs > maxRetryDelayMs) {
        throw rateLimitError(
          options.operation,
          "eBay Browse remains rate-limited beyond the safe retry window. The last known-good marketplace feed was preserved.",
        );
      }
      await sleep(remainingMs);
    }

    for (let attempt = 0; ; attempt++) {
      consumeBudget(options.budget, options.operation);
      const response = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${options.token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          Accept: "application/json",
        },
      });

      if (response.status === 429) {
        const retryMs = parseRetryAfterMs(response.headers.get("retry-after"), now());
        rateLimitedUntil = Math.max(rateLimitedUntil, now() + retryMs);
        if (attempt < maxRetries && retryMs <= maxRetryDelayMs) {
          await sleep(retryMs);
          continue;
        }
      }

      if (!response.ok) {
        const error = await ebayErrorFromResponse(response, options.operation);
        logEbayError(error);
        throw error;
      }

      const value = await response.json() as T;
      responseCache.set(url, { expiresAt: now() + cacheTtlMs, value });
      return value;
    }
  })();

  inFlight.set(url, request);
  try {
    return await request;
  } finally {
    inFlight.delete(url);
  }
}

export function resetEbayBrowseClientForTests(): void {
  responseCache.clear();
  inFlight.clear();
  publicFeedDepth = 0;
  rateLimitedUntil = 0;
}
