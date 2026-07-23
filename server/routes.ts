import type { Express } from "express";
import type { Server } from "http";
import { z } from "zod";
import crypto from "crypto";
import { api } from "@shared/routes";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { searchCJProducts, searchCJProductsPaginated, cjProductToDeal, getSportKeywords, getCJPartners } from "./cj-affiliate";
import { searchEbayProducts, ebayItemToDeal, getEbaySportKeywords, getEbayCategorySyncs, searchEbayDealItems, ebayDealItemToDeal, getEbayDealCategorySyncs } from "./ebay-api";
import { syncShopifyStore } from "./shopify-sync";
import { syncNameOfTheGame } from "./woocommerce-sync";
import { syncBaseballResale } from "./baseball-resale-sync";
import { syncFanaticsDeals } from "./fanatics-sync";
import { syncSidelineSwap, getSidelineSwapSports } from "./sidelineswap";
import {
  getEbayOAuthUrl,
  exchangeEbayCode,
  getValidEbayUserToken,
  fetchEbaySalesOrders,
  salesOrdersToCsv,
  fetchEbayPurchases,
  purchasesToCsv,
} from "./ebay-reports";
import { startDealSyncScheduler, runFullSync, getSyncStatus } from "./deal-sync-scheduler";
import { getStopEpoch, stopRequestedSince, requestStopAll, getLastStopAt } from "./process-control";
import { configurePush, getVapidPublicKey, isPushConfigured, sendPushToUser } from "./push-notifications";
import { configureSms, isSmsConfigured, sendSms, sendWelcomeSms, sendSmsBatch } from "./sms-notifications";
import { fetchLinkPreview, generateWriteup, generateSlug } from "./sms-campaigns";
import { registerMagicLinkRoutes } from "./magic-link-auth";
import { registerSmsAuthRoutes } from "./sms-auth";
import { registerTeamStatsRoutes } from "./team-stats";
import { registerInvoiceRoutes } from "./invoices";
import { projectDealSearchClassification } from "./deal-search";

const SCHEDULED_TIMES_ET = ["08:00", "12:00", "16:00", "20:00"];
const FEATURED_RULES = {
  ourStoreSourceId: "twin-seam-sports",
  withinPercentPoints: 5,
  bonusScore: 100,
};

const ADMIN_EMAIL = "justin@twinseamsports.com";
const ANALYTICS_EXCLUDED_EMAILS = ["justin@twinseamsports.com", "jshirk1@gmail.com"];

function getAuthedUserId(req: any): string {
  if (req.user?.magicLink) return req.user.userId;
  return req.user?.claims?.sub;
}

function getAuthedUserEmail(req: any): string | undefined {
  if (req.user?.magicLink) return req.user.email;
  return req.user?.claims?.email;
}

const isAdmin: import("express").RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const email = getAuthedUserEmail(req);
  if (email !== ADMIN_EMAIL) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  registerMagicLinkRoutes(app);
  registerSmsAuthRoutes(app);
  registerTeamStatsRoutes(app);
  registerInvoiceRoutes(app);

  app.get("/92ea36508d8a3f146aa22783a2d57295.html", (_req, res) => {
    res.type("text/html").send("twilio-domain-verification=92ea36508d8a3f146aa22783a2d57295");
  });

  // Public meta endpoints
  app.get(api.meta.config.path, async (_req, res) => {
    const rules = await storage.listAutoIncludeRules();
    res.json({
      scheduled: { times: SCHEDULED_TIMES_ET, timezone: "America/New_York" },
      featuredRules: FEATURED_RULES,
      autoIncludeRules: rules,
    });
  });

  // Taxonomy
  app.get(api.taxonomy.sports.list.path, async (_req, res) => {
    const rows = await storage.listSports();
    res.json(rows);
  });

  app.get(api.taxonomy.equipmentTypes.list.path, async (req, res) => {
    const input = api.taxonomy.equipmentTypes.list.input?.parse(req.query);
    const rows = await storage.listEquipmentTypes(input?.sportId);
    res.json(rows);
  });

  app.get(api.taxonomy.sources.list.path, async (_req, res) => {
    const rows = await storage.listSources();
    res.json(rows);
  });

  app.post("/api/sources", isAdmin, async (req: any, res) => {
    try {
      const input = api.taxonomy.sources.create.input.parse(req.body);
      const source = await storage.createSource(input.name, input.baseUrl);
      res.status(201).json(source);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input", field: err.errors[0]?.path?.join(".") });
      }
      throw err;
    }
  });

  app.post("/api/sports", isAdmin, async (req: any, res) => {
    try {
      const input = api.taxonomy.sports.create.input.parse(req.body);
      const sport = await storage.createSport(input.name, {
        source: "admin-api",
        approvedBy: getAuthedUserEmail(req) ?? ADMIN_EMAIL,
      });
      res.status(201).json(sport);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input", field: err.errors[0]?.path?.join(".") });
      }
      throw err;
    }
  });

  app.post("/api/equipment-types", isAdmin, async (req: any, res) => {
    try {
      const input = api.taxonomy.equipmentTypes.create.input.parse(req.body);
      const eqType = await storage.createEquipmentType(input.name, input.sportId, {
        source: "admin-api",
        approvedBy: getAuthedUserEmail(req) ?? ADMIN_EMAIL,
      });
      res.status(201).json(eqType);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input", field: err.errors[0]?.path?.join(".") });
      }
      throw err;
    }
  });

  // Sub-filters
  app.get(api.taxonomy.subFilters.list.path, async (req, res) => {
    const input = api.taxonomy.subFilters.list.input?.parse(req.query);
    const rows = await storage.listSubFilters(input?.equipmentTypeId);
    res.json(rows);
  });

  app.post(api.taxonomy.subFilters.create.path, isAdmin, async (req: any, res) => {
    try {
      const input = api.taxonomy.subFilters.create.input.parse(req.body);
      const subFilter = await storage.createSubFilter(input.name, input.equipmentTypeId, {
        source: "admin-api",
        approvedBy: getAuthedUserEmail(req) ?? ADMIN_EMAIL,
      });
      res.status(201).json(subFilter);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input", field: err.errors[0]?.path?.join(".") });
      }
      throw err;
    }
  });

  app.delete("/api/sub-filters/:id", isAdmin, async (req: any, res) => {
    try {
      await storage.deleteSubFilter(req.params.id);
      res.status(204).end();
    } catch (err) {
      res.status(404).json({ message: "Sub-filter not found" });
    }
  });

  function toSlug(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  let seoSlugsCache: { data: any; ts: number } | null = null;
  const SEO_CACHE_TTL = 5 * 60 * 1000;

  async function buildSeoSlugs() {
    if (seoSlugsCache && Date.now() - seoSlugsCache.ts < SEO_CACHE_TTL) {
      return seoSlugsCache.data;
    }
    const [allSports, allEquipTypes, brandRows] = await Promise.all([
      storage.listSports(),
      storage.listEquipmentTypes(),
      storage.listBrands({}),
    ]);
    const usedSlugs = new Set<string>();
    const slugs: { slug: string; type: string; name: string }[] = [];
    for (const s of allSports) {
      const sl = toSlug(s.name);
      usedSlugs.add(sl);
      slugs.push({ slug: sl, type: "sport", name: s.name });
    }
    for (const et of allEquipTypes) {
      const sl = toSlug(et.name);
      if (!usedSlugs.has(sl)) {
        usedSlugs.add(sl);
        slugs.push({ slug: sl, type: "category", name: et.name });
      }
    }
    for (const brand of brandRows) {
      if (brand && brand.length > 1) {
        const sl = toSlug(brand);
        if (!usedSlugs.has(sl)) {
          usedSlugs.add(sl);
          slugs.push({ slug: sl, type: "brand", name: brand });
        }
      }
    }
    seoSlugsCache = { data: slugs, ts: Date.now() };
    return slugs;
  }

  app.get("/api/seo/slugs", async (_req, res) => {
    try {
      res.json(await buildSeoSlugs());
    } catch (err: any) {
      console.error(`[seo] Error fetching slugs: ${err.message}`);
      res.status(500).json({ error: "Failed to fetch SEO slugs" });
    }
  });

  app.get("/api/seo/page/:slug", async (req, res) => {
    try {
      const slug = req.params.slug;
      const [allSports, allEquipTypes] = await Promise.all([
        storage.listSports(),
        storage.listEquipmentTypes(),
      ]);

      const sportMatch = allSports.find((s) => toSlug(s.name) === slug);
      if (sportMatch) {
        const sportDeals = await storage.listDeals({ sportId: sportMatch.id, minPercentOff: 40, limit: 50 });
        const equipTypes = allEquipTypes.filter((et) => et.sportId === sportMatch.id);
        return res.json({
          type: "sport",
          name: sportMatch.name,
          id: sportMatch.id,
          slug,
          deals: sportDeals,
          categories: equipTypes.map((et) => ({ name: et.name, slug: toSlug(et.name), id: et.id })),
        });
      }

      const equipMatch = allEquipTypes.find((et) => toSlug(et.name) === slug);
      if (equipMatch) {
        const sport = allSports.find((s) => s.id === equipMatch.sportId);
        const equipDeals = await storage.listDeals({ equipmentTypeId: equipMatch.id, minPercentOff: 40, limit: 50 });
        return res.json({
          type: "category",
          name: equipMatch.name,
          id: equipMatch.id,
          slug,
          sportName: sport?.name || "",
          sportSlug: sport ? toSlug(sport.name) : "",
          deals: equipDeals,
        });
      }

      const brandSearchTerm = slug.replace(/-/g, " ");
      const brandDeals = await storage.listDeals({ brand: brandSearchTerm, minPercentOff: 40, limit: 50 });
      const confirmedBrandDeals = brandDeals.filter((d) => d.brand && d.brand.toLowerCase() === brandSearchTerm.toLowerCase());
      if (confirmedBrandDeals.length > 0) {
        const brandName = confirmedBrandDeals[0].brand || brandSearchTerm;
        return res.json({
          type: "brand",
          name: brandName,
          slug,
          deals: brandDeals,
        });
      }

      const searchDeals = await storage.listDeals({ q: slug.replace(/-/g, " "), minPercentOff: 0, limit: 50 });
      if (searchDeals.length > 0) {
        return res.json({
          type: "product",
          name: slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
          slug,
          deals: searchDeals,
        });
      }

      return res.status(404).json({ error: "No deals found for this page" });
    } catch (err: any) {
      console.error(`[seo] Error fetching page ${req.params.slug}: ${err.message}`);
      res.status(500).json({ error: "Failed to fetch page data" });
    }
  });

  // robots.txt — explicit allow + sitemap pointer. Lighthouse's
  // "page-blocked-from-indexing" audit relies on the absence of disallow rules
  // and the presence of a valid robots policy, so we serve this directly rather
  // than relying on the SPA fallback (which would return the index.html shell).
  app.get("/robots.txt", (_req, res) => {
    const body = [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /admin/",
      "Disallow: /api/",
      "",
      "Sitemap: https://www.tssdeals.com/sitemap.xml",
      "",
    ].join("\n");
    res.set("Cache-Control", "public, max-age=3600");
    res.type("text/plain").send(body);
  });

  let sitemapCache: { xml: string; ts: number } | null = null;

  app.get("/sitemap.xml", async (_req, res) => {
    try {
      if (sitemapCache && Date.now() - sitemapCache.ts < SEO_CACHE_TTL) {
        res.set("Cache-Control", "public, max-age=300");
        return res.type("application/xml").send(sitemapCache.xml);
      }
      const baseUrl = "https://www.tssdeals.com";
      const slugs = await buildSeoSlugs();
      const staticPages = [
        "", "/deals", "/privacy", "/terms", "/about", "/contact",
        "/disclaimer", "/notifications", "/guides",
      ];
      const priorityMap: Record<string, string> = { sport: "0.8", category: "0.7", brand: "0.6" };
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
      for (const page of staticPages) {
        xml += `  <url><loc>${baseUrl}${page}</loc><changefreq>weekly</changefreq><priority>${page === "" ? "1.0" : "0.7"}</priority></url>\n`;
      }
      for (const s of slugs) {
        xml += `  <url><loc>${baseUrl}/deals/${s.slug}</loc><changefreq>daily</changefreq><priority>${priorityMap[s.type] || "0.5"}</priority></url>\n`;
      }
      xml += "</urlset>";
      sitemapCache = { xml, ts: Date.now() };
      res.set("Cache-Control", "public, max-age=300");
      res.type("application/xml").send(xml);
    } catch (err: any) {
      console.error(`[seo] Sitemap error: ${err.message}`);
      res.status(500).send("Error generating sitemap");
    }
  });

  app.get("/api/banner-redirect/ebay", (_req, res) => {
    res.redirect(302, "https://www.ebay.com/b/Sporting-Goods/888/bn_1865031?mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339133080&customid=Banner&toolid=10001&mkevt=1");
  });

  app.get("/api/banner-redirect/amazon", (_req, res) => {
    const tag = process.env.AMAZON_PARTNER_TAG;
    const base = "https://www.amazon.com/sports-outdoors/b/?ie=UTF8&node=3375251&ref_=topnav_storetab_sv_so_sando";
    const url = tag ? `${base}&tag=${encodeURIComponent(tag)}` : base;
    res.redirect(302, url);
  });

  app.get("/api/banner-redirect/dicks", (_req, res) => {
    res.redirect(302, "https://www.jdoqocy.com/click-101681221-17023985");
  });

  app.get("/api/banner-redirect/hoka", (_req, res) => {
    const sid = process.env.RAKUTEN_SID;
    const base = "https://www.hoka.com/";
    const url = sid ? `https://click.linksynergy.com/fs-bin/click?id=${sid}&offerid=43729&type=3&subid=0&u1=tssdeals-banner&tmpid=&PROGRAM_ID=43729&RD_PARM1=${encodeURIComponent(base)}` : base;
    res.redirect(302, url);
  });

  app.get("/api/banner-redirect/golf-galaxy", (_req, res) => {
    const cjPid = process.env.CJ_PROPERTY_ID || process.env.CJ_COMPANY_ID;
    const base = "https://www.golfgalaxy.com/";
    const url = cjPid ? `https://www.anrdoezrs.net/links/${cjPid}/type/dlg/${base}` : base;
    res.redirect(302, url);
  });

  app.get("/api/banner-redirect/academy", (_req, res) => {
    res.redirect(302, "https://www.anrdoezrs.net/click-101681221-17020943");
  });

  app.get("/api/banner-redirect/rtic", (_req, res) => {
    res.redirect(302, "https://share.rticoutdoors.com/x/jdGec7");
  });

  app.get("/api/banner-redirect/smash-it-sports", (_req, res) => {
    res.redirect(302, "https://smashitsports.com/?bg_ref=o2DvTRjD2t&tid1=Tssdeals");
  });

  app.get("/api/banner-redirect/wilson", (_req, res) => {
    res.redirect(302, "https://wilson.aqpg.net/c/6444121/1251681/9003");
  });

  app.get("/api/banner-redirect/louisville-slugger", (_req, res) => {
    res.redirect(302, "https://wilson.aqpg.net/c/6444121/2102643/9003");
  });

  app.get("/api/banner-redirect/demarini", (_req, res) => {
    res.redirect(302, "https://wilson.aqpg.net/c/6444121/1983144/9003");
  });

  app.get("/api/banner-redirect/evoshield", (_req, res) => {
    res.redirect(302, "https://wilson.aqpg.net/c/6444121/578303/9003");
  });

  app.post("/api/admin/backfill-sub-filters", isAdmin, async (_req: any, res) => {
    try {
      const { backfillSubFilters } = await import("./sub-filter-classifier");
      const result = await backfillSubFilters();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/reclassify-all-deals", isAdmin, async (_req: any, res) => {
    try {
      const { backfillSubFilters } = await import("./sub-filter-classifier");
      const result = await backfillSubFilters({ reclassifyAll: true });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Admin: edit any deal's classification fields ---
  // Used by the Data Reporting panel "Edit" dialog. Unlike featured-deals patch,
  // this does NOT bump last_seen_at — an admin re-classifying a stale deal
  // shouldn't make it look freshly synced.
  app.patch("/api/admin/deals/:id", isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { deals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const schema = z.object({
        sportId: z.string().nullable().optional(),
        equipmentTypeId: z.string().nullable().optional(),
        subFilterId: z.string().nullable().optional(),
        // Multi-tag: full set of sub-filter IDs to apply. When provided, this
        // replaces every existing tag on the deal (no merge). The legacy
        // sub_filter_id column is reset to subFilterIds[0] ?? null so the
        // "primary" tag stays consistent with the join table.
        subFilterIds: z.array(z.string()).max(50).optional(),
        brand: z.string().nullable().optional(),
        dropWeight: z.number().int().min(0).max(20).nullable().optional(),
        sizeNumber: z.string().trim().max(20).nullable().optional(),
        condition: z.enum(["new", "preowned"]).optional(),
        isFeatured: z.boolean().optional(),
      });
      const parsed = schema.parse(req.body);
      const subFilterIds = parsed.subFilterIds;
      const updates: any = { ...parsed };
      delete updates.subFilterIds;
      // If the caller sent the explicit multi-tag list, the legacy column tracks
      // the first entry. Otherwise, leave subFilterId behavior unchanged.
      if (Array.isArray(subFilterIds)) {
        updates.subFilterId = subFilterIds[0] ?? null;
      }
      // Coerce empty string sentinels to null so the UI can clear a field.
      for (const k of Object.keys(updates)) {
        if (updates[k] === "" || updates[k] === "__none__") updates[k] = null;
      }
      if (Object.keys(updates).length === 0 && !Array.isArray(subFilterIds)) {
        return res.status(400).json({ message: "No fields to update" });
      }
      // Validate any incoming subFilterIds exist before we touch any rows.
      // Doing this up front (outside the transaction) keeps error responses
      // fast and avoids rolling back work for a typo'd ID.
      let validatedIds: string[] | null = null;
      if (Array.isArray(subFilterIds)) {
        validatedIds = Array.from(new Set(subFilterIds.filter(Boolean)));
        if (validatedIds.length > 0) {
          const { equipmentSubFilters } = await import("@shared/schema");
          const { inArray } = await import("drizzle-orm");
          const found = await db
            .select({ id: equipmentSubFilters.id })
            .from(equipmentSubFilters)
            .where(inArray(equipmentSubFilters.id, validatedIds));
          const foundSet = new Set(found.map((r) => r.id));
          const missing = validatedIds.filter((id) => !foundSet.has(id));
          if (missing.length > 0) {
            return res.status(400).json({ message: `Unknown sub-filter id(s): ${missing.join(", ")}` });
          }
        }
      }
      // Wrap update + tag replace in a transaction so a failure mid-flight
      // can't leave the join table out of sync with the legacy primary column.
      const updated = await db.transaction(async (tx) => {
        let row: any = null;
        if (Object.keys(updates).length > 0) {
          const rows = await tx
            .update(deals)
            .set(updates)
            .where(eq(deals.id, req.params.id))
            .returning();
          row = rows[0];
        } else {
          const rows = await tx.select().from(deals).where(eq(deals.id, req.params.id)).limit(1);
          row = rows[0];
        }
        if (!row) return null;
        if (validatedIds !== null) {
          const { dealSubFilters } = await import("@shared/schema");
          await tx.delete(dealSubFilters).where(eq(dealSubFilters.dealId, req.params.id));
          if (validatedIds.length > 0) {
            await tx
              .insert(dealSubFilters)
              .values(validatedIds.map((sfId) => ({ dealId: req.params.id, subFilterId: sfId })))
              .onConflictDoNothing();
          }
        }
        return row;
      });
      if (!updated) return res.status(404).json({ message: "Deal not found" });
      res.json({ ok: true, deal: updated });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // --- Admin: reporting / stats with filters ---
  // Returns total/active counts, untagged buckets, and group breakdowns.
  // freshDays defaults to 7 — a deal is "active" if last_seen_at is within
  // the window (mirrors the public stale-cleanup behavior).
  app.get("/api/admin/stats", isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql: dsql } = await import("drizzle-orm");
      const sportId = req.query.sportId ? String(req.query.sportId) : null;
      const sourceId = req.query.sourceId ? String(req.query.sourceId) : null;
      const equipmentTypeId = req.query.equipmentTypeId ? String(req.query.equipmentTypeId) : null;
      const condition = req.query.condition ? String(req.query.condition) : null;
      const freshDays = Math.max(1, Math.min(90, parseInt(String(req.query.freshDays ?? "7"), 10) || 7));

      const filters: any[] = [dsql`TRUE`];
      if (sportId) filters.push(dsql`sport_id = ${sportId}`);
      if (sourceId) filters.push(dsql`source_id = ${sourceId}`);
      if (equipmentTypeId) filters.push(dsql`equipment_type_id = ${equipmentTypeId}`);
      if (condition) filters.push(dsql`condition = ${condition}`);
      const whereSql = dsql.join(filters, dsql` AND `);

      const totalsRow = await db.execute(dsql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '1 day' * ${freshDays})::int AS active,
          COUNT(*) FILTER (WHERE sub_filter_id IS NULL)::int AS missing_sub_filter,
          COUNT(*) FILTER (WHERE equipment_type_id IS NULL)::int AS missing_equipment,
          COUNT(*) FILTER (WHERE sport_id IS NULL)::int AS missing_sport,
          COUNT(*) FILTER (WHERE drop_weight IS NOT NULL)::int AS with_drop,
          COUNT(*) FILTER (WHERE size_number IS NOT NULL)::int AS with_size,
          COUNT(*) FILTER (WHERE is_featured)::int AS featured,
          COUNT(*) FILTER (WHERE has_price_drop)::int AS price_drops
        FROM deals
        WHERE ${whereSql}
      `);
      const totals = (totalsRow.rows[0] ?? {}) as any;

      const bySport = await db.execute(dsql`
        SELECT COALESCE(s.name, '(unassigned)') AS label, s.id AS id, COUNT(*)::int AS n,
               COUNT(*) FILTER (WHERE d.sub_filter_id IS NULL)::int AS untagged
        FROM deals d LEFT JOIN sports s ON s.id = d.sport_id
        WHERE ${whereSql} GROUP BY s.id, s.name ORDER BY n DESC LIMIT 50
      `);
      const bySource = await db.execute(dsql`
        SELECT COALESCE(src.name, d.source_id) AS label, d.source_id AS id, COUNT(*)::int AS n,
               COUNT(*) FILTER (WHERE d.last_seen_at >= NOW() - INTERVAL '1 day' * ${freshDays})::int AS active
        FROM deals d LEFT JOIN sources src ON src.id = d.source_id
        WHERE ${whereSql} GROUP BY src.name, d.source_id ORDER BY n DESC LIMIT 100
      `);
      const byEquipment = await db.execute(dsql`
        SELECT COALESCE(et.name, '(unassigned)') AS label, et.id AS id, COUNT(*)::int AS n,
               COUNT(*) FILTER (WHERE d.sub_filter_id IS NULL)::int AS untagged
        FROM deals d LEFT JOIN equipment_types et ON et.id = d.equipment_type_id
        WHERE ${whereSql} GROUP BY et.id, et.name ORDER BY n DESC LIMIT 100
      `);

      res.json({
        filters: { sportId, sourceId, equipmentTypeId, condition, freshDays },
        totals,
        bySport: bySport.rows,
        bySource: bySource.rows,
        byEquipment: byEquipment.rows,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Admin: deal list for editing (filtered, paginated) ---
  app.get("/api/admin/deals/list", isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql: dsql } = await import("drizzle-orm");
      const sportId = req.query.sportId ? String(req.query.sportId) : null;
      const sourceId = req.query.sourceId ? String(req.query.sourceId) : null;
      const equipmentTypeId = req.query.equipmentTypeId ? String(req.query.equipmentTypeId) : null;
      const condition = req.query.condition ? String(req.query.condition) : null;
      const search = req.query.search ? String(req.query.search) : null;
      const untaggedOnly = String(req.query.untaggedOnly ?? "") === "1";
      const inactiveOnly = String(req.query.inactiveOnly ?? "") === "1";
      const freshDays = Math.max(1, Math.min(90, parseInt(String(req.query.freshDays ?? "7"), 10) || 7));
      const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "100"), 10) || 100));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);

      const filters: any[] = [dsql`TRUE`];
      if (sportId) filters.push(dsql`d.sport_id = ${sportId}`);
      if (sourceId) filters.push(dsql`d.source_id = ${sourceId}`);
      if (equipmentTypeId) filters.push(dsql`d.equipment_type_id = ${equipmentTypeId}`);
      if (condition) filters.push(dsql`d.condition = ${condition}`);
      if (untaggedOnly) filters.push(dsql`d.sub_filter_id IS NULL`);
      if (inactiveOnly) filters.push(dsql`d.last_seen_at < NOW() - INTERVAL '1 day' * ${freshDays}`);
      if (search) filters.push(dsql`(d.title ILIKE ${"%" + search + "%"} OR d.brand ILIKE ${"%" + search + "%"})`);
      const whereSql = dsql.join(filters, dsql` AND `);

      const totalRow = await db.execute(dsql`SELECT COUNT(*)::int AS n FROM deals d WHERE ${whereSql}`);
      // Aggregate every tag a deal carries (multi sub-filter support) so the
      // admin table shows the full set, not just the legacy primary column.
      const rows = await db.execute(dsql`
        SELECT d.id, d.title, d.brand, d.source_id, d.sport_id, d.equipment_type_id,
               d.sub_filter_id, d.drop_weight, d.size_number, d.condition,
               d.price_cents, d.msrp_cents, d.percent_off, d.is_featured,
               d.last_seen_at, d.url,
               COALESCE(t.sub_filter_ids, '{}') AS sub_filter_ids,
               COALESCE(t.sub_filter_names, '{}') AS sub_filter_names
        FROM deals d
        LEFT JOIN LATERAL (
          SELECT array_agg(sf.id ORDER BY sf.name) AS sub_filter_ids,
                 array_agg(sf.name ORDER BY sf.name) AS sub_filter_names
          FROM deal_sub_filters dsf
          JOIN equipment_sub_filters sf ON sf.id = dsf.sub_filter_id
          WHERE dsf.deal_id = d.id
        ) t ON TRUE
        WHERE ${whereSql}
        ORDER BY d.last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
      res.json({ total: (totalRow.rows[0] as any)?.n ?? 0, limit, offset, rows: rows.rows });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Admin: CSV export with same filter shape as /list ---
  app.get("/api/admin/deals/export", isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql: dsql } = await import("drizzle-orm");
      const sportId = req.query.sportId ? String(req.query.sportId) : null;
      const sourceId = req.query.sourceId ? String(req.query.sourceId) : null;
      const equipmentTypeId = req.query.equipmentTypeId ? String(req.query.equipmentTypeId) : null;
      const condition = req.query.condition ? String(req.query.condition) : null;
      const search = req.query.search ? String(req.query.search) : null;
      const untaggedOnly = String(req.query.untaggedOnly ?? "") === "1";
      const inactiveOnly = String(req.query.inactiveOnly ?? "") === "1";
      const freshDays = Math.max(1, Math.min(90, parseInt(String(req.query.freshDays ?? "7"), 10) || 7));
      const maxRows = Math.max(1, Math.min(50000, parseInt(String(req.query.maxRows ?? "10000"), 10) || 10000));

      const filters: any[] = [dsql`TRUE`];
      if (sportId) filters.push(dsql`d.sport_id = ${sportId}`);
      if (sourceId) filters.push(dsql`d.source_id = ${sourceId}`);
      if (equipmentTypeId) filters.push(dsql`d.equipment_type_id = ${equipmentTypeId}`);
      if (condition) filters.push(dsql`d.condition = ${condition}`);
      if (untaggedOnly) filters.push(dsql`d.sub_filter_id IS NULL`);
      if (inactiveOnly) filters.push(dsql`d.last_seen_at < NOW() - INTERVAL '1 day' * ${freshDays}`);
      if (search) filters.push(dsql`(d.title ILIKE ${"%" + search + "%"} OR d.brand ILIKE ${"%" + search + "%"})`);
      const whereSql = dsql.join(filters, dsql` AND `);

      const result = await db.execute(dsql`
        SELECT d.id, d.title, d.brand, d.source_id, src.name AS source_name,
               d.sport_id, sp.name AS sport_name,
               d.equipment_type_id, et.name AS equipment_type_name,
               d.sub_filter_id, sf.name AS sub_filter_name,
               COALESCE(
                 (SELECT string_agg(sf2.name, '|' ORDER BY sf2.name)
                  FROM deal_sub_filters dsf
                  JOIN equipment_sub_filters sf2 ON sf2.id = dsf.sub_filter_id
                  WHERE dsf.deal_id = d.id),
                 ''
               ) AS sub_filter_names,
               d.drop_weight, d.size_number, d.condition,
               d.price_cents, d.msrp_cents, d.percent_off,
               d.is_featured, d.has_price_drop, d.found_at, d.last_seen_at, d.url
        FROM deals d
        LEFT JOIN sources src ON src.id = d.source_id
        LEFT JOIN sports sp ON sp.id = d.sport_id
        LEFT JOIN equipment_types et ON et.id = d.equipment_type_id
        LEFT JOIN equipment_sub_filters sf ON sf.id = d.sub_filter_id
        WHERE ${whereSql}
        ORDER BY d.last_seen_at DESC
        LIMIT ${maxRows}
      `);

      const cols = [
        "id","title","brand","source_id","source_name","sport_id","sport_name",
        "equipment_type_id","equipment_type_name","sub_filter_id","sub_filter_name",
        "sub_filter_names",
        "drop_weight","size_number","condition","price_cents","msrp_cents",
        "percent_off","is_featured","has_price_drop","found_at","last_seen_at","url",
      ];
      // CSV escape + neutralize spreadsheet formula injection: any cell starting
      // with =, +, -, @, tab, or CR gets a leading single quote so Excel/Sheets
      // treat it as text, not a formula. (Attacker-influenced fields like title
      // and url could otherwise execute on open.)
      const escape = (v: any): string => {
        if (v === null || v === undefined) return "";
        let s = v instanceof Date ? v.toISOString() : String(v);
        if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="tssdeals-export-${Date.now()}.csv"`);
      res.write(cols.join(",") + "\n");
      for (const row of result.rows as any[]) {
        res.write(cols.map((c) => escape(row[c])).join(",") + "\n");
      }
      res.end();
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/validate-deals", isAdmin, async (req: any, res) => {
    try {
      const maxPerSource = Math.min(2000, Math.max(50, parseInt(req.body?.maxPerSource ?? "500") || 500));
      const { runDealValidation } = await import("./deal-validation");
      const result = await runDealValidation(maxPerSource);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // eBay Sellers
  app.get(api.ebaySellers.list.path, async (_req, res) => {
    const rows = await storage.listEbaySellers();
    res.json(rows);
  });

  app.post(api.ebaySellers.create.path, isAdmin, async (req: any, res) => {
    try {
      const input = api.ebaySellers.create.input.parse(req.body);
      const seller = await storage.createEbaySeller(input.username, input.notes);
      res.status(201).json(seller);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input", field: err.errors[0]?.path?.join(".") });
      }
      throw err;
    }
  });

  app.post("/api/admin/ebay-sellers/verify", isAdmin, async (req: any, res) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ message: "Username required" });
      const clientId = process.env.EBAY_CLIENT_ID;
      const clientSecret = process.env.EBAY_CLIENT_SECRET;
      if (!clientId || !clientSecret) return res.status(500).json({ message: "eBay credentials not configured" });
      const items = await searchEbayProducts(clientId, clientSecret, {
        keywords: "",
        sportId: "baseball",
        equipmentTypeId: "bb-other",
        condition: "all",
        maxResults: 5,
        categoryId: "888",
        sellerUsername: username,
      });
      res.json({ valid: items.length > 0, itemCount: items.length, username });
    } catch (err: any) {
      res.json({ valid: false, itemCount: 0, username: req.body.username, error: err.message });
    }
  });

  app.get("/api/admin/ebay-sellers/deal-counts", isAdmin, async (_req: any, res) => {
    const counts = await storage.getEbaySellerDealCounts();
    res.json(counts);
  });

  app.patch("/api/admin/ebay-sellers/:id", isAdmin, async (req: any, res) => {
    try {
      const patchSchema = z.object({
        username: z.string().min(1, "Username cannot be empty").max(100).transform(s => s.trim()).optional(),
        notes: z.string().max(500).optional(),
      }).refine(d => d.username || d.notes !== undefined, { message: "At least one field required" });
      const parsed = patchSchema.parse(req.body);
      const seller = await storage.updateEbaySeller(req.params.id, parsed);
      res.json(seller);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      }
      res.status(404).json({ message: err.message || "Seller not found" });
    }
  });

  app.delete("/api/ebay-sellers/:id", isAdmin, async (req: any, res) => {
    try {
      await storage.deleteEbaySeller(req.params.id);
      res.status(204).end();
    } catch (err) {
      res.status(404).json({ message: "Seller not found" });
    }
  });

  // Deals
  // Facet counts for filter options — cached to avoid expensive repeated aggregation
  const facetsCache = new Map<string, { data: any; ts: number }>();
  const FACETS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  app.get("/api/deals/facets", async (req, res) => {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");

    const minPercentOff = req.query.minPercentOff ? Number(req.query.minPercentOff) : 50;
    const condition = typeof req.query.condition === "string" && req.query.condition !== "all"
      ? req.query.condition : null;
    const sportId = typeof req.query.sportId === "string" ? req.query.sportId : null;

    const cacheKey = `${minPercentOff}|${condition ?? ""}|${sportId ?? ""}`;
    const cached = facetsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < FACETS_CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    try {
      const [sportRows, conditionRows, sourceRows] = await Promise.all([
        // Sport counts (always uses base discount filter)
        db.execute(sql.raw(`
          SELECT sport_id, COUNT(*)::int AS count
          FROM deals
          WHERE last_seen_at > NOW() - INTERVAL '14 days'
            AND sport_id IS NOT NULL
            AND (percent_off >= ${minPercentOff} OR auto_included = true)
            ${condition ? `AND condition = '${condition.replace(/'/g, "''")}'` : ""}
          GROUP BY sport_id
          ORDER BY count DESC
        `)),
        // Condition counts (scoped to sport if provided)
        db.execute(sql.raw(`
          SELECT condition, COUNT(*)::int AS count
          FROM deals
          WHERE last_seen_at > NOW() - INTERVAL '14 days'
            AND (percent_off >= ${minPercentOff} OR auto_included = true)
            ${sportId ? `AND sport_id = '${sportId.replace(/'/g, "''")}'` : ""}
          GROUP BY condition
          ORDER BY count DESC
        `)),
        // Top source/retailer counts
        db.execute(sql.raw(`
          SELECT source_id, COUNT(*)::int AS count
          FROM deals
          WHERE last_seen_at > NOW() - INTERVAL '14 days'
            AND (percent_off >= ${minPercentOff} OR auto_included = true)
            ${sportId ? `AND sport_id = '${sportId.replace(/'/g, "''")}'` : ""}
            ${condition ? `AND condition = '${condition.replace(/'/g, "''")}'` : ""}
          GROUP BY source_id
          ORDER BY count DESC
          LIMIT 30
        `)),
      ]);

      const data = {
        sports: (sportRows as any).rows ?? sportRows,
        conditions: (conditionRows as any).rows ?? conditionRows,
        sources: (sourceRows as any).rows ?? sourceRows,
      };

      facetsCache.set(cacheKey, { data, ts: Date.now() });
      res.json(data);
    } catch (err) {
      console.error("Facets query failed:", err);
      res.status(500).json({ message: "Failed to load facets" });
    }
  });

  app.get("/api/deals/brands", async (req, res) => {
    const sportId = typeof req.query.sportId === "string" ? req.query.sportId : undefined;
    const equipmentTypeId = typeof req.query.equipmentTypeId === "string" ? req.query.equipmentTypeId : undefined;
    const source = typeof req.query.source === "string" ? req.query.source : undefined;
    const condition = typeof req.query.condition === "string" ? req.query.condition : undefined;
    const minPercentOff = req.query.minPercentOff ? Number(req.query.minPercentOff) : undefined;
    const brands = await storage.listBrands({ sportId, equipmentTypeId, source, condition, minPercentOff });
    res.json(brands);
  });

  app.get("/api/deals/ai-suggestions", async (req, res) => {
    try {
      const sport = typeof req.query.sport === "string" ? req.query.sport : "";
      const equipmentType = typeof req.query.equipmentType === "string" ? req.query.equipmentType : "";
      const q = typeof req.query.q === "string" ? req.query.q : "";

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const contextParts = [sport, equipmentType, q].filter(Boolean).join(", ");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `You are a sporting goods expert. Generate 4 specific search keywords to find deals for: ${contextParts}. Return ONLY a comma-separated list of keywords (e.g. "glove, mitt, fielding, infield"). No explanation.`,
        }],
        max_tokens: 40,
        temperature: 0.3,
      });

      const keywordStr = completion.choices[0].message.content?.trim() ?? "";
      const keywords = keywordStr.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 4);

      const seen = new Set<string>();
      const allResults: any[] = [];

      for (const keyword of keywords) {
        const results = await storage.listDeals({
          q: keyword,
          sportId: sport || undefined,
          limit: 8,
          minPercentOff: 0,
        });
        for (const d of results) {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            allResults.push(d);
          }
        }
      }

      res.json({ suggestions: allResults.slice(0, 9), keywords });
    } catch (err: any) {
      log(`AI suggestions error: ${err.message}`, "ai");
      res.status(500).json({ suggestions: [], keywords: [], error: err.message });
    }
  });

  app.get("/api/deals/default-feed", async (req, res) => {
    const allowedPerSport = [10, 20, 50, 100];
    const rawLimit = parseInt(String(req.query.limit ?? ""), 10);
    const perSport = allowedPerSport.includes(rawLimit) ? rawLimit : 10;
    let sportIds: string[] | undefined;
    if (typeof req.query.sports === "string") {
      sportIds = req.query.sports.split(",").map((s) => s.trim()).filter(Boolean);
    }
    const feed = await storage.getDefaultFeed({ perSport, sportIds });
    const slimFeed = feed.map((group) => ({
      ...group,
      deals: group.deals.map(({ raw, ...rest }) => rest),
    }));
    res.json(slimFeed);
  });

  app.get(api.deals.list.path, async (req: any, res) => {
    const input = api.deals.list.input?.parse(req.query) ?? {};
    const eqTypeIds = input.equipmentTypeIds
      ? input.equipmentTypeIds.split(",").map((s: string) => s.trim()).filter(Boolean)
      : undefined;
    let currentUserId: string | undefined;
    try { currentUserId = getAuthedUserId(req) ?? undefined; } catch {}
    if (input.q && input.q.trim().length >= 2) {
      storage.trackSearch(input.q, currentUserId).catch(() => {});
    }

    const deals = await storage.listDeals({
      q: input.q,
      sportId: input.sportId,
      equipmentTypeId: input.equipmentTypeId,
      equipmentTypeIds: eqTypeIds,
      subFilterId: input.subFilterId,
      ebaySeller: input.ebaySeller,
      condition: input.condition,
      minPercentOff: input.minPercentOff,
      maxPrice: input.maxPrice,
      source: input.source,
      brand: input.brand,
      featured: input.featured,
      priceDropOnly: input.priceDropOnly,
      limit: input.limit,
      currency: input.currency,
      sortBy: input.sortBy,
      userId: currentUserId,
    });
    const slim = deals.map((deal) => {
      const projected = projectDealSearchClassification(input.q, deal);
      const recovered = projected !== deal;
      const { raw, ...rest } = projected;
      return {
        ...rest,
        ...(recovered ? {
          classificationRecovered: true,
          storedSportId: deal.sportId,
          storedEquipmentTypeId: deal.equipmentTypeId,
        } : {}),
        conditionDetail: (raw as any)?.ebayCondition || (raw as any)?.sidelineSwapCondition || null,
      };
    });
    res.json(slim);
  });

  app.get(api.deals.get.path, async (req, res) => {
    const deal = await storage.getDeal(req.params.id);
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }
    res.json(deal);
  });

  app.get("/api/deals/:id/price-history", async (req, res) => {
    const history = await storage.getDealPriceHistory(req.params.id);
    res.json(history);
  });

  app.get("/api/deals/:id/alerts", isAuthenticated, async (req: any, res) => {
    const userId = getAuthedUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const alerts = await storage.listDealPriceAlerts(req.params.id, userId);
    res.json(alerts);
  });

  app.post("/api/deals/:id/alerts", isAuthenticated, async (req: any, res) => {
    const userId = getAuthedUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const deal = await storage.getDeal(req.params.id);
    if (!deal) return res.status(404).json({ message: "Deal not found" });
    const { createPriceAlertInputSchema } = await import("@shared/schema");
    const parsed = createPriceAlertInputSchema.safeParse({ ...req.body, dealId: req.params.id });
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
    }
    const alert = await storage.createPriceAlert(
      userId,
      req.params.id,
      parsed.data.targetPriceCents,
      parsed.data.targetPercentOff,
      parsed.data.scope,
      parsed.data.scope === "all_sellers" ? (deal.title ?? null) : null,
      parsed.data.scope === "all_sellers" ? (deal.brand ?? null) : null,
    );
    res.status(201).json(alert);
  });

  app.get("/api/alerts", isAuthenticated, async (req: any, res) => {
    const userId = getAuthedUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const alerts = await storage.listUserPriceAlerts(userId);
    res.json(alerts);
  });

  app.delete("/api/alerts/:id", isAuthenticated, async (req: any, res) => {
    const userId = getAuthedUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    await storage.deletePriceAlert(req.params.id, userId);
    res.json({ success: true });
  });

  app.post("/api/deals/:id/hide", isAuthenticated, async (req: any, res) => {
    const userId = getAuthedUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    await storage.hideDeal(userId, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/deals/:id/hide", isAuthenticated, async (req: any, res) => {
    const userId = getAuthedUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    await storage.unhideDeal(userId, req.params.id);
    res.json({ success: true });
  });

  app.get("/api/deal-categories", async (_req, res) => {
    const categories = await storage.listDealCategories(true);
    res.json(categories);
  });

  app.get("/api/deal-categories/:slug", async (req, res) => {
    const category = await storage.getDealCategory(req.params.slug);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    const deals = await storage.getCategoryDeals(category, 20);
    res.json({ category, deals });
  });

  app.get("/api/popular-searches", async (_req, res) => {
    const popular = await storage.getPopularSearches(20, 7);
    res.json(popular);
  });

  // Auto-include rules
  app.get(api.autoIncludeRules.list.path, async (_req, res) => {
    const rules = await storage.listAutoIncludeRules();
    res.json(rules);
  });

  // Preferences (auth required)
  app.get(api.preferences.get.path, isAuthenticated, async (req: any, res) => {
    const userId = getAuthedUserId(req);
    const prefs = await storage.getUserPreferences(userId);
    if (!prefs) {
      // Return defaults shaped like table
      return res.json({
        userId,
        condition: "all",
        minPercentOff: "50",
        pushEnabled: false,
        smsEnabled: false,
        phoneNumber: null,
        equipmentTypeIds: [],
        updatedAt: new Date(),
      });
    }
    res.json(prefs);
  });

  app.put(api.preferences.upsert.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthedUserId(req);
      const input = api.preferences.upsert.input.parse(req.body);
      const saved = await storage.upsertUserPreferences(userId, input);
      res.json(saved);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0]?.message ?? "Invalid input",
          field: err.errors[0]?.path?.join("."),
        });
      }
      throw err;
    }
  });

  await configurePush();
  configureSms();

  app.get("/api/push/public-key", (_req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return res.status(503).json({ error: "Push not configured" });
    }
    res.json({ publicKey });
  });

  // Push subscription endpoints (auth required)
  app.post(api.push.subscribe.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthedUserId(req);
      const input = api.push.subscribe.input.parse(req.body);
      await storage.addPushSubscription(userId, input);
      res.status(201).json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0]?.message ?? "Invalid input",
          field: err.errors[0]?.path?.join("."),
        });
      }
      throw err;
    }
  });

  app.post(api.push.unsubscribe.path, isAuthenticated, async (req: any, res) => {
    const userId = getAuthedUserId(req);
    const input = api.push.unsubscribe.input.parse(req.body);
    await storage.removePushSubscription(userId, input.endpoint);
    res.json({ ok: true });
  });

  app.post(api.push.sendTest.path, isAuthenticated, async (req: any, res) => {
    const userId = getAuthedUserId(req);
    api.push.sendTest.input?.parse(req.body);

    if (!isPushConfigured()) {
      return res.status(503).json({ error: "Push notifications not configured on server" });
    }

    const subs = await storage.listPushSubscriptionsForUser(userId);
    if (subs.length === 0) {
      return res.status(400).json({ error: "No push subscriptions found. Please subscribe first." });
    }

    const result = await sendPushToUser(subs, {
      title: "TwinSeam Deals",
      body: "Test notification - push notifications are working!",
      url: "/app/deals",
      tag: "test",
    });

    if (result.expired.length > 0) {
      for (const ep of result.expired) {
        await storage.removePushSubscription(userId, ep);
      }
    }

    res.json({ ok: true, sent: result.sent, failed: result.failed });
  });

  app.post("/api/sms/test", isAuthenticated, async (req: any, res) => {
    const userId = getAuthedUserId(req);

    if (!isSmsConfigured()) {
      return res.status(503).json({ error: "SMS notifications not configured on server" });
    }

    const prefs = await storage.getUserPreferences(userId);
    if (!prefs || !prefs.smsEnabled || !prefs.phoneNumber) {
      return res.status(400).json({ error: "SMS is not enabled or no phone number set. Enable SMS in Preferences first." });
    }

    if (!prefs.firstSmsSent) {
      const welcomeOk = await sendWelcomeSms(prefs.phoneNumber);
      if (welcomeOk) {
        await storage.upsertUserPreferences(userId, {
          condition: prefs.condition as "all" | "new" | "preowned",
          minPercentOff: Number(prefs.minPercentOff),
          pushEnabled: prefs.pushEnabled,
          smsEnabled: prefs.smsEnabled,
          phoneNumber: prefs.phoneNumber,
          equipmentTypeIds: prefs.equipmentTypeIds,
          sportId: prefs.sportId,
          hiddenSections: prefs.hiddenSections,
          firstSmsSent: true,
        });
      }
    }

    const success = await sendSms({
      to: prefs.phoneNumber,
      body: "TwinSeam Deals: Test SMS - your notifications are working! You'll receive deal alerts at scheduled times.",
    });

    if (success) {
      res.json({ ok: true, message: "Test SMS sent successfully" });
    } else {
      res.status(500).json({ error: "Failed to send test SMS. Please check your phone number." });
    }
  });

  const smsSubscribeRateLimit = new Map<string, number>();
  app.post("/api/sms/subscribe", async (req: any, res) => {
    try {
      const { phoneNumber, marketingConsent, transactionalConsent } = req.body;
      if (!phoneNumber || typeof phoneNumber !== "string" || phoneNumber.replace(/\D/g, "").length < 10) {
        return res.status(400).json({ error: "Please provide a valid US phone number." });
      }
      // Twilio compliance: marketing and transactional consent are collected as
      // two separate, optional checkboxes. The caller must explicitly choose at
      // least one category — there is no combined/legacy single-consent bypass.
      const marketing = Boolean(marketingConsent);
      const transactional = Boolean(transactionalConsent);
      if (!marketing && !transactional) {
        return res.status(400).json({ error: "Please select at least one type of message to subscribe to." });
      }
      const ip = req.ip || req.connection?.remoteAddress || "unknown";
      const now = Date.now();
      const lastAttempt = smsSubscribeRateLimit.get(ip);
      if (lastAttempt && now - lastAttempt < 60000) {
        return res.status(429).json({ error: "Too many requests. Please try again in a minute." });
      }
      smsSubscribeRateLimit.set(ip, now);
      if (smsSubscribeRateLimit.size > 10000) {
        const cutoff = now - 300000;
        for (const [k, v] of smsSubscribeRateLimit) { if (v < cutoff) smsSubscribeRateLimit.delete(k); }
      }
      console.log(`[sms] Public subscribe consent from ${ip} at ${new Date().toISOString()} for ${phoneNumber.replace(/\d(?=\d{4})/g, '*')} (marketing=${marketing}, transactional=${transactional})`);
      // Persist the opt-in (consent categories + IP/timestamp) for compliance audit
      // and so marketing blasts can target only marketing-consented numbers.
      await storage.upsertSmsSubscriber({ phone: phoneNumber, marketingConsent: marketing, transactionalConsent: transactional, optInIp: ip });
      const ok = await sendWelcomeSms(phoneNumber, { marketing });
      if (ok) {
        res.json({ ok: true, message: "Subscription confirmed. Check your phone for a confirmation text." });
      } else {
        res.status(500).json({ error: "Could not send confirmation SMS. Please try again." });
      }
    } catch (err: any) {
      console.error(`[sms] Public subscribe error: ${err.message}`);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/sms/webhook", async (req: any, res) => {
    try {
      const body = req.body?.Body?.trim() || "";
      const from = req.body?.From || "";
      const optOutKeywords = ["stop", "stopall", "cancel", "end", "quit", "unsubscribe", "revoke", "optout"];
      const helpKeywords = ["help", "info"];
      if (helpKeywords.includes(body.toLowerCase())) {
        res.type("text/xml").send('<Response><Message>TSSDeals: For help, contact tssdeals@twinseamsports.com. Msg &amp; data rates may apply. Reply STOP to cancel.</Message></Response>');
        return;
      }
      if (optOutKeywords.includes(body.toLowerCase())) {
        const count = await storage.optOutSmsByPhone(from);
        const subCount = await storage.optOutSmsSubscriberByPhone(from);
        console.log(`[sms] SMS opt-out received from ${from}: ${count} user(s) + ${subCount} subscriber(s) opted out`);
      }
      res.type("text/xml").send("<Response></Response>");
    } catch (err: any) {
      console.error(`[sms] SMS webhook error: ${err.message}`);
      res.type("text/xml").send("<Response></Response>");
    }
  });

  app.post("/api/sms/a2p-status", async (req: any, res) => {
    try {
      const payload = req.body || {};
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (authToken && process.env.NODE_ENV === "production") {
        const signature = req.header("X-Twilio-Signature") || "";
        const proto = req.header("X-Forwarded-Proto") || req.protocol;
        const host = req.header("X-Forwarded-Host") || req.get("host");
        const url = `${proto}://${host}${req.originalUrl}`;
        const { default: twilio } = await import("twilio");
        const valid = twilio.validateRequest(authToken, signature, url, payload);
        if (!valid) {
          console.warn(`[sms-a2p] invalid signature, rejecting`);
          res.status(403).json({ received: false });
          return;
        }
      }
      const eventType = payload.EventType || payload.eventType || "unknown";
      const resourceSid = payload.ResourceSid || payload.resourceSid || payload.BrandSid || payload.CampaignSid || null;
      const status = payload.Status || payload.status || payload.BrandStatus || payload.CampaignStatus || null;
      const failureReason = payload.FailureReason || payload.failureReason || null;
      console.log(`[sms-a2p] ${eventType} — sid=${resourceSid} status=${status}${failureReason ? ` reason=${failureReason}` : ""}`);
      const { db } = await import("./db");
      const { a2pStatusEvents } = await import("@shared/schema");
      await db.insert(a2pStatusEvents).values({
        eventType,
        resourceSid,
        status,
        failureReason,
        payload,
      });
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error(`[sms-a2p] webhook error: ${err.message}`);
      res.status(200).json({ received: false });
    }
  });

  app.get("/api/admin/a2p-events", isAdmin, async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { a2pStatusEvents } = await import("@shared/schema");
      const { desc } = await import("drizzle-orm");
      const events = await db
        .select()
        .from(a2pStatusEvents)
        .orderBy(desc(a2pStatusEvents.createdAt))
        .limit(100);
      res.json(events);
    } catch (err: any) {
      console.error(`[sms-a2p] admin fetch error: ${err.message}`);
      res.status(500).json({ message: "Failed to load events" });
    }
  });

  // ---- SMS Deal Blast campaigns ----
  function publicBaseUrl(req: any): string {
    const proto = req.header("X-Forwarded-Proto") || req.protocol || "https";
    const host = req.header("X-Forwarded-Host") || req.get("host");
    return `${proto}://${host}`;
  }

  // Fetch images + suggested AI write-up from a pasted retailer link (preview only).
  app.post("/api/admin/sms-campaigns/fetch-preview", isAdmin, async (req: any, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: "Please provide a valid http(s) link." });
      }
      const preview = await fetchLinkPreview(url);
      const writeup = await generateWriteup({ url, title: preview.title, description: preview.description });
      res.json({ ...preview, writeup });
    } catch (err: any) {
      console.error(`[sms-campaign] fetch-preview error: ${err.message}`);
      res.status(500).json({ error: "Could not read that link. You can still enter details manually." });
    }
  });

  app.get("/api/admin/sms-campaigns", isAdmin, async (_req, res) => {
    try {
      res.json(await storage.listSmsCampaigns());
    } catch (err: any) {
      console.error(`[sms-campaign] list error: ${err.message}`);
      res.status(500).json({ error: "Failed to load campaigns" });
    }
  });

  app.post("/api/admin/sms-campaigns", isAdmin, async (req: any, res) => {
    try {
      const { retailerUrl, smsText, title, writeup, images } = req.body || {};
      if (!retailerUrl || typeof retailerUrl !== "string" || !/^https?:\/\//i.test(retailerUrl)) {
        return res.status(400).json({ error: "A valid retailer link is required." });
      }
      if (!smsText || typeof smsText !== "string" || !smsText.trim()) {
        return res.status(400).json({ error: "SMS text is required." });
      }
      const cleanImages = Array.isArray(images)
        ? images.filter((i: any) => typeof i === "string" && /^https?:\/\//i.test(i)).slice(0, 6)
        : [];
      let slug = generateSlug();
      for (let i = 0; i < 5 && (await storage.getSmsCampaignBySlug(slug)); i++) slug = generateSlug();
      const campaign = await storage.createSmsCampaign({
        retailerUrl: retailerUrl.trim(),
        smsText: smsText.trim(),
        title: typeof title === "string" ? title.trim() || null : null,
        writeup: typeof writeup === "string" ? writeup.trim() || null : null,
        images: cleanImages,
        slug,
        createdBy: getAuthedUserId(req),
      });
      res.json({ ...campaign, landingUrl: `${publicBaseUrl(req)}/d/${campaign.slug}` });
    } catch (err: any) {
      console.error(`[sms-campaign] create error: ${err.message}`);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  app.delete("/api/admin/sms-campaigns/:id", isAdmin, async (req: any, res) => {
    try {
      await storage.deleteSmsCampaign(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      console.error(`[sms-campaign] delete error: ${err.message}`);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  // Push the campaign SMS to all marketing-consented recipients.
  app.post("/api/admin/sms-campaigns/:id/send", isAdmin, async (req: any, res) => {
    try {
      const campaign = await storage.getSmsCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (campaign.sentAt) return res.status(400).json({ error: "This campaign has already been sent." });
      if (!isSmsConfigured()) return res.status(503).json({ error: "SMS is not configured." });

      const recipients = await storage.listMarketingRecipients();
      if (recipients.length === 0) {
        return res.status(400).json({ error: "No marketing-consented recipients yet." });
      }
      const landingUrl = `${publicBaseUrl(req)}/d/${campaign.slug}`;
      // Auto-append the short link + STOP (Twilio compliance) to the admin's core copy.
      const body = `${campaign.smsText.trim()} ${landingUrl}\nReply STOP to opt out.`;
      const payloads = recipients.map((to) => ({ to, body }));
      const { sent, failed } = await sendSmsBatch(payloads);
      await storage.markSmsCampaignSent(campaign.id, sent);
      console.log(`[sms-campaign] sent "${campaign.slug}": ${sent} sent, ${failed} failed of ${recipients.length}`);
      res.json({ ok: true, sent, failed, recipients: recipients.length, landingUrl });
    } catch (err: any) {
      console.error(`[sms-campaign] send error: ${err.message}`);
      res.status(500).json({ error: "Failed to send campaign" });
    }
  });

  // Public landing-page data for a campaign short link.
  app.get("/api/campaign/:slug", async (req, res) => {
    try {
      const campaign = await storage.getSmsCampaignBySlug(req.params.slug);
      if (!campaign) return res.status(404).json({ error: "Not found" });
      res.json({
        slug: campaign.slug,
        retailerUrl: campaign.retailerUrl,
        title: campaign.title,
        writeup: campaign.writeup,
        images: campaign.images,
      });
    } catch (err: any) {
      console.error(`[sms-campaign] public fetch error: ${err.message}`);
      res.status(500).json({ error: "Failed to load" });
    }
  });

  app.post("/api/sms/enable-inline", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthedUserId(req);
      const { phoneNumber } = req.body;
      if (!phoneNumber || typeof phoneNumber !== "string" || phoneNumber.replace(/\D/g, "").length < 10) {
        return res.status(400).json({ error: "Valid phone number is required" });
      }
      const existing = await storage.getUserPreferences(userId);
      if (existing) {
        await storage.upsertUserPreferences(userId, {
          condition: existing.condition as "all" | "new" | "preowned",
          minPercentOff: Number(existing.minPercentOff),
          pushEnabled: existing.pushEnabled,
          smsEnabled: true,
          phoneNumber,
          equipmentTypeIds: existing.equipmentTypeIds,
          sportId: existing.sportId,
          hiddenSections: existing.hiddenSections,
          firstSmsSent: existing.firstSmsSent ?? false,
        });
      } else {
        await storage.upsertUserPreferences(userId, {
          condition: "all",
          minPercentOff: 50,
          pushEnabled: false,
          smsEnabled: true,
          phoneNumber,
          equipmentTypeIds: [],
          sportId: null,
          hiddenSections: [],
          firstSmsSent: false,
        });
      }
      if (isSmsConfigured()) {
        const prefs = await storage.getUserPreferences(userId);
        if (prefs && !prefs.firstSmsSent) {
          const welcomeOk = await sendWelcomeSms(phoneNumber);
          if (welcomeOk) {
            await storage.upsertUserPreferences(userId, {
              condition: prefs.condition as "all" | "new" | "preowned",
              minPercentOff: Number(prefs.minPercentOff),
              pushEnabled: prefs.pushEnabled,
              smsEnabled: true,
              phoneNumber,
              equipmentTypeIds: prefs.equipmentTypeIds,
              sportId: prefs.sportId,
              hiddenSections: prefs.hiddenSections,
              firstSmsSent: true,
            });
          }
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sync status (is a sync currently running?)
  app.get("/api/admin/sync/status", isAdmin, (_req, res) => {
    res.json(getSyncStatus());
  });

  // Admin / manual run (auth required). MVP: no real scraping.
  app.post(api.admin.runAggregator.path, isAdmin, async (req: any, res) => {
    api.admin.runAggregator.input?.parse(req.body);
    try {
      const result = await runFullSync(storage);
      if (!result) {
        return res.json({ ok: false, message: "Sync already in progress" });
      }
      res.json({
        ok: true,
        totalCreated: result.totalCreated,
        totalUpdated: result.totalUpdated,
        totalErrors: result.totalErrors,
        elapsedSeconds: result.elapsedSeconds,
        breakdown: result.breakdown,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err.message || "Sync failed" });
    }
  });

  // CJ Affiliate sync endpoint (auth required)
  app.post("/api/cj/sync", isAdmin, async (req: any, res) => {
    try {
      const apiKey = process.env.CJ_API_TOKEN;
      const companyId = process.env.CJ_COMPANY_ID;

      if (!apiKey || !companyId) {
        return res.status(500).json({ message: "CJ Affiliate credentials not configured. Set CJ_API_TOKEN and CJ_COMPANY_ID." });
      }

      const input = z.object({
        sportId: z.string().optional(),
        keywords: z.string().optional(),
        maxResults: z.number().min(1).optional(),
      }).parse(req.body);

      const sportKeywords = getSportKeywords();
      const sportsToSync: string[] = input.sportId
        ? [input.sportId]
        : Object.keys(sportKeywords);

      const allEquipmentTypes = await storage.listEquipmentTypes();
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalErrors = 0;
      const syncLog: string[] = [];

      const stopEpoch = getStopEpoch();
      for (const sid of sportsToSync) {
        if (stopRequestedSince(stopEpoch)) break;
        const keywords = input.keywords
          ? [input.keywords]
          : (sportKeywords[sid] ?? [`${sid} sporting goods`]);

        const sportEqTypes = allEquipmentTypes.filter(et => et.sportId === sid);
        const defaultEqType = sportEqTypes[0]?.id ?? null;

        for (const kw of keywords) {
          if (stopRequestedSince(stopEpoch)) break;
          try {
            const products = await searchCJProducts(apiKey, companyId, {
              keywords: kw,
              sportId: sid,
              equipmentTypeId: defaultEqType ?? sid,
              maxResults: input.maxResults ?? 100,
            });

            const dealsToInsert = products
              .map((p) => cjProductToDeal(p, sid, defaultEqType ?? sid))
              .filter((d): d is NonNullable<typeof d> => d !== null);

            for (const deal of dealsToInsert) {
              await storage.ensureSource(deal.sourceId, deal.sourceId.replace(/-/g, " "), "");
            }

            if (dealsToInsert.length > 0) {
              const result = await storage.bulkUpsertDeals(dealsToInsert);
              totalCreated += result.created;
              totalUpdated += result.updated;
              syncLog.push(`${sid}/${kw}: ${products.length} products, ${result.created} new, ${result.updated} updated`);
            } else {
              syncLog.push(`${sid}/${kw}: ${products.length} products, 0 qualifying deals`);
            }
          } catch (err: any) {
            totalErrors++;
            syncLog.push(`${sid}/${kw}: ERROR - ${err.message}`);
          }
        }
      }

      res.json({
        ok: true,
        created: totalCreated,
        updated: totalUpdated,
        errors: totalErrors,
        log: syncLog,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  // CJ Affiliate status check
  app.get("/api/cj/status", isAuthenticated, async (_req: any, res) => {
    const hasToken = !!process.env.CJ_API_TOKEN;
    const hasCompanyId = !!process.env.CJ_COMPANY_ID;
    let apiReachable = false;
    let apiError: string | null = null;

    if (hasToken) {
      try {
        const testRes = await fetch("https://ads.api.cj.com/query", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.CJ_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: "{ __schema { queryType { name } } }" }),
        });
        const text = await testRes.text();
        if (text.includes("Could not authenticate")) {
          apiError = "Token invalid - generate a new Personal Access Token at developers.cj.com";
        } else if (text.includes("unable to complete")) {
          apiError = "API returned server error - Product Feed API access may not be enabled on your account";
        } else {
          try {
            const parsed = JSON.parse(text);
            if (parsed.data?.__schema) {
              apiReachable = true;
            }
          } catch {
            apiError = "Unexpected API response";
          }
        }
      } catch (e: any) {
        apiError = `Connection error: ${e.message}`;
      }
    }

    res.json({
      configured: hasToken && hasCompanyId,
      hasToken,
      hasCompanyId,
      apiReachable,
      apiError,
    });
  });

  // eBay Browse API sync endpoint (auth required)
  app.post("/api/ebay/sync", isAdmin, async (req: any, res) => {
    try {
      const clientId = process.env.EBAY_CLIENT_ID;
      const clientSecret = process.env.EBAY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({ message: "eBay API credentials not configured. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET." });
      }

      const input = z.object({
        sportId: z.string().optional(),
        keywords: z.string().optional(),
        condition: z.enum(["new", "preowned", "all"]).default("all"),
        maxResults: z.number().min(1).optional(),
        maxPrice: z.number().optional(),
        sellerUsername: z.string().optional(),
      }).parse(req.body);

      const sportKeywords = getEbaySportKeywords();
      const sportsToSync: string[] = input.sportId
        ? [input.sportId]
        : Object.keys(sportKeywords);

      const allEquipmentTypes = await storage.listEquipmentTypes();
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;
      const syncLog: string[] = [];

      const eqTypeKeywordMap: Record<string, Record<string, string[]>> = {
        baseball: {
          "bb-bats": ["bat", "bbcor", "usssa bat", "usa bat"],
          "bb-gloves": ["glove", "mitt"],
          "bb-cleats": ["cleat", "cleats", "turf shoe", "turf shoes", "metal cleat"],
          "bb-balls": ["baseball ball", "baseballs", "practice ball"],
          "bb-protective": ["helmet", "guard", "protector", "chest protector", "leg guard", "catcher"],
          "bb-shoes-apparel": ["jersey", "pants", "belt", "batting glove", "batting gloves"],
          "bb-training": ["net", "tee", "batting cage", "pitching machine", "training"],
          "bb-other": [],
        },
        "fastpitch-softball": {
          "fp-bats": ["bat", "fastpitch bat"],
          "fp-gloves": ["glove", "mitt"],
          "fp-cleats": ["cleat", "cleats", "turf shoe", "turf shoes"],
          "fp-balls": ["softball", "ball"],
          "fp-protective": ["helmet", "guard", "mask"],
          "fp-shoes-apparel": ["jersey", "pants", "batting glove", "batting gloves"],
          "fp-other": [],
        },
        "slowpitch-softball": {
          "sp-bats": ["bat", "slowpitch bat"],
          "sp-gloves": ["glove", "mitt"],
          "sp-cleats": ["cleat", "cleats", "turf shoe", "turf shoes"],
          "sp-balls": ["softball", "ball"],
          "sp-protective": ["helmet", "guard"],
          "sp-shoes-apparel": ["jersey", "pants", "batting glove", "batting gloves"],
          "sp-other": [],
        },
        golf: {
          "golf-drivers": ["driver"],
          "golf-irons": ["iron"],
          "golf-iron-sets": ["iron set", "irons set"],
          "golf-wedges": ["wedge"],
          "golf-putters": ["putter"],
          "golf-balls": ["golf ball", "dozen"],
          "golf-bags": ["golf bag", "stand bag", "cart bag"],
          "golf-shoes-apparel": ["golf shoe", "golf shirt", "golf polo"],
          "golf-other": [],
        },
        basketball: {
          "bk-balls": ["basketball"],
          "bk-shoes-apparel": ["basketball shoe", "basketball sneaker"],
          "bk-hoops-nets": ["hoop", "backboard"],
          "bk-other": [],
        },
        lacrosse: {
          "lax-sticks": ["stick", "shaft", "head"],
          "lax-protective": ["helmet", "shoulder pad", "arm pad", "glove"],
          "lax-balls": ["lacrosse ball"],
          "lax-shoes-apparel": ["cleat"],
          "lax-other": [],
        },
        soccer: {
          "soc-balls": ["soccer ball", "football"],
          "soc-shoes-apparel": ["cleat", "boot", "shin guard"],
          "soc-nets": ["goal", "net"],
          "soc-other": [],
        },
        football: {
          "fb-balls": ["football"],
          "fb-protective": ["helmet", "shoulder pad", "pad"],
          "fb-shoes-apparel": ["cleat", "glove"],
          "fb-other": [],
        },
        fishing: {
          "fish-rods": ["rod", "pole"],
          "fish-reels": ["reel"],
          "fish-lures-line": ["lure", "bait", "line", "tackle"],
          "fish-other": [],
        },
        hockey: {
          "hk-sticks": ["stick", "blade"],
          "hk-skates": ["skate"],
          "hk-protective": ["helmet", "pad", "glove", "shin"],
          "hk-other": [],
        },
        volleyball: {
          "vb-balls": ["volleyball"],
          "vb-shoes-apparel": ["volleyball shoe"],
          "vb-nets": ["net"],
          "vb-other": [],
        },
        wrestling: {
          "wrest-shoes-apparel": ["wrestling shoe", "singlet", "headgear"],
        },
        cycling: {
          "cyc-bikes": ["bike", "bicycle"],
          "cyc-protective": ["cycling helmet", "helmet"],
          "cyc-shoes-apparel": ["cycling shoe", "jersey"],
          "cyc-other": [],
        },
        swimming: {
          "swim-goggles": ["goggle"],
          "swim-caps": ["swim cap"],
          "swim-apparel": ["swimsuit", "jammer", "swim trunk"],
          "swim-other": [],
        },
        gymnastics: {
          "gym-shoes-apparel": ["leotard", "grip"],
          "gym-other": [],
        },
        cheerleading: {
          "cheer-shoes-apparel": ["cheer shoe"],
          "cheer-other": [],
        },
        rugby: {
          "rug-balls": ["rugby ball"],
          "rug-shoes-apparel": ["rugby cleat", "rugby boot"],
          "rug-other": [],
        },
        "disc-golf": {
          "dg-distance": ["distance driver", "speed 12", "speed 13", "speed 14"],
          "dg-fairway": ["fairway driver", "control driver"],
          "dg-midrange": ["midrange", "mid-range", "mid range"],
          "dg-putters": ["putter", "putt"],
          "dg-bags": ["disc golf bag", "disc bag", "backpack"],
          "dg-baskets": ["basket", "target", "practice basket"],
          "dg-shoes-apparel": ["disc golf shoe", "disc golf shirt"],
          "dg-accessories": ["mini marker", "towel", "retriever", "chalk bag"],
          "dg-other": [],
        },
      };

      const matchEquipmentType = (title: string, sportId: string): string | null => {
        const titleLower = title.toLowerCase();
        const sportMap = eqTypeKeywordMap[sportId];
        if (!sportMap) return null;

        const priorityOverrides: Record<string, { keywords: string[]; targetId: string }[]> = {
          baseball: [
            { keywords: ["batting glove", "batting gloves", "batters glove"], targetId: "bb-shoes-apparel" },
            { keywords: ["cleat", "cleats", "turf shoe", "turf shoes"], targetId: "bb-cleats" },
          ],
          "fastpitch-softball": [
            { keywords: ["batting glove", "batting gloves", "batters glove"], targetId: "fp-shoes-apparel" },
            { keywords: ["cleat", "cleats", "turf shoe", "turf shoes"], targetId: "fp-cleats" },
          ],
          "slowpitch-softball": [
            { keywords: ["batting glove", "batting gloves", "batters glove"], targetId: "sp-shoes-apparel" },
            { keywords: ["cleat", "cleats", "turf shoe", "turf shoes"], targetId: "sp-cleats" },
          ],
        };

        const overrides = priorityOverrides[sportId];
        if (overrides) {
          for (const rule of overrides) {
            for (const kw of rule.keywords) {
              if (titleLower.includes(kw)) return rule.targetId;
            }
          }
        }

        for (const [eqId, keywords] of Object.entries(sportMap)) {
          if (keywords.length === 0) continue;
          for (const kw of keywords) {
            if (titleLower.includes(kw)) return eqId;
          }
        }
        const fallbackId = Object.keys(sportMap).find(k => k.endsWith("-other"));
        return fallbackId ?? Object.keys(sportMap)[0] ?? null;
      }

      const stopEpoch = getStopEpoch();
      for (const sid of sportsToSync) {
        if (stopRequestedSince(stopEpoch)) break;
        const keywords = input.keywords
          ? [input.keywords]
          : (sportKeywords[sid] ?? [`${sid} sporting goods`]);

        const sportEqTypes = allEquipmentTypes.filter(et => et.sportId === sid);
        const defaultEqType = sportEqTypes.find(et => et.id.endsWith("-other"))?.id ?? sportEqTypes[0]?.id ?? null;

        for (const kw of keywords) {
          if (stopRequestedSince(stopEpoch)) break;
          try {
            const items = await searchEbayProducts(clientId, clientSecret, {
              keywords: kw,
              sportId: sid,
              equipmentTypeId: defaultEqType ?? sid,
              maxResults: input.maxResults,
              condition: input.condition === "all" ? undefined : input.condition,
              maxPrice: input.maxPrice,
              sellerUsername: input.sellerUsername,
            });

            const dealsToInsert = items
              .map((item) => {
                const eqType = matchEquipmentType(item.title, sid) ?? defaultEqType ?? sid;
                return ebayItemToDeal(item, sid, eqType);
              })
              .filter((d): d is NonNullable<typeof d> => d !== null);

            const skipped = items.length - dealsToInsert.length;
            totalSkipped += skipped;

            if (dealsToInsert.length > 0) {
              const result = await storage.bulkUpsertDeals(dealsToInsert);
              totalCreated += result.created;
              totalUpdated += result.updated;
              syncLog.push(`${sid}/${kw}: ${items.length} items, ${dealsToInsert.length} deals (${result.created} new, ${result.updated} updated, ${skipped} skipped)`);
            } else {
              syncLog.push(`${sid}/${kw}: ${items.length} items, 0 qualifying deals (${skipped} skipped)`);
            }
          } catch (err: any) {
            totalErrors++;
            syncLog.push(`${sid}/${kw}: ERROR - ${err.message}`);
          }
        }
      }

      res.json({
        ok: true,
        created: totalCreated,
        updated: totalUpdated,
        skipped: totalSkipped,
        errors: totalErrors,
        log: syncLog,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ebay/category-sync", isAdmin, async (req: any, res) => {
    try {
      const clientId = process.env.EBAY_CLIENT_ID;
      const clientSecret = process.env.EBAY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({ message: "eBay API credentials not configured." });
      }

      const categorySyncs = getEbayCategorySyncs();
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalErrors = 0;
      const syncLog: string[] = [];

      for (const catSync of categorySyncs) {
        try {
          const items = await searchEbayProducts(clientId, clientSecret, {
            keywords: catSync.keywords || "",
            sportId: catSync.sportId,
            equipmentTypeId: catSync.equipmentTypeId,
            condition: "all",
            maxResults: 2000,
            categoryId: catSync.categoryId,
          });

          const dealsToInsert = items
            .map((item) => ebayItemToDeal(item, catSync.sportId, catSync.equipmentTypeId))
            .filter((d): d is NonNullable<typeof d> => d !== null);

          if (dealsToInsert.length > 0) {
            await storage.ensureSource("ebay", "eBay", "https://www.ebay.com");
            const result = await storage.bulkUpsertDeals(dealsToInsert);
            totalCreated += result.created;
            totalUpdated += result.updated;
            syncLog.push(`${catSync.categoryName} (${catSync.categoryId}): ${items.length} items, ${dealsToInsert.length} deals (${result.created} new, ${result.updated} updated)`);
          } else {
            syncLog.push(`${catSync.categoryName} (${catSync.categoryId}): ${items.length} items, 0 qualifying deals`);
          }
        } catch (err: any) {
          totalErrors++;
          syncLog.push(`${catSync.categoryName} (${catSync.categoryId}): ERROR - ${err.message}`);
        }
      }

      res.json({
        ok: true,
        created: totalCreated,
        updated: totalUpdated,
        errors: totalErrors,
        log: syncLog,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ebay/seller-sync", isAdmin, async (req: any, res) => {
    try {
      const { syncEbaySellerDeals } = await import("./deal-sync-scheduler");
      const result = await syncEbaySellerDeals(storage);
      res.json({
        message: `Seller sync complete: ${result.created} created, ${result.updated} updated`,
        ...result,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/amazon/oauth-test", isAdmin, async (_req: any, res) => {
    const clientId = process.env.AMAZON_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: "AMAZON_CLIENT_ID or AMAZON_CLIENT_SECRET not set" });
    }
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const results: Record<string, any> = {};

    // Primary: Creators API Cognito token endpoint with correct scope
    const cognitoUrl = "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token";
    const cognitoScopes = ["creatorsapi/default", "(no scope)", "creatorsapi"];
    for (const scope of cognitoScopes) {
      const body = new URLSearchParams({ grant_type: "client_credentials" });
      if (scope !== "(no scope)") body.set("scope", scope);
      const key = `cognito::${scope}`;
      try {
        const r = await fetch(cognitoUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}` },
          body: body.toString(),
        });
        const text = await r.text();
        results[key] = { status: r.status, body: text.slice(0, 400) };
        if (r.ok) {
          // If we got a token, test a quick API call
          const tokenData = JSON.parse(text);
          const version = process.env.AMAZON_CREDENTIAL_VERSION || "2.1";
          const apiRes = await fetch("https://creatorsapi.amazon/catalog/v1/searchItems", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tokenData.access_token}, Version ${version}`,
              "Content-Type": "application/json",
              "x-marketplace": "www.amazon.com",
            },
            body: JSON.stringify({
              keywords: "baseball glove",
              partnerTag: process.env.AMAZON_PARTNER_TAG || "twinseamdeals-20",
              partnerType: "Associates",
              searchIndex: "SportingGoods",
              itemCount: 1,
              marketplace: "www.amazon.com",
              resources: ["itemInfo.title", "offersV2.listings.price"],
            }),
          });
          const apiText = await apiRes.text();
          results["api_test"] = { status: apiRes.status, body: apiText.slice(0, 500) };
        }
      } catch (e: any) {
        results[key] = { error: e.message };
      }
    }

    return res.json(results);
  });

  app.post("/api/admin/sync/impact", isAdmin, async (_req: any, res) => {
    try {
      const { syncImpactDeals } = await import("./deal-sync-scheduler");
      const result = await syncImpactDeals(storage);
      res.json({
        message: `Impact sync complete: ${result.created} created, ${result.updated} updated, ${result.errors} errors`,
        ...result,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/sync/playitagain", isAdmin, async (_req: any, res) => {
    try {
      const { syncPlayItAgainDeals } = await import("./deal-sync-scheduler");
      const result = await syncPlayItAgainDeals(storage);
      res.json({
        message: `Play It Again sync complete: ${result.created} created, ${result.updated} updated, ${result.errors} errors`,
        ...result,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- AI deal classification (daily-gated; manual trigger here) ---
  app.get("/api/admin/ai-classification/stats", isAdmin, async (_req: any, res) => {
    try {
      const { getClassificationStats } = await import("./ai-classifier");
      res.json(await getClassificationStats());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/ai-classification/run", isAdmin, async (req: any, res) => {
    try {
      const { startBackgroundClassify } = await import("./ai-classifier");
      // limit <= 0 means "all candidates" (no cap). Safe now that the run is a
      // background job that polls run-status instead of blocking the request.
      const rawLimit = Number(req.body?.limit);
      const limit =
        rawLimit === 0
          ? 0
          : Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 150, 1), 100000);
      const mode = req.body?.mode === "baseball-rescue" ? "baseball-rescue" : "unclassified";
      // Sport filter only applies to the unclassified pile (rescue mode is fixed to baseball).
      const sportId =
        mode === "unclassified" && typeof req.body?.sportId === "string" && req.body.sportId
          ? req.body.sportId
          : undefined;
      // Run in the background and return immediately so a large pass can't trip
      // the gateway's request timeout. The admin panel polls run-status below.
      const result = startBackgroundClassify({ limit, sportId, mode });
      res.status(result.started ? 202 : 200).json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/ai-classification/run-status", isAdmin, async (_req: any, res) => {
    try {
      const { getClassifyJobState } = await import("./ai-classifier");
      res.json(getClassifyJobState());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Snapshot of what long-running work is currently active (for the System
  // Controls card to enable/disable the Stop button and show live status).
  app.get("/api/admin/processes/status", isAdmin, async (_req: any, res) => {
    try {
      const { getClassifyJobState } = await import("./ai-classifier");
      const sync = getSyncStatus();
      const ai = getClassifyJobState();
      res.json({
        sync: { running: sync.running, startedAt: sync.startedAt },
        aiClassification: { running: ai.status === "running", status: ai.status, message: ai.message },
        anyRunning: sync.running || ai.status === "running",
        lastStopAt: getLastStopAt(),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // One-shot kill switch: signal every currently-running sync + the AI
  // classification job to halt at their next checkpoint. Scheduled cron jobs are
  // untouched and resume on their normal timers.
  app.post("/api/admin/processes/stop", isAdmin, async (_req: any, res) => {
    try {
      const { getClassifyJobState } = await import("./ai-classifier");
      const syncBefore = getSyncStatus();
      const aiBefore = getClassifyJobState();
      const { stoppedAt } = requestStopAll();
      res.json({
        ok: true,
        stoppedAt,
        wasRunning: {
          sync: syncBefore.running,
          aiClassification: aiBefore.status === "running",
        },
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // One-time remediation: re-route the wrong-sport backlog that was stamped
  // 'ai' (and cached with needsNewCategory=false) BEFORE the validate() fix.
  // Defaults to a dry run; pass { confirm: true } to actually mutate. This
  // re-incurs OpenAI cost on the next classify pass, so it is gated explicitly.
  app.post("/api/admin/ai-classification/remediate-mislabeled", isAdmin, async (req: any, res) => {
    try {
      const { remediateMislabeledRescueDeals } = await import("./ai-classifier");
      const dryRun = req.body?.confirm === true ? false : true;
      const limit =
        Number.isFinite(Number(req.body?.limit)) && Number(req.body?.limit) > 0
          ? Math.min(Number(req.body.limit), 5000)
          : undefined;
      const result = await remediateMislabeledRescueDeals({ dryRun, limit });
      res.json({
        message: result.dryRun
          ? `Dry run: ${result.affected} mislabeled deals found, ${result.cacheRowsRemoved} cache rows would be removed. Re-run with { confirm: true } to apply.`
          : `Remediated: reset ${result.dealsReset} deals and removed ${result.cacheRowsRemoved} cache rows. Run a baseball-rescue classify pass to re-route them.`,
        ...result,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/ai-classification/review", isAdmin, async (req: any, res) => {
    try {
      const { listReviewQueue } = await import("./ai-classifier");
      const status = typeof req.query?.status === "string" ? req.query.status : "pending";
      res.json(await listReviewQueue(status));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/ai-classification/review/:id/approve", isAdmin, async (req: any, res) => {
    try {
      const { approveReviewItem } = await import("./ai-classifier");
      const result = await approveReviewItem(
        req.params.id,
        getAuthedUserEmail(req) ?? ADMIN_EMAIL,
      );
      res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/ai-classification/review/:id/reject", isAdmin, async (req: any, res) => {
    try {
      const { rejectReviewItem } = await import("./ai-classifier");
      const result = await rejectReviewItem(req.params.id);
      res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ebay/deal-items-sync", isAdmin, async (req: any, res) => {
    try {
      const clientId = process.env.EBAY_CLIENT_ID;
      const clientSecret = process.env.EBAY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({ message: "eBay API credentials not configured." });
      }

      const dealCategorySyncs = getEbayDealCategorySyncs();
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalErrors = 0;
      const syncLog: string[] = [];

      const stopEpoch = getStopEpoch();
      for (const catSync of dealCategorySyncs) {
        if (stopRequestedSince(stopEpoch)) break;
        try {
          const items = await searchEbayDealItems(clientId, clientSecret, {
            categoryIds: catSync.ebayCategoryId,
            maxResults: 500,
          });

          const dealsToInsert = items
            .map((item) => ebayDealItemToDeal(item, catSync.sportId, catSync.equipmentTypeId))
            .filter((d): d is NonNullable<typeof d> => d !== null);

          if (dealsToInsert.length > 0) {
            await storage.ensureSource("ebay", "eBay", "https://www.ebay.com");
            const result = await storage.bulkUpsertDeals(dealsToInsert);
            totalCreated += result.created;
            totalUpdated += result.updated;
            syncLog.push(`${catSync.categoryName} (${catSync.ebayCategoryId}): ${items.length} deal items, ${dealsToInsert.length} deals (${result.created} new, ${result.updated} updated)`);
          } else {
            syncLog.push(`${catSync.categoryName} (${catSync.ebayCategoryId}): ${items.length} deal items, 0 qualifying deals`);
          }
        } catch (err: any) {
          totalErrors++;
          syncLog.push(`${catSync.categoryName} (${catSync.ebayCategoryId}): ERROR - ${err.message}`);
        }
      }

      res.json({
        ok: true,
        created: totalCreated,
        updated: totalUpdated,
        errors: totalErrors,
        log: syncLog,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // eBay API status check
  app.get("/api/ebay/status", isAuthenticated, async (_req: any, res) => {
    const hasClientId = !!process.env.EBAY_CLIENT_ID;
    const hasClientSecret = !!process.env.EBAY_CLIENT_SECRET;
    res.json({
      configured: hasClientId && hasClientSecret,
      hasClientId,
      hasClientSecret,
    });
  });

  // eBay Marketplace Account Deletion Notification endpoint
  const EBAY_VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN || "TwinSeam_eBay_2026_EventNotice_ReplitApp";
  const EBAY_NOTIFICATION_ENDPOINT = "https://deal-scout-twinseamsports.replit.app/api/ebay/account-deletion";

  app.get("/api/ebay/account-deletion", (req, res) => {
    const challengeCode = req.query.challenge_code as string;
    if (!challengeCode) {
      return res.status(400).json({ message: "Missing challenge_code" });
    }
    const hash = crypto
      .createHash("sha256")
      .update(challengeCode)
      .update(EBAY_VERIFICATION_TOKEN)
      .update(EBAY_NOTIFICATION_ENDPOINT)
      .digest("hex");
    res.status(200).json({ challengeResponse: hash });
  });

  app.post("/api/ebay/account-deletion", (req, res) => {
    console.log("eBay account deletion notification received:", JSON.stringify(req.body));
    res.status(200).json({ message: "Notification received" });
  });

  // eBay OAuth2 user authorization flow
  const oauthStates = new Map<string, { userId: string; createdAt: number }>();

  app.get("/api/ebay/oauth/start", isAdmin, (req: any, res) => {
    const clientId = process.env.EBAY_CLIENT_ID;
    if (!clientId) return res.status(500).json({ message: "eBay API credentials not configured" });

    const ruName = process.env.EBAY_REDIRECT_URI;
    let redirectUri: string;
    if (ruName) {
      redirectUri = ruName;
    } else {
      const protocol = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      redirectUri = `${protocol}://${host}/api/ebay/oauth/callback`;
    }

    const state = crypto.randomBytes(24).toString("hex");
    const userId = getAuthedUserId(req);
    oauthStates.set(state, { userId, createdAt: Date.now() });

    setTimeout(() => oauthStates.delete(state), 10 * 60 * 1000);

    const url = getEbayOAuthUrl(clientId, redirectUri, state);
    res.redirect(url);
  });

  app.get("/api/ebay/oauth/callback", async (req, res) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      const errorParam = req.query.error as string | undefined;
      const errorDesc = req.query.error_description as string | undefined;

      if (errorParam) {
        let msg = errorDesc || errorParam;
        console.error("eBay OAuth error:", errorParam, errorDesc);
        if (errorParam === "invalid_scope") {
          msg = "eBay rejected the requested permissions (invalid_scope). Please verify that your eBay developer app has the required OAuth scopes enabled: sell.fulfillment.readonly, sell.inventory, sell.inventory.readonly. Check your eBay developer account at developer.ebay.com.";
        }
        return res.redirect(`/app/admin?ebay_error=${encodeURIComponent(msg)}`);
      }

      if (!code || !state) {
        console.error("eBay OAuth callback missing params. Query:", JSON.stringify(req.query));
        return res.redirect("/app/admin?ebay_error=missing_params");
      }

      const stateData = oauthStates.get(state);
      if (!stateData) {
        return res.redirect("/app/admin?ebay_error=invalid_state");
      }
      oauthStates.delete(state);

      const clientId = process.env.EBAY_CLIENT_ID!;
      const clientSecret = process.env.EBAY_CLIENT_SECRET!;
      const ruName = process.env.EBAY_REDIRECT_URI;
      let redirectUri: string;
      if (ruName) {
        redirectUri = ruName;
      } else {
        const protocol = req.headers["x-forwarded-proto"] || req.protocol;
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        redirectUri = `${protocol}://${host}/api/ebay/oauth/callback`;
      }

      const tokens = await exchangeEbayCode(code, clientId, clientSecret, redirectUri);

      await storage.upsertEbayOauthToken(stateData.userId, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        scope: tokens.scope,
      });

      res.redirect("/app/admin?ebay_connected=true");
    } catch (err: any) {
      console.error("eBay OAuth callback error:", err.message);
      res.redirect(`/app/admin?ebay_error=${encodeURIComponent(err.message)}`);
    }
  });

  app.get("/api/ebay/oauth/status", isAdmin, async (req: any, res) => {
    try {
      const { getEbayOAuthConnectionStatus } = await import("./ebay-reports");
      res.json(await getEbayOAuthConnectionStatus(getAuthedUserId(req), storage));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ebay/oauth/disconnect", isAdmin, async (req: any, res) => {
    try {
      await storage.deleteEbayOauthToken(getAuthedUserId(req));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // eBay reports - sales CSV
  app.get("/api/ebay/reports/sales.csv", isAdmin, async (req: any, res) => {
    try {
      const accessToken = await getValidEbayUserToken(getAuthedUserId(req), storage);
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const orders = await fetchEbaySalesOrders(accessToken, startDate, endDate);
      const csv = salesOrdersToCsv(orders);

      const filename = `ebay-sales${startDate ? `-from-${startDate}` : ""}${endDate ? `-to-${endDate}` : ""}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err: any) {
      res.status(err.message.includes("not connected") || err.message.includes("expired") ? 401 : 500).json({ message: err.message });
    }
  });

  // eBay reports - purchases CSV
  app.get("/api/ebay/reports/purchases.csv", isAdmin, async (req: any, res) => {
    try {
      const accessToken = await getValidEbayUserToken(getAuthedUserId(req), storage);
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const purchases = await fetchEbayPurchases(accessToken, startDate, endDate);
      const csv = purchasesToCsv(purchases);

      const filename = `ebay-purchases${startDate ? `-from-${startDate}` : ""}${endDate ? `-to-${endDate}` : ""}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err: any) {
      res.status(err.message.includes("not connected") || err.message.includes("expired") ? 401 : 500).json({ message: err.message });
    }
  });

  app.post("/api/sidelineswap/sync", isAdmin, async (req: any, res) => {
    try {
      const input = z.object({
        sportId: z.string().optional(),
        minPrice: z.number().min(0).optional(),
        maxPages: z.number().min(1).max(10).default(3),
        condition: z.enum(["new", "preowned", "all"]).default("all"),
      }).parse(req.body);

      await storage.ensureSource("sidelineswap", "SidelineSwap", "https://www.sidelineswap.com");

      const result = await syncSidelineSwap({
        sportId: input.sportId,
        minPrice: input.minPrice,
        maxPages: input.maxPages,
        condition: input.condition,
      });

      const { created, updated } = await storage.bulkUpsertDeals(result.deals);

      res.json({
        ok: true,
        created,
        updated,
        total: result.deals.length,
        log: result.log,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sidelineswap/sports", (req, res) => {
    res.json(getSidelineSwapSports());
  });

  // Shopify store sync (Twin Seam Sports)
  app.post("/api/shopify/sync", isAdmin, async (req, res) => {
    try {
      const input = z.object({
        sportId: z.string().optional(),
        maxPages: z.number().min(1).max(50).optional(),
      }).parse(req.body);

      const result = await syncShopifyStore(
        "https://www.twinseamsports.com",
        (deals) => storage.bulkUpsertDeals(deals),
        input.sportId,
        input.maxPages ?? 30,
      );

      res.json({
        ok: true,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        total: result.total,
        log: result.log,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/nameofthegame/sync", isAdmin, async (req, res) => {
    try {
      const input = z.object({
        maxPages: z.number().min(1).max(50).optional(),
      }).parse(req.body);

      await storage.ensureSource("name-of-the-game", "NameOfTheGame", "https://www.nameofthegame.com");
      const result = await syncNameOfTheGame(
        (deals) => storage.bulkUpsertDeals(deals),
        input.maxPages ?? 20,
      );

      res.json({
        ok: true,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        total: result.total,
        log: result.log,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/baseball-resale/sync", isAdmin, async (req, res) => {
    try {
      const input = z.object({
        maxPages: z.number().min(1).max(50).optional(),
      }).parse(req.body);

      await storage.ensureSource("baseball-resale", "Baseball Resale", "https://nunnbaseball.shop");
      const result = await syncBaseballResale(
        (deals) => storage.bulkUpsertDeals(deals),
        input.maxPages ?? 20,
      );

      res.json({
        ok: true,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        total: result.total,
        log: result.log,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid input" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fanatics/sync", isAdmin, async (_req, res) => {
    try {
      const result = await syncFanaticsDeals(storage);
      res.json({
        ok: true,
        created: result.created,
        updated: result.updated,
        errors: result.errors,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/rakuten/sync", isAdmin, async (_req, res) => {
    try {
      const apiToken = process.env.RAKUTEN_API_TOKEN;
      if (!apiToken) {
        return res.status(400).json({ message: "Rakuten API token not configured" });
      }

      const { syncRakutenMerchant, RAKUTEN_MERCHANTS } = await import("./rakuten-api");
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalErrors = 0;

      const stopEpoch = getStopEpoch();
      for (const merchant of RAKUTEN_MERCHANTS) {
        if (stopRequestedSince(stopEpoch)) break;
        try {
          const { deals } = await syncRakutenMerchant(apiToken, merchant);
          const validDeals = deals.filter((d: any): d is NonNullable<typeof d> => d !== null);

          if (validDeals.length > 0) {
            await storage.ensureSource(merchant.sourceId, merchant.name, "");
            const result = await storage.bulkUpsertDeals(validDeals);
            totalCreated += result.created;
            totalUpdated += result.updated;
          }
        } catch (err: any) {
          totalErrors++;
        }
      }

      res.json({ ok: true, created: totalCreated, updated: totalUpdated, errors: totalErrors });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // eBay Listing Assistant
  const multer = (await import("multer")).default;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 12 } });

  app.post("/api/ebay-listing/upload-photos", isAdmin, upload.array("photos", 12), async (req: any, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No photos provided" });
      }

      const imageUrls: string[] = [];
      for (const file of files) {
        const base64 = file.buffer.toString("base64");
        const mimeType = file.mimetype || "image/jpeg";
        imageUrls.push(`data:${mimeType};base64,${base64}`);
      }

      res.json({ imageUrls });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ebay-listing/generate", isAdmin, async (req: any, res) => {
    try {
      const { generateEbayListing } = await import("./ebay-listing-ai");
      const { description, imageUrls, sport, condition } = req.body;

      if (!description) {
        return res.status(400).json({ message: "Description is required" });
      }

      const listing = await generateEbayListing({
        description,
        imageUrls: imageUrls || [],
        sport,
        condition,
      });

      res.json(listing);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ebay-listing/create", isAdmin, async (req: any, res) => {
    try {
      const { createEbayDraftListing, EBAY_CONDITION_MAP } = await import("./ebay-listing");
      const userId = getAuthedUserId(req);
      const { title, description, price, conditionId, categoryName, imageUrls, itemSpecifics, quantity } = req.body;

      if (!title || !description || !price) {
        return res.status(400).json({ message: "Title, description, and price are required" });
      }

      const condition = EBAY_CONDITION_MAP[conditionId || "3000"] || "USED_EXCELLENT";

      const result = await createEbayDraftListing(userId, storage, {
        title,
        description,
        price: parseFloat(price),
        condition,
        categoryName: categoryName || title,
        imageUrls: imageUrls || [],
        itemSpecifics: itemSpecifics || {},
        quantity: quantity || 1,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ebay-listing/publish", isAdmin, async (req: any, res) => {
    try {
      const { publishEbayOffer } = await import("./ebay-listing");
      const userId = getAuthedUserId(req);
      const { offerId } = req.body;

      if (!offerId) {
        return res.status(400).json({ message: "Offer ID is required" });
      }

      const result = await publishEbayOffer(userId, storage, offerId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Scheduled report endpoints
  app.get("/api/scheduled-reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getAuthedUserId(req);
      const reports = await storage.listScheduledReports(userId, 30);
      res.json(reports.map(r => ({ ...r, csvContent: undefined })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/scheduled-reports/:id/download", isAuthenticated, async (req: any, res) => {
    try {
      const report = await storage.getScheduledReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (report.userId !== getAuthedUserId(req)) return res.status(403).json({ message: "Forbidden" });

      const filename = `ebay_${report.reportType}_${report.reportDate}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(report.csvContent);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Detect source/origin from a product URL
  function detectSource(url: string): { sourceId: string; sourceName: string; baseUrl: string } {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const map: Record<string, { id: string; name: string; base: string }> = {
      "amazon.com": { id: "amazon-manual", name: "Amazon", base: "https://www.amazon.com" },
      "twinseamsports.com": { id: "twin-seam-sports", name: "Twin Seam Sports", base: "https://www.twinseamsports.com" },
      "ebay.com": { id: "ebay", name: "eBay", base: "https://www.ebay.com" },
      "dickssportinggoods.com": { id: "dicks-sporting-goods", name: "DICK'S Sporting Goods", base: "https://www.dickssportinggoods.com" },
      "baseballmonkey.com": { id: "baseball-monkey", name: "Baseball Monkey", base: "https://www.baseballmonkey.com" },
      "justballgloves.com": { id: "just-ball-gloves", name: "JustBallGloves", base: "https://www.justballgloves.com" },
      "justbats.com": { id: "just-bats", name: "JustBats", base: "https://www.justbats.com" },
      "baseballrampage.com": { id: "baseball-rampage", name: "Baseball Rampage", base: "https://www.baseballrampage.com" },
      "academy.com": { id: "academy-sports", name: "Academy Sports", base: "https://www.academy.com" },
      "walmart.com": { id: "walmart", name: "Walmart", base: "https://www.walmart.com" },
      "target.com": { id: "target", name: "Target", base: "https://www.target.com" },
      "nike.com": { id: "nike", name: "Nike", base: "https://www.nike.com" },
      "rawlings.com": { id: "rawlings", name: "Rawlings", base: "https://www.rawlings.com" },
      "wilson.com": { id: "wilson", name: "Wilson", base: "https://www.wilson.com" },
      "sidelineswap.com": { id: "sidelineswap", name: "SidelineSwap", base: "https://www.sidelineswap.com" },
      "fanatics.com": { id: "fanatics", name: "Fanatics", base: "https://www.fanatics.com" },
    };
    for (const [domain, info] of Object.entries(map)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return { sourceId: info.id, sourceName: info.name, baseUrl: info.base };
      }
    }
    const cleanDomain = hostname.replace(/\.(com|net|org|co|io)$/i, "").replace(/[^a-z0-9]/g, "-");
    return { sourceId: `manual-${cleanDomain}`, sourceName: hostname, baseUrl: `https://${hostname}` };
  }

  // Add a featured deal from any URL (admin only)
  app.post("/api/admin/featured-deals", isAdmin, async (req: any, res) => {
    try {
      const input = z.object({
        url: z.string().url(),
        title: z.string().min(1).max(500),
        brand: z.string().max(200).optional(),
        priceCents: z.number().int().min(1),
        msrpCents: z.number().int().min(1).optional(),
        sportId: z.string().optional(),
        equipmentTypeId: z.string().optional(),
        condition: z.enum(["new", "preowned"]).default("new"),
        imageUrl: z.string().url().optional(),
      }).parse(req.body);

      const { sourceId, sourceName, baseUrl } = detectSource(input.url);

      let finalUrl = input.url;
      const parsedUrl = new URL(input.url);
      const isAmazon = /amazon\.(com|co\.uk|ca|de|fr|es|it|co\.jp|com\.au|in|com\.br|com\.mx)/i.test(parsedUrl.hostname);
      if (isAmazon) {
        const partnerTag = process.env.AMAZON_PARTNER_TAG;
        if (partnerTag) {
          parsedUrl.searchParams.set("tag", partnerTag);
          finalUrl = parsedUrl.toString();
        }
      }

      await storage.ensureSource(sourceId, sourceName, baseUrl);

      let percentOff: string | undefined;
      if (input.msrpCents && input.msrpCents > input.priceCents) {
        percentOff = (((input.msrpCents - input.priceCents) / input.msrpCents) * 100).toFixed(3);
      }

      const deal = await storage.createDeal({
        sourceId,
        title: input.title,
        brand: input.brand ?? null,
        url: finalUrl,
        imageUrl: input.imageUrl ?? null,
        sportId: input.sportId ?? null,
        equipmentTypeId: input.equipmentTypeId ?? null,
        condition: input.condition,
        currency: "USD",
        msrpCents: input.msrpCents ?? null,
        priceCents: input.priceCents,
        percentOff: percentOff ?? null,
        isBuyItNow: true,
        isFeatured: true,
        raw: { originalUrl: input.url, addedBy: getAuthedUserId(req), detectedSource: sourceName },
      });

      res.json({ ok: true, deal, detectedSource: sourceName });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      res.status(500).json({ message: err.message });
    }
  });

  // List featured deals
  app.get("/api/admin/featured-deals", isAdmin, async (_req: any, res) => {
    try {
      const featuredDeals = await storage.listFeaturedDeals();
      res.json(featuredDeals);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Toggle featured status on a deal
  app.patch("/api/admin/featured-deals/:id", isAdmin, async (req: any, res) => {
    try {
      const { isFeatured } = z.object({ isFeatured: z.boolean() }).parse(req.body);
      const deal = await storage.updateDeal(req.params.id, { isFeatured });
      res.json({ ok: true, deal });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Delete a featured deal
  app.delete("/api/admin/featured-deals/:id", isAdmin, async (req: any, res) => {
    try {
      await storage.deleteDeal(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Bonus deals (non-sporting goods) - public list
  app.get("/api/bonus-deals", async (_req, res) => {
    try {
      const deals = await storage.listBonusDeals(true);
      res.json(deals);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Bonus deals - admin CRUD
  app.get("/api/admin/bonus-deals", isAdmin, async (_req, res) => {
    try {
      const deals = await storage.listBonusDeals(false);
      res.json(deals);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/bonus-deals", isAdmin, async (req: any, res) => {
    try {
      const { insertBonusDealSchema } = await import("@shared/schema");
      const data = insertBonusDealSchema.parse(req.body);
      const deal = await storage.createBonusDeal(data);
      res.status(201).json(deal);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/admin/bonus-deals/:id", isAdmin, async (req: any, res) => {
    try {
      const deal = await storage.updateBonusDeal(req.params.id, req.body);
      res.json(deal);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/bonus-deals/:id", isAdmin, async (req: any, res) => {
    try {
      await storage.deleteBonusDeal(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/popular-products", async (_req, res) => {
    try {
      const MAX_PRODUCTS = 12;
      const adminPicks = await storage.listPopularProducts(true);
      const result: { name: string; slug: string; sport: string; source: "admin" | "trending" }[] = [];
      const usedSlugs = new Set<string>();
      for (const p of adminPicks) {
        result.push({ name: p.name, slug: p.slug, sport: p.sport, source: "admin" });
        usedSlugs.add(p.slug);
      }
      if (result.length < MAX_PRODUCTS) {
        const trending = await storage.getTrendingProducts(MAX_PRODUCTS);
        for (const t of trending) {
          if (usedSlugs.has(t.slug)) continue;
          usedSlugs.add(t.slug);
          result.push({ name: t.name, slug: t.slug, sport: t.sport, source: "trending" });
          if (result.length >= MAX_PRODUCTS) break;
        }
      }
      res.json(result);
    } catch (err: any) {
      console.error(`[popular-products] Error: ${err.message}`);
      res.status(500).json({ error: "Failed to fetch popular products" });
    }
  });

  app.get("/api/admin/popular-products", isAdmin, async (_req, res) => {
    try {
      const products = await storage.listPopularProducts(false);
      res.json(products);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/popular-products", isAdmin, async (req: any, res) => {
    try {
      const { name, slug, sport, sortOrder, isActive } = req.body;
      if (!name?.trim() || !slug?.trim() || !sport?.trim()) {
        return res.status(400).json({ message: "name, slug, and sport are required" });
      }
      const productSlug = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!productSlug) return res.status(400).json({ message: "slug must contain at least one alphanumeric character" });
      if (name.trim().length > 200) return res.status(400).json({ message: "name too long (max 200)" });
      const product = await storage.createPopularProduct({
        name: name.trim(),
        slug: productSlug,
        sport: sport.trim(),
        sortOrder: typeof sortOrder === "number" ? sortOrder : parseInt(sortOrder) || 0,
        isActive: isActive ?? true,
      });
      res.json(product);
    } catch (err: any) {
      if (err.message?.includes("duplicate") || err.code === "23505") {
        return res.status(409).json({ message: "A product with this slug already exists" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/popular-products/:id", isAdmin, async (req: any, res) => {
    try {
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
      if (req.body.slug !== undefined) {
        updates.slug = String(req.body.slug).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (!updates.slug) return res.status(400).json({ message: "slug must contain at least one alphanumeric character" });
      }
      if (req.body.sport !== undefined) updates.sport = String(req.body.sport).trim();
      if (req.body.sortOrder !== undefined) updates.sortOrder = typeof req.body.sortOrder === "number" ? req.body.sortOrder : parseInt(req.body.sortOrder) || 0;
      if (req.body.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);
      const product = await storage.updatePopularProduct(req.params.id, updates);
      res.json(product);
    } catch (err: any) {
      if (err.message === "Popular product not found") {
        return res.status(404).json({ message: err.message });
      }
      if (err.message?.includes("duplicate") || err.code === "23505") {
        return res.status(409).json({ message: "A product with this slug already exists" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/popular-products/:id", isAdmin, async (req: any, res) => {
    try {
      await storage.deletePopularProduct(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/msrp/stats", isAdmin, async (_req, res) => {
    try {
      const { getMsrpVerificationStats } = await import("./msrp-lookup");
      const stats = await getMsrpVerificationStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/msrp/verify-deal/:id", isAdmin, async (req: any, res) => {
    try {
      const { verifyMsrpForDeal } = await import("./msrp-lookup");
      const dealId = parseInt(req.params.id);
      if (isNaN(dealId)) return res.status(400).json({ message: "Invalid deal ID" });
      const result = await verifyMsrpForDeal(dealId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/msrp/batch-verify", isAdmin, async (req: any, res) => {
    try {
      const { batchVerifyMsrps } = await import("./msrp-lookup");
      const { sportId, brand, limit } = req.body || {};
      const result = await batchVerifyMsrps({
        sportId: sportId || undefined,
        brand: brand || undefined,
        limit: limit ? parseInt(limit) : 50,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/msrp/lookups", isAdmin, async (req: any, res) => {
    try {
      const { getRecentLookups } = await import("./msrp-lookup");
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const lookups = await getRecentLookups(limit);
      res.json(lookups);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/deals/:id/click", async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { dealClicks, deals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const dealId = req.params.id;
      const deal = await db.select({ sourceId: deals.sourceId, sportId: deals.sportId }).from(deals).where(eq(deals.id, dealId)).limit(1);
      if (!deal.length) return res.status(404).json({ message: "Deal not found" });
      let userId: string | null = null;
      try { userId = getAuthedUserId(req); } catch {}
      await db.insert(dealClicks).values({
        dealId,
        userId,
        sourceId: deal[0].sourceId,
        sportId: deal[0].sportId,
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/recalculate-discounts", isAdmin, async (_req, res) => {
    try {
      const updated = await storage.recalculateDealDiscounts();
      res.json({ updated, message: `Recalculated percent_off for ${updated} deals` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/ebay-pricing/generate-report", isAdmin, async (_req, res) => {
    try {
      const { generatePricingReport } = await import("./ebay-pricing-analysis");
      const reportId = await generatePricingReport();
      res.json({ reportId });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/ebay-pricing/reports", isAdmin, async (_req, res) => {
    try {
      const { listReports } = await import("./ebay-pricing-analysis");
      const reports = await listReports();
      res.json(reports);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/ebay-pricing/latest", isAdmin, async (_req, res) => {
    try {
      const { getLatestReport } = await import("./ebay-pricing-analysis");
      const report = await getLatestReport();
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/ebay-pricing/reports/:id", isAdmin, async (req: any, res) => {
    try {
      const { getReport } = await import("./ebay-pricing-analysis");
      const report = await getReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/ebay-pricing/costs", isAdmin, async (_req, res) => {
    try {
      const { listItemCosts } = await import("./ebay-pricing-analysis");
      const costs = await listItemCosts();
      res.json(costs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/ebay-pricing/costs", isAdmin, async (req: any, res) => {
    try {
      const { ebayItemId, title, procurementCostCents, notes } = req.body;
      if (!ebayItemId || !title) return res.status(400).json({ message: "ebayItemId and title required" });
      if (procurementCostCents !== null && procurementCostCents !== undefined) {
        const cost = Number(procurementCostCents);
        if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ message: "procurementCostCents must be a non-negative number" });
      }
      const { upsertItemCost } = await import("./ebay-pricing-analysis");
      const cost = await upsertItemCost(ebayItemId, title, procurementCostCents ?? null, notes);
      res.json(cost);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/ebay-pricing/costs/:id", isAdmin, async (req: any, res) => {
    try {
      const { deleteItemCost } = await import("./ebay-pricing-analysis");
      await deleteItemCost(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/promo-codes", isAdmin, async (req: any, res) => {
    try {
      const { listPromoCodes } = await import("./promo-codes");
      const codes = await listPromoCodes({
        source: req.query.source || undefined,
        status: req.query.status || undefined,
        advertiser: req.query.advertiser || undefined,
      });
      res.json(codes);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/promo-codes/stats", isAdmin, async (_req, res) => {
    try {
      const { getPromoStats } = await import("./promo-codes");
      const stats = await getPromoStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/promo-codes/sync", isAdmin, async (_req, res) => {
    try {
      const { syncAllPromoCodes } = await import("./promo-codes");
      const result = await syncAllPromoCodes();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/promo-codes", isAdmin, async (req: any, res) => {
    try {
      const { advertiserName, code, description, startDate, endDate, discountType, discountValue } = req.body;
      if (!advertiserName || !code) return res.status(400).json({ message: "advertiserName and code required" });
      const { createManualPromoCode } = await import("./promo-codes");
      const promo = await createManualPromoCode({ advertiserName, code, description, startDate, endDate, discountType, discountValue });
      res.json(promo);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/promo-codes/:id", isAdmin, async (req: any, res) => {
    try {
      const { updatePromoCode } = await import("./promo-codes");
      const promo = await updatePromoCode(req.params.id, req.body);
      if (!promo) return res.status(404).json({ message: "Promo code not found" });
      res.json(promo);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/promo-codes/:id", isAdmin, async (req: any, res) => {
    try {
      const { deletePromoCode } = await import("./promo-codes");
      await deletePromoCode(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/visits/heartbeat", async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const { sessionId, pagesViewed } = req.body;
      if (!sessionId) return res.status(400).json({ message: "sessionId required" });
      // Skip analytics for excluded admin accounts
      const reqEmail = getAuthedUserEmail(req);
      if (reqEmail && ANALYTICS_EXCLUDED_EMAILS.includes(reqEmail)) {
        return res.json({ ok: true });
      }
      let userId: string | null = null;
      try { userId = getAuthedUserId(req); } catch {}
      const crypto = await import("crypto");
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
      const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
      const ua = (req.headers["user-agent"] || "").slice(0, 500);
      const SESSION_TIMEOUT_SEC = 1800;
      await db.execute(sql.raw(`
        INSERT INTO user_visits (id, user_id, session_id, started_at, pages_viewed, user_agent, ip_hash)
        VALUES (gen_random_uuid(), ${userId ? `'${userId.replace(/'/g, "''")}'` : 'NULL'}, '${sessionId.replace(/'/g, "''")}', NOW(), ${Math.max(1, parseInt(pagesViewed, 10) || 1)}, '${ua.replace(/'/g, "''")}', '${ipHash}')
        ON CONFLICT (session_id) DO UPDATE SET
          ended_at = NOW(),
          duration_seconds = LEAST(EXTRACT(EPOCH FROM (NOW() - user_visits.started_at))::int, 86400),
          pages_viewed = GREATEST(EXCLUDED.pages_viewed, user_visits.pages_viewed),
          user_id = COALESCE(EXCLUDED.user_id, user_visits.user_id)
        WHERE user_visits.ended_at IS NULL
           OR EXTRACT(EPOCH FROM (NOW() - user_visits.ended_at)) < ${SESSION_TIMEOUT_SEC}
      `));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/analytics/summary", isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const excludedEmailsLiteral = ANALYTICS_EXCLUDED_EMAILS.map(e => `'${e.replace(/'/g, "''")}'`).join(",");
      const excludedUserIdsSubquery = `SELECT id FROM users WHERE email IN (${excludedEmailsLiteral})`;
      const [clickStats, userStats, topDeals, topSources, topSports, dailyClicks, visitStats] = await Promise.all([
        db.execute(sql.raw(`SELECT count(*) as total_clicks, count(DISTINCT deal_id) as unique_deals, count(DISTINCT user_id) as unique_users FROM deal_clicks WHERE clicked_at >= '${since}' AND (user_id IS NULL OR user_id NOT IN (${excludedUserIdsSubquery}))`)),
        db.execute(sql.raw(`SELECT count(*) as total_users, count(CASE WHEN created_at >= '${since}' THEN 1 END) as new_users FROM users WHERE email NOT IN (${excludedEmailsLiteral})`)),
        db.execute(sql.raw(`SELECT dc.deal_id, d.title, d.source_id, d.sport_id, count(*) as click_count FROM deal_clicks dc JOIN deals d ON dc.deal_id = d.id WHERE dc.clicked_at >= '${since}' AND (dc.user_id IS NULL OR dc.user_id NOT IN (${excludedUserIdsSubquery})) GROUP BY dc.deal_id, d.title, d.source_id, d.sport_id ORDER BY click_count DESC LIMIT 20`)),
        db.execute(sql.raw(`SELECT source_id, count(*) as click_count FROM deal_clicks WHERE clicked_at >= '${since}' AND (user_id IS NULL OR user_id NOT IN (${excludedUserIdsSubquery})) GROUP BY source_id ORDER BY click_count DESC LIMIT 20`)),
        db.execute(sql.raw(`SELECT sport_id, count(*) as click_count FROM deal_clicks WHERE clicked_at >= '${since}' AND sport_id IS NOT NULL AND (user_id IS NULL OR user_id NOT IN (${excludedUserIdsSubquery})) GROUP BY sport_id ORDER BY click_count DESC LIMIT 20`)),
        db.execute(sql.raw(`SELECT DATE(clicked_at) as day, count(*) as clicks FROM deal_clicks WHERE clicked_at >= '${since}' AND (user_id IS NULL OR user_id NOT IN (${excludedUserIdsSubquery})) GROUP BY DATE(clicked_at) ORDER BY day`)),
        db.execute(sql.raw(`SELECT count(*) as total_visits, count(DISTINCT COALESCE(user_id, ip_hash)) as unique_visitors, COALESCE(AVG(duration_seconds),0) as avg_duration, COALESCE(AVG(pages_viewed),0) as avg_pages FROM user_visits WHERE started_at >= '${since}' AND (user_id IS NULL OR user_id NOT IN (${excludedUserIdsSubquery}))`)),
      ]);

      const getRows = (r: any) => r.rows ?? r;

      res.json({
        clicks: getRows(clickStats)[0] || { total_clicks: 0, unique_deals: 0, unique_users: 0 },
        users: getRows(userStats)[0] || { total_users: 0, new_users: 0 },
        visits: getRows(visitStats)[0] || { total_visits: 0, unique_visitors: 0, avg_duration: 0, avg_pages: 0 },
        topDeals: getRows(topDeals),
        topSources: getRows(topSources),
        topSports: getRows(topSports),
        dailyClicks: getRows(dailyClicks),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/analytics/clicks-csv", isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const groupBy = req.query.groupBy || "all";

      let csvContent = "";
      if (groupBy === "source") {
        const result = await db.execute(sql.raw(`SELECT source_id, count(*) as click_count, count(DISTINCT deal_id) as unique_deals, count(DISTINCT user_id) as unique_users FROM deal_clicks WHERE clicked_at >= '${since}' GROUP BY source_id ORDER BY click_count DESC`));
        const rows = (result as any).rows ?? result;
        csvContent = "Source,Clicks,Unique Deals,Unique Users\n" + rows.map((r: any) => `"${r.source_id}","${r.click_count}","${r.unique_deals}","${r.unique_users}"`).join("\n");
      } else if (groupBy === "sport") {
        const result = await db.execute(sql.raw(`SELECT sport_id, count(*) as click_count, count(DISTINCT deal_id) as unique_deals, count(DISTINCT user_id) as unique_users FROM deal_clicks WHERE clicked_at >= '${since}' AND sport_id IS NOT NULL GROUP BY sport_id ORDER BY click_count DESC`));
        const rows = (result as any).rows ?? result;
        csvContent = "Sport,Clicks,Unique Deals,Unique Users\n" + rows.map((r: any) => `"${r.sport_id}","${r.click_count}","${r.unique_deals}","${r.unique_users}"`).join("\n");
      } else if (groupBy === "deal") {
        const result = await db.execute(sql.raw(`SELECT dc.deal_id, d.title, d.source_id, d.sport_id, d.price_cents, count(*) as click_count FROM deal_clicks dc JOIN deals d ON dc.deal_id = d.id WHERE dc.clicked_at >= '${since}' GROUP BY dc.deal_id, d.title, d.source_id, d.sport_id, d.price_cents ORDER BY click_count DESC`));
        const rows = (result as any).rows ?? result;
        csvContent = "Deal ID,Title,Source,Sport,Price,Clicks\n" + rows.map((r: any) => `"${r.deal_id}","${(r.title || '').replace(/"/g, '""')}","${r.source_id}","${r.sport_id || ''}","${((r.price_cents || 0) / 100).toFixed(2)}","${r.click_count}"`).join("\n");
      } else if (groupBy === "daily") {
        const result = await db.execute(sql.raw(`SELECT DATE(clicked_at) as day, count(*) as clicks, count(DISTINCT user_id) as unique_users, count(DISTINCT deal_id) as unique_deals FROM deal_clicks WHERE clicked_at >= '${since}' GROUP BY DATE(clicked_at) ORDER BY day`));
        const rows = (result as any).rows ?? result;
        csvContent = "Date,Clicks,Unique Users,Unique Deals\n" + rows.map((r: any) => `"${r.day}","${r.clicks}","${r.unique_users}","${r.unique_deals}"`).join("\n");
      } else {
        const result = await db.execute(sql.raw(`
          SELECT dc.clicked_at, dc.deal_id, d.title, d.source_id, d.sport_id, d.price_cents, dc.user_id,
            u.first_name, u.last_name, u.email
          FROM deal_clicks dc
          JOIN deals d ON dc.deal_id = d.id
          LEFT JOIN users u ON dc.user_id = u.id
          WHERE dc.clicked_at >= '${since}'
          ORDER BY dc.clicked_at DESC
        `));
        const rows = (result as any).rows ?? result;
        csvContent = "Clicked At,Deal ID,Title,Source,Sport,Price,User ID,User Name,Email\n" + rows.map((r: any) =>
          `"${r.clicked_at}","${r.deal_id}","${(r.title || '').replace(/"/g, '""')}","${r.source_id}","${r.sport_id || ''}","${((r.price_cents || 0) / 100).toFixed(2)}","${r.user_id || 'anonymous'}","${(r.first_name || '')} ${(r.last_name || '')}".trim(),"${r.email || ''}"`
        ).join("\n");
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=clicks-${groupBy}-${days}d.csv`);
      res.send(csvContent);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/analytics/users", isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      const result = await db.execute(sql.raw(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.profile_image_url, u.created_at,
          COALESCE(c.total_clicks, 0) as total_clicks,
          c.last_click,
          COALESCE(v.total_visits, 0) as total_visits,
          COALESCE(v.total_duration, 0) as total_duration_seconds,
          COALESCE(v.total_pages, 0) as total_pages_viewed,
          v.last_visit,
          up.sport_id as preferred_sport,
          up.push_enabled,
          up.sms_enabled,
          up.phone_number
        FROM users u
        LEFT JOIN (
          SELECT user_id, count(*) as total_clicks, max(clicked_at) as last_click
          FROM deal_clicks GROUP BY user_id
        ) c ON c.user_id = u.id
        LEFT JOIN (
          SELECT user_id, count(*) as total_visits, sum(duration_seconds) as total_duration, sum(pages_viewed) as total_pages, max(started_at) as last_visit
          FROM user_visits GROUP BY user_id
        ) v ON v.user_id = u.id
        LEFT JOIN user_preferences up ON up.user_id = u.id
        WHERE u.email NOT IN (${ANALYTICS_EXCLUDED_EMAILS.map(e => `'${e.replace(/'/g, "''")}'`).join(",")})
        ORDER BY u.created_at DESC
      `));

      res.json((result as any).rows ?? result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/analytics/users-csv", isAdmin, async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");

      const result = await db.execute(sql.raw(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
          COALESCE(c.total_clicks, 0) as total_clicks,
          c.last_click,
          COALESCE(v.total_visits, 0) as total_visits,
          COALESCE(v.total_duration, 0) as total_duration_seconds,
          COALESCE(v.total_pages, 0) as total_pages_viewed,
          v.last_visit,
          up.sport_id as preferred_sport,
          up.push_enabled,
          up.sms_enabled,
          up.phone_number
        FROM users u
        LEFT JOIN (
          SELECT user_id, count(*) as total_clicks, max(clicked_at) as last_click
          FROM deal_clicks GROUP BY user_id
        ) c ON c.user_id = u.id
        LEFT JOIN (
          SELECT user_id, count(*) as total_visits, sum(duration_seconds) as total_duration, sum(pages_viewed) as total_pages, max(started_at) as last_visit
          FROM user_visits GROUP BY user_id
        ) v ON v.user_id = u.id
        LEFT JOIN user_preferences up ON up.user_id = u.id
        ORDER BY u.created_at DESC
      `));

      const rows = (result as any).rows ?? result;
      const header = "User ID,Email,Name,Joined,Total Clicks,Last Click,Total Visits,Time on Site (min),Pages Viewed,Last Visit,Preferred Sport,Push Enabled,SMS Enabled,Phone";
      const csvRows = rows.map((r: any) => {
        const name = `${r.first_name || ''} ${r.last_name || ''}`.trim();
        const timeMin = Math.round((Number(r.total_duration_seconds) || 0) / 60);
        return `"${r.id}","${r.email || ''}","${name}","${r.created_at}","${r.total_clicks}","${r.last_click || 'never'}","${r.total_visits}","${timeMin}","${r.total_pages_viewed}","${r.last_visit || 'never'}","${r.preferred_sport || ''}","${r.push_enabled || false}","${r.sms_enabled || false}","${r.phone_number || ''}"`;
      });
      const csv = [header, ...csvRows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=users.csv`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Blog proxy endpoints (public, no auth required)
  app.get("/api/blog/articles", async (_req, res) => {
    try {
      const { fetchBlogArticles } = await import("./blog-proxy");
      const articles = await fetchBlogArticles();
      res.json(articles);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/blog/articles/:slug", async (req, res) => {
    try {
      const { fetchArticleContent } = await import("./blog-proxy");
      const article = await fetchArticleContent(req.params.slug);
      if (!article) return res.status(404).json({ message: "Article not found" });
      res.json(article);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Deal return tracking (estimated conversions)
  app.post("/api/deals/:id/return", async (req: any, res) => {
    try {
      const { db } = await import("./db");
      const { dealClickReturns, deals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const dealId = req.params.id;
      const minutesAway: number = Math.max(0, Math.min(180, Number(req.body?.minutesAway) || 0));
      const isLikelyConversion = minutesAway >= 1 && minutesAway <= 60;

      const deal = await db.select({ sourceId: deals.sourceId, sportId: deals.sportId }).from(deals).where(eq(deals.id, dealId)).limit(1);
      if (!deal.length) return res.status(404).json({ message: "Deal not found" });

      let userId: string | null = null;
      try { userId = getAuthedUserId(req); } catch {}

      await db.insert(dealClickReturns).values({
        dealId,
        userId,
        sourceId: deal[0].sourceId,
        sportId: deal[0].sportId,
        minutesAway,
        isLikelyConversion,
      });

      res.json({ ok: true, isLikelyConversion });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Affiliate postback endpoints — fire these URLs in your affiliate network dashboards
  // CJ: GET /api/affiliate/postback/cj?OID={ORDER_ID}&AMOUNT={SALE_AMOUNT}&COMMISSION={COMMISSION}&CID={ADVERTISER_ID}&ACTION_TRACKER_ID={ACTION_TRACKER_ID}
  app.get("/api/affiliate/postback/cj", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { affiliateConversions } = await import("@shared/schema");
      const { OID, AMOUNT, COMMISSION, CID } = req.query as Record<string, string>;
      const saleCents = AMOUNT ? Math.round(parseFloat(AMOUNT) * 100) : null;
      const commissionCents = COMMISSION ? Math.round(parseFloat(COMMISSION) * 100) : null;
      await db.insert(affiliateConversions).values({
        network: "cj",
        orderId: OID || null,
        advertiserId: CID || null,
        saleCents,
        commissionCents,
        rawPostback: req.query,
      });
      console.log(`[affiliate] CJ postback: order ${OID}, commission $${COMMISSION}, sale $${AMOUNT}`);
      res.status(200).send("OK");
    } catch (err: any) {
      console.error("[affiliate] CJ postback error:", err.message);
      res.status(200).send("OK");
    }
  });

  // Impact: GET /api/affiliate/postback/impact?OrderId={ORDER_ID}&OrderAmount={SALE_AMOUNT}&CommissionAmount={COMMISSION}&AdvertiserId={ADVERTISER_ID}&AdvertiserName={ADVERTISER_NAME}
  app.get("/api/affiliate/postback/impact", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { affiliateConversions } = await import("@shared/schema");
      const { OrderId, OrderAmount, CommissionAmount, AdvertiserId, AdvertiserName } = req.query as Record<string, string>;
      const saleCents = OrderAmount ? Math.round(parseFloat(OrderAmount) * 100) : null;
      const commissionCents = CommissionAmount ? Math.round(parseFloat(CommissionAmount) * 100) : null;
      await db.insert(affiliateConversions).values({
        network: "impact",
        orderId: OrderId || null,
        advertiserId: AdvertiserId || null,
        advertiserName: AdvertiserName || null,
        saleCents,
        commissionCents,
        rawPostback: req.query,
      });
      console.log(`[affiliate] Impact postback: order ${OrderId}, commission $${CommissionAmount}, sale $${OrderAmount}`);
      res.status(200).send("OK");
    } catch (err: any) {
      console.error("[affiliate] Impact postback error:", err.message);
      res.status(200).send("OK");
    }
  });

  // Rakuten: GET /api/affiliate/postback/rakuten?mid={MID}&orderId={ORDER_ID}&orderTotal={SALE_AMOUNT}&commissionTotal={COMMISSION}&advertiserId={ADVERTISER_ID}
  app.get("/api/affiliate/postback/rakuten", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { affiliateConversions } = await import("@shared/schema");
      const { mid, orderId, orderTotal, commissionTotal } = req.query as Record<string, string>;
      const saleCents = orderTotal ? Math.round(parseFloat(orderTotal) * 100) : null;
      const commissionCents = commissionTotal ? Math.round(parseFloat(commissionTotal) * 100) : null;
      await db.insert(affiliateConversions).values({
        network: "rakuten",
        orderId: orderId || null,
        advertiserId: mid || null,
        saleCents,
        commissionCents,
        rawPostback: req.query,
      });
      console.log(`[affiliate] Rakuten postback: order ${orderId}, commission $${commissionTotal}, sale $${orderTotal}`);
      res.status(200).send("OK");
    } catch (err: any) {
      console.error("[affiliate] Rakuten postback error:", err.message);
      res.status(200).send("OK");
    }
  });

  // eBay Partner Network: GET /api/affiliate/postback/ebay?transaction_id={TRANSACTION_ID}&item_id={ITEM_ID}&customid={CUSTOM_ID}&price={PRICE}&commission={COMMISSION}
  app.get("/api/affiliate/postback/ebay", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { affiliateConversions } = await import("@shared/schema");
      const { transaction_id, item_id, price, commission } = req.query as Record<string, string>;
      const saleCents = price ? Math.round(parseFloat(price) * 100) : null;
      const commissionCents = commission ? Math.round(parseFloat(commission) * 100) : null;
      await db.insert(affiliateConversions).values({
        network: "ebay",
        orderId: transaction_id || null,
        advertiserId: item_id || null,
        saleCents,
        commissionCents,
        rawPostback: req.query,
      });
      console.log(`[affiliate] eBay postback: txn ${transaction_id}, commission $${commission}, sale $${price}`);
      res.status(200).send("OK");
    } catch (err: any) {
      console.error("[affiliate] eBay postback error:", err.message);
      res.status(200).send("OK");
    }
  });

  // Affiliate network reporting
  app.get("/api/admin/affiliate-reporting", isAdmin, async (req, res) => {
    try {
      const { fetchAllAffiliateReports } = await import("./affiliate-reporting");
      const days = Math.min(365, Math.max(1, parseInt(req.query.days as string || "30")));
      const reports = await fetchAllAffiliateReports(days);
      res.json(reports);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Admin conversions analytics
  app.get("/api/admin/analytics/conversions", isAdmin, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { dealClickReturns, affiliateConversions } = await import("@shared/schema");
      const { sql: dsql2 } = await import("drizzle-orm");
      const days = Math.min(365, Math.max(1, parseInt(req.query.days as string || "30")));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [returnStats, topConvertingDeals, affiliateStats, recentConversions, dailyFunnel] = await Promise.all([
        db.execute(dsql2.raw(`
          SELECT
            COUNT(*) AS total_returns,
            COUNT(*) FILTER (WHERE is_likely_conversion) AS likely_conversions,
            AVG(minutes_away) FILTER (WHERE minutes_away > 0) AS avg_minutes_away,
            COUNT(DISTINCT deal_id) AS unique_deals
          FROM deal_click_returns
          WHERE returned_at >= '${since.toISOString()}'
        `)),
        db.execute(dsql2.raw(`
          SELECT dcr.deal_id, d.title, d.source_id, d.sport_id,
            COUNT(*) AS total_returns,
            COUNT(*) FILTER (WHERE dcr.is_likely_conversion) AS likely_conversions,
            ROUND(COUNT(*) FILTER (WHERE dcr.is_likely_conversion) * 100.0 / NULLIF(COUNT(*), 0), 1) AS conversion_rate_pct
          FROM deal_click_returns dcr
          JOIN deals d ON dcr.deal_id = d.id
          WHERE dcr.returned_at >= '${since.toISOString()}'
          GROUP BY dcr.deal_id, d.title, d.source_id, d.sport_id
          ORDER BY likely_conversions DESC
          LIMIT 20
        `)),
        db.execute(dsql2.raw(`
          SELECT network,
            COUNT(*) AS total_conversions,
            SUM(commission_cents) AS total_commission_cents,
            SUM(sale_cents) AS total_sale_cents,
            AVG(commission_cents) AS avg_commission_cents
          FROM affiliate_conversions
          WHERE converted_at >= '${since.toISOString()}'
          GROUP BY network
          ORDER BY total_commission_cents DESC NULLS LAST
        `)),
        db.execute(dsql2.raw(`
          SELECT id, network, order_id, advertiser_name, commission_cents, sale_cents, converted_at
          FROM affiliate_conversions
          WHERE converted_at >= '${since.toISOString()}'
          ORDER BY converted_at DESC
          LIMIT 50
        `)),
        db.execute(dsql2.raw(`
          SELECT
            DATE(dc.clicked_at) AS day,
            COUNT(DISTINCT dc.id) AS clicks,
            COUNT(DISTINCT dcr.id) AS returns,
            COUNT(DISTINCT dcr.id) FILTER (WHERE dcr.is_likely_conversion) AS likely_conversions
          FROM deal_clicks dc
          LEFT JOIN deal_click_returns dcr ON dc.deal_id = dcr.deal_id
            AND dcr.returned_at BETWEEN dc.clicked_at AND dc.clicked_at + INTERVAL '3 hours'
          WHERE dc.clicked_at >= '${since.toISOString()}'
          GROUP BY DATE(dc.clicked_at)
          ORDER BY day
        `)),
      ]);

      const toRows = (r: any) => (r as any).rows ?? r ?? [];

      res.json({
        returnStats: toRows(returnStats)[0] || {},
        topConvertingDeals: toRows(topConvertingDeals),
        affiliateStats: toRows(affiliateStats),
        recentConversions: toRows(recentConversions),
        dailyFunnel: toRows(dailyFunnel),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Search by Photo
  app.post("/api/deals/search-by-photo", async (req: any, res) => {
    try {
      const multer = (await import("multer")).default;
      const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

      await new Promise<void>((resolve, reject) => {
        upload.single("photo")(req, res as any, (err) => (err ? reject(err) : resolve()));
      });

      if (!req.file) return res.status(400).json({ message: "No photo provided" });

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const base64 = req.file.buffer.toString("base64");
      const mimeType = req.file.mimetype || "image/jpeg";
      const dataUrl = `data:${mimeType};base64,${base64}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: `You are a sporting goods expert. Identify the sporting goods item in the photo and extract search details.
Return ONLY a JSON object with these fields (no markdown, no extra text):
{
  "q": "search query string — brand + model + product type (e.g. 'Rawlings Heart of the Hide first base mitt')",
  "sport": "sport name in lowercase (e.g. 'baseball', 'basketball', 'soccer', 'golf', 'tennis', 'hockey', 'football', 'running', 'cycling', etc.) or empty string if unclear",
  "brand": "brand name or empty string if unclear",
  "identified": "short human-readable label of what you see (e.g. 'Rawlings baseball glove')"
}
If you cannot identify a sporting goods item, return { "q": "", "sport": "", "brand": "", "identified": "Unable to identify a sporting goods item" }.`,
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            ],
          },
        ],
      });

      const text = response.choices[0]?.message?.content || "";
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

      let result: { q: string; sport: string; brand: string; identified: string };
      try {
        result = JSON.parse(cleaned);
      } catch {
        result = { q: "", sport: "", brand: "", identified: "Could not parse response" };
      }

      res.json(result);
    } catch (err: any) {
      console.error("Photo search error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // eBay Inventory (for SidelineSwap sync)
  app.get("/api/ebay/inventory", isAdmin, async (req: any, res) => {
    try {
      const { fetchEbayInventory } = await import("./sidelineswap-inventory");
      const limit = Math.min(parseInt(req.query.limit as string || "100"), 200);
      const items = await fetchEbayInventory(getAuthedUserId(req), storage, limit);
      res.json({ items, total: items.length });
    } catch (err: any) {
      const { logEbayError, safeEbayError } = await import("./ebay-errors");
      logEbayError(err);
      const safe = safeEbayError(err);
      res.status(safe.reconnectRequired ? 401 : 502).json(safe);
    }
  });

  // SidelineSwap Sync admin routes
  app.get("/api/admin/sidelineswap-sync/status", isAdmin, async (_req, res) => {
    const { isSidelineSwapConfigured } = await import("./sidelineswap-inventory");
    res.json({ configured: isSidelineSwapConfigured() });
  });

  app.get("/api/admin/sidelineswap-sync", isAdmin, async (_req, res) => {
    try {
      const syncs = await storage.listSidelineswapSyncs();
      res.json(syncs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/sidelineswap-sync", isAdmin, async (req: any, res) => {
    try {
      const {
        createSidelineSwapListing,
        isSidelineSwapConfigured,
      } = await import("./sidelineswap-inventory");

      const { ebaySku, ebayTitle, ebayItemId, ebayPriceCents, ebayQuantity, ebayCondition,
              ebayImages, ebayCategory, ssCategory, ssBrand, ssModel, ssAddressId,
              ssDescription, acceptsOffers } = req.body;

      if (!ebaySku || !ssCategory || !ssBrand || !ssAddressId) {
        return res.status(400).json({ message: "Missing required fields: ebaySku, ssCategory, ssBrand, ssAddressId" });
      }

      await storage.upsertSidelineswapSync({
        ebaySku,
        ebayItemId,
        ebayTitle,
        ebayPriceCents,
        ebayQuantity,
        ebayCondition,
        ebayImages,
        ebayCategory,
        sidelineswapStatus: "PENDING",
        sidelineswapCategory: ssCategory,
        errorMessage: null,
      });

      if (!isSidelineSwapConfigured()) {
        const sync = await storage.getSidelineswapSync(ebaySku);
        return res.json({ sync, skipped: true, message: "Saved locally — SidelineSwap API not yet configured." });
      }

      const listPrice = ebayPriceCents ? ebayPriceCents / 100 : 0;
      const result = await createSidelineSwapListing({
        listingSku: ebaySku,
        name: ebayTitle || ebaySku,
        description: ssDescription || undefined,
        category: ssCategory,
        brand: ssBrand,
        model: ssModel || undefined,
        acceptsOffers: acceptsOffers !== false,
        shipFromAddressId: ssAddressId,
        images: ebayImages || [],
        items: [{
          itemSku: ebaySku,
          quantity: ebayQuantity || 1,
          listPrice,
          retailPrice: listPrice,
        }],
      });

      const sync = await storage.upsertSidelineswapSync({
        ebaySku,
        ebayItemId,
        ebayTitle,
        ebayPriceCents,
        ebayQuantity,
        ebayCondition,
        ebayImages,
        ebayCategory,
        sidelineswapListingId: result.id,
        sidelineswapStatus: result.status,
        sidelineswapCategory: ssCategory,
        errorMessage: result.errors?.length ? JSON.stringify(result.errors) : null,
        lastSyncedAt: new Date(),
      });

      res.json({ sync, result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/sidelineswap-sync/batch", isAdmin, async (req: any, res) => {
    try {
      const { batchCreateSidelineSwapListings, isSidelineSwapConfigured } = await import("./sidelineswap-inventory");
      const { items, ssAddressId } = req.body as {
        items: Array<{
          ebaySku: string; ebayTitle: string; ebayItemId?: string; ebayPriceCents?: number;
          ebayQuantity?: number; ebayCondition?: string; ebayImages?: string[]; ebayCategory?: string;
          ssCategory: string; ssBrand: string; ssModel?: string;
        }>;
        ssAddressId: string;
      };

      if (!items?.length || !ssAddressId) {
        return res.status(400).json({ message: "Missing items or ssAddressId" });
      }

      for (const item of items) {
        await storage.upsertSidelineswapSync({
          ebaySku: item.ebaySku,
          ebayItemId: item.ebayItemId,
          ebayTitle: item.ebayTitle,
          ebayPriceCents: item.ebayPriceCents,
          ebayQuantity: item.ebayQuantity,
          ebayCondition: item.ebayCondition,
          ebayImages: item.ebayImages,
          ebayCategory: item.ebayCategory,
          sidelineswapStatus: "PENDING",
          sidelineswapCategory: item.ssCategory,
          errorMessage: null,
        });
      }

      if (!isSidelineSwapConfigured()) {
        const syncs = await storage.listSidelineswapSyncs();
        return res.json({ syncs, skipped: true, message: "Saved locally — SidelineSwap API not yet configured." });
      }

      const payloads = items.map((item) => ({
        listingSku: item.ebaySku,
        name: item.ebayTitle || item.ebaySku,
        category: item.ssCategory,
        brand: item.ssBrand,
        model: item.ssModel,
        acceptsOffers: true,
        shipFromAddressId: ssAddressId,
        images: item.ebayImages || [],
        items: [{
          itemSku: item.ebaySku,
          quantity: item.ebayQuantity || 1,
          listPrice: item.ebayPriceCents ? item.ebayPriceCents / 100 : 0,
        }],
      }));

      const batchResult = await batchCreateSidelineSwapListings(payloads);

      for (const result of batchResult.results) {
        if (result.listing_sku) {
          await storage.upsertSidelineswapSync({
            ebaySku: result.listing_sku,
            sidelineswapListingId: result.id,
            sidelineswapStatus: result.status,
            errorMessage: result.errors?.length ? JSON.stringify(result.errors) : null,
            lastSyncedAt: new Date(),
          });
        }
      }

      const syncs = await storage.listSidelineswapSyncs();
      res.json({ syncs, batchResult });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/sidelineswap-sync/categories", isAdmin, async (_req, res) => {
    try {
      const { getSidelineSwapCategories, isSidelineSwapConfigured } = await import("./sidelineswap-inventory");
      if (!isSidelineSwapConfigured()) {
        return res.json({ configured: false, categories: [] });
      }
      const categories = await getSidelineSwapCategories();
      res.json({ configured: true, categories });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/sidelineswap-sync/addresses", isAdmin, async (_req, res) => {
    try {
      const { getSidelineSwapAddresses, isSidelineSwapConfigured } = await import("./sidelineswap-inventory");
      if (!isSidelineSwapConfigured()) {
        return res.json({ configured: false, addresses: [] });
      }
      const addresses = await getSidelineSwapAddresses();
      res.json({ configured: true, addresses });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/sidelineswap-sync/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteSidelineswapSync(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Start schedulers
  startDealSyncScheduler(storage);

  return httpServer;
}
