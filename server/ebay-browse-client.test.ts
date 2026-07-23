import assert from "node:assert/strict";
import test from "node:test";
import { EbayIntegrationError } from "./ebay-errors";
import {
  createEbayBrowseBudget,
  fetchEbayBrowseJson,
  parseRetryAfterMs,
  resetEbayBrowseClientForTests,
  withEbayPublicBrowsePriority,
} from "./ebay-browse-client";

const URL = "https://api.ebay.com/buy/browse/v1/item_summary/search?q=glove";

test("Browse 429 respects Retry-After and retries only once", async () => {
  resetEbayBrowseClientForTests();
  let nowMs = 1_000;
  let calls = 0;
  const sleeps: number[] = [];
  const fetchImpl: typeof fetch = async () => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({ errors: [{ message: "rate limited" }] }), {
        status: 429,
        headers: { "Retry-After": "2" },
      });
    }
    return new Response(JSON.stringify({ total: 1, itemSummaries: [{ itemId: "1" }] }), {
      status: 200,
    });
  };

  const data = await fetchEbayBrowseJson<{ total: number }>(URL, {
    token: "token",
    operation: "public deal search",
    purpose: "public_feed",
    budget: createEbayBrowseBudget("test public feed", 2),
    maxRetries: 1,
    fetchImpl,
    now: () => nowMs,
    sleep: async (ms) => {
      sleeps.push(ms);
      nowMs += ms;
    },
  });

  assert.equal(data.total, 1);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [2_000]);
});

test("repeated Browse 429 stops after the bounded retry", async () => {
  resetEbayBrowseClientForTests();
  let calls = 0;
  let nowMs = 10_000;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ errors: [{ message: "daily quota exhausted" }] }), {
      status: 429,
      headers: { "Retry-After": "1" },
    });
  };

  await assert.rejects(
    fetchEbayBrowseJson(URL, {
      token: "token",
      operation: "public deal search",
      purpose: "public_feed",
      maxRetries: 1,
      fetchImpl,
      now: () => nowMs,
      sleep: async (ms) => { nowMs += ms; },
    }),
    (error: unknown) =>
      error instanceof EbayIntegrationError &&
      error.code === "rate_limited" &&
      error.upstreamStatus === 429,
  );
  assert.equal(calls, 2);
});

test("Retry-After beyond the safe window fails without an early retry", async () => {
  resetEbayBrowseClientForTests();
  let calls = 0;
  const sleeps: number[] = [];

  await assert.rejects(
    fetchEbayBrowseJson(URL, {
      token: "token",
      operation: "public deal search",
      purpose: "public_feed",
      maxRetries: 1,
      maxRetryDelayMs: 60_000,
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({ errors: [{ message: "daily quota exhausted" }] }), {
          status: 429,
          headers: { "Retry-After": "120" },
        });
      },
      sleep: async (ms) => { sleeps.push(ms); },
    }),
    (error: unknown) =>
      error instanceof EbayIntegrationError &&
      error.code === "rate_limited" &&
      error.upstreamStatus === 429,
  );

  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
});

test("identical Browse requests share one in-flight call and cached result", async () => {
  resetEbayBrowseClientForTests();
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    await Promise.resolve();
    return new Response(JSON.stringify({ total: 3 }), { status: 200 });
  };
  const options = {
    token: "token",
    operation: "public deal search",
    purpose: "public_feed" as const,
    fetchImpl,
  };

  const [first, second] = await Promise.all([
    fetchEbayBrowseJson<{ total: number }>(URL, options),
    fetchEbayBrowseJson<{ total: number }>(URL, options),
  ]);
  const third = await fetchEbayBrowseJson<{ total: number }>(URL, options);

  assert.equal(first.total, 3);
  assert.equal(second.total, 3);
  assert.equal(third.total, 3);
  assert.equal(calls, 1);
});

test("Browse request budgets stop additional network calls", async () => {
  resetEbayBrowseClientForTests();
  let calls = 0;
  const budget = createEbayBrowseBudget("test public feed", 1);
  const fetchImpl: typeof fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ total: 1 }), { status: 200 });
  };

  await fetchEbayBrowseJson(URL, {
    token: "token",
    operation: "public deal search",
    purpose: "public_feed",
    budget,
    fetchImpl,
  });

  await assert.rejects(
    fetchEbayBrowseJson(`${URL}&offset=200`, {
      token: "token",
      operation: "public deal search",
      purpose: "public_feed",
      budget,
      fetchImpl,
    }),
    (error: unknown) =>
      error instanceof EbayIntegrationError &&
      error.code === "rate_limited",
  );

  assert.equal(budget.used, 1);
  assert.equal(calls, 1);
});

test("pricing Browse calls are refused while the public feed owns priority", async () => {
  resetEbayBrowseClientForTests();
  let calls = 0;

  await withEbayPublicBrowsePriority(async () => {
    await assert.rejects(
      fetchEbayBrowseJson(URL, {
        token: "token",
        operation: "pricing marketplace search",
        purpose: "pricing",
        fetchImpl: async () => {
          calls++;
          return new Response(JSON.stringify({ total: 0 }), { status: 200 });
        },
      }),
      (error: unknown) =>
        error instanceof EbayIntegrationError &&
        error.code === "rate_limited",
    );
  });

  assert.equal(calls, 0);
});

test("Retry-After supports both delta seconds and HTTP dates", () => {
  assert.equal(parseRetryAfterMs("3", 1_000), 3_000);
  assert.equal(
    parseRetryAfterMs("Thu, 23 Jul 2026 12:00:10 GMT", Date.parse("2026-07-23T12:00:00Z")),
    10_000,
  );
});
