import { db } from "./db";
import { promoCodes, deals, sources } from "@shared/schema";
import { eq, and, desc, sql, isNull, or, lte, gte } from "drizzle-orm";
import { log } from "./index";

const CJ_PROMOTIONS_URL = "https://promotion-api.cj.com/v2/promotions";

interface CJPromotion {
  id: string;
  promotionType: string;
  couponCode: string;
  promotionStartDate: string;
  promotionEndDate: string;
  clickUrl: string;
  description: string;
  advertiserName: string;
  advertiserId: string;
  status: string;
}

async function upsertPromo(values: {
  source: string; advertiserId: string | null; advertiserName: string;
  code: string; description: string | null; startDate: Date | null;
  endDate: Date | null; discountType: string | null; discountValue: string | null;
  trackingUrl: string | null; raw: any;
}) {
  const existing = await db
    .select({ id: promoCodes.id })
    .from(promoCodes)
    .where(
      and(
        eq(promoCodes.source, values.source),
        eq(promoCodes.advertiserName, values.advertiserName),
        eq(promoCodes.code, values.code),
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(promoCodes)
      .set({
        description: values.description,
        endDate: values.endDate,
        startDate: values.startDate,
        status: "active",
        discountType: values.discountType,
        discountValue: values.discountValue,
        trackingUrl: values.trackingUrl,
        raw: values.raw,
        updatedAt: new Date(),
      })
      .where(eq(promoCodes.id, existing[0].id));
  } else {
    await db.insert(promoCodes).values({
      source: values.source,
      advertiserId: values.advertiserId,
      advertiserName: values.advertiserName,
      code: values.code,
      description: values.description,
      startDate: values.startDate,
      endDate: values.endDate,
      status: "active",
      discountType: values.discountType,
      discountValue: values.discountValue,
      trackingUrl: values.trackingUrl,
      raw: values.raw,
      updatedAt: new Date(),
    });
  }
}

async function fetchCJPromotions(): Promise<number> {
  const apiKey = process.env.CJ_API_TOKEN;
  const propertyId = process.env.CJ_PROPERTY_ID || process.env.CJ_COMPANY_ID;
  if (!apiKey) {
    log("CJ_API_TOKEN not set, skipping CJ promo sync", "promo-codes");
    return 0;
  }

  let totalUpserted = 0;
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      const params = new URLSearchParams({
        "promotion-type": "coupon",
        "website-id": propertyId || "",
        "page-number": String(page),
        "records-per-page": String(perPage),
      });

      const response = await fetch(`${CJ_PROMOTIONS_URL}?${params}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        log(`CJ promotions API error ${response.status}: ${errText.slice(0, 300)}`, "promo-codes");
        break;
      }

      const contentType = response.headers.get("content-type") || "";
      let promos: CJPromotion[] = [];

      if (contentType.includes("xml") || contentType.includes("text")) {
        const xmlText = await response.text();
        promos = parseCJPromotionsXml(xmlText);
      } else {
        const json = await response.json() as any;
        promos = json.data || [];
      }

      if (promos.length === 0) break;

      for (const promo of promos) {
        if (!promo.couponCode || !promo.couponCode.trim()) continue;

        const discountInfo = parseDiscountFromDescription(promo.description || "");

        await upsertPromo({
          source: "cj",
          advertiserId: promo.advertiserId || null,
          advertiserName: promo.advertiserName || "Unknown",
          code: promo.couponCode.trim(),
          description: promo.description || null,
          startDate: promo.promotionStartDate ? new Date(promo.promotionStartDate) : null,
          endDate: promo.promotionEndDate ? new Date(promo.promotionEndDate) : null,
          discountType: discountInfo.type,
          discountValue: discountInfo.value,
          trackingUrl: promo.clickUrl || null,
          raw: promo as any,
        });
        totalUpserted++;
      }

      if (promos.length < perPage) break;
      page++;
      await delay(500);
    }
  } catch (err: any) {
    log(`CJ promotions fetch error: ${err.message}`, "promo-codes");
  }

  log(`CJ promotions: ${totalUpserted} promo codes synced`, "promo-codes");
  return totalUpserted;
}

function parseCJPromotionsXml(xml: string): CJPromotion[] {
  const promos: CJPromotion[] = [];
  const promoRegex = /<promotion>([\s\S]*?)<\/promotion>/gi;
  let match;

  while ((match = promoRegex.exec(xml)) !== null) {
    const block = match[1];
    const extract = (tag: string): string => {
      const m = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}>([^<]*)</${tag}>`, "i").exec(block);
      return (m?.[1] ?? m?.[2] ?? "").trim();
    };

    promos.push({
      id: extract("id"),
      promotionType: extract("promotion-type"),
      couponCode: extract("coupon-code"),
      promotionStartDate: extract("promotion-start-date"),
      promotionEndDate: extract("promotion-end-date"),
      clickUrl: extract("click-url"),
      description: extract("description"),
      advertiserName: extract("advertiser-name"),
      advertiserId: extract("advertiser-id"),
      status: extract("promotion-status"),
    });
  }

  return promos;
}

async function fetchImpactPromotions(): Promise<number> {
  const accountSid = process.env.IMPACT_ACCOUNT_SID;
  const authToken = process.env.IMPACT_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    log("Impact credentials not set, skipping Impact promo sync", "promo-codes");
    return 0;
  }

  return fetchImpactStylePromotions(accountSid, authToken, "impact");
}

async function fetchFanaticsPromotions(): Promise<number> {
  const accountSid = process.env.FANATICS_IMPACT_ACCOUNT_SID;
  const authToken = process.env.FANATICS_IMPACT_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    log("Fanatics Impact credentials not set, skipping", "promo-codes");
    return 0;
  }

  return fetchImpactStylePromotions(accountSid, authToken, "impact-fanatics");
}

async function fetchImpactStylePromotions(accountSid: string, authToken: string, source: string): Promise<number> {
  let totalUpserted = 0;
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    let page = 1;
    while (true) {
      const url = `https://api.impact.com/Mediapartners/${accountSid}/PromoAds?PageSize=100&Page=${page}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        log(`${source} promos API error ${response.status}: ${errText.slice(0, 300)}`, "promo-codes");
        break;
      }

      const json = await response.json() as any;
      const ads = json.Ads || json.PromoAds || [];

      if (!Array.isArray(ads) || ads.length === 0) break;

      for (const ad of ads) {
        const code = ad.PromoCode || ad.CouponCode || ad.Code || "";
        if (!code.trim()) continue;

        const discountInfo = parseDiscountFromDescription(ad.Description || ad.Name || "");
        const advertiserName = ad.AdvertiserName || ad.CampaignName || "Unknown";

        await upsertPromo({
          source,
          advertiserId: ad.AdvertiserId || ad.CampaignId || null,
          advertiserName,
          code: code.trim(),
          description: ad.Description || ad.Name || null,
          startDate: ad.StartDate ? new Date(ad.StartDate) : null,
          endDate: ad.EndDate ? new Date(ad.EndDate) : null,
          discountType: discountInfo.type,
          discountValue: discountInfo.value,
          trackingUrl: ad.TrackingLink || ad.ClickUrl || null,
          raw: ad as any,
        });
        totalUpserted++;
      }

      if (ads.length < 100) break;
      page++;
      await delay(500);
    }
  } catch (err: any) {
    log(`${source} promotions fetch error: ${err.message}`, "promo-codes");
  }

  log(`${source} promotions: ${totalUpserted} promo codes synced`, "promo-codes");
  return totalUpserted;
}

async function fetchRakutenPromotions(): Promise<number> {
  const token = process.env.RAKUTEN_API_TOKEN;
  const sid = process.env.RAKUTEN_SID;
  if (!token || !sid) {
    log("Rakuten credentials not set, skipping Rakuten promo sync", "promo-codes");
    return 0;
  }

  let totalUpserted = 0;

  try {
    const url = `https://api.rakutenmarketing.com/coupon/1.0?category=18&resultsperpage=100&pagenumber=1`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const altUrl = `https://productsearch.linksynergy.com/coupon?token=${token}&category=18&resultsperpage=100`;
      const altResponse = await fetch(altUrl);
      if (!altResponse.ok) {
        log(`Rakuten promotions API not available (${response.status})`, "promo-codes");
        return 0;
      }

      const text = await altResponse.text();
      const coupons = parseRakutenCouponsXml(text);
      for (const coupon of coupons) {
        if (!coupon.code.trim()) continue;

        await upsertPromo({
          source: "rakuten",
          advertiserId: coupon.mid || null,
          advertiserName: coupon.advertiserName,
          code: coupon.code.trim(),
          description: coupon.description || null,
          startDate: coupon.startDate ? new Date(coupon.startDate) : null,
          endDate: coupon.endDate ? new Date(coupon.endDate) : null,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          trackingUrl: coupon.clickUrl || null,
          raw: coupon as any,
        });
        totalUpserted++;
      }
    } else {
      const json = await response.json() as any;
      const coupons = json.coupons || json.result || [];

      for (const c of coupons) {
        const code = c.couponCode || c.code || "";
        if (!code.trim()) continue;

        const discountInfo = parseDiscountFromDescription(c.offerDescription || c.description || "");

        await upsertPromo({
          source: "rakuten",
          advertiserId: c.mid || c.advertiserId || null,
          advertiserName: c.advertiserName || c.merchantName || "Unknown",
          code: code.trim(),
          description: c.offerDescription || c.description || null,
          startDate: c.offerStartDate ? new Date(c.offerStartDate) : null,
          endDate: c.offerEndDate ? new Date(c.offerEndDate) : null,
          discountType: discountInfo.type,
          discountValue: discountInfo.value,
          trackingUrl: c.clickUrl || c.couponLink || null,
          raw: c as any,
        });
        totalUpserted++;
      }
    }
  } catch (err: any) {
    log(`Rakuten promotions fetch error: ${err.message}`, "promo-codes");
  }

  log(`Rakuten promotions: ${totalUpserted} promo codes synced`, "promo-codes");
  return totalUpserted;
}

function parseRakutenCouponsXml(xml: string): Array<{
  code: string; advertiserName: string; mid: string; description: string;
  startDate: string; endDate: string; clickUrl: string; discountType: string; discountValue: string;
}> {
  const results: any[] = [];
  const linkRegex = /<link>([\s\S]*?)<\/link>/gi;
  let match;

  while ((match = linkRegex.exec(xml)) !== null) {
    const block = match[1];
    const extract = (tag: string): string => {
      const m = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}>([^<]*)</${tag}>`, "i").exec(block);
      return (m?.[1] ?? m?.[2] ?? "").trim();
    };

    const code = extract("couponcode") || extract("coupon-code");
    if (code) {
      const desc = extract("offerdescription") || extract("description");
      const discountInfo = parseDiscountFromDescription(desc);
      results.push({
        code,
        advertiserName: extract("advertisername") || extract("merchantname") || "Unknown",
        mid: extract("mid"),
        description: desc,
        startDate: extract("offerstartdate") || extract("startdate"),
        endDate: extract("offerenddate") || extract("enddate"),
        clickUrl: extract("clickurl") || extract("couponlink"),
        discountType: discountInfo.type,
        discountValue: discountInfo.value,
      });
    }
  }

  return results;
}

function parseDiscountFromDescription(desc: string): { type: string; value: string } {
  if (!desc) return { type: "other", value: "" };

  const percentMatch = desc.match(/(\d+(?:\.\d+)?)\s*%\s*off/i);
  if (percentMatch) return { type: "percent", value: percentMatch[1] };

  const dollarMatch = desc.match(/\$(\d+(?:\.\d+)?)\s*off/i);
  if (dollarMatch) return { type: "fixed", value: dollarMatch[1] };

  const freeShipMatch = /free\s*shipping/i.test(desc);
  if (freeShipMatch) return { type: "freeShipping", value: "" };

  return { type: "other", value: "" };
}

const ADVERTISER_TO_SOURCE: Record<string, string[]> = {
  "dick's sporting goods": ["dicks-sporting-goods"],
  "dicks sporting goods": ["dicks-sporting-goods"],
  "academy sports": ["academy-sports"],
  "academy sports + outdoors": ["academy-sports"],
  "golf galaxy": ["golf-galaxy"],
  "baseball savings": ["playbaseball"],
  "playbaseball": ["playbaseball"],
  "footjoy": ["cj-footjoy"],
  "easton": ["cj-easton"],
  "easton diamond sports": ["cj-easton"],
  "holabird sports": ["cj-holabird-sports"],
  "nike": ["cj-partner-4942550"],
  "fanatics": ["fanatics"],
  "hoka": ["rak-hoka"],
  "orvis": ["rak-orvis"],
};

async function mapAdvertiserToSourceIds(advertiserName: string): Promise<string[]> {
  const lower = advertiserName.toLowerCase().trim();

  for (const [pattern, sourceIds] of Object.entries(ADVERTISER_TO_SOURCE)) {
    if (lower.includes(pattern)) return sourceIds;
  }

  const allSources = await db.select({ id: sources.id, name: sources.name }).from(sources);
  for (const src of allSources) {
    if (src.name && lower.includes(src.name.toLowerCase())) return [src.id];
    if (lower.replace(/[^a-z0-9]/g, "").includes(src.id.replace(/[^a-z0-9]/g, ""))) return [src.id];
  }

  return [];
}

export async function matchPromosToDeals(): Promise<{ matched: number; cleared: number }> {
  let matched = 0;
  let cleared = 0;

  const now = new Date();
  await db
    .update(promoCodes)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(promoCodes.status, "active"),
        lte(promoCodes.endDate, now),
      )
    );

  const activePromos = await db
    .select()
    .from(promoCodes)
    .where(
      and(
        eq(promoCodes.status, "active"),
        or(
          isNull(promoCodes.startDate),
          lte(promoCodes.startDate, now),
        ),
        or(
          isNull(promoCodes.endDate),
          gte(promoCodes.endDate, now),
        ),
      )
    );

  const promosBySource = new Map<string, typeof activePromos>();

  for (const promo of activePromos) {
    const sourceIds = await mapAdvertiserToSourceIds(promo.advertiserName);
    for (const sid of sourceIds) {
      if (!promosBySource.has(sid)) promosBySource.set(sid, []);
      promosBySource.get(sid)!.push(promo);
    }
  }

  const allSourceIds = [...promosBySource.keys()];

  if (allSourceIds.length > 0) {
    for (const sourceId of allSourceIds) {
      const sourcePromos = promosBySource.get(sourceId) || [];
      if (sourcePromos.length === 0) continue;

      const bestPromo = sourcePromos.sort((a, b) => {
        if (a.discountType === "percent" && b.discountType !== "percent") return -1;
        if (b.discountType === "percent" && a.discountType !== "percent") return 1;
        const aVal = parseFloat(a.discountValue || "0");
        const bVal = parseFloat(b.discountValue || "0");
        return bVal - aVal;
      })[0];

      await db
        .update(deals)
        .set({
          promoCode: bestPromo.code,
          promoDescription: bestPromo.description,
        })
        .where(eq(deals.sourceId, sourceId));

      matched++;
    }
  }

  const sourcesWithPromos = new Set(allSourceIds);
  const allSources = await db.select({ id: sources.id }).from(sources);
  const sourcesWithoutPromos = allSources
    .map(s => s.id)
    .filter(id => !sourcesWithPromos.has(id));

  if (sourcesWithoutPromos.length > 0) {
    for (const sourceId of sourcesWithoutPromos) {
      await db
        .update(deals)
        .set({ promoCode: null, promoDescription: null })
        .where(
          and(
            eq(deals.sourceId, sourceId),
            sql`${deals.promoCode} IS NOT NULL`,
          )
        );
    }
    cleared++;
  }

  log(`Promo matching: ${matched} sources matched, stale codes cleared`, "promo-codes");
  return { matched, cleared };
}

export async function syncAllPromoCodes(): Promise<{
  cj: number; impact: number; fanatics: number; rakuten: number; matched: number;
}> {
  log("Starting promo code sync from all affiliate networks...", "promo-codes");

  const [cj, impact, fanatics, rakuten] = await Promise.all([
    fetchCJPromotions(),
    fetchImpactPromotions(),
    fetchFanaticsPromotions(),
    fetchRakutenPromotions(),
  ]);

  const { matched } = await matchPromosToDeals();

  log(`Promo sync complete: CJ=${cj}, Impact=${impact}, Fanatics=${fanatics}, Rakuten=${rakuten}, matched=${matched}`, "promo-codes");
  return { cj, impact, fanatics, rakuten, matched };
}

export async function listPromoCodes(filters?: {
  source?: string; status?: string; advertiser?: string;
}) {
  const conditions = [];
  if (filters?.source) conditions.push(eq(promoCodes.source, filters.source));
  if (filters?.status) conditions.push(eq(promoCodes.status, filters.status));
  if (filters?.advertiser) conditions.push(sql`LOWER(${promoCodes.advertiserName}) LIKE ${`%${filters.advertiser.toLowerCase()}%`}`);

  const query = db.select().from(promoCodes).orderBy(desc(promoCodes.updatedAt)).limit(500);
  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function createManualPromoCode(data: {
  advertiserName: string; code: string; description?: string;
  startDate?: string; endDate?: string; discountType?: string;
  discountValue?: string;
}) {
  const [promo] = await db
    .insert(promoCodes)
    .values({
      source: "manual",
      advertiserName: data.advertiserName,
      code: data.code,
      description: data.description || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      status: "active",
      discountType: data.discountType || "other",
      discountValue: data.discountValue || null,
      updatedAt: new Date(),
    })
    .returning();

  await matchPromosToDeals();
  return promo;
}

export async function updatePromoCode(id: string, data: {
  status?: string; code?: string; description?: string;
  endDate?: string; discountType?: string; discountValue?: string;
}) {
  const updates: any = { updatedAt: new Date() };
  if (data.status) updates.status = data.status;
  if (data.code) updates.code = data.code;
  if (data.description !== undefined) updates.description = data.description;
  if (data.endDate !== undefined) updates.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.discountType) updates.discountType = data.discountType;
  if (data.discountValue !== undefined) updates.discountValue = data.discountValue;

  const [promo] = await db
    .update(promoCodes)
    .set(updates)
    .where(eq(promoCodes.id, id))
    .returning();

  await matchPromosToDeals();
  return promo;
}

export async function deletePromoCode(id: string) {
  await db.delete(promoCodes).where(eq(promoCodes.id, id));
  await matchPromosToDeals();
}

export async function getPromoStats() {
  const all = await db.select().from(promoCodes);
  const active = all.filter(p => p.status === "active");
  const bySrc: Record<string, number> = {};
  for (const p of active) {
    bySrc[p.source] = (bySrc[p.source] || 0) + 1;
  }
  return {
    total: all.length,
    active: active.length,
    expired: all.filter(p => p.status === "expired").length,
    disabled: all.filter(p => p.status === "disabled").length,
    bySource: bySrc,
  };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
