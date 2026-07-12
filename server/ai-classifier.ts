import OpenAI from "openai";
import { db } from "./db";
import {
  deals,
  sports,
  equipmentTypes,
  aiClassifications,
  classificationReviewQueue,
  type ClassificationReviewItem,
} from "@shared/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { classifyDealSubFilter } from "./sub-filter-classifier";
import { storage } from "./storage";
import { getStopEpoch, stopRequestedSince } from "./process-control";

// Lazily instantiate the OpenAI client only when a model call is actually made,
// so stats/review-queue imports don't fail when OPENAI_API_KEY is absent.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// Single in-process guard shared by the daily pass and the manual admin trigger
// so two classification runs can't overlap (avoids duplicate model spend/races).
let isClassifying = false;

// Live status of the most recent (or in-flight) classification pass, polled by
// the admin panel so a long run reports progress instead of blocking the HTTP
// request past the gateway timeout. Mutated in place during a run.
export interface ClassifyJobState {
  status: "idle" | "running" | "done" | "error";
  mode: "unclassified" | "baseball-rescue" | null;
  total: number; // candidate deals in this pass
  processed: number; // candidates whose decision has been applied
  applied: number;
  queued: number;
  notSporting: number;
  skipped: number;
  failed: number;
  aiTotal: number; // OpenAI batches to run (the slow phase)
  aiDone: number; // OpenAI batches completed
  startedAt: number | null;
  finishedAt: number | null;
  message: string;
  error: string | null;
  log: string[];
}

function freshJobState(mode: ClassifyJobState["mode"]): ClassifyJobState {
  return {
    status: "running",
    mode,
    total: 0,
    processed: 0,
    applied: 0,
    queued: 0,
    notSporting: 0,
    skipped: 0,
    failed: 0,
    aiTotal: 0,
    aiDone: 0,
    startedAt: Date.now(),
    finishedAt: null,
    message: "",
    error: null,
    log: [],
  };
}

let jobState: ClassifyJobState = {
  ...freshJobState(null),
  status: "idle",
  startedAt: null,
};

export function getClassifyJobState(): ClassifyJobState & { isRunning: boolean } {
  return { ...jobState, isRunning: isClassifying };
}

// Only classifications at these confidence levels are auto-applied to a deal.
// Lower-confidence answers are recorded (so the deal isn't re-processed) but
// the existing classification is left untouched. Tunable in one place.
const AUTO_APPLY_CONFIDENCE = new Set(["high"]);
// A taxonomy-gap suggestion is only queued for admin review at these levels,
// to keep low-signal guesses out of the review queue.
const QUEUE_CONFIDENCE = new Set(["high", "medium"]);

const BATCH_SIZE = 15; // deals per OpenAI call
const DEFAULT_LIMIT = 150; // deals processed per run

// High-precision signal that a deal currently filed under "baseball" actually
// belongs to a clearly different sport. Used by the "baseball-rescue" mode to
// surface only a high-suspicion subset of the large baseball-defaulted pile —
// never the whole pile — so genuine baseball gear is not put at risk. Keywords
// are unambiguous sport names / sport-specific terms that effectively never
// appear in real baseball product titles. The baseball↔softball family is
// deliberately EXCLUDED: those are frequently combo ("Baseball/Softball") items
// that were reasonably defaulted to baseball, so moving them risks false moves.
const RESCUE_SIGNAL_KEYWORDS = [
  "tennis", "pickleball", "pickle ball", "badminton", "squash", "racquetball",
  "shuttlecock", "racquet", "golf", "hockey", "puck", "soccer", "basketball",
  "football", "volleyball", "lacrosse", "rugby", "cricket", "fishing", "fly rod",
  "fishing rod", "spinning reel", "baitcast", "cycling", "bicycle", "bike helmet",
  "swimming", "swim goggles", "swimsuit", "wrestling", "gymnastics", "leotard",
  "cheerleading", "pom pom", "disc golf", "frisbee",
];
// Postgres ARE word-boundary alternation, e.g. \y(tennis|golf|...)\y
const RESCUE_SIGNAL_PATTERN = `\\y(${RESCUE_SIGNAL_KEYWORDS.join("|")})\\y`;
const RESCUE_SPORT_ID = "baseball";

type Confidence = "high" | "medium" | "low";

interface AiClassifyItem {
  index: number;
  sportId: string | null;
  equipmentTypeId: string | null;
  isSportingGoods: boolean;
  confidence: Confidence;
  needsNewCategory: boolean;
  suggestedSportName: string | null;
  suggestedEquipmentName: string | null;
  reasoning: string;
}

// The validated, ready-to-apply decision for a single product signature.
interface Decision {
  sportId: string | null;
  equipmentTypeId: string | null;
  isSportingGoods: boolean;
  confidence: Confidence;
  needsNewCategory: boolean;
  suggestedSportName: string | null;
  suggestedEquipmentName: string | null;
  reasoning: string;
}

interface Taxonomy {
  sportsById: Map<string, string>;
  equipmentById: Map<string, { name: string; sportId: string | null }>;
  prompt: string;
}

function makeSignature(title: string, brand: string | null): string {
  const b = (brand ?? "").toLowerCase().trim();
  const t = title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
  return `${b}|${t}`;
}

async function loadTaxonomy(): Promise<Taxonomy> {
  const sportRows = await db.select().from(sports);
  const eqRows = await db.select().from(equipmentTypes);

  const sportsById = new Map<string, string>();
  for (const s of sportRows) sportsById.set(s.id, s.name);

  const equipmentById = new Map<string, { name: string; sportId: string | null }>();
  for (const e of eqRows) equipmentById.set(e.id, { name: e.name, sportId: e.sportId });

  // Group non-"other" equipment types by sport for the prompt. We deliberately
  // exclude the "*-other" catch-all buckets so the model must pick a real
  // category or flag a taxonomy gap instead of re-dumping into "other".
  const bySport = new Map<string, string[]>();
  for (const e of eqRows) {
    if (e.id.endsWith("-other")) continue;
    if (!e.sportId) continue;
    const list = bySport.get(e.sportId) ?? [];
    list.push(`${e.id}=${e.name}`);
    bySport.set(e.sportId, list);
  }

  const lines: string[] = [];
  for (const s of sportRows) {
    const eqs = bySport.get(s.id);
    if (!eqs || eqs.length === 0) continue;
    lines.push(`${s.id} (${s.name}): ${eqs.join(", ")}`);
  }

  return { sportsById, equipmentById, prompt: lines.join("\n") };
}

async function classifyBatchViaAI(
  batch: { title: string; brand: string | null; currentSport: string | null }[],
  taxonomy: Taxonomy,
): Promise<AiClassifyItem[]> {
  const productList = batch
    .map((d, i) => {
      const brand = d.brand ? ` | brand: ${d.brand}` : "";
      const cur = d.currentSport ? ` | currently: ${d.currentSport}` : "";
      return `${i}. "${d.title}"${brand}${cur}`;
    })
    .join("\n");

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a sporting goods catalog classifier. Assign each product to the correct sport and equipment category from the EXISTING taxonomy below. These items may be uncategorized or miscategorized (the "currently:" hint, when present, is a possibly-wrong existing guess) and need the correct sport and equipment category.

EXISTING TAXONOMY (sportId (Sport Name): equipmentTypeId=Equipment Name, ...):
${taxonomy.prompt}

Rules:
- Choose sportId and equipmentTypeId ONLY from the taxonomy above. Use the exact IDs shown (the part before "=").
- equipmentTypeId MUST belong to the chosen sportId.
- Set confidence to "high" only when the product clearly matches a specific category. Use "medium" when likely but not certain, "low" when unsure.
- If the item is NOT sporting goods / sports equipment (e.g. random electronics, home goods), set isSportingGoods=false and leave sportId/equipmentTypeId null.
- If the item IS sporting goods but no existing category fits (a genuine taxonomy gap), set needsNewCategory=true, leave equipmentTypeId null, set sportId to the best existing sport if one applies (else null), and propose suggestedSportName (only if a new sport is needed) and suggestedEquipmentName.
- NEVER invent IDs that are not in the taxonomy.

Respond with ONLY a JSON object: {"results": [ { "index": 0, "sportId": "golf"|null, "equipmentTypeId": "golf-balls"|null, "isSportingGoods": true, "confidence": "high"|"medium"|"low", "needsNewCategory": false, "suggestedSportName": null, "suggestedEquipmentName": null, "reasoning": "brief" } ] }`,
      },
      { role: "user", content: productList },
    ],
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content?.trim() ?? "";
  try {
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const results = Array.isArray(parsed) ? parsed : parsed.results;
    if (!Array.isArray(results)) return [];
    return results.map((r: any) => ({
      index: Number(r.index),
      sportId: r.sportId ?? null,
      equipmentTypeId: r.equipmentTypeId ?? null,
      isSportingGoods: r.isSportingGoods !== false,
      confidence: (["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low") as Confidence,
      needsNewCategory: r.needsNewCategory === true,
      suggestedSportName: r.suggestedSportName || null,
      suggestedEquipmentName: r.suggestedEquipmentName || null,
      reasoning: r.reasoning || "",
    }));
  } catch {
    console.log(`[ai-classifier] Failed to parse batch response: ${content.slice(0, 200)}`);
    return [];
  }
}

// Turn an unmapped equipment id (e.g. "soccer-cleats", "field-hockey-sticks")
// into a human label for the review queue: strip the sport prefix, humanize.
function humanizeEquipmentId(rawId: string, sportId: string | null): string {
  let s = rawId;
  if (sportId && s.startsWith(`${sportId}-`)) s = s.slice(sportId.length + 1);
  else if (s.includes("-")) s = s.slice(s.indexOf("-") + 1);
  return s
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Validate a raw AI answer against the live taxonomy, dropping hallucinated IDs.
function validate(item: AiClassifyItem, taxonomy: Taxonomy): Decision {
  let sportId = item.sportId && taxonomy.sportsById.has(item.sportId) ? item.sportId : null;
  let equipmentTypeId: string | null = null;

  if (item.equipmentTypeId) {
    const eq = taxonomy.equipmentById.get(item.equipmentTypeId);
    // Equipment must exist, not be an "-other" bucket, and belong to the sport.
    if (eq && !item.equipmentTypeId.endsWith("-other")) {
      if (!sportId && eq.sportId) sportId = eq.sportId;
      if (eq.sportId === sportId) equipmentTypeId = item.equipmentTypeId;
    }
  }

  // The AI proposed a concrete (non-"-other") equipment type for a known sport
  // but we could NOT map it — the category doesn't exist (e.g. soccer/football/
  // lacrosse "cleats") or it belongs to a different sport. That's a genuine
  // taxonomy gap. Flag it so the item is routed to the review queue (with a
  // usable equipment-name suggestion) instead of being silently stamped and
  // left under its original (often wrong) sport.
  let needsNewCategory = item.needsNewCategory;
  let suggestedEquipmentName = item.suggestedEquipmentName;
  const aiProposedConcreteEquip =
    !!item.equipmentTypeId && !item.equipmentTypeId.endsWith("-other");
  if (aiProposedConcreteEquip && !equipmentTypeId && sportId) {
    needsNewCategory = true;
    if (!suggestedEquipmentName) {
      suggestedEquipmentName = humanizeEquipmentId(item.equipmentTypeId!, sportId);
    }
  }

  return {
    sportId,
    equipmentTypeId,
    isSportingGoods: item.isSportingGoods,
    confidence: item.confidence,
    needsNewCategory,
    suggestedSportName: item.suggestedSportName,
    suggestedEquipmentName,
    reasoning: item.reasoning,
  };
}

async function findCached(signature: string) {
  const rows = await db
    .select()
    .from(aiClassifications)
    .where(eq(aiClassifications.signature, signature))
    .limit(1);
  return rows[0] ?? null;
}

// Exported for the classification-dedup test (server/ai-classifier.dedup.test.ts).
export async function saveCached(signature: string, decision: Decision) {
  const aiResponse = {
    reasoning: decision.reasoning,
    needsNewCategory: decision.needsNewCategory,
    suggestedSportName: decision.suggestedSportName,
    suggestedEquipmentName: decision.suggestedEquipmentName,
  };
  // Upsert against the UNIQUE(signature) constraint so concurrent runs (or
  // multiple server instances) can never insert duplicate signature rows.
  await db
    .insert(aiClassifications)
    .values({
      signature,
      sportId: decision.sportId,
      equipmentTypeId: decision.equipmentTypeId,
      isSportingGoods: decision.isSportingGoods,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      aiResponse: aiResponse as any,
    })
    .onConflictDoUpdate({
      target: aiClassifications.signature,
      set: {
        sportId: decision.sportId,
        equipmentTypeId: decision.equipmentTypeId,
        isSportingGoods: decision.isSportingGoods,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        aiResponse: aiResponse as any,
        lookupCount: sql`${aiClassifications.lookupCount} + 1`,
        updatedAt: new Date(),
      },
    });
}

function cachedRowToDecision(row: typeof aiClassifications.$inferSelect): Decision {
  const ai = (row.aiResponse ?? {}) as any;
  return {
    sportId: row.sportId,
    equipmentTypeId: row.equipmentTypeId,
    isSportingGoods: row.isSportingGoods,
    confidence: (["high", "medium", "low"].includes(row.confidence) ? row.confidence : "low") as Confidence,
    needsNewCategory: ai.needsNewCategory === true,
    suggestedSportName: ai.suggestedSportName ?? null,
    suggestedEquipmentName: ai.suggestedEquipmentName ?? null,
    reasoning: row.reasoning ?? "",
  };
}

async function stampProcessed(dealId: string, confidence: Confidence) {
  await db
    .update(deals)
    .set({ classificationSource: "ai", classificationConfidence: confidence })
    .where(eq(deals.id, dealId));
}

async function applyClassification(
  dealId: string,
  title: string,
  decision: Decision,
) {
  const subFilterId = decision.equipmentTypeId
    ? classifyDealSubFilter(title, decision.equipmentTypeId)
    : null;
  await db
    .update(deals)
    .set({
      sportId: decision.sportId,
      equipmentTypeId: decision.equipmentTypeId,
      subFilterId,
      classificationSource: "ai",
      classificationConfidence: decision.confidence,
    })
    .where(eq(deals.id, dealId));
}

// Exported for the classification-dedup test (server/ai-classifier.dedup.test.ts).
export async function queueReview(
  deal: { id: string; title: string; brand: string | null },
  decision: Decision,
) {
  // Avoid duplicate pending entries for the same deal.
  const existing = await db
    .select({ id: classificationReviewQueue.id })
    .from(classificationReviewQueue)
    .where(
      and(
        eq(classificationReviewQueue.dealId, deal.id),
        eq(classificationReviewQueue.status, "pending"),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;

  // The pre-check above handles the common case; the partial unique index
  // (deal_id WHERE status='pending') is the race-safe backstop, so a
  // concurrent run can never insert a second pending item for the same deal.
  await db
    .insert(classificationReviewQueue)
    .values({
      dealId: deal.id,
      title: deal.title,
      brand: deal.brand,
      suggestedSportId: decision.sportId, // existing sport when only equipment is missing
      suggestedSportName: decision.suggestedSportName,
      suggestedEquipmentName: decision.suggestedEquipmentName,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
    })
    .onConflictDoNothing({
      target: classificationReviewQueue.dealId,
      where: sql`status = 'pending'`,
    });
}

export interface BatchClassifyOptions {
  limit?: number;
  sportId?: string; // restrict candidates to a single current sport
  // "unclassified" (default): items stuck in an "-other"/null bucket.
  // "baseball-rescue": items defaulted to baseball but whose title strongly
  // signals a different sport (high-suspicion subset only — see RESCUE_SIGNAL_*).
  mode?: "unclassified" | "baseball-rescue";
}

export interface BatchClassifyResult {
  processed: number;
  applied: number;
  queued: number;
  notSporting: number;
  skipped: number;
  failed: number;
  log: string[];
  stopped: boolean;
}

export async function batchClassifyDeals(
  options: BatchClassifyOptions = {},
): Promise<BatchClassifyResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (isClassifying) {
    return { processed: 0, applied: 0, queued: 0, notSporting: 0, skipped: 0, failed: 0, log: ["A classification pass is already running — skipped."], stopped: false };
  }
  isClassifying = true;
  jobState = freshJobState(options.mode ?? "unclassified");
  try {
    const result = await runBatchClassifyDeals(options);
    jobState.status = "done";
    jobState.finishedAt = Date.now();
    jobState.processed = result.processed;
    jobState.applied = result.applied;
    jobState.queued = result.queued;
    jobState.notSporting = result.notSporting;
    jobState.skipped = result.skipped;
    jobState.failed = result.failed;
    jobState.log = result.log.slice(-200);
    jobState.message = result.stopped
      ? `Stopped by admin — processed ${result.processed} of ${jobState.total}: ${result.applied} applied, ${result.queued} queued, ${result.notSporting} non-sporting, ${result.skipped} skipped, ${result.failed} failed`
      : `Classified ${result.processed}: ${result.applied} applied, ${result.queued} queued, ${result.notSporting} non-sporting, ${result.skipped} skipped, ${result.failed} failed`;
    return result;
  } catch (err: any) {
    jobState.status = "error";
    jobState.finishedAt = Date.now();
    jobState.error = err?.message ?? "Unknown error";
    throw err;
  } finally {
    isClassifying = false;
  }
}

// Kick off a classification pass without blocking the HTTP request. The admin
// panel polls getClassifyJobState() for progress so a large run can't trip the
// gateway's request timeout. batchClassifyDeals owns the jobState lifecycle.
export function startBackgroundClassify(
  options: BatchClassifyOptions = {},
): { started: boolean; message: string; reason?: "already_running" | "missing_openai_key" } {
  if (!process.env.OPENAI_API_KEY) {
    return { started: false, message: "OPENAI_API_KEY is not configured", reason: "missing_openai_key" };
  }
  if (isClassifying) {
    return { started: false, message: "A classification pass is already running.", reason: "already_running" };
  }
  // Pre-set running so the first status poll reflects it before the async body runs.
  jobState = freshJobState(options.mode ?? "unclassified");
  void batchClassifyDeals(options).catch(() => {
    /* error already recorded on jobState */
  });
  return { started: true, message: "Classification pass started." };
}

async function runBatchClassifyDeals(
  options: BatchClassifyOptions,
): Promise<BatchClassifyResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const log: string[] = [];
  const stopEpoch = getStopEpoch();
  let stopped = false;
  let processedCount = 0;
  let applied = 0;
  let queued = 0;
  let notSporting = 0;
  let skipped = 0;
  let failed = 0;

  const taxonomy = await loadTaxonomy();
  const mode = options.mode ?? "unclassified";

  // Candidate pile differs by mode. Both exclude deals the AI has already
  // processed (classification_source = 'ai') so a run never reprocesses them.
  const conditions = [sql`${deals.classificationSource} IS DISTINCT FROM 'ai'`];
  if (mode === "baseball-rescue") {
    // Deals defaulted to baseball WITH a concrete equipment type, whose title
    // strongly signals a different sport. We restrict to concrete equipment
    // because the "-other"/null baseball deals are already covered by the
    // "unclassified" pile.
    conditions.push(eq(deals.sportId, RESCUE_SPORT_ID));
    conditions.push(
      sql`${deals.equipmentTypeId} IS NOT NULL AND ${deals.equipmentTypeId} NOT LIKE '%-other'`,
    );
    conditions.push(sql`${deals.title} ~* ${RESCUE_SIGNAL_PATTERN}`);
  } else {
    // Items stuck in an "-other" bucket (or with no sport/equipment).
    conditions.push(
      sql`(${deals.equipmentTypeId} IS NULL OR ${deals.equipmentTypeId} LIKE '%-other' OR ${deals.sportId} IS NULL)`,
    );
    if (options.sportId) conditions.push(eq(deals.sportId, options.sportId));
  }

  // limit <= 0 means "process every candidate" (no cap).
  const baseQuery = db
    .select({ id: deals.id, title: deals.title, brand: deals.brand, sportId: deals.sportId })
    .from(deals)
    .where(and(...conditions))
    .orderBy(desc(deals.priceCents));
  const candidates = limit > 0 ? await baseQuery.limit(limit) : await baseQuery;

  jobState.total = candidates.length;

  if (candidates.length === 0) {
    return { processed: 0, applied: 0, queued: 0, notSporting: 0, skipped: 0, failed: 0, log: ["No candidate deals to classify."], stopped: false };
  }

  // Resolve a decision per unique signature, using the cache and only calling
  // the model for signatures we haven't seen before.
  const sigToDecision = new Map<string, Decision>();
  const uncached = new Map<string, { title: string; brand: string | null; currentSport: string | null }>();

  for (const d of candidates) {
    if (stopRequestedSince(stopEpoch)) { stopped = true; break; }
    const sig = makeSignature(d.title, d.brand);
    if (sigToDecision.has(sig) || uncached.has(sig)) continue;
    const cached = await findCached(sig);
    if (cached) {
      sigToDecision.set(sig, cachedRowToDecision(cached));
      await db
        .update(aiClassifications)
        .set({ lookupCount: sql`${aiClassifications.lookupCount} + 1`, updatedAt: new Date() })
        .where(eq(aiClassifications.id, cached.id));
    } else {
      uncached.set(sig, {
        title: d.title,
        brand: d.brand,
        currentSport: d.sportId ? taxonomy.sportsById.get(d.sportId) ?? d.sportId : null,
      });
    }
  }

  // Call the model in batches for the uncached signatures.
  const uncachedEntries = Array.from(uncached.entries());
  jobState.aiTotal = Math.ceil(uncachedEntries.length / BATCH_SIZE);
  for (let i = 0; i < uncachedEntries.length; i += BATCH_SIZE) {
    if (stopRequestedSince(stopEpoch)) { stopped = true; break; }
    const slice = uncachedEntries.slice(i, i + BATCH_SIZE);
    try {
      const items = await classifyBatchViaAI(slice.map(([, v]) => v), taxonomy);
      const byIndex = new Map<number, AiClassifyItem>();
      for (const it of items) byIndex.set(it.index, it);
      for (let j = 0; j < slice.length; j++) {
        const [sig] = slice[j];
        const raw = byIndex.get(j);
        const decision: Decision = raw
          ? validate(raw, taxonomy)
          : {
              sportId: null,
              equipmentTypeId: null,
              isSportingGoods: true,
              confidence: "low",
              needsNewCategory: false,
              suggestedSportName: null,
              suggestedEquipmentName: null,
              reasoning: "No AI result returned",
            };
        sigToDecision.set(sig, decision);
        await saveCached(sig, decision);
      }
      await new Promise((r) => setTimeout(r, 400));
    } catch (err: any) {
      failed += slice.length;
      jobState.failed = failed;
      log.push(`✗ Batch ${i / BATCH_SIZE} failed: ${err.message}`);
    }
    jobState.aiDone++;
  }

  // Apply decisions to each candidate deal.
  for (const d of candidates) {
    if (stopRequestedSince(stopEpoch)) { stopped = true; break; }
    jobState.processed++;
    processedCount++;
    const sig = makeSignature(d.title, d.brand);
    const decision = sigToDecision.get(sig);
    if (!decision) {
      skipped++;
      continue;
    }
    try {
      if (!decision.isSportingGoods) {
        await stampProcessed(d.id, decision.confidence);
        notSporting++;
        continue;
      }
      if (
        decision.equipmentTypeId &&
        decision.sportId &&
        AUTO_APPLY_CONFIDENCE.has(decision.confidence)
      ) {
        await applyClassification(d.id, d.title, decision);
        applied++;
        log.push(`✓ ${d.title.slice(0, 60)} → ${decision.sportId}/${decision.equipmentTypeId} (${decision.confidence})`);
        continue;
      }
      if (decision.needsNewCategory && QUEUE_CONFIDENCE.has(decision.confidence)) {
        await queueReview(d, decision);
        await stampProcessed(d.id, decision.confidence);
        queued++;
        log.push(`⚑ ${d.title.slice(0, 60)} → gap: ${decision.suggestedSportName ?? decision.sportId ?? "?"}/${decision.suggestedEquipmentName ?? "?"}`);
        continue;
      }
      // Valid-but-low-confidence or unresolved: record so we don't reprocess.
      await stampProcessed(d.id, decision.confidence);
      skipped++;
    } catch (err: any) {
      failed++;
      log.push(`✗ ${d.title.slice(0, 60)}: ${err.message}`);
    }
  }

  if (stopped) log.push("■ Stopped by admin — halted before all candidates were processed.");
  return { processed: processedCount, applied, queued, notSporting, skipped, failed, log, stopped };
}

export async function getClassificationStats() {
  // node-postgres driver: db.execute returns a QueryResult; rows live on `.rows`.
  const pileRes = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE equipment_type_id LIKE '%-other' OR equipment_type_id IS NULL OR sport_id IS NULL) AS candidate_pile,
      COUNT(*) FILTER (WHERE (equipment_type_id LIKE '%-other' OR equipment_type_id IS NULL OR sport_id IS NULL) AND classification_source IS DISTINCT FROM 'ai') AS pending,
      COUNT(*) FILTER (WHERE classification_source = 'ai') AS ai_classified
    FROM deals
  `);
  const cacheRes = await db.execute(sql`SELECT COUNT(*) AS cached FROM ai_classifications`);
  const reviewRes = await db.execute(sql`SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending_review FROM classification_review_queue`);
  // High-suspicion baseball-defaulted deals still awaiting a rescue pass.
  const rescueRes = await db.execute(sql`
    SELECT COUNT(*) AS rescue_pile
    FROM deals
    WHERE sport_id = ${RESCUE_SPORT_ID}
      AND equipment_type_id IS NOT NULL
      AND equipment_type_id NOT LIKE '%-other'
      AND classification_source IS DISTINCT FROM 'ai'
      AND title ~* ${RESCUE_SIGNAL_PATTERN}
  `);
  const pile = (pileRes.rows[0] ?? {}) as Record<string, unknown>;
  const cache = (cacheRes.rows[0] ?? {}) as Record<string, unknown>;
  const review = (reviewRes.rows[0] ?? {}) as Record<string, unknown>;
  const rescue = (rescueRes.rows[0] ?? {}) as Record<string, unknown>;

  return {
    candidatePile: Number(pile.candidate_pile) || 0,
    pending: Number(pile.pending) || 0,
    aiClassified: Number(pile.ai_classified) || 0,
    cachedSignatures: Number(cache.cached) || 0,
    pendingReview: Number(review.pending_review) || 0,
    baseballRescuePile: Number(rescue.rescue_pile) || 0,
  };
}

export interface RemediateMislabeledResult {
  dryRun: boolean;
  // Deals matching the suspicious pattern (AI-stamped baseball + concrete
  // equipment + title strongly signaling a different sport).
  affected: number;
  // Distinct ai_classifications cache rows that match (would be) deleted.
  cacheRowsRemoved: number;
  // Deals whose classification_source was reset to null.
  dealsReset: number;
  sample: { id: string; title: string; equipmentTypeId: string | null }[];
}

// One-time remediation for the wrong-sport backlog. Items classified BEFORE the
// validate() taxonomy-gap fix were stamped classification_source='ai' (so the
// rescue pass skips them) and their cached decision was stored with
// needsNewCategory=false (so reading the cache never re-routes them to review).
// This finds that high-suspicion backlog and, when run for real (dryRun=false),
// (a) deletes the matching ai_classifications cache rows so the new validate()
// logic re-runs, and (b) resets classification_source to null so the deals
// re-enter the next baseball-rescue candidate pile. Defaults to a dry run
// because re-running classification re-incurs OpenAI cost (see
// .agents/memory/ai-classifier-cache-bypass.md) — confirm scope before mutating.
export async function remediateMislabeledRescueDeals(
  options: { dryRun?: boolean; limit?: number } = {},
): Promise<RemediateMislabeledResult> {
  const dryRun = options.dryRun ?? true;
  // Same high-precision signal as the rescue pass, but targeting deals already
  // stamped 'ai' (the backlog the rescue pass can no longer reach). The cheap,
  // index-friendly equality filters run in SQL; the 40-keyword word-boundary
  // regex is applied in JS afterward. Doing the regex in Postgres would force a
  // full-table seq scan over every deal (no usable index for ~* alternation),
  // whereas the equality predicates narrow the set to a tiny pile first.
  const prefiltered = await db
    .select({
      id: deals.id,
      title: deals.title,
      brand: deals.brand,
      equipmentTypeId: deals.equipmentTypeId,
    })
    .from(deals)
    .where(
      and(
        eq(deals.classificationSource, "ai"),
        eq(deals.sportId, RESCUE_SPORT_ID),
        sql`${deals.equipmentTypeId} IS NOT NULL AND ${deals.equipmentTypeId} NOT LIKE '%-other'`,
      ),
    )
    .orderBy(desc(deals.priceCents));

  // JS equivalent of the Postgres \y(...)\y rescue pattern (\b is the ASCII
  // word boundary; phrases with spaces still anchor correctly).
  const rescueRegex = new RegExp(`\\b(${RESCUE_SIGNAL_KEYWORDS.join("|")})\\b`, "i");
  let affected = prefiltered.filter((d) => rescueRegex.test(d.title));
  if (options.limit && options.limit > 0) affected = affected.slice(0, options.limit);

  const sample = affected.slice(0, 20).map((d) => ({
    id: d.id,
    title: d.title.slice(0, 80),
    equipmentTypeId: d.equipmentTypeId,
  }));

  // Cache rows keyed by the affected deals' signatures. Scoped to these
  // signatures only so we never disturb cache entries for unrelated deals.
  const signatures = Array.from(
    new Set(affected.map((d) => makeSignature(d.title, d.brand))),
  );
  let cacheRowsRemoved = 0;
  if (signatures.length > 0) {
    const matching = await db
      .select({ id: aiClassifications.id })
      .from(aiClassifications)
      .where(inArray(aiClassifications.signature, signatures));
    cacheRowsRemoved = matching.length;
  }

  if (dryRun) {
    return { dryRun: true, affected: affected.length, cacheRowsRemoved, dealsReset: 0, sample };
  }

  // Delete the matching cache rows so the corrected validate() re-runs.
  if (signatures.length > 0) {
    await db
      .delete(aiClassifications)
      .where(inArray(aiClassifications.signature, signatures));
  }

  // Un-stamp the affected deals so they re-enter the rescue candidate pile.
  let dealsReset = 0;
  const ids = affected.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    await db
      .update(deals)
      .set({ classificationSource: null, classificationConfidence: null })
      .where(inArray(deals.id, slice));
    dealsReset += slice.length;
  }

  return { dryRun: false, affected: affected.length, cacheRowsRemoved, dealsReset, sample };
}

export async function listReviewQueue(status: string = "pending"): Promise<ClassificationReviewItem[]> {
  return db
    .select()
    .from(classificationReviewQueue)
    .where(eq(classificationReviewQueue.status, status))
    .orderBy(desc(classificationReviewQueue.createdAt))
    .limit(200);
}

export async function approveReviewItem(id: string): Promise<{ success: boolean; message: string }> {
  const [item] = await db
    .select()
    .from(classificationReviewQueue)
    .where(eq(classificationReviewQueue.id, id))
    .limit(1);
  if (!item) return { success: false, message: "Review item not found" };
  if (item.status !== "pending") return { success: false, message: `Already ${item.status}` };

  // Resolve / create the sport.
  let sportId = item.suggestedSportId;
  if (!sportId && item.suggestedSportName) {
    const sport = await storage.createSport(item.suggestedSportName);
    sportId = sport.id;
  }
  if (!sportId) {
    return { success: false, message: "No sport to assign — reject instead" };
  }

  // Create the equipment type if one was suggested.
  let equipmentTypeId: string | null = null;
  if (item.suggestedEquipmentName) {
    const eq = await storage.createEquipmentType(item.suggestedEquipmentName, sportId);
    equipmentTypeId = eq.id;
  }

  // Reclassify the originating deal.
  if (item.dealId) {
    const subFilterId = equipmentTypeId ? classifyDealSubFilter(item.title, equipmentTypeId) : null;
    await db
      .update(deals)
      .set({
        sportId,
        equipmentTypeId,
        subFilterId,
        classificationSource: "ai",
        classificationConfidence: item.confidence,
      })
      .where(eq(deals.id, item.dealId));
  }

  await db
    .update(classificationReviewQueue)
    .set({ status: "approved", resolvedAt: new Date() })
    .where(eq(classificationReviewQueue.id, id));

  return {
    success: true,
    message: `Approved — sport ${sportId}${equipmentTypeId ? `, equipment ${equipmentTypeId}` : ""}`,
  };
}

export async function rejectReviewItem(id: string): Promise<{ success: boolean; message: string }> {
  const [item] = await db
    .select({ id: classificationReviewQueue.id, status: classificationReviewQueue.status })
    .from(classificationReviewQueue)
    .where(eq(classificationReviewQueue.id, id))
    .limit(1);
  if (!item) return { success: false, message: "Review item not found" };

  await db
    .update(classificationReviewQueue)
    .set({ status: "rejected", resolvedAt: new Date() })
    .where(eq(classificationReviewQueue.id, id));
  return { success: true, message: "Rejected" };
}
