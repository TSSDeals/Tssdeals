import { z } from "zod";
import { pool } from "./db";

export const PRODUCT_RESEARCH_WINDOWS = [5, 10, 30, 90, 365, 1095] as const;
export type ProductResearchWindow = typeof PRODUCT_RESEARCH_WINDOWS[number];

export function productResearchWindow(value: unknown): ProductResearchWindow {
  const parsed = Number(value);
  return PRODUCT_RESEARCH_WINDOWS.includes(parsed as ProductResearchWindow)
    ? parsed as ProductResearchWindow
    : 30;
}

const optionalNonnegative = z.number().int().nonnegative().nullable().optional();
const optionalPercent = z.number().min(0).max(100)
  .transform((value) => Math.round(value))
  .nullable()
  .optional();

export const productResearchObservationInput = z.object({
  observationType: z.enum(["category", "product_identity"]),
  productIdentityId: z.string().min(1).nullable().optional(),
  researchKey: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(240),
  marketplace: z.literal("EBAY_US").default("EBAY_US"),
  queryText: z.string().trim().max(500).nullable().optional(),
  categoryId: z.string().trim().max(32).nullable().optional(),
  categoryLabel: z.string().trim().max(240).nullable().optional(),
  windowDays: z.union([
    z.literal(5), z.literal(10), z.literal(30), z.literal(90),
    z.literal(365), z.literal(1095),
  ]),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  averageSoldPriceCents: optionalNonnegative,
  minimumSoldPriceCents: optionalNonnegative,
  maximumSoldPriceCents: optionalNonnegative,
  averageShippingCents: optionalNonnegative,
  freeShippingPercent: optionalPercent,
  sellThroughPercent: optionalPercent,
  totalSold: optionalNonnegative,
  totalSellers: optionalNonnegative,
  notes: z.string().trim().max(2000).nullable().optional(),
  sourceUrl: z.string().url().refine((url) => {
    const host = new URL(url).hostname.toLowerCase();
    return host === "ebay.com" || host.endsWith(".ebay.com");
  }, "Source URL must be an eBay page"),
}).superRefine((value, context) => {
  if (value.observationType === "product_identity" && !value.productIdentityId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["productIdentityId"],
      message: "Product identity observations require an approved identity",
    });
  }
  if (value.periodStart > value.periodEnd) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["periodStart"],
      message: "Period start must not be after period end",
    });
  }
  if (value.windowDays > 90 && value.sellThroughPercent != null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sellThroughPercent"],
      message: "eBay does not provide sell-through for Product Research windows over 90 days",
    });
  }
  if (value.minimumSoldPriceCents != null && value.maximumSoldPriceCents != null
      && value.minimumSoldPriceCents > value.maximumSoldPriceCents) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["minimumSoldPriceCents"],
      message: "Minimum price must not exceed maximum price",
    });
  }
});

export type ProductResearchObservationInput = z.infer<typeof productResearchObservationInput>;

export const PRODUCT_RESEARCH_CATEGORIES = [
  {
    researchKey: "category:baseball-fielding-gloves",
    label: "Baseball Fielding Gloves & Mitts",
    queryText: "Baseball Gloves",
    categoryId: "16030",
    categoryLabel: "Baseball Gloves & Mitts",
  },
  { researchKey: "category:baseball-bats", label: "Baseball Bats", queryText: "Baseball Bat" },
  { researchKey: "category:fastpitch-bats", label: "Fastpitch Softball Bats", queryText: "Fastpitch Softball Bat" },
  { researchKey: "category:catchers-gear", label: "Catcher's Gear", queryText: "Baseball Catcher's Gear" },
  { researchKey: "category:batting-helmets", label: "Batting Helmets", queryText: "Baseball Batting Helmet" },
  { researchKey: "category:cleats", label: "Baseball & Softball Cleats", queryText: "Baseball Softball Cleats" },
] as const;

export function buildProductResearchUrl(input: {
  queryText: string;
  categoryId?: string | null;
  windowDays: ProductResearchWindow;
  endDate?: Date;
}) {
  const end = input.endDate ?? new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - input.windowDays);
  const params = new URLSearchParams({
    marketplace: "EBAY-US",
    keywords: input.queryText,
    dayRange: String(input.windowDays),
    endDate: String(end.getTime()),
    startDate: String(start.getTime()),
    offset: "0",
    limit: "50",
    sorting: "-datelastsold",
    tabName: "SOLD",
  });
  if (input.categoryId) params.set("categoryId", input.categoryId);
  return `https://www.ebay.com/sh/research?${params.toString()}`;
}

export async function saveProductResearchObservation(
  rawInput: unknown,
  recordedBy?: string,
) {
  const input = productResearchObservationInput.parse(rawInput);
  const client = await pool.connect();
  try {
    if (input.productIdentityId) {
      const approved = await client.query(`
        SELECT 1
          FROM product_identities pi
         WHERE pi.id=$1
           AND EXISTS (
             SELECT 1 FROM deal_product_identities dpi
              WHERE dpi.product_identity_id=pi.id AND dpi.status='approved'
           )
         LIMIT 1
      `, [input.productIdentityId]);
      if (!approved.rowCount) throw new Error("Product identity is not approved for trusted research");
    }
    // Re-saving the same dated eBay research URL is a correction, not a second
    // observation. This also repairs records created before URL dates were used.
    await client.query(`
      DELETE FROM product_research_observations
       WHERE source='ebay_product_research'
         AND research_key=$1
         AND window_days=$2
         AND source_url=$3
         AND period_end<>$4::date
    `, [input.researchKey, input.windowDays, input.sourceUrl, input.periodEnd]);
    const result = await client.query(`
      INSERT INTO product_research_observations (
        observation_type, product_identity_id, research_key, label, marketplace,
        query_text, category_id, category_label, window_days, period_start, period_end,
        average_sold_price_cents, minimum_sold_price_cents, maximum_sold_price_cents,
        average_shipping_cents, free_shipping_percent, sell_through_percent,
        total_sold, total_sellers, notes, source_url, recorded_by, observed_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,$22,NOW()
      )
      ON CONFLICT (source, research_key, window_days, period_end) DO UPDATE SET
        product_identity_id=EXCLUDED.product_identity_id,
        label=EXCLUDED.label, query_text=EXCLUDED.query_text,
        category_id=EXCLUDED.category_id, category_label=EXCLUDED.category_label,
        period_start=EXCLUDED.period_start,
        average_sold_price_cents=EXCLUDED.average_sold_price_cents,
        minimum_sold_price_cents=EXCLUDED.minimum_sold_price_cents,
        maximum_sold_price_cents=EXCLUDED.maximum_sold_price_cents,
        average_shipping_cents=EXCLUDED.average_shipping_cents,
        free_shipping_percent=EXCLUDED.free_shipping_percent,
        sell_through_percent=EXCLUDED.sell_through_percent,
        total_sold=EXCLUDED.total_sold, total_sellers=EXCLUDED.total_sellers,
        notes=EXCLUDED.notes, source_url=EXCLUDED.source_url,
        recorded_by=EXCLUDED.recorded_by, observed_at=NOW()
      RETURNING *
    `, [
      input.observationType, input.productIdentityId ?? null, input.researchKey,
      input.label, input.marketplace, input.queryText ?? null, input.categoryId ?? null,
      input.categoryLabel ?? null, input.windowDays, input.periodStart, input.periodEnd,
      input.averageSoldPriceCents ?? null, input.minimumSoldPriceCents ?? null,
      input.maximumSoldPriceCents ?? null, input.averageShippingCents ?? null,
      input.freeShippingPercent ?? null, input.sellThroughPercent ?? null,
      input.totalSold ?? null, input.totalSellers ?? null, input.notes ?? null,
      input.sourceUrl, recordedBy ?? null,
    ]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function getProductResearchWorkspace(windowDays: ProductResearchWindow) {
  const client = await pool.connect();
  try {
    const [observations, identities] = await Promise.all([
      client.query(`
        SELECT o.*, pi.canonical_brand, pi.product_family, pi.model_code
          FROM product_research_observations o
          LEFT JOIN product_identities pi ON pi.id=o.product_identity_id
         WHERE o.window_days=$1
         ORDER BY o.period_end DESC, o.observed_at DESC
         LIMIT 100
      `, [windowDays]),
      client.query(`
        SELECT pi.id, pi.family_fingerprint, pi.canonical_brand, pi.product_family,
               pi.model_code, pi.sport_id, pi.equipment_type_id,
               count(dpi.deal_id)::int AS approved_listings,
               max(o.period_end) FILTER (WHERE o.window_days=$1) AS last_observed
          FROM product_identities pi
          JOIN deal_product_identities dpi
            ON dpi.product_identity_id=pi.id AND dpi.status='approved'
          LEFT JOIN product_research_observations o ON o.product_identity_id=pi.id
         GROUP BY pi.id
         ORDER BY (max(o.period_end) FILTER (WHERE o.window_days=$1)) ASC NULLS FIRST,
                  count(dpi.deal_id) DESC, pi.canonical_brand, pi.product_family
         LIMIT 40
      `, [windowDays]),
    ]);
    return {
      windowDays,
      categories: PRODUCT_RESEARCH_CATEGORIES.map((category) => ({
        ...category,
        researchUrl: buildProductResearchUrl({
          queryText: category.queryText,
          categoryId: category.categoryId,
          windowDays,
        }),
      })),
      identities: identities.rows.map((identity) => ({
        ...identity,
        researchKey: `identity:${identity.id}`,
        label: `${identity.canonical_brand} ${identity.product_family}${identity.model_code ? ` ${identity.model_code}` : ""}`,
        queryText: `${identity.canonical_brand} ${identity.product_family}${identity.model_code ? ` ${identity.model_code}` : ""}`,
        researchUrl: buildProductResearchUrl({
          queryText: `${identity.canonical_brand} ${identity.product_family}${identity.model_code ? ` ${identity.model_code}` : ""}`,
          windowDays,
        }),
      })),
      observations: observations.rows,
    };
  } finally {
    client.release();
  }
}
