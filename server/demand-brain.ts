import { pool } from "./db";

export type DemandSnapshotResult = {
  snapshotDate: string;
  trustedListings: number;
  proposedListings: number;
  identityVariants: number;
  sourceCount: number;
};

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
    return {
      windowDays,
      latest: latest.rows[0] ?? null,
      history: history.rows,
      families: families.rows,
      completedSales: completedSales.rows,
      generatedAt: new Date().toISOString(),
      caveat: completedSales.rows.length
        ? "Supply metrics come from approved listings. Completed-sale metrics are aggregate observations manually recorded from authenticated eBay Product Research."
        : "Active-listing observations measure supply and market coverage. Record an aggregate Product Research observation before using completed-sale demand.",
    };
  } finally {
    client.release();
  }
}
