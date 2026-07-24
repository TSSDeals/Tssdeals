import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { InsertDeal } from "@shared/schema";
import {
  createSingleFlightTask,
  defaultEbayPublicSyncStatus,
  isCustomerMarketplaceDealVisible,
  recoverStaleEbayPublicSyncStatus,
  runEbayPublicSnapshotSync,
  type EbayPublicSyncStatus,
} from "./ebay-public-sync";
import { EbayIntegrationError } from "./ebay-errors";

function ebayDeal(url: string, title = "Wilson A2000 Baseball Glove"): InsertDeal {
  return {
    sourceId: "ebay",
    title,
    url,
    sportId: "baseball",
    equipmentTypeId: "bb-gloves",
    condition: "new",
    currency: "USD",
    priceCents: 20000,
  };
}

function previousSuccess(): EbayPublicSyncStatus {
  return {
    ...defaultEbayPublicSyncStatus(),
    state: "success",
    lastSuccessfulAt: "2026-07-22T12:00:00.000Z",
    lastSuccessfulItemCount: 38,
    lastAttemptCompletedAt: "2026-07-22T12:00:00.000Z",
  };
}

test("partial Browse retrieval does not publish and preserves the last successful snapshot", async () => {
  const saved: EbayPublicSyncStatus[] = [];
  let publishCalls = 0;

  const result = await runEbayPublicSnapshotSync({
    loadStatus: async () => previousSuccess(),
    saveStatus: async (status) => { saved.push(status); },
    collect: async () => ({
      deals: [ebayDeal("https://www.ebay.com/itm/1")],
      errors: 1,
      requestsAttempted: 3,
      requestsSucceeded: 2,
    }),
    publish: async () => {
      publishCalls++;
      return { created: 1, updated: 0 };
    },
    now: () => new Date("2026-07-23T12:00:00.000Z"),
  });

  assert.deepEqual(result, { created: 0, updated: 0, errors: 1 });
  assert.equal(publishCalls, 0);
  assert.equal(saved.at(-1)?.state, "failed");
  assert.equal(saved.at(-1)?.lastSuccessfulAt, "2026-07-22T12:00:00.000Z");
  assert.equal(saved.at(-1)?.lastSuccessfulItemCount, 38);
  assert.equal(saved.at(-1)?.preserveLastKnownGood, true);
});

test("zero-item Browse retrieval is a failed attempt, never an empty successful snapshot", async () => {
  const saved: EbayPublicSyncStatus[] = [];
  let publishCalls = 0;

  const result = await runEbayPublicSnapshotSync({
    loadStatus: async () => previousSuccess(),
    saveStatus: async (status) => { saved.push(status); },
    collect: async () => ({
      deals: [],
      errors: 0,
      requestsAttempted: 4,
      requestsSucceeded: 4,
    }),
    publish: async () => {
      publishCalls++;
      return { created: 0, updated: 0 };
    },
    now: () => new Date("2026-07-23T12:00:00.000Z"),
  });

  assert.deepEqual(result, { created: 0, updated: 0, errors: 1 });
  assert.equal(publishCalls, 0);
  assert.equal(saved.at(-1)?.state, "failed");
  assert.match(saved.at(-1)?.message ?? "", /zero publishable items/i);
});

test("upstream Browse exception preserves the last successful snapshot", async () => {
  const saved: EbayPublicSyncStatus[] = [];

  await runEbayPublicSnapshotSync({
    loadStatus: async () => previousSuccess(),
    saveStatus: async (status) => { saved.push(status); },
    collect: async () => { throw new Error("upstream 503"); },
    publish: async () => {
      assert.fail("failed retrieval must not publish");
    },
    now: () => new Date("2026-07-23T12:00:00.000Z"),
  });

  assert.equal(saved.at(-1)?.state, "failed");
  assert.equal(saved.at(-1)?.lastSuccessfulAt, "2026-07-22T12:00:00.000Z");
  assert.equal(saved.at(-1)?.preserveLastKnownGood, true);
});

test("Browse 429 preserves the last successful public snapshot", async () => {
  const saved: EbayPublicSyncStatus[] = [];

  const result = await runEbayPublicSnapshotSync({
    loadStatus: async () => previousSuccess(),
    saveStatus: async (status) => { saved.push(status); },
    collect: async () => {
      throw new EbayIntegrationError({
        code: "rate_limited",
        operation: "public deal search",
        message: "eBay is temporarily rate-limiting marketplace requests.",
        upstreamStatus: 429,
      });
    },
    publish: async () => {
      assert.fail("a rate-limited retrieval must not publish");
    },
    now: () => new Date("2026-07-23T12:00:00.000Z"),
  });

  assert.deepEqual(result, { created: 0, updated: 0, errors: 1 });
  assert.equal(saved.at(-1)?.state, "failed");
  assert.equal(saved.at(-1)?.lastSuccessfulAt, "2026-07-22T12:00:00.000Z");
  assert.equal(saved.at(-1)?.lastSuccessfulItemCount, 38);
  assert.equal(saved.at(-1)?.preserveLastKnownGood, true);
  assert.match(saved.at(-1)?.message ?? "", /quota is exhausted/i);
});

test("rate-limited collections persist a concise quota status and preserve the prior snapshot", async () => {
  const saved: EbayPublicSyncStatus[] = [];

  const result = await runEbayPublicSnapshotSync({
    loadStatus: async () => previousSuccess(),
    saveStatus: async (status) => { saved.push(status); },
    collect: async () => ({
      deals: [],
      errors: 1,
      requestsAttempted: 1,
      requestsSucceeded: 0,
      stopped: true,
      failureKind: "rate_limited",
    }),
    publish: async () => assert.fail("rate-limited data must not publish"),
    now: () => new Date("2026-07-24T12:00:00.000Z"),
  });

  assert.deepEqual(result, { created: 0, updated: 0, errors: 1 });
  assert.equal(saved.at(-1)?.state, "failed");
  assert.match(saved.at(-1)?.message ?? "", /quota is exhausted/i);
  assert.equal(saved.at(-1)?.preserveLastKnownGood, true);
  assert.equal(saved.at(-1)?.lastSuccessfulItemCount, 38);
});

test("single-flight background task starts promptly and coalesces duplicate clicks", async () => {
  const runner = createSingleFlightTask<number>();
  let finish!: (value: number) => void;
  let runs = 0;
  const deferred = new Promise<number>((resolve) => { finish = resolve; });

  const first = runner.start(async () => {
    runs++;
    return deferred;
  });
  const second = runner.start(async () => {
    runs++;
    return 99;
  });

  assert.equal(first.started, true);
  assert.equal(second.started, false);
  assert.equal(runner.isRunning(), true);
  assert.equal(runs, 0, "the HTTP caller can return before background work begins");

  await Promise.resolve();
  assert.equal(runs, 1);
  finish(7);
  assert.equal(await first.completion, 7);
  assert.equal(await second.completion, 7);
  await Promise.resolve();
  assert.equal(runner.isRunning(), false);
});

test("expired persisted running state with no active task recovers after restart", async () => {
  const persisted: EbayPublicSyncStatus = {
    ...previousSuccess(),
    state: "running",
    lastAttemptStartedAt: "2026-07-24T11:50:00.000Z",
    lastAttemptCompletedAt: null,
    message: "eBay public Browse snapshot retrieval is running.",
    preserveLastKnownGood: true,
  };

  const recovered = recoverStaleEbayPublicSyncStatus(persisted, {
    hasActiveTask: false,
    now: new Date("2026-07-24T12:00:00.000Z"),
    leaseMs: 5 * 60 * 1000,
  });

  assert.equal(recovered.state, "failed");
  assert.equal(recovered.lastAttemptCompletedAt, "2026-07-24T12:00:00.000Z");
  assert.equal(recovered.lastSuccessfulItemCount, 38);
  assert.equal(recovered.preserveLastKnownGood, true);
  assert.match(recovered.message ?? "", /server restarted/i);
  assert.match(recovered.message ?? "", /new refresh can now be started/i);

  const runner = createSingleFlightTask<number>();
  const next = runner.start(async () => 1);
  assert.equal(next.started, true);
  assert.equal(await next.completion, 1);
});

test("live single-flight task is never reclaimed even after its persisted lease age", () => {
  const persisted: EbayPublicSyncStatus = {
    ...previousSuccess(),
    state: "running",
    lastAttemptStartedAt: "2026-07-24T11:00:00.000Z",
    lastAttemptCompletedAt: null,
    preserveLastKnownGood: true,
  };

  const unchanged = recoverStaleEbayPublicSyncStatus(persisted, {
    hasActiveTask: true,
    now: new Date("2026-07-24T12:00:00.000Z"),
    leaseMs: 5 * 60 * 1000,
  });

  assert.equal(unchanged, persisted);
});

test("recent orphaned running state remains leased until the bounded recovery window", () => {
  const persisted: EbayPublicSyncStatus = {
    ...previousSuccess(),
    state: "running",
    lastAttemptStartedAt: "2026-07-24T11:58:00.000Z",
    lastAttemptCompletedAt: null,
    preserveLastKnownGood: true,
  };

  const unchanged = recoverStaleEbayPublicSyncStatus(persisted, {
    hasActiveTask: false,
    now: new Date("2026-07-24T12:00:00.000Z"),
    leaseMs: 5 * 60 * 1000,
  });

  assert.equal(unchanged, persisted);
});

test("complete public eBay ingestion publishes once and remains visible to an eBay-only customer search", async () => {
  const saved: EbayPublicSyncStatus[] = [];
  const published: InsertDeal[] = [];
  const duplicateUrl = "https://www.ebay.com/itm/123";

  const result = await runEbayPublicSnapshotSync({
    loadStatus: async () => defaultEbayPublicSyncStatus(),
    saveStatus: async (status) => { saved.push(status); },
    collect: async () => ({
      deals: [ebayDeal(duplicateUrl), ebayDeal(duplicateUrl), ebayDeal("https://www.ebay.com/itm/456")],
      errors: 0,
      requestsAttempted: 3,
      requestsSucceeded: 3,
    }),
    publish: async (deals) => {
      published.push(...deals);
      return { created: deals.length, updated: 0 };
    },
    now: () => new Date("2026-07-23T12:00:00.000Z"),
  });

  assert.deepEqual(result, { created: 2, updated: 0, errors: 0 });
  assert.equal(published.length, 2);
  assert.equal(saved.at(-1)?.state, "success");
  assert.equal(saved.at(-1)?.lastSuccessfulItemCount, 2);
  assert.equal(saved.at(-1)?.preserveLastKnownGood, false);

  const visibleToEbayOnlySearch = published.filter((deal) =>
    deal.sourceId === "ebay" &&
    isCustomerMarketplaceDealVisible({
      sourceId: deal.sourceId,
      lastSeenAt: new Date("2026-07-23T12:00:00.000Z"),
      now: new Date("2026-07-23T12:05:00.000Z"),
      preserveEbayLastKnownGood: false,
    })
  );
  assert.equal(visibleToEbayOnlySearch.length, 2);
});

test("failed snapshot status keeps stale eBay rows visible but does not broaden SidelineSwap", () => {
  const stale = new Date("2026-07-20T12:00:00.000Z");
  const now = new Date("2026-07-23T12:00:00.000Z");

  assert.equal(isCustomerMarketplaceDealVisible({
    sourceId: "ebay",
    lastSeenAt: stale,
    now,
    preserveEbayLastKnownGood: true,
  }), true);
  assert.equal(isCustomerMarketplaceDealVisible({
    sourceId: "sidelineswap",
    lastSeenAt: stale,
    now,
    preserveEbayLastKnownGood: true,
  }), false);
});

test("customer query and stale cleanup both honor the durable eBay snapshot guard", () => {
  const storageSource = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
  const schedulerSource = readFileSync(new URL("./deal-sync-scheduler.ts", import.meta.url), "utf8");

  assert.match(storageSource, /ebay_public_sync_status[\s\S]{0,500}preserveLastKnownGood/);
  assert.match(storageSource, /eq\(deals\.sourceId,\s*"ebay"\),\s*preserveLastKnownGoodEbaySnapshot/);
  assert.match(schedulerSource, /source_id <> 'ebay'[\s\S]{0,500}ebay_public_sync_status[\s\S]{0,300}preserveLastKnownGood/);
  assert.doesNotMatch(schedulerSource, /collectEbayDeals/);
  assert.match(schedulerSource, /createEbayBrowseBudget\("public feed sync", 250\)/);
  assert.match(schedulerSource, /maxResults:\s*200/);
  assert.doesNotMatch(schedulerSource, /maxResults:\s*(?:2000|5000|10000)/);
});

test("admin public sync is queued in the background and the UI polls persisted status", () => {
  const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const schedulerSource = readFileSync(new URL("./deal-sync-scheduler.ts", import.meta.url), "utf8");
  const adminSource = readFileSync(new URL("../client/src/pages/Admin.tsx", import.meta.url), "utf8");

  assert.match(routesSource, /post\("\/api\/ebay\/public-sync"[\s\S]{0,300}await queueEbayPublicSync/);
  assert.match(routesSource, /status\(started \? 202 : 200\)/);
  assert.match(schedulerSource, /const reconciled = recoverStaleEbayPublicSyncStatus[\s\S]{0,300}ebayPublicSyncTask\.isRunning/);
  assert.match(schedulerSource, /async function queueEbayPublicSync/);
  assert.match(schedulerSource, /browseMaxRetries:\s*0/);
  assert.match(adminSource, /apiRequest\("POST", "\/api\/ebay\/public-sync"/);
  assert.match(adminSource, /refetchInterval:\s*3000/);
});
