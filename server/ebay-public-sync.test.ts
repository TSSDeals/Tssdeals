import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { InsertDeal } from "@shared/schema";
import {
  defaultEbayPublicSyncStatus,
  isCustomerMarketplaceDealVisible,
  runEbayPublicSnapshotSync,
  type EbayPublicSyncStatus,
} from "./ebay-public-sync";

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
});
