import { pool } from "./db";

export type DemandSnapshotResult = {
  snapshotDate: string;
  trustedListings: number;
  proposedListings: number;
  identityVariants: number;
  sourceCount: number;
};

export type DemandScoreInput = {
  windowDays: number;
  averageSoldPriceCents?: number | null;
  minimumSoldPriceCents?: number | null;
  maximumSoldPriceCents?: number | null;
  averageShippingCents?: number | null;
  sellThroughPercent?: number | null;
  totalSold?: number | null;
  totalSellers?: number | null;
};

export type DemandIntelligence = {
  score: number | null;
  confidence: "high" | "medium" | "low" | "insufficient";
  marketStatus: "hot" | "reliable" | "slow" | "uncertain";
  expectedSaleLowCents: number | null;
  expectedSaleHighCents: number | null;
  maximumAcquisitionCents: number | null;
  explanation: string[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function calculateDemandIntelligence(input: DemandScoreInput): DemandIntelligence {
  const sold = Number(input.totalSold ?? 0);
  const sellers = Number(input.totalSellers ?? 0);
  const average = Number(input.averageSoldPriceCents ?? 0);
  const sellThrough = input.sellThroughPercent == null
    ? null
    : clampScore(Number(input.sellThroughPercent));
  if (sold <= 0 || average <= 0) {
    return {
      score: null,
      confidence: "insufficient",
      marketStatus: "uncertain",
      expectedSaleLowCents: null,
      expectedSaleHighCents: null,
      maximumAcquisitionCents: null,
      explanation: ["No trustworthy sold-market sample is available for this exact model."],
    };
  }

  const completeness = [
    input.minimumSoldPriceCents, input.maximumSoldPriceCents,
    input.sellThroughPercent, input.totalSellers,
  ].filter((value) => value != null).length;
  const confidence = sold >= 30 && completeness >= 3
    ? "high"
    : sold >= 10 && completeness >= 2
      ? "medium"
      : "low";
  const monthlySold = sold * (30 / Math.max(1, Number(input.windowDays)));
  const velocityScore = clampScore(
    (Math.log1p(monthlySold) / Math.log1p(40)) * 100,
  );
  const sellThroughScore = sellThrough ?? 35;
  const sellerEfficiency = sellers > 0
    ? clampScore((sold / sellers / 2) * 100)
    : 35;
  const minimum = Number(input.minimumSoldPriceCents ?? average);
  const maximum = Number(input.maximumSoldPriceCents ?? average);
  const relativeSpread = average > 0 ? Math.max(0, maximum - minimum) / average : 1;
  const stabilityScore = clampScore(100 - relativeSpread * 50);
  const rawScore = (
    velocityScore * 0.45
    + sellThroughScore * 0.35
    + sellerEfficiency * 0.10
    + stabilityScore * 0.10
  );
  const confidenceFactor = confidence === "high" ? 1 : confidence === "medium" ? 0.85 : 0.65;
  const score = Math.round(clampScore(rawScore * confidenceFactor));
  const marketStatus = score >= 75 ? "hot" : score >= 55 ? "reliable" : score >= 35 ? "slow" : "uncertain";
  const expectedSaleLowCents = input.minimumSoldPriceCents == null
    ? Math.round(average * 0.9)
    : Math.max(Number(input.minimumSoldPriceCents), Math.round(average * 0.75));
  const expectedSaleHighCents = input.maximumSoldPriceCents == null
    ? Math.round(average * 1.1)
    : Math.min(Number(input.maximumSoldPriceCents), Math.round(average * 1.25));
  const riskAllowance = confidence === "high" ? 0.05 : confidence === "medium" ? 0.10 : 0.15;
  const maximumAcquisitionCents = Math.max(0, Math.round(
    average * (1 - 0.15 - 0.20 - riskAllowance) - Number(input.averageShippingCents ?? 0),
  ));
  const explanation = [
    `${sold.toLocaleString()} sold in ${input.windowDays} days (${monthlySold.toFixed(1)} per 30 days).`,
    sellThrough == null
      ? "Sell-through was unavailable, so the score uses a conservative neutral value."
      : `${Math.round(sellThrough)}% sell-through indicates ${sellThrough >= 50 ? "strong" : sellThrough >= 25 ? "moderate" : "limited"} conversion.`,
    sellers > 0
      ? `${sellers.toLocaleString()} sellers create ${sold / sellers >= 1 ? "manageable" : "meaningful"} competition.`
      : "Seller competition was unavailable.",
    `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence based on sample size and field coverage.`,
  ];
  return {
    score,
    confidence,
    marketStatus,
    expectedSaleLowCents,
    expectedSaleHighCents,
    maximumAcquisitionCents,
    explanation,
  };
}

export function marketWindowDays(value: unknown): 5 | 10 | 30 | 90 {
  const parsed = Number(value);
  return parsed === 5 || parsed === 10 || parsed === 90 ? parsed : 30;
}

export async function captureDailyDemandSnapshot(
  now = new Date(),
): Promise<DemandSnapshotResult> {
  const snapshotDate = now.toISOString().slice(0, 10);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('tssdeals-demand-snapshot'))",
    );
    const coverage = await client.query<{
      trusted_listings: number;
      proposed_listings: number;
    }>(`
      SELECT
        count(*) FILTER (WHERE status='approved')::int AS trusted_listings,
        count(*) FILTER (WHERE status='proposed')::int AS proposed_listings
      FROM deal_product_identities
    `);

    await client.query(
      `DELETE FROM demand_market_snapshots WHERE snapshot_date=$1::date`,
      [snapshotDate],
    );
    const inserted = await client.query<{
      identity_variants: number;
      source_count: number;
    }>(`
      WITH inserted AS (
        INSERT INTO demand_market_snapshots (
          snapshot_date, product_identity_id, source_id, active_listings,
          priced_listings, min_price_cents, median_price_cents,
          average_price_cents, max_price_cents, new_listings, preowned_listings
        )
        SELECT $1::date, dpi.product_identity_id, d.source_id,
               count(*)::int,
               count(d.price_cents)::int,
               min(d.price_cents)::int,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY d.price_cents)::int,
               round(avg(d.price_cents))::int,
               max(d.price_cents)::int,
               count(*) FILTER (WHERE lower(coalesce(d.condition,'')) LIKE '%new%')::int,
               count(*) FILTER (WHERE lower(coalesce(d.condition,'')) NOT LIKE '%new%')::int
          FROM deal_product_identities dpi
          JOIN deals d ON d.id=dpi.deal_id
         WHERE dpi.status='approved'
         GROUP BY dpi.product_identity_id, d.source_id
        RETURNING product_identity_id, source_id
      )
      SELECT count(DISTINCT product_identity_id)::int AS identity_variants,
             count(DISTINCT source_id)::int AS source_count
        FROM inserted
    `, [snapshotDate]);
    const trustedListings = Number(coverage.rows[0]?.trusted_listings ?? 0);
    const proposedListings = Number(coverage.rows[0]?.proposed_listings ?? 0);
    const identityVariants = Number(inserted.rows[0]?.identity_variants ?? 0);
    const sourceCount = Number(inserted.rows[0]?.source_count ?? 0);

    await client.query(`
      INSERT INTO demand_snapshot_runs (
        snapshot_date, status, trusted_listings, proposed_listings,
        identity_variants, source_count, captured_at
      ) VALUES ($1::date,'complete',$2,$3,$4,$5,NOW())
      ON CONFLICT (snapshot_date) DO UPDATE SET
        status='complete',
        trusted_listings=EXCLUDED.trusted_listings,
        proposed_listings=EXCLUDED.proposed_listings,
        identity_variants=EXCLUDED.identity_variants,
        source_count=EXCLUDED.source_count,
        captured_at=NOW()
    `, [snapshotDate, trustedListings, proposedListings, identityVariants, sourceCount]);
    await client.query("COMMIT");
    return { snapshotDate, trustedListings, proposedListings, identityVariants, sourceCount };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function getDemandBrainSummary(windowDays: 5 | 10 | 30 | 90 = 30) {
  const client = await pool.connect();
  try {
    const [latest, history, families, completedSales] = await Promise.all([
      client.query(`
        SELECT snapshot_date, status, trusted_listings, proposed_listings,
               identity_variants, source_count, captured_at
          FROM demand_snapshot_runs
         ORDER BY snapshot_date DESC LIMIT 1
      `),
      client.query(`
        SELECT snapshot_date, trusted_listings, proposed_listings,
               identity_variants, source_count
          FROM demand_snapshot_runs
         WHERE snapshot_date >= CURRENT_DATE - ($1::int - 1)
         ORDER BY snapshot_date
      `, [windowDays]),
      client.query(`
        WITH daily AS (
          SELECT s.snapshot_date, pi.family_fingerprint, pi.canonical_brand,
                 pi.product_family, pi.sport_id, pi.equipment_type_id,
                 sum(s.active_listings)::int AS active_listings,
                 sum(s.priced_listings)::int AS priced_listings,
                 percentile_cont(0.5) WITHIN GROUP
                   (ORDER BY s.median_price_cents) FILTER
                   (WHERE s.median_price_cents IS NOT NULL)::int AS median_price_cents,
                 count(DISTINCT s.source_id)::int AS sources
            FROM demand_market_snapshots s
            JOIN product_identities pi ON pi.id=s.product_identity_id
           WHERE s.snapshot_date >= CURRENT_DATE - ($1::int - 1)
           GROUP BY s.snapshot_date, pi.family_fingerprint, pi.canonical_brand,
                    pi.product_family, pi.sport_id, pi.equipment_type_id
        ),
        rolled AS (
          SELECT family_fingerprint, canonical_brand, product_family, sport_id,
                 equipment_type_id, sum(active_listings)::int AS listing_observations,
                 max(active_listings) FILTER
                   (WHERE snapshot_date=(SELECT max(snapshot_date) FROM daily))::int AS current_listings,
                 round(avg(median_price_cents))::int AS median_price_cents,
                 max(sources)::int AS sources,
                 count(DISTINCT snapshot_date)::int AS observed_days
            FROM daily
           GROUP BY family_fingerprint, canonical_brand, product_family,
                    sport_id, equipment_type_id
        )
        SELECT * FROM rolled
         ORDER BY listing_observations DESC, sources DESC
         LIMIT 25
      `, [windowDays]),
      client.query(`
        SELECT DISTINCT ON (research_key)
               research_key, label, observation_type, product_identity_id,
               average_sold_price_cents, minimum_sold_price_cents,
               maximum_sold_price_cents, average_shipping_cents,
               free_shipping_percent, sell_through_percent, total_sold,
               total_sellers, period_start, period_end, source_url
          FROM product_research_observations
         WHERE window_days=$1
         ORDER BY research_key, period_end DESC, observed_at DESC
      `, [windowDays]),
    ]);
    const completedSalesWithScores = completedSales.rows.map((observation) => ({
      ...observation,
      intelligence: calculateDemandIntelligence({
        windowDays,
        averageSoldPriceCents: observation.average_sold_price_cents,
        minimumSoldPriceCents: observation.minimum_sold_price_cents,
        maximumSoldPriceCents: observation.maximum_sold_price_cents,
        averageShippingCents: observation.average_shipping_cents,
        sellThroughPercent: observation.sell_through_percent,
        totalSold: observation.total_sold,
        totalSellers: observation.total_sellers,
      }),
    }));
    return {
      windowDays,
      latest: latest.rows[0] ?? null,
      history: history.rows,
      families: families.rows,
      completedSales: completedSalesWithScores,
      generatedAt: new Date().toISOString(),
      caveat: completedSales.rows.length
        ? "Supply metrics come from approved listings. Completed-sale metrics are aggregate observations manually recorded from authenticated eBay Product Research."
        : "Active-listing observations measure supply and market coverage. Record an aggregate Product Research observation before using completed-sale demand.",
    };
  } finally {
    client.release();
  }
}
