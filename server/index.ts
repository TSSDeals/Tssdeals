import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
// Replit's load balancer terminates TLS upstream and forwards via X-Forwarded-For.
// Trusting the proxy lets `req.ip` resolve to the real client IP, which is required
// for rate limiters on public endpoints to work correctly (and not be spoofable
// by a raw client-supplied X-Forwarded-For header).
app.set("trust proxy", true);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

let appReady = false;
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.use((req, res, next) => {
  if (!appReady && req.method === "GET" && (req.path === "/" || !req.path.startsWith("/api"))) {
    if (req.path === "/") {
      return res.status(200).set("Content-Type", "text/html").end(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading...</title><meta http-equiv="refresh" content="3"></head><body><p>Loading...</p></body></html>`
      );
    }
  }
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen(
  {
    port,
    host: "0.0.0.0",
    reusePort: true,
  },
  () => {
    log(`serving on port ${port}`);
  },
);

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  appReady = true;
  log("Application ready");
  runStartupMigrations().catch(e => console.error("Startup migrations failed:", e));

  try {
    const { ensureTeamStatsSchema, seedKnoxStarsTeam } = await import("./team-stats");
    await ensureTeamStatsSchema();
    await seedKnoxStarsTeam();
    log("Team stats schema + Knox Stars seed ensured", "migration");
  } catch (e) {
    console.error("Team stats migration failed:", e);
  }


})();

async function runStartupMigrations() {
  // Fix source names
  try {
    const { db } = await import("./db");
    const { sources, deals } = await import("@shared/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    await db.update(sources).set({ name: "Amazon" }).where(eq(sources.id, "amazon-manual"));
    await db.update(sources).set({ name: "DICK'S Sporting Goods" }).where(eq(sources.id, "dicks-sporting-goods"));

    const requiredEqTypes = [
      { id: "bb-batting-gloves", name: "Batting Gloves", sportId: "baseball" },
      { id: "bb-bags", name: "Bat Bags / Equipment Bags", sportId: "baseball" },
      { id: "bb-cleats", name: "Cleats", sportId: "baseball" },
      { id: "bb-drip", name: "Baseball Drip", sportId: "baseball" },
      { id: "bb-care-accessories", name: "Equipment Care & Accessories", sportId: "baseball" },
      { id: "bb-field-equipment", name: "Field Equipment", sportId: "baseball" },
      { id: "fp-batting-gloves", name: "Batting Gloves", sportId: "fastpitch-softball" },
      { id: "fp-bags", name: "Bat Bags / Equipment Bags", sportId: "fastpitch-softball" },
      { id: "fp-cleats", name: "Cleats", sportId: "fastpitch-softball" },
      { id: "fp-care-accessories", name: "Equipment Care & Accessories", sportId: "fastpitch-softball" },
      { id: "fp-field-equipment", name: "Field Equipment", sportId: "fastpitch-softball" },
      { id: "sp-batting-gloves", name: "Batting Gloves", sportId: "slowpitch-softball" },
      { id: "sp-bags", name: "Bat Bags / Equipment Bags", sportId: "slowpitch-softball" },
      { id: "sp-cleats", name: "Cleats", sportId: "slowpitch-softball" },
      { id: "sp-care-accessories", name: "Equipment Care & Accessories", sportId: "slowpitch-softball" },
      { id: "sp-field-equipment", name: "Field Equipment", sportId: "slowpitch-softball" },
      { id: "golf-iron-sets", name: "Iron Sets", sportId: "golf" },
      { id: "golf-drivers", name: "Drivers", sportId: "golf" },
      { id: "golf-irons", name: "Irons", sportId: "golf" },
      { id: "golf-putters", name: "Putters", sportId: "golf" },
      { id: "golf-wedges", name: "Wedges", sportId: "golf" },
      { id: "fb-bags", name: "Bags", sportId: "football" },
      { id: "bk-bags", name: "Bags", sportId: "basketball" },
      { id: "bk-hoops-nets", name: "Hoops/Nets", sportId: "basketball" },
      { id: "soc-bags", name: "Bags", sportId: "soccer" },
      { id: "soc-nets", name: "Nets", sportId: "soccer" },
      { id: "hk-sticks", name: "Sticks", sportId: "hockey" },
      { id: "hk-skates", name: "Skates", sportId: "hockey" },
      { id: "hk-apparel", name: "Apparel", sportId: "hockey" },
      { id: "hk-bags", name: "Bags", sportId: "hockey" },
      { id: "hk-nets", name: "Nets", sportId: "hockey" },
      { id: "lax-sticks", name: "Sticks", sportId: "lacrosse" },
      { id: "lax-balls", name: "Balls", sportId: "lacrosse" },
      { id: "lax-bags", name: "Bags", sportId: "lacrosse" },
      { id: "lax-shoes-apparel", name: "Shoes / Apparel", sportId: "lacrosse" },
      { id: "vb-bags", name: "Bags", sportId: "volleyball" },
      { id: "fish-bags", name: "Bags", sportId: "fishing" },
      { id: "fish-apparel", name: "Apparel", sportId: "fishing" },
      { id: "run-shoes", name: "Shoes", sportId: "running" },
      { id: "run-shorts", name: "Shorts", sportId: "running" },
      { id: "run-socks", name: "Socks", sportId: "running" },
      { id: "run-apparel", name: "Apparel", sportId: "running" },
      { id: "run-watches-tech", name: "Watches / Tech", sportId: "running" },
      { id: "run-hydration", name: "Hydration", sportId: "running" },
      { id: "run-bags", name: "Bags / Vests", sportId: "running" },
      { id: "run-accessories", name: "Accessories", sportId: "running" },
      { id: "run-other", name: "Other", sportId: "running" },
      { id: "ten-rackets", name: "Rackets", sportId: "tennis" },
      { id: "ten-balls", name: "Balls", sportId: "tennis" },
      { id: "ten-bags", name: "Bags", sportId: "tennis" },
      { id: "ten-apparel", name: "Apparel", sportId: "tennis" },
      { id: "ten-shoes", name: "Shoes", sportId: "tennis" },
      { id: "ten-accessories", name: "Accessories", sportId: "tennis" },
      { id: "ten-other", name: "Other", sportId: "tennis" },
      { id: "pkl-paddles", name: "Paddles", sportId: "pickleball" },
      { id: "pkl-balls", name: "Balls", sportId: "pickleball" },
      { id: "pkl-bags", name: "Bags", sportId: "pickleball" },
      { id: "pkl-apparel", name: "Apparel", sportId: "pickleball" },
      { id: "pkl-shoes", name: "Shoes", sportId: "pickleball" },
      { id: "pkl-accessories", name: "Accessories", sportId: "pickleball" },
      { id: "pkl-other", name: "Other", sportId: "pickleball" },
      { id: "bad-rackets", name: "Rackets", sportId: "badminton" },
      { id: "bad-shuttlecocks", name: "Shuttlecocks", sportId: "badminton" },
      { id: "bad-bags", name: "Bags", sportId: "badminton" },
      { id: "bad-apparel", name: "Apparel", sportId: "badminton" },
      { id: "bad-shoes", name: "Shoes", sportId: "badminton" },
      { id: "bad-other", name: "Other", sportId: "badminton" },
      { id: "sqsh-rackets", name: "Rackets", sportId: "squash" },
      { id: "sqsh-balls", name: "Balls", sportId: "squash" },
      { id: "sqsh-bags", name: "Bags", sportId: "squash" },
      { id: "sqsh-apparel", name: "Apparel", sportId: "squash" },
      { id: "sqsh-shoes", name: "Shoes", sportId: "squash" },
      { id: "sqsh-other", name: "Other", sportId: "squash" },
    ];
    await db.execute(sql.raw(`INSERT INTO sports (id, name, user_created) VALUES ('running', 'Running', false) ON CONFLICT (id) DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO sports (id, name, user_created) VALUES ('tennis', 'Tennis', false) ON CONFLICT (id) DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO sports (id, name, user_created) VALUES ('pickleball', 'Pickleball', false) ON CONFLICT (id) DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO sports (id, name, user_created) VALUES ('badminton', 'Badminton', false) ON CONFLICT (id) DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO sports (id, name, user_created) VALUES ('squash', 'Squash', false) ON CONFLICT (id) DO NOTHING`));
    for (const et of requiredEqTypes) {
      await db.execute(sql.raw(`INSERT INTO equipment_types (id, name, sport_id, user_created) VALUES ('${et.id}', '${et.name}', '${et.sportId}', false) ON CONFLICT (id) DO NOTHING`));
    }
    log("Ensured all equipment types exist", "migration");

    const reclassCheck = await db.execute(sql`SELECT count(*) as cnt FROM deals WHERE source_id = 'dicks-sporting-goods' AND equipment_type_id LIKE '%-other' LIMIT 1`);
    const otherCount = Number((reclassCheck as any).rows?.[0]?.cnt ?? (reclassCheck as any)[0]?.cnt ?? 0);
    if (otherCount > 100) {
      log("Running equipment type reclassification migration...", "migration");
      const sportRules: Array<{ sport: string; prefix: string; rules: Array<{ eq: string; patterns: string[] }> }> = [
        { sport: "baseball", prefix: "bb", rules: [
          { eq: "bb-drip", patterns: ["necklace", "chain", "pendant", "rope chain", "sunglasses", "shades", "oakley", "sliding mitt", "sliding glove", "arm sleeve", "compression sleeve", "wristband", "headband", "eye black", "phiten", "titanium necklace", "baseball necklace", "baseball chain"] },
          { eq: "bb-batting-gloves", patterns: ["batting glove"] },
          { eq: "bb-gloves", patterns: ["glove", "mitt"] },
          { eq: "bb-bats", patterns: ["bat ", " bat", "bats", "bbcor"] },
          { eq: "bb-cleats", patterns: ["cleat", "spike"] },
          { eq: "bb-protective", patterns: ["helmet", "chest protector", "shin guard", "face mask", "elbow guard"] },
          { eq: "bb-balls", patterns: ["ball ","balls "] },
          { eq: "bb-bags", patterns: ["bat bag", "equipment bag", "backpack", "duffel"] },
          { eq: "bb-shoes-apparel", patterns: ["shoe", "shoes", "jersey", "pant", "pants", "uniform", "sock", "jacket", "hoodie", "hat ", " hat", "cap ", "belt"] },
          { eq: "bb-training", patterns: ["training", "batting tee", "pitching machine"] },
        ]},
        { sport: "golf", prefix: "golf", rules: [
          { eq: "golf-drivers", patterns: ["driver"] },
          { eq: "golf-iron-sets", patterns: ["iron set", "complete set"] },
          { eq: "golf-putters", patterns: ["putter"] },
          { eq: "golf-wedges", patterns: ["wedge"] },
          { eq: "golf-irons", patterns: ["iron ", " iron", "irons", "hybrid", "fairway wood"] },
          { eq: "golf-balls", patterns: ["golf ball", "dozen"] },
          { eq: "golf-bags", patterns: ["golf bag", "cart bag", "stand bag", "carry bag"] },
          { eq: "golf-shoes-apparel", patterns: ["shoe", "polo", "shirt", "pant", "short", "glove", "hat ", "visor", "jacket"] },
          { eq: "golf-training", patterns: ["training", "rangefinder", "swing"] },
        ]},
        { sport: "football", prefix: "fb", rules: [
          { eq: "fb-protective", patterns: ["helmet", "shoulder pad", "girdle", "glove", "pads", "visor", "face mask"] },
          { eq: "fb-shoes-apparel", patterns: ["cleat", "shoe", "jersey", "pant", "sock"] },
          { eq: "fb-balls", patterns: ["football"] },
          { eq: "fb-training", patterns: ["training", "cone", "agility"] },
        ]},
        { sport: "basketball", prefix: "bk", rules: [
          { eq: "bk-shoes-apparel", patterns: ["shoe", "jersey", "short", "sock"] },
          { eq: "bk-hoops-nets", patterns: ["hoop", "backboard", "net ", "rim "] },
          { eq: "bk-balls", patterns: ["basketball"] },
        ]},
        { sport: "soccer", prefix: "soc", rules: [
          { eq: "soc-shoes-apparel", patterns: ["cleat", "shoe", "boot", "jersey", "glove"] },
          { eq: "soc-balls", patterns: ["ball"] },
          { eq: "soc-protective", patterns: ["shin guard", "shin pad"] },
          { eq: "soc-nets", patterns: ["goal", "net "] },
        ]},
        { sport: "fishing", prefix: "fish", rules: [
          { eq: "fish-rods", patterns: ["rod", "pole"] },
          { eq: "fish-reels", patterns: ["reel"] },
          { eq: "fish-lures-line", patterns: ["lure", "line", "hook", "jig ", "bait", "tackle", "spinner"] },
          { eq: "fish-apparel", patterns: ["wader", "vest"] },
        ]},
        { sport: "fastpitch-softball", prefix: "fp", rules: [
          { eq: "fp-batting-gloves", patterns: ["batting glove"] },
          { eq: "fp-gloves", patterns: ["glove", "mitt"] },
          { eq: "fp-bats", patterns: ["bat ", " bat", "bats", "fastpitch"] },
          { eq: "fp-cleats", patterns: ["cleat", "spike"] },
          { eq: "fp-protective", patterns: ["helmet", "chest protector", "face mask"] },
          { eq: "fp-shoes-apparel", patterns: ["shoe", "jersey", "pant"] },
        ]},
        { sport: "slowpitch-softball", prefix: "sp", rules: [
          { eq: "sp-batting-gloves", patterns: ["batting glove"] },
          { eq: "sp-gloves", patterns: ["glove", "mitt"] },
          { eq: "sp-bats", patterns: ["bat ", " bat", "bats", "slowpitch"] },
          { eq: "sp-cleats", patterns: ["cleat"] },
        ]},
        { sport: "hockey", prefix: "hk", rules: [
          { eq: "hk-sticks", patterns: ["stick"] },
          { eq: "hk-skates", patterns: ["skate"] },
          { eq: "hk-protective", patterns: ["helmet", "glove", "pad"] },
          { eq: "hk-apparel", patterns: ["jersey", "sock", "pant"] },
        ]},
        { sport: "lacrosse", prefix: "lax", rules: [
          { eq: "lax-sticks", patterns: ["stick", "head", "shaft"] },
          { eq: "lax-protective", patterns: ["helmet", "glove", "pad", "goggles"] },
          { eq: "lax-shoes-apparel", patterns: ["cleat", "shoe", "jersey"] },
        ]},
        { sport: "volleyball", prefix: "vb", rules: [
          { eq: "vb-shoes-apparel", patterns: ["shoe", "jersey", "short"] },
          { eq: "vb-balls", patterns: ["volleyball"] },
          { eq: "vb-nets", patterns: ["net "] },
          { eq: "vb-protective", patterns: ["knee pad", "pad"] },
        ]},
      ];

      for (const { sport, prefix, rules } of sportRules) {
        for (const rule of rules) {
          const likeConditions = rule.patterns.map(p => `lower(title) LIKE '%${p}%'`).join(" OR ");
          await db.execute(sql.raw(`UPDATE deals SET equipment_type_id = '${rule.eq}' WHERE sport_id = '${sport}' AND equipment_type_id = '${prefix}-other' AND (${likeConditions})`));
        }
      }
      log("Equipment type reclassification complete", "migration");
    }

    const dripPatterns = ["necklace", "chain", "pendant", "rope chain", "sunglasses", "shades", "oakley", "sliding mitt", "sliding glove", "arm sleeve", "compression sleeve", "wristband", "headband", "eye black", "phiten"];
    const dripWhere = dripPatterns.map(p => `lower(title) LIKE '%${p}%'`).join(" OR ");
    await db.execute(sql.raw(`UPDATE deals SET equipment_type_id = 'bb-drip' WHERE sport_id = 'baseball' AND equipment_type_id IN ('bb-other', 'bb-shoes-apparel', 'bb-protective', 'bb-care-accessories') AND (${dripWhere})`));

    const nonBaseballGloveExclusions = ['golf', 'lacrosse', 'football', 'hockey', 'soccer', 'tennis', 'pickleball', 'boxing', 'ufc', 'mma', 'skiing', 'fleece', 'north face', 'carhartt', 'columbia', 'body board', 'body glove', 'mechanic', 'garden', 'cycling', 'bike', 'snowboard', 'workout', 'weight lift', 'tactical', 'shooting', 'hunt', 'winter', 'outdoor research', 'smartwool', 'seirus', 'gordini', 'spyder', 'hestra', 'dakine', 'burton', 'striker', 'clam outdoor', 'ice fish', 'taylormade', 'titleist', 'callaway', 'footjoy', 'top flite', 'cobra golf', 'srixon', 'ghost golf', 'glove it ', 'warrior ', 'stx ', 'glovelo'];
    const excludeWhere = nonBaseballGloveExclusions.map(k => `lower(title) LIKE '%${k}%'`).join(' OR ');
    const reclassGloves = await db.execute(sql.raw(`UPDATE deals SET equipment_type_id = 'bb-other' WHERE sport_id = 'baseball' AND equipment_type_id = 'bb-gloves' AND (${excludeWhere})`));
    const movedCount = (reclassGloves as any).rowCount ?? (reclassGloves as any).count ?? 0;
    if (movedCount > 0) log(`Moved ${movedCount} non-baseball items out of bb-gloves`, "migration");

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS deal_clicks (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        deal_id VARCHAR NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        source_id VARCHAR,
        sport_id VARCHAR,
        clicked_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS deal_clicks_clicked_at_idx ON deal_clicks(clicked_at)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS deal_clicks_deal_idx ON deal_clicks(deal_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS deal_clicks_user_idx ON deal_clicks(user_id)`));
    log("Ensured deal_clicks table exists", "migration");

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS user_visits (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        session_id VARCHAR NOT NULL,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMP,
        duration_seconds INTEGER,
        pages_viewed INTEGER NOT NULL DEFAULT 1,
        user_agent TEXT,
        ip_hash VARCHAR
      )
    `));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS user_visits_user_idx ON user_visits(user_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS user_visits_started_idx ON user_visits(started_at)`));
    await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS user_visits_session_uniq ON user_visits(session_id)`));
    log("Ensured user_visits table exists", "migration");

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS msrp_lookups (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        brand VARCHAR NOT NULL,
        model VARCHAR NOT NULL,
        sport_id VARCHAR,
        manufacturer_msrp_cents INTEGER,
        confidence VARCHAR(16),
        source_url TEXT,
        ai_response JSONB,
        lookup_count INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS msrp_lookups_brand_model_idx ON msrp_lookups(brand, model)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS msrp_lookups_sport_idx ON msrp_lookups(sport_id)`));
    log("Ensured msrp_lookups table exists", "migration");
  } catch (e) {
    console.error("Source rename / reclassification migration failed:", e);
  }

  // Fix CJ affiliate tracking URLs on existing CJ-sourced deals
  try {
    const { db: cjDb } = await import("./db");
    const { sql: cjSql } = await import("drizzle-orm");
    const cjPid = process.env.CJ_PROPERTY_ID || process.env.CJ_COMPANY_ID || "";
    if (cjPid) {
      const cjSourceIds = [
        'dicks-sporting-goods', 'golf-galaxy', 'academy-sports', 'playbaseball',
        'soccergarage',
        'cj-velocity-outdoor-crosman-benjamin-lasermax-game-face', 'cj-power-systems',
        'cj-alphard-golf', 'cj-easton', 'cj-footjoy',
        'cj-partner-2193092', 'cj-partner-6809508', 'cj-partner-3058605',
        'cj-partner-6668618', 'cj-partner-4942550', 'cj-partner-565703',
        'cj-partner-6530791', 'cj-partner-6130947', 'cj-partner-5178287',
        'cj-partner-7686132', 'cj-partner-7401394', 'cj-partner-6209356',
        'cj-partner-6809515',
      ];
      const sourceList = cjSourceIds.map(s => `'${s}'`).join(',');
      const cjDomains = ['anrdoezrs.net', 'dpbolvw.net', 'jdoqocy.com', 'tkqlhce.com', 'kqzyfj.com'];
      const notLikeClauses = cjDomains.map(d => `url NOT LIKE '%${d}%'`).join(' AND ');
      const updateResult = await cjDb.execute(cjSql.raw(`
        UPDATE deals
        SET url = 'https://www.anrdoezrs.net/links/${cjPid}/type/dlg/' || url
        WHERE source_id IN (${sourceList})
        AND ${notLikeClauses}
        AND url LIKE 'https://%'
      `));
      const rowCount = (updateResult as any).rowCount ?? (updateResult as any).count ?? 0;
      if (rowCount > 0) {
        log(`Fixed CJ tracking URLs on ${rowCount} deals`, "migration");
      }

      const oldPid = "7630058";
      if (cjPid !== oldPid) {
        const fixResult = await cjDb.execute(cjSql.raw(`
          UPDATE deals
          SET url = REPLACE(url, '/links/${oldPid}/', '/links/${cjPid}/')
          WHERE url LIKE '%/links/${oldPid}/%'
        `));
        const fixCount = (fixResult as any).rowCount ?? (fixResult as any).count ?? 0;
        if (fixCount > 0) {
          log(`Migrated ${fixCount} CJ deal URLs from PID ${oldPid} to ${cjPid}`, "migration");
        }
      }
    }
  } catch (e) {
    console.error("CJ URL migration failed:", e);
  }

  try {
    const { db: promoDb } = await import("./db");
    const { sql: promoSql } = await import("drizzle-orm");
    await promoDb.execute(promoSql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_unique_idx ON promo_codes(source, advertiser_name, code)`));
  } catch (e) {
    console.error("Promo codes unique index creation failed:", e);
  }

  // AI classifier dedup: enforce one cache row per signature and one pending
  // review item per deal at the DB level, so overlapping classification runs
  // (multiple instances / future refactor) can never insert duplicates.
  // Applied here as idempotent DDL (NOT via db:push, which would drop the
  // deals.search_vector tsvector column). Pre-dedupe first so index creation
  // cannot fail on any pre-existing duplicate rows.
  try {
    const { db: acDb } = await import("./db");
    const { sql: acSql } = await import("drizzle-orm");
    // Collapse duplicate signatures down to the most-recently-updated row.
    await acDb.execute(acSql.raw(`
      DELETE FROM ai_classifications a
      USING ai_classifications b
      WHERE a.signature = b.signature
        AND (a.updated_at, a.id) < (b.updated_at, b.id)
    `));
    await acDb.execute(acSql.raw(`DROP INDEX IF EXISTS ai_classifications_signature_idx`));
    await acDb.execute(acSql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ai_classifications_signature_idx ON ai_classifications (signature)`));
    // Collapse duplicate pending review items down to the newest per deal.
    await acDb.execute(acSql.raw(`
      DELETE FROM classification_review_queue a
      USING classification_review_queue b
      WHERE a.status = 'pending' AND b.status = 'pending'
        AND a.deal_id IS NOT NULL AND a.deal_id = b.deal_id
        AND (a.created_at, a.id) < (b.created_at, b.id)
    `));
    await acDb.execute(acSql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS classification_review_pending_deal_idx ON classification_review_queue (deal_id) WHERE status = 'pending'`));
    log("Ensured AI classification dedup constraints", "migration");
  } catch (e) {
    console.error("AI classification dedup constraint creation failed:", e);
  }

  try {
    const { db: ppDb } = await import("./db");
    const { sql: ppSql } = await import("drizzle-orm");
    await ppDb.execute(ppSql.raw(`
      CREATE TABLE IF NOT EXISTS popular_products (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        sport VARCHAR(100) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `));
    log("Ensured popular_products table exists", "migration");
    await ppDb.execute(ppSql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS popular_products_slug_unique ON popular_products (slug)`));
    log("Ensured popular_products slug uniqueness index", "migration");
  } catch (e) {
    console.error("Popular products table creation failed:", e);
  }

  // Deals: drop_weight / size_number derived attribute columns
  try {
    const { db: dwDb } = await import("./db");
    const { sql: dwSql } = await import("drizzle-orm");
    await dwDb.execute(dwSql.raw(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS drop_weight INTEGER`));
    // size_number was originally INTEGER (capped at single-digit ball sizes), but real-world
    // sizes include decimals like 11.5" glove or 12.75" — now stored as VARCHAR(20).
    await dwDb.execute(dwSql.raw(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS size_number VARCHAR(20)`));
    await dwDb.execute(dwSql.raw(`ALTER TABLE deals ALTER COLUMN size_number TYPE VARCHAR(20) USING size_number::text`));
    await dwDb.execute(dwSql.raw(`CREATE INDEX IF NOT EXISTS deals_drop_weight_idx ON deals (drop_weight) WHERE drop_weight IS NOT NULL`));
    await dwDb.execute(dwSql.raw(`CREATE INDEX IF NOT EXISTS deals_size_number_idx ON deals (size_number) WHERE size_number IS NOT NULL`));
    log("Ensured deals.drop_weight / deals.size_number columns", "migration");
  } catch (e) {
    console.error("drop_weight / size_number column creation failed:", e);
  }

  // Deals: multi-sub-filter join table. A deal can be tagged with multiple
  // sub-filters at once. deals.sub_filter_id remains the "primary" (first) tag
  // and is kept in sync by the upsert layer so legacy single-tag URLs and the
  // "untagged" admin count stay correct.
  try {
    const { db: msfDb } = await import("./db");
    const { sql: msfSql } = await import("drizzle-orm");
    await msfDb.execute(msfSql.raw(`
      CREATE TABLE IF NOT EXISTS deal_sub_filters (
        deal_id        VARCHAR NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        sub_filter_id  VARCHAR NOT NULL REFERENCES equipment_sub_filters(id) ON DELETE CASCADE,
        PRIMARY KEY (deal_id, sub_filter_id)
      )
    `));
    await msfDb.execute(msfSql.raw(`
      CREATE INDEX IF NOT EXISTS deal_sub_filters_sub_idx
        ON deal_sub_filters (sub_filter_id)
    `));
    // Idempotent backfill: every non-null sub_filter_id on deals seeds a row.
    await msfDb.execute(msfSql.raw(`
      INSERT INTO deal_sub_filters (deal_id, sub_filter_id)
      SELECT id, sub_filter_id FROM deals
      WHERE sub_filter_id IS NOT NULL
      ON CONFLICT (deal_id, sub_filter_id) DO NOTHING
    `));
    log("Ensured deal_sub_filters join table (multi-tag)", "migration");
  } catch (e) {
    console.error("deal_sub_filters table creation failed:", e);
  }

  // A2P 10DLC status events table
  try {
    const { db: a2pDb } = await import("./db");
    const { sql: a2pSql } = await import("drizzle-orm");
    await a2pDb.execute(a2pSql.raw(`
      CREATE TABLE IF NOT EXISTS a2p_status_events (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR NOT NULL,
        resource_sid VARCHAR,
        status VARCHAR,
        failure_reason TEXT,
        payload JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `));
    log("Ensured a2p_status_events table exists", "migration");
  } catch (e) {
    console.error("A2P status events table creation failed:", e);
  }

  // Hidden deals table
  try {
    const { db: hdDb } = await import("./db");
    const { sql: hdSql } = await import("drizzle-orm");
    await hdDb.execute(hdSql.raw(`
      CREATE TABLE IF NOT EXISTS hidden_deals (
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        deal_id VARCHAR NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        hidden_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, deal_id)
      )
    `));
    log("Ensured hidden_deals table exists", "migration");
  } catch (e) {
    console.error("Hidden deals table creation failed:", e);
  }

  // Clean up duplicate / obsolete sources
  try {
    const { db: cleanSrcDb } = await import("./db");
    const { sql: cleanSrcSql } = await import("drizzle-orm");
    // Remove stale duplicate sources that appeared in production — move any deals to baseball-resale first
    await cleanSrcDb.execute(cleanSrcSql.raw(`UPDATE deals SET source_id = 'baseball-resale' WHERE source_id IN ('baseball-resale-nunn', 'baseball-desale')`));
    await cleanSrcDb.execute(cleanSrcSql.raw(`DELETE FROM sources WHERE id IN ('baseball-resale-nunn', 'baseball-desale')`));
    // Update baseball-resale to use the public-facing domain
    await cleanSrcDb.execute(cleanSrcSql.raw(`UPDATE sources SET base_url = 'https://nunnbaseball.shop' WHERE id = 'baseball-resale'`));
    log("Cleaned up obsolete baseball sources", "migration");
  } catch (e) {
    console.error("Baseball source cleanup failed:", e);
  }

  // New columns: last_price_confirmed_at and search_vector
  // These must be added BEFORE slow index building to avoid race conditions with deal sync
  try {
    const { db: colDb } = await import("./db");
    const { sql: colSql } = await import("drizzle-orm");

    await colDb.execute(colSql.raw(`
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS last_price_confirmed_at timestamp
    `));
    // Backfill with last_seen_at for any existing rows that don't have it
    await colDb.execute(colSql.raw(`
      UPDATE deals SET last_price_confirmed_at = last_seen_at
      WHERE id IN (
        SELECT id FROM deals
        WHERE last_price_confirmed_at IS NULL AND last_seen_at IS NOT NULL
        LIMIT 10000
      )
    `));

    await colDb.execute(colSql.raw(`
      ALTER TABLE deals ADD COLUMN IF NOT EXISTS search_vector tsvector
    `));

    log("New deal columns ensured (last_price_confirmed_at, search_vector)", "migration");
  } catch (e) {
    console.error("New deal column migration failed:", e);
  }

  // Search performance indexes
  try {
    const { db: idxDb } = await import("./db");
    const { sql: idxSql } = await import("drizzle-orm");

    // Fast B-tree indexes (quick to build)
    await idxDb.execute(idxSql.raw(`CREATE INDEX IF NOT EXISTS deals_last_seen_at_idx ON deals (last_seen_at)`));
    await idxDb.execute(idxSql.raw(`CREATE INDEX IF NOT EXISTS deals_sport_equip_idx ON deals (sport_id, equipment_type_id)`));
    await idxDb.execute(idxSql.raw(`CREATE INDEX IF NOT EXISTS deals_source_sport_idx ON deals (source_id, sport_id)`));
    await idxDb.execute(idxSql.raw(`CREATE INDEX IF NOT EXISTS deals_condition_idx ON deals (condition)`));
    // Composite for the most common filter combo: sport + equipment + discount
    await idxDb.execute(idxSql.raw(
      `CREATE INDEX IF NOT EXISTS deals_sport_equip_pct_idx ON deals (sport_id, equipment_type_id, percent_off DESC NULLS LAST) WHERE percent_off IS NOT NULL`
    ));

    // GIN trigram indexes for fast ILIKE text search (may take a minute on large tables)
    await idxDb.execute(idxSql.raw(`CREATE EXTENSION IF NOT EXISTS pg_trgm`));
    await idxDb.execute(idxSql.raw(`CREATE INDEX IF NOT EXISTS deals_title_trgm_idx ON deals USING gin (title gin_trgm_ops)`));
    await idxDb.execute(idxSql.raw(`CREATE INDEX IF NOT EXISTS deals_brand_trgm_idx ON deals USING gin (brand gin_trgm_ops)`));

    // GIN FTS index for full-text search ranking
    await idxDb.execute(idxSql.raw(`CREATE INDEX IF NOT EXISTS deals_fts_idx ON deals USING GIN (search_vector)`));

    log("Search performance indexes ensured", "migration");
  } catch (e) {
    console.error("Search index creation failed:", e);
  }

  // Backfill search_vector for existing deals (batched to avoid long locks)
  try {
    const { db: ftsDb } = await import("./db");
    const { sql: ftsSql } = await import("drizzle-orm");
    const result = await ftsDb.execute(ftsSql.raw(`
      UPDATE deals
      SET search_vector = to_tsvector('english',
        coalesce(title, '') || ' ' || coalesce(brand, '')
      )
      WHERE id IN (
        SELECT id FROM deals WHERE search_vector IS NULL LIMIT 10000
      )
    `));
    const populated = (result as any).rowCount ?? 0;
    if (populated > 0) log(`FTS search_vector backfilled for ${populated} deals`, "migration");
  } catch (e) {
    console.error("FTS search_vector backfill failed:", e);
  }

  // Stale deal cleanup (batched to avoid locking)
  try {
    const { db: cleanDb } = await import("./db");
    const { sql: cleanSql } = await import("drizzle-orm");
    let totalCleaned = 0;
    const batchSize = 10000;
    const maxBatches = 20;

    let deleted = 0;
    let batches = 0;
    do {
      const mktResult = await cleanDb.execute(cleanSql.raw(`
        DELETE FROM deals WHERE id IN (
          SELECT id FROM deals
          WHERE source_id IN ('ebay', 'sidelineswap')
          AND last_seen_at < NOW() - INTERVAL '7 days'
          LIMIT ${batchSize}
        )
      `));
      deleted = (mktResult as any).rowCount ?? 0;
      totalCleaned += deleted;
      batches++;
      if (deleted > 0) log(`Deleted batch of ${deleted} stale marketplace deals (>7d)`, "migration");
    } while (deleted >= batchSize && batches < maxBatches);

    batches = 0;
    do {
      const otherResult = await cleanDb.execute(cleanSql.raw(`
        DELETE FROM deals WHERE id IN (
          SELECT id FROM deals
          WHERE source_id NOT IN ('ebay', 'sidelineswap')
          AND last_seen_at < NOW() - INTERVAL '14 days'
          LIMIT ${batchSize}
        )
      `));
      deleted = (otherResult as any).rowCount ?? 0;
      totalCleaned += deleted;
      batches++;
      if (deleted > 0) log(`Deleted batch of ${deleted} stale retailer deals (>14d)`, "migration");
    } while (deleted >= batchSize && batches < maxBatches);

    if (totalCleaned > 0) {
      log(`Startup stale deal cleanup complete: ${totalCleaned} deals removed`, "migration");
    }
  } catch (e) {
    console.error("Stale deal cleanup failed:", e);
  }

  // Seed eBay sellers if missing
  try {
    const { storage } = await import("./storage");
    const existingSellers = await storage.listEbaySellers();
    const existingUsernames = new Set(existingSellers.map(s => s.username.toLowerCase()));
    const seedSellers = [
      "120290", "208_gloves_and_mitts", "2nd String Sports", "AAA Japan Edo Store",
      "ball-gloves", "BaseballExpress/TeamExpress", "baseballsoftballworld",
      "Bases Loaded Sporting Goods", "Better Baseball", "BKs Cards and Gear",
      "bomber21", "boston21notsob12", "Cargo Largo", "Casepros by ProTech Products Inc",
      "cameron_1981", "car23_44", "cw-gloveworks", "floridasportsandmoresuperstore",
      "Fun100Japan", "Game On Closeouts", "gimmedaloot209", "GLAFT JAPAN",
      "Glove Reviver and Son Vintage Shop", "gudbuyz777", "Headbanger Sports",
      "JAPAN BASEBALL SAZHAI777", "JapanPicks", "joval1227", "Jstews Odds and Ins",
      "JustBats", "kelsiv_17", "Kenja Games2", "mcgloven", "MILO'S SHOP 956",
      "milocoman", "mmvitch", "National Product Sales", "NIHONGANGUTEN YOPPY",
      "nunnbaseballco", "Peligro Sports", "Restore_Retro_Toys&Games", "rickrubi_2",
      "savvywholesales", "sdw2002musicmusic", "Smash It Sports", "spo.plus",
      "sports-and-things", "SportsXchange", "TACHINO BASEBALL MARKET", "techrecommerce",
      "thidpanyap-0", "Time To Move On Collectibles", "TopQualityBrandsInc",
      "TunnelVision 916", "turn2baseball", "viper24baseball", "VirtualDealz2000",
      "Zoo City Deals", "jdees82", "malar-2365", "mzdeals832", "orometaco0",
      "outpost_14", "pete_han_solo_11", "yardleysports", "ymkmkrz", "yourglovedealer",
      "yualv-66", "zackattack10255", "discountture", "ultimatesportsllc",
    ];
    let added = 0;
    for (const username of seedSellers) {
      if (!existingUsernames.has(username.toLowerCase())) {
        try {
          await storage.createEbaySeller(username);
          added++;
        } catch {}
      }
    }
    if (added > 0) console.log(`[seed] Added ${added} eBay sellers`);
  } catch (e) {
    console.error("[seed] eBay sellers seed failed:", e);
  }

  // Backfill percent_off using enriched pricing logic (MSRP → historical high) for all deals.
  // Run non-blocking so it doesn't delay startup; logs progress when done.
  try {
    const { storage: st } = await import("./storage");
    const updated = await st.recalculateDealDiscounts();
    console.log(`[discount-recalc] Startup recalculation complete — ${updated} deals updated`);
  } catch (e) {
    console.error("[discount-recalc] Startup recalculation failed:", e);
  }
}
