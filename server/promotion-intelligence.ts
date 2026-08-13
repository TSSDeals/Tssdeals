import { sql } from "drizzle-orm";
import { db } from "./db";

const SPORTING_TERMS = /\b(?:baseball|softball|glove|mitt|bat|golf|club|driver|iron|wedge|putter|ball|cleat|running|shoe|sport|athletic|hockey|lacrosse|football|basketball|soccer|fishing|cycling)\b/i;

export function promotionDetails(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const percent = normalized.match(/\b(?:save\s+)?(\d{1,2})\s*%\s*(?:off|discount|savings?|on)?\b/i);
  const dollars = normalized.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:off|discount)\b/i);
  const code = normalized.match(/\b(?:code|coupon|promo)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{2,24})\b/i)?.[1] ?? null;
  const url = normalized.match(/https?:\/\/[^\s<>"')]+/i)?.[0]?.replace(/[.,;!?]+$/, "") ?? null;
  return {
    code,
    discountType: percent ? "percent" : dollars ? "amount" : null,
    discountValue: percent?.[1] ?? dollars?.[1] ?? null,
    landingUrl: url,
  };
}

export async function observeAffiliateAdvertiser(input: {
  network: string; advertiserId?: string | null; advertiserName: string; evidence?: unknown;
}) {
  const source = await db.execute(sql`
    SELECT id FROM sources
    WHERE lower(name) = lower(${input.advertiserName})
       OR lower(base_url) LIKE ${`%${input.advertiserName.toLowerCase().replace(/[^a-z0-9]+/g, "%")}%`}
    LIMIT 1
  `);
  const sourceId = (source as any).rows?.[0]?.id ?? null;
  const likelihood = SPORTING_TERMS.test(input.advertiserName) ? "high" : "unknown";
  await db.execute(sql`
    INSERT INTO affiliate_relationship_candidates (
      network, advertiser_id, advertiser_name, source_id, status, sporting_goods_likelihood, evidence
    ) VALUES (
      ${input.network}, ${input.advertiserId ?? null}, ${input.advertiserName}, ${sourceId},
      ${sourceId ? "monitored" : "pending"}, ${likelihood}, ${JSON.stringify(input.evidence ?? {})}::jsonb
    )
    ON CONFLICT (network, advertiser_name) DO UPDATE SET
      advertiser_id = COALESCE(EXCLUDED.advertiser_id, affiliate_relationship_candidates.advertiser_id),
      source_id = COALESCE(EXCLUDED.source_id, affiliate_relationship_candidates.source_id),
      status = CASE WHEN affiliate_relationship_candidates.status = 'approved' THEN 'approved' ELSE EXCLUDED.status END,
      sporting_goods_likelihood = EXCLUDED.sporting_goods_likelihood,
      evidence = EXCLUDED.evidence, last_seen_at = NOW()
  `);
}

export async function listAffiliateCandidates() {
  const result = await db.execute(sql`
    SELECT * FROM affiliate_relationship_candidates
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'monitored' THEN 1 ELSE 2 END, last_seen_at DESC
    LIMIT 500
  `);
  return (result as any).rows ?? [];
}

export { SPORTING_TERMS };
