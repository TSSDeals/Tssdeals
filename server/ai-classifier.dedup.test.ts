/**
 * Dedup safeguard tests for the AI classifier.
 *
 * Proves the database-level safeguards added to stop duplicate classification
 * data from piling up:
 *   1. UNIQUE(ai_classifications.signature) — the same signature can never be
 *      stored twice; a repeat save bumps lookup_count instead.
 *   2. Partial unique index (classification_review_queue.deal_id WHERE
 *      status='pending') — a deal can never have two pending review items.
 *
 * There is no test framework in this project, so this is a self-running tsx
 * script: `npx tsx server/ai-classifier.dedup.test.ts` (exit code 0 = pass).
 * It is also registered as the "classification-dedup" validation command.
 *
 * Isolation: all rows it creates are namespaced with the __dedup_test__ prefix
 * and removed before and after the run, so it never touches real data.
 */
import { db, pool } from "./db";
import {
  aiClassifications,
  classificationReviewQueue,
  deals,
  sources,
} from "@shared/schema";
import { saveCached, queueReview } from "./ai-classifier";
import { and, eq, sql } from "drizzle-orm";

const TAG = "__dedup_test__";
const STAMP = Date.now();
const SIG = `${TAG}:sig:${STAMP}`;
const DEAL_ID = `${TAG}-deal-${STAMP}`;
const TITLE = `${TAG} soccer cleats ${STAMP}`;

let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  \u2713 ${msg}`);
  } else {
    console.error(`  \u2717 ${msg}`);
    failures++;
  }
}

// Remove every row this test could have created (current run or a prior crash).
async function cleanup() {
  await db
    .delete(classificationReviewQueue)
    .where(sql`${classificationReviewQueue.title} LIKE ${TAG + "%"}`);
  await db
    .delete(aiClassifications)
    .where(sql`${aiClassifications.signature} LIKE ${TAG + "%"}`);
  await db.delete(deals).where(sql`${deals.id} LIKE ${TAG + "%"}`);
}

async function main() {
  await cleanup();

  // --- Test 1: signature dedup via the classifier save path -----------------
  console.log("ai_classifications.signature dedup:");
  const decision: any = {
    sportId: "baseball",
    equipmentTypeId: null,
    isSportingGoods: true,
    confidence: "high",
    needsNewCategory: false,
    suggestedSportName: null,
    suggestedEquipmentName: null,
    reasoning: "dedup test",
  };
  await saveCached(SIG, decision);
  await saveCached(SIG, decision);

  const cacheRows = await db
    .select()
    .from(aiClassifications)
    .where(eq(aiClassifications.signature, SIG));
  check(cacheRows.length === 1, `only one cache row exists (got ${cacheRows.length})`);
  check(
    cacheRows[0]?.lookupCount === 2,
    `lookup_count incremented to 2 on repeat save (got ${cacheRows[0]?.lookupCount})`,
  );

  let dupSigThrew = false;
  try {
    await db
      .insert(aiClassifications)
      .values({ signature: SIG, isSportingGoods: true, confidence: "high" });
  } catch {
    dupSigThrew = true;
  }
  check(dupSigThrew, "raw duplicate-signature insert is rejected by the UNIQUE index");

  // --- Test 2: pending review-queue dedup via the classifier save path -------
  console.log("classification_review_queue pending dedup:");
  const srcRows = await db.select({ id: sources.id }).from(sources).limit(1);
  if (srcRows.length === 0) throw new Error("no source rows to anchor the test deal FK");
  const sourceId = srcRows[0].id;

  await db.insert(deals).values({
    id: DEAL_ID,
    sourceId,
    title: TITLE,
    url: `https://example.com/${TAG}/${STAMP}`,
    condition: "new",
    priceCents: 1000,
  });

  const reviewDecision: any = {
    sportId: "soccer",
    equipmentTypeId: null,
    isSportingGoods: true,
    confidence: "high",
    needsNewCategory: true,
    suggestedSportName: null,
    suggestedEquipmentName: "Cleats",
    reasoning: "dedup test",
  };
  await queueReview({ id: DEAL_ID, title: TITLE, brand: null }, reviewDecision);
  await queueReview({ id: DEAL_ID, title: TITLE, brand: null }, reviewDecision);

  const pendingRows = await db
    .select()
    .from(classificationReviewQueue)
    .where(
      and(
        eq(classificationReviewQueue.dealId, DEAL_ID),
        eq(classificationReviewQueue.status, "pending"),
      ),
    );
  check(
    pendingRows.length === 1,
    `only one pending review item exists for the deal (got ${pendingRows.length})`,
  );

  let dupPendingThrew = false;
  try {
    await db
      .insert(classificationReviewQueue)
      .values({ dealId: DEAL_ID, title: TITLE, status: "pending" });
  } catch {
    dupPendingThrew = true;
  }
  check(
    dupPendingThrew,
    "raw second pending insert for the same deal is rejected by the partial unique index",
  );
}

main()
  .catch((err) => {
    console.error("Unexpected error:", err);
    failures++;
  })
  .finally(async () => {
    await cleanup();
    await pool.end();
    if (failures > 0) {
      console.error(`\nFAILED: ${failures} check(s) did not pass.`);
      process.exit(1);
    } else {
      console.log("\nPASSED: all dedup safeguards hold.");
      process.exit(0);
    }
  });
