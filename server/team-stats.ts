import type { Express, RequestHandler } from "express";
import { z } from "zod";
import crypto from "crypto";
import { promisify } from "util";
import OpenAI from "openai";
import sgMail from "@sendgrid/mail";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}
import { and, asc, desc, eq, inArray, sql as dsql } from "drizzle-orm";
import { db } from "./db";
import {
  bbTeams,
  bbPlayers,
  bbGames,
  bbPlayerGame,
  bbPlayerFielding,
  bbTeamFielding,
  bbCoachPollResponses,
  bbTeamAdmins,
  type BbTeam,
  type BbPlayer,
  type BbGame,
  type BbPlayerGame,
  type BbPlayerFielding,
  type BbCoachPollResponse,
  type BbTeamAdmin,
} from "@shared/schema";

const defaultTeamStatsDatabase = db;

const scryptAsync = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const SESSION_DAYS = 30;
const KNOX_SLUG = "stars7u";
const KNOX_NAME = "Knox Stars 7U";
// Bootstrap password: prefer env var; falls back to a temporary default the
// owner can change via the admin "change password" endpoint.
const KNOX_PASSWORD_DEFAULT = process.env.BB_KNOX_PASSWORD ?? "knoxstars7u";
// ERA / K-rate normalize to 9 innings (industry standard) for consistency.
const ERA_INNINGS_BASIS = 9;

// ---------------------------------------------------------------------------
// Schema migration + seed
// ---------------------------------------------------------------------------

export async function ensureTeamStatsSchema(database?: any): Promise<void> {
  const db = database ?? defaultTeamStatsDatabase;
  await db.execute(dsql.raw(`
    CREATE TABLE IF NOT EXISTS bb_teams (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(100) NOT NULL UNIQUE,
      name TEXT NOT NULL,
      season VARCHAR(50),
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await db.execute(dsql.raw(`
    CREATE TABLE IF NOT EXISTS bb_players (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id VARCHAR NOT NULL REFERENCES bb_teams(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      jersey_number VARCHAR(10),
      position VARCHAR(20),
      active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await db.execute(dsql.raw(`CREATE INDEX IF NOT EXISTS bb_players_team_idx ON bb_players(team_id)`));
  await db.execute(dsql.raw(`
    CREATE TABLE IF NOT EXISTS bb_games (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id VARCHAR NOT NULL REFERENCES bb_teams(id) ON DELETE CASCADE,
      game_date TIMESTAMP NOT NULL,
      opponent TEXT NOT NULL,
      location TEXT,
      our_score INTEGER,
      opp_score INTEGER,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await db.execute(dsql.raw(`CREATE INDEX IF NOT EXISTS bb_games_team_date_idx ON bb_games(team_id, game_date)`));
  // Season tag on each game (idempotent). Backfill anything pre-existing to
  // "Spring 2026" — the only season we've tracked so far — then enforce NOT NULL
  // with a default so future inserts always carry a value.
  await db.execute(dsql.raw(`
    ALTER TABLE bb_games ADD COLUMN IF NOT EXISTS season VARCHAR(50)
  `));
  await db.execute(dsql.raw(`
    UPDATE bb_games SET season = 'Spring 2026' WHERE season IS NULL OR season = ''
  `));
  await db.execute(dsql.raw(`
    ALTER TABLE bb_games ALTER COLUMN season SET DEFAULT 'Spring 2026'
  `));
  await db.execute(dsql.raw(`
    ALTER TABLE bb_games ALTER COLUMN season SET NOT NULL
  `));
  await db.execute(dsql.raw(`CREATE INDEX IF NOT EXISTS bb_games_team_season_idx ON bb_games(team_id, season)`));
  // Normalize the team's stored current season to "Spring 2026" if it's still
  // the legacy bare-year value.
  await db.execute(dsql.raw(`UPDATE bb_teams SET season = 'Spring 2026' WHERE season IN ('2026', '') OR season IS NULL`));
  await db.execute(dsql.raw(`
    CREATE TABLE IF NOT EXISTS bb_player_game (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id VARCHAR NOT NULL REFERENCES bb_games(id) ON DELETE CASCADE,
      player_id VARCHAR NOT NULL REFERENCES bb_players(id) ON DELETE CASCADE,
      ab INTEGER, r INTEGER, h INTEGER,
      doubles INTEGER, triples INTEGER, hr INTEGER,
      bb INTEGER, k INTEGER, sb INTEGER, sac INTEGER, rbi INTEGER,
      po INTEGER, a INTEGER, e INTEGER,
      pitching_outs INTEGER, pc INTEGER, p_bb INTEGER,
      so INTEGER, p_h INTEGER, p_r INTEGER, er INTEGER,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await db.execute(dsql.raw(`CREATE INDEX IF NOT EXISTS bb_player_game_game_idx ON bb_player_game(game_id)`));
  await db.execute(dsql.raw(`CREATE INDEX IF NOT EXISTS bb_player_game_player_idx ON bb_player_game(player_id)`));
  // Add source column (idempotent) so existing rows default to 'manual'.
  await db.execute(dsql.raw(`
    ALTER TABLE bb_player_game
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'
  `));
  // Heal bb_player_game_uniq if it's the wrong shape. Drop when:
  //   (a) it isn't unique, OR
  //   (b) it doesn't include the source column.
  // Then (re)create as a UNIQUE index on (game_id, player_id, source).
  await db.execute(dsql.raw(`
    DO $$
    DECLARE
      idx_exists BOOLEAN;
      is_unique BOOLEAN;
      has_source BOOLEAN;
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'bb_player_game_uniq'
      ) INTO idx_exists;
      IF idx_exists THEN
        SELECT i.indisunique INTO is_unique
          FROM pg_index i
          JOIN pg_class c ON c.oid = i.indexrelid
          WHERE c.relname = 'bb_player_game_uniq';
        SELECT EXISTS (
          SELECT 1 FROM pg_index i
          JOIN pg_class c ON c.oid = i.indexrelid
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE c.relname = 'bb_player_game_uniq' AND a.attname = 'source'
        ) INTO has_source;
        IF (NOT is_unique) OR (NOT has_source) THEN
          EXECUTE 'DROP INDEX bb_player_game_uniq';
        END IF;
      END IF;
    END $$;
  `));
  await db.execute(dsql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS bb_player_game_uniq ON bb_player_game(game_id, player_id, source)`));
  // v2 scorebook template columns — idempotent, additive only.
  await db.execute(dsql.raw(`ALTER TABLE bb_games ADD COLUMN IF NOT EXISTS game_time TEXT`));
  await db.execute(dsql.raw(`ALTER TABLE bb_games ADD COLUMN IF NOT EXISTS our_home_visitor VARCHAR(10)`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS singles INTEGER`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS swing_k INTEGER`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS looking_k INTEGER`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS pitches_seen INTEGER`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS reached_base INTEGER`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS fc INTEGER`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS roe INTEGER`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS hbp INTEGER`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS summary TEXT`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS comments TEXT`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS position VARCHAR(10)`));
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS starting_position VARCHAR(10)`));
  // Per-game batting-order (lineup spot). Additive, nullable.
  await db.execute(dsql.raw(`ALTER TABLE bb_player_game ADD COLUMN IF NOT EXISTS batting_order INTEGER`));
  // Per-position fielding detail. Additive: a player can log PO/A/E at each
  // position they played. The "By Position" view reads this; when a (game,
  // player, source) has no detail rows, it falls back to the single
  // (position, po, a, e) cached on bb_player_game — so no backfill is required.
  await db.execute(dsql.raw(`
    CREATE TABLE IF NOT EXISTS bb_player_fielding (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id VARCHAR NOT NULL REFERENCES bb_games(id) ON DELETE CASCADE,
      player_id VARCHAR NOT NULL REFERENCES bb_players(id) ON DELETE CASCADE,
      position VARCHAR(10) NOT NULL,
      po INTEGER, a INTEGER, e INTEGER,
      source VARCHAR(20) NOT NULL DEFAULT 'manual',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await db.execute(dsql.raw(`CREATE INDEX IF NOT EXISTS bb_player_fielding_game_idx ON bb_player_fielding(game_id)`));
  await db.execute(dsql.raw(`CREATE INDEX IF NOT EXISTS bb_player_fielding_player_idx ON bb_player_fielding(player_id)`));
  await db.execute(dsql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS bb_player_fielding_uniq ON bb_player_fielding(game_id, player_id, position, source)`));
  // Team-level fielding by position (no player attached). Combined with the
  // per-player fielding in the "By Position" view. Additive; one row per
  // (game, position, source).
  await db.execute(dsql.raw(`
    CREATE TABLE IF NOT EXISTS bb_team_fielding (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id VARCHAR NOT NULL REFERENCES bb_games(id) ON DELETE CASCADE,
      position VARCHAR(10) NOT NULL,
      po INTEGER, a INTEGER, e INTEGER,
      source VARCHAR(20) NOT NULL DEFAULT 'manual',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await db.execute(dsql.raw(`CREATE INDEX IF NOT EXISTS bb_team_fielding_game_idx ON bb_team_fielding(game_id)`));
  await db.execute(dsql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS bb_team_fielding_uniq ON bb_team_fielding(game_id, position, source)`));
  // Coach poll responses (one row per team + coach role).
  await db.execute(dsql.raw(`
    CREATE TABLE IF NOT EXISTS bb_coach_poll_responses (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id VARCHAR NOT NULL REFERENCES bb_teams(id) ON DELETE CASCADE,
      coach_role VARCHAR(40) NOT NULL,
      submitted_name TEXT NOT NULL,
      rankings JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  // The poll is now open to anyone with team-page access. Coaches matching the
  // hard-coded roster are tagged `is_coach = true` and deduped by role;
  // everyone else is `is_coach = false` and deduped by submitted name.
  // Idempotent migration:
  //   1. Add `is_coach` (default true — pre-existing rows are coaches).
  //   2. Drop the legacy strict NOT NULL on coach_role.
  //   3. Replace the old simple unique index with two partial unique indexes.
  await db.execute(dsql.raw(`
    ALTER TABLE bb_coach_poll_responses ADD COLUMN IF NOT EXISTS is_coach BOOLEAN NOT NULL DEFAULT true
  `));
  await db.execute(dsql.raw(`
    ALTER TABLE bb_coach_poll_responses ALTER COLUMN coach_role DROP NOT NULL
  `));
  await db.execute(dsql.raw(`DROP INDEX IF EXISTS bb_coach_poll_team_role_uniq`));
  await db.execute(dsql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS bb_coach_poll_team_role_uniq
    ON bb_coach_poll_responses(team_id, coach_role)
    WHERE is_coach = true
  `));
  await db.execute(dsql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS bb_coach_poll_team_name_uniq
    ON bb_coach_poll_responses(team_id, lower(submitted_name))
    WHERE is_coach = false
  `));
  await db.execute(dsql.raw(`CREATE INDEX IF NOT EXISTS bb_coach_poll_team_idx ON bb_coach_poll_responses(team_id)`));
  // One-time scale flip: the original poll stored 1 = best / 5 = worst. We
  // flipped it so 5 = best / 1 = worst (more intuitive). The `scale_flipped`
  // column is a per-row idempotency marker so this migration runs exactly
  // once per existing response, even across server restarts.
  await db.execute(dsql.raw(`
    ALTER TABLE bb_coach_poll_responses ADD COLUMN IF NOT EXISTS scale_flipped BOOLEAN NOT NULL DEFAULT FALSE
  `));
  await db.execute(dsql.raw(`
    UPDATE bb_coach_poll_responses
    SET rankings = (
      SELECT jsonb_object_agg(
        key,
        jsonb_build_object(
          'speed', 6 - COALESCE((value->>'speed')::int, 3),
          'brIQ',  6 - COALESCE((value->>'brIQ')::int, 3)
        )
      )
      FROM jsonb_each(rankings)
    ),
    scale_flipped = TRUE
    WHERE scale_flipped = FALSE
  `));
  // New rows from the updated UI are already on the new scale, so mark them
  // flipped on insert so we never double-invert them on a future restart.
  await db.execute(dsql.raw(`
    ALTER TABLE bb_coach_poll_responses ALTER COLUMN scale_flipped SET DEFAULT TRUE
  `));
  // Team-level admin grants (grants admin access to non-TSS users by email).
  await db.execute(dsql.raw(`
    CREATE TABLE IF NOT EXISTS bb_team_admins (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id VARCHAR NOT NULL REFERENCES bb_teams(id) ON DELETE CASCADE,
      email VARCHAR(200) NOT NULL,
      granted_by_email VARCHAR(200),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));
  await db.execute(dsql.raw(`CREATE INDEX IF NOT EXISTS bb_team_admins_team_idx ON bb_team_admins(team_id)`));
  await db.execute(dsql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS bb_team_admins_team_email_uniq
    ON bb_team_admins(team_id, lower(email))
  `));

  // Assertion: refuse to start if uniqueness on (game_id, player_id, source) isn't in place.
  const check = await db.execute(dsql.raw(`
    SELECT i.indisunique AS is_unique
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'bb_player_game_uniq'
  `));
  const row = (check as any).rows?.[0];
  if (!row || row.is_unique !== true) {
    throw new Error("bb_player_game_uniq is missing or not unique after migration");
  }
  // Assertion: the team-admin case-insensitive uniqueness must really be unique.
  // Drizzle's index() builder can't express a functional unique index, so if a
  // non-unique sibling with the same name ever crept in, the admin grant table
  // would silently allow duplicate emails per team. Fail fast instead.
  const adminCheck = await db.execute(dsql.raw(`
    SELECT i.indisunique AS is_unique
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'bb_team_admins_team_email_uniq'
  `));
  const adminRow = (adminCheck as any).rows?.[0];
  if (!adminRow || adminRow.is_unique !== true) {
    throw new Error("bb_team_admins_team_email_uniq is missing or not unique after migration");
  }
}

async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return { hash: buf.toString("hex"), salt };
}

async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const buf = await scryptAsync(password, salt, 64);
  const target = Buffer.from(hash, "hex");
  if (buf.length !== target.length) return false;
  return crypto.timingSafeEqual(buf, target);
}

export async function seedKnoxStarsTeam(database?: any): Promise<void> {
  const db = database ?? defaultTeamStatsDatabase;
  // Legacy slug correction is maintenance, not seed work. Startup may create
  // the one approved team on a genuinely empty database, but never rewrites an
  // existing team record.
  const existing = await db.select().from(bbTeams).where(eq(bbTeams.slug, KNOX_SLUG)).limit(1);
  if (existing[0]) return;
  const { hash, salt } = await hashPassword(KNOX_PASSWORD_DEFAULT);
  await db.insert(bbTeams).values({
    slug: KNOX_SLUG,
    name: KNOX_NAME,
    season: "Spring 2026",
    passwordHash: hash,
    passwordSalt: salt,
  });
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function getTeamAccessMap(req: any): Record<string, number> {
  return (req.session?.bbTeamAccess as Record<string, number> | undefined) ?? {};
}

function setTeamAccess(req: any, teamId: string): void {
  if (!req.session) return;
  const map = getTeamAccessMap(req);
  map[teamId] = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  req.session.bbTeamAccess = map;
}

function hasTeamAccess(req: any, teamId: string): boolean {
  const map = getTeamAccessMap(req);
  const expiresAt = map[teamId];
  return typeof expiresAt === "number" && expiresAt > Date.now();
}

function getReqEmail(req: any): string | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) return null;
  const email = req.user?.magicLink ? req.user.email : req.user?.claims?.email;
  return typeof email === "string" && email.length > 0 ? email.toLowerCase() : null;
}

function isTssAdmin(req: any): boolean {
  return getReqEmail(req) === "justin@twinseamsports.com";
}

// Same-origin guard for paid OpenAI endpoints. Returns false (and writes a
// 403 response) if the request looks cross-origin; routes should `return` on
// false. Cookie auth alone is CSRF-prone, so we additionally require the
// Origin/Referer host to match the request Host.
function enforceSameOrigin(req: any, res: any): boolean {
  const origin = req.get("origin") || req.get("referer") || "";
  const host = req.get("host") || "";
  if (!origin) {
    res.status(403).json({ message: "Missing Origin/Referer" });
    return false;
  }
  try {
    const u = new URL(origin);
    if (host && u.host !== host) {
      res.status(403).json({ message: "Cross-origin request blocked" });
      return false;
    }
  } catch {
    res.status(403).json({ message: "Invalid Origin/Referer" });
    return false;
  }
  return true;
}

// True if the requester is the TSS admin OR has been granted admin access
// for this specific team via the bb_team_admins table (matched on email,
// case-insensitive).
async function isTeamAdminForRequest(req: any, teamId: string): Promise<boolean> {
  if (isTssAdmin(req)) return true;
  const email = getReqEmail(req);
  if (!email) return false;
  const rows = await db
    .select({ id: bbTeamAdmins.id })
    .from(bbTeamAdmins)
    .where(and(eq(bbTeamAdmins.teamId, teamId), dsql`lower(${bbTeamAdmins.email}) = ${email}`))
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Stat math
// ---------------------------------------------------------------------------

export interface AggregateStats {
  games: number;
  pa: number; ab: number; r: number; h: number;
  singles: number; doubles: number; triples: number; hr: number;
  bb: number; k: number; sb: number; sac: number; rbi: number;
  hbp: number; fc: number; roe: number;
  tb: number;
  // Reached Base = H + BB + HBP + ROE + FC (any-way-on-base, includes errors
  // and fielder's choice). RB% = RB / PA. Distinct from OBP, which is the
  // official rulebook stat and excludes ROE/FC.
  rb: number;
  rbPct: number | null;
  avg: number | null; obp: number | null; slg: number | null; ops: number | null;
  // Advanced offensive (all gated on sufficient data; null when undefined):
  iso: number | null;       // Isolated Power = SLG − AVG
  babip: number | null;     // (H − HR) / (officialAB − K − HR)
  bbRate: number | null;    // BB / PA
  kRate: number | null;     // K / PA
  xbh: number;              // 2B + 3B + HR
  xbhRate: number | null;   // XBH / H
  secAvg: number | null;    // (TB − H + BB + SB) / officialAB (Bill James secondary average)
  po: number; a: number; e: number; fpct: number | null;
  pitchingOuts: number; ipDecimal: number; ipDisplay: string;
  pc: number; pBb: number; so: number; pH: number; pR: number; er: number;
  era: number | null; whip: number | null; kPer9: number | null;
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}

export function aggregate(rows: BbPlayerGame[]): AggregateStats {
  const a: AggregateStats = {
    games: rows.length,
    pa: 0, ab: 0, r: 0, h: 0,
    singles: 0, doubles: 0, triples: 0, hr: 0,
    bb: 0, k: 0, sb: 0, sac: 0, rbi: 0,
    hbp: 0, fc: 0, roe: 0,
    tb: 0,
    rb: 0, rbPct: null,
    avg: null, obp: null, slg: null, ops: null,
    iso: null, babip: null, bbRate: null, kRate: null,
    xbh: 0, xbhRate: null, secAvg: null,
    po: 0, a: 0, e: 0, fpct: null,
    pitchingOuts: 0, ipDecimal: 0, ipDisplay: "0.0",
    pc: 0, pBb: 0, so: 0, pH: 0, pR: 0, er: 0,
    era: null, whip: null, kPer9: null,
  };
  for (const r of rows) {
    a.ab += num(r.ab); a.r += num(r.r); a.h += num(r.h);
    a.doubles += num(r.doubles); a.triples += num(r.triples); a.hr += num(r.hr);
    a.bb += num(r.bb); a.k += num(r.k); a.sb += num(r.sb);
    a.sac += num(r.sac); a.rbi += num(r.rbi);
    a.hbp += num(r.hbp); a.fc += num(r.fc); a.roe += num(r.roe);
    a.po += num(r.po); a.a += num(r.a); a.e += num(r.e);
    a.pitchingOuts += num(r.pitchingOuts);
    a.pc += num(r.pc); a.pBb += num(r.pBb); a.so += num(r.so);
    a.pH += num(r.pH); a.pR += num(r.pR); a.er += num(r.er);
  }
  a.singles = Math.max(0, a.h - a.doubles - a.triples - a.hr);
  a.tb = a.singles + 2 * a.doubles + 3 * a.triples + 4 * a.hr;
  a.xbh = a.doubles + a.triples + a.hr;
  // Convention: stored `ab` is the raw scorebook total of plate appearances
  // (walks, sacrifices, HBP, SF are NOT subtracted by the scorer).
  // For rate stats we derive the official AB = PA − BB − SAC − HBP. SF is
  // collapsed into the single SAC column on this team's scorebook (sac bunt +
  // sac fly are not separated), so the OBP denominator simplifies to PA.
  // Reached Base (RB) = H + BB + HBP + ROE + FC — any-way-on-base.
  a.pa = a.ab;
  const officialAb = Math.max(0, a.ab - a.bb - a.sac - a.hbp);
  if (officialAb > 0) a.avg = a.h / officialAb;
  // Official OBP: (H + BB + HBP) / (AB + BB + HBP + SF). With AB-as-PA and SF
  // merged into SAC, the denominator = officialAb + BB + HBP + SAC = PA.
  if (a.pa > 0) a.obp = (a.h + a.bb + a.hbp) / a.pa;
  if (officialAb > 0) a.slg = a.tb / officialAb;
  a.rb = a.h + a.bb + a.hbp + a.roe + a.fc;
  if (a.pa > 0) a.rbPct = a.rb / a.pa;
  if (a.avg !== null && a.obp !== null && a.slg !== null) a.ops = a.obp + a.slg;
  // Advanced offensive metrics.
  if (a.avg !== null && a.slg !== null) a.iso = a.slg - a.avg;
  const babipDenom = officialAb - a.k - a.hr;
  if (babipDenom > 0) a.babip = (a.h - a.hr) / babipDenom;
  if (a.pa > 0) { a.bbRate = a.bb / a.pa; a.kRate = a.k / a.pa; }
  if (a.h > 0) a.xbhRate = a.xbh / a.h;
  if (officialAb > 0) a.secAvg = (a.tb - a.h + a.bb + a.sb) / officialAb;
  const fieldChances = a.po + a.a + a.e;
  if (fieldChances > 0) a.fpct = (a.po + a.a) / fieldChances;
  a.ipDecimal = a.pitchingOuts / 3;
  const whole = Math.floor(a.pitchingOuts / 3);
  const thirds = a.pitchingOuts % 3;
  a.ipDisplay = `${whole}.${thirds}`;
  if (a.ipDecimal > 0) {
    a.era = (a.er * ERA_INNINGS_BASIS) / a.ipDecimal;
    a.whip = (a.pBb + a.pH) / a.ipDecimal;
    a.kPer9 = (a.so * 9) / a.ipDecimal;
  }
  return a;
}

// Compact offensive + defensive projection of an AggregateStats for the trends
// chart (pitching fields and the IP display string are dropped). Keys mirror
// AggregateStats so the client can index by the same stat key it shows.
function trendStats(a: AggregateStats) {
  return {
    h: a.h, hr: a.hr, rbi: a.rbi, r: a.r, doubles: a.doubles, triples: a.triples,
    xbh: a.xbh, tb: a.tb, bb: a.bb, k: a.k, sb: a.sb, pa: a.pa, ab: a.ab,
    avg: a.avg, obp: a.obp, slg: a.slg, ops: a.ops, iso: a.iso, babip: a.babip,
    secAvg: a.secAvg, bbRate: a.bbRate, kRate: a.kRate, xbhRate: a.xbhRate,
    po: a.po, a: a.a, e: a.e, fpct: a.fpct,
  };
}

// Stat-source modes for combining manual + GameChanger lines.
export type StatMode = "manual" | "combined" | "gamechanger";

function parseMode(value: unknown): StatMode {
  if (value === "gamechanger" || value === "combined" || value === "manual") return value;
  return "combined";
}

// Apply a mode filter to raw stat rows.
// - manual:      only rows with source='manual'
// - gamechanger: only rows with source='gamechanger'
// - combined:    for each (gameId, playerId), prefer manual; fall back to gamechanger
function applyMode(rows: BbPlayerGame[], mode: StatMode): BbPlayerGame[] {
  if (mode === "manual") return rows.filter(r => r.source === "manual");
  if (mode === "gamechanger") return rows.filter(r => r.source === "gamechanger");
  const byKey = new Map<string, BbPlayerGame>();
  for (const r of rows) {
    const key = `${r.gameId}|${r.playerId}`;
    const existing = byKey.get(key);
    if (!existing || (existing.source !== "manual" && r.source === "manual")) {
      byKey.set(key, r);
    }
  }
  return Array.from(byKey.values());
}

// Fielding position ordering + labels. "UA" = unassigned (error/credit not tied
// to a specific spot). Order drives the By Position table.
const FIELD_POSITIONS: { code: string; label: string }[] = [
  { code: "1", label: "P" },
  { code: "2", label: "C" },
  { code: "3", label: "1B" },
  { code: "4", label: "2B" },
  { code: "5", label: "3B" },
  { code: "6", label: "SS" },
  { code: "7", label: "LF" },
  { code: "8", label: "CF" },
  { code: "9", label: "RF" },
  { code: "10", label: "SF" },
  { code: "UA", label: "Unassigned" },
];
const FIELD_POS_ORDER = new Map(FIELD_POSITIONS.map((p, i) => [p.code, i]));
const FIELD_POS_LABEL = new Map(FIELD_POSITIONS.map(p => [p.code, p.label]));
function normalizePosition(raw: unknown): string {
  const s = String(raw ?? "").trim().toUpperCase();
  if (FIELD_POS_LABEL.has(s)) return s;
  // accept label aliases too (e.g. "SS", "1B")
  for (const p of FIELD_POSITIONS) if (p.label.toUpperCase() === s) return p.code;
  return "UA";
}

// Convert "5.2" notation to outs (5 + 2/3 innings = 17 outs).
function parseIpToOuts(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).trim();
  if (!/^\d+(\.\d)?$/.test(str)) return null;
  const [w, frac = "0"] = str.split(".");
  const whole = parseInt(w, 10);
  const thirds = Math.min(2, parseInt(frac, 10) || 0);
  return whole * 3 + thirds;
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

// v2 scorebook column layout — matches the Knox Stars entry sheet 1:1.
// Row indices are 0-based. Game info appears only on the first row of a game
// block; subsequent rows in the same game leave columns 0..9 blank.
const TEMPLATE_SECTION_HEADERS = [
  "",                              // 0  Game #
  "Our Team", "",                  // 1  Name           2  Home/Visitor
  "Opponent", "",                  // 3  Name           4  Home/Visitor
  "Game Details", "", "", "", "",  // 5..9
  "Team Roster / Lineup", "", "", "", // 10..13
  "Fielding", "", "", "",          // 14..17
  "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
];
const TEMPLATE_COLUMN_HEADERS = [
  "Game #",
  "Name", "Home/Visitor",
  "Name", "Home/Visitor",
  "Game Date", "Game Time", "Final Score (Visitor)", "Final Score (Home)", "Location",
  "Batting Order #", "Player #", "Player Name", "Position (#)",
  "Pos #", "PO", "A", "Errors",
  "Plate App", "Pitches", "Reached Base", "Hits",
  "1B", "2B", "3B", "HR",
  "R", "RBI", "BB", "K", "Swing", "Looking",
  "SAC", "FC", "ROE",
  "Summary", "Comments",
];
const TEMPLATE_BATTING_SLOTS = 15;
const TEMPLATE_EMPTY_GAMES = 10;

async function buildTemplateWorkbook(): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const colCount = TEMPLATE_COLUMN_HEADERS.length;
  const blank = () => Array(colCount).fill("");
  const rows: any[][] = [];
  // Row 1: blank spacer to match the user's source sheet layout.
  rows.push(blank());
  // Row 2: section headers.
  const section = blank();
  for (let i = 0; i < TEMPLATE_SECTION_HEADERS.length && i < colCount; i++) {
    section[i] = TEMPLATE_SECTION_HEADERS[i];
  }
  rows.push(section);
  // Row 3: column headers.
  rows.push([...TEMPLATE_COLUMN_HEADERS]);
  // Build empty game blocks. Each block = 15 batting rows + 1 Totals row + 1 spacer.
  for (let g = 1; g <= TEMPLATE_EMPTY_GAMES; g++) {
    for (let slot = 1; slot <= TEMPLATE_BATTING_SLOTS; slot++) {
      const row = blank();
      if (slot === 1) row[0] = g;            // Game # only on first row
      row[10] = slot;                        // Batting Order #
      rows.push(row);
    }
    const totals = blank();
    totals[10] = "Totals";
    rows.push(totals);
    rows.push(blank());                      // spacer
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Column widths — first 10 wider for metadata, the rest a uniform stat width.
  ws["!cols"] = [
    { wch: 7 },  { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 12 },
    { wch: 11 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    { wch: 9 },  { wch: 9 },  { wch: 22 }, { wch: 13 },
    { wch: 7 },  { wch: 6 },  { wch: 6 },  { wch: 7 },
    { wch: 10 }, { wch: 9 },  { wch: 13 }, { wch: 7 },
    { wch: 6 },  { wch: 6 },  { wch: 6 },  { wch: 6 },
    { wch: 6 },  { wch: 6 },  { wch: 6 },  { wch: 6 },  { wch: 7 }, { wch: 8 },
    { wch: 6 },  { wch: 6 },  { wch: 6 },
    { wch: 28 }, { wch: 28 },
  ];

  // README sheet documenting the new columns.
  const readme = [
    ["Knox Stars 7U Stats Entry Sheet — Column Guide"],
    [],
    ["Game info (only on the FIRST row of each game)"],
    ["Game #", "Sequential number; identifies the game block."],
    ["Our Team Name + Home/Visitor", "Our team and our side."],
    ["Opponent Name + Home/Visitor", "Opponent and their side."],
    ["Game Date", "Use a real date (the file will format it as a date)."],
    ["Game Time", "Free text — e.g. 9:30am."],
    ["Final Score (Visitor) / (Home)", "Final runs by side, NOT by us/them."],
    ["Location", "Field name."],
    [],
    ["Per-player row"],
    ["Batting Order #", "1-15; Totals row signals end of game block."],
    ["Player #", "Jersey number (optional)."],
    ["Player Name", "Must match the team roster exactly."],
    ["Position (#)", "Player's primary position. 1=P 2=C 3=1B 4=2B 5=3B 6=SS 7=LF 8=CF 9=RF 10=SF, EH=extra hitter."],
    [],
    ["Fielding (recorded by POSITION, not necessarily this player)"],
    ["Pos #", "The position the PO/A/Errors below belong to. 1-10 or UA (unassigned/unclear)."],
    ["PO / A / Errors", "Putouts, assists, errors at that position."],
    [],
    ["Hitting"],
    ["Plate App", "Total plate appearances (AB column — raw PA convention)."],
    ["Pitches", "Total pitches the batter saw."],
    ["Reached Base", "Times reached safely (any way)."],
    ["Hits", "Total hits. Should = 1B + 2B + 3B + HR."],
    ["1B / 2B / 3B / HR", "Hit breakdown."],
    ["R", "Runs scored."],
    ["RBI", "Runs batted in."],
    ["BB", "Walks."],
    ["K / Swing / Looking", "Total strikeouts (K). Swing + Looking should equal K."],
    ["SAC", "Sacrifices."],
    ["FC", "Reached on fielder's choice."],
    ["ROE", "Reached on error."],
    ["Summary", 'Each AB separated by ";"  — e.g. "1B; HR" or "3B ; F6".'],
    ["Comments", "Free-text notes for this player/game."],
    [],
    ["Notes"],
    ["", "AB convention: raw plate appearances (walks/sacrifices/HBP/SF NOT subtracted). AVG/OBP/SLG will read lower than official MLB figures."],
    ["", "Upload mode: re-uploading replaces existing manual rows for any matched (date, opponent) game."],
  ];
  const readmeWs = XLSX.utils.aoa_to_sheet(readme);
  readmeWs["!cols"] = [{ wch: 32 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stats");
  XLSX.utils.book_append_sheet(wb, readmeWs, "Guide");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function pickInt(row: Record<string, any>, ...keys: string[]): number | null {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") {
      const n = parseInt(String(row[k]), 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function pickStr(row: Record<string, any>, ...keys: string[]): string | null {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return String(row[k]).trim();
    }
  }
  return null;
}

function pickDate(row: Record<string, any>, ...keys: string[]): Date | null {
  for (const k of keys) {
    if (row[k] === undefined || row[k] === null || row[k] === "") continue;
    const v = row[k];
    if (v instanceof Date) return v;
    if (typeof v === "number") {
      // Excel serial date
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d = new Date(String(v));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

interface ImportResult {
  gamesCreated: number;
  rowsImported: number;
  playersUnmatched: string[];
  errors: string[];
}

// Parse an "AoA" row using a header-name -> column-index map. Returns null
// when missing/blank. Tolerant of header whitespace and case.
function cellInt(row: any[], colIdx: number | undefined): number | null {
  if (colIdx === undefined) return null;
  const v = row[colIdx];
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isNaN(n) ? null : n;
}
function cellStr(row: any[], colIdx: number | undefined): string | null {
  if (colIdx === undefined) return null;
  const v = row[colIdx];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function cellDate(row: any[], colIdx: number | undefined): Date | null {
  if (colIdx === undefined) return null;
  const v = row[colIdx];
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

interface GameCtx {
  game: BbGame;
  ourIsHome: boolean | null; // null = unknown; map final scores conservatively
}

async function importExcel(buffer: Buffer, teamId: string, source: "manual" | "gamechanger", currentSeason: string): Promise<ImportResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { gamesCreated: 0, rowsImported: 0, playersUnmatched: [], errors: ["Workbook has no sheets"] };
  const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null, blankrows: true });

  // Find the header row: it contains "Player Name" + "Game #".
  const norm = (s: any) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const cells = (aoa[i] ?? []).map(norm);
    if (cells.includes("player name") && cells.includes("game #")) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) {
    return { gamesCreated: 0, rowsImported: 0, playersUnmatched: [], errors: ["Could not find header row (expected 'Game #' and 'Player Name' columns)"] };
  }
  const headers = (aoa[headerIdx] ?? []).map(norm);
  const col = (name: string) => {
    const idx = headers.indexOf(name);
    return idx < 0 ? undefined : idx;
  };
  const C = {
    gameNum: col("game #"),
    ourName: -1, ourHV: -1, oppName: -1, oppHV: -1,
    gameDate: col("game date"),
    gameTime: col("game time"),
    finalVisitor: col("final score (visitor)"),
    finalHome: col("final score (home)"),
    location: col("location"),
    battingOrder: col("batting order #"),
    playerNum: col("player #"),
    playerName: col("player name"),
    primaryPos: col("position (#)"),
    fieldPos: col("pos #"),
    po: col("po"),
    a: col("a"),
    errors: col("errors"),
    plateApp: col("plate app"),
    pitches: col("pitches"),
    reached: col("reached base"),
    hits: col("hits"),
    b1: col("1b"),
    b2: col("2b"),
    b3: col("3b"),
    hr: col("hr"),
    r: col("r"),
    rbi: col("rbi"),
    bb: col("bb"),
    k: col("k"),
    swing: col("swing"),
    looking: col("looking"),
    sac: col("sac"),
    fc: col("fc"),
    roe: col("roe"),
    summary: col("summary"),
    comments: col("comments"),
  };
  // "Name" / "Home/Visitor" headers repeat — disambiguate by which "Name"
  // column comes first (Our Team) vs second (Opponent).
  const nameCols: number[] = [];
  const hvCols: number[] = [];
  headers.forEach((h, i) => { if (h === "name") nameCols.push(i); if (h === "home/visitor") hvCols.push(i); });
  if (nameCols.length >= 2) { C.ourName = nameCols[0]; C.oppName = nameCols[1]; }
  if (hvCols.length >= 2) { C.ourHV = hvCols[0]; C.oppHV = hvCols[1]; }

  const players = await db.select().from(bbPlayers).where(eq(bbPlayers.teamId, teamId));
  const playerByName = new Map<string, BbPlayer>();
  for (const p of players) playerByName.set(p.name.toLowerCase().trim(), p);

  const result: ImportResult = { gamesCreated: 0, rowsImported: 0, playersUnmatched: [], errors: [] };
  let ctx: GameCtx | null = null;
  const seenGames = new Set<string>(); // dedupe key in this run; track cleared-on-replace

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const excelRow = i + 1; // 1-indexed for error messages
    // Skip totally blank rows.
    if (row.every(v => v === null || v === undefined || String(v).trim() === "")) continue;

    const battingOrderRaw = cellStr(row, C.battingOrder);
    if (battingOrderRaw && /^totals?$/i.test(battingOrderRaw)) {
      // Totals row — end of current game's data; carry context forward.
      continue;
    }

    const gameNum = cellInt(row, C.gameNum);
    if (gameNum !== null) {
      // Start of a new game block.
      const date = cellDate(row, C.gameDate);
      const opponent = cellStr(row, C.oppName);
      if (!date && !opponent) {
        // Empty placeholder game # row (template ships with future game slots) — skip silently.
        ctx = null;
        continue;
      }
      if (!date || !opponent) {
        result.errors.push(`Row ${excelRow}: game ${gameNum} is missing ${!date ? "date" : "opponent"}`);
        ctx = null;
        continue;
      }
      const ourHV = (cellStr(row, C.ourHV) ?? "").toLowerCase();
      const oppHV = (cellStr(row, C.oppHV) ?? "").toLowerCase();
      const ourIsHome = ourHV === "home" ? true : ourHV === "visitor" ? false : oppHV === "visitor" ? true : oppHV === "home" ? false : null;
      const finalV = cellInt(row, C.finalVisitor);
      const finalH = cellInt(row, C.finalHome);
      let ourScore: number | null = null;
      let oppScore: number | null = null;
      if (ourIsHome === true) { ourScore = finalH; oppScore = finalV; }
      else if (ourIsHome === false) { ourScore = finalV; oppScore = finalH; }

      const dayUtc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const dayStr = dayUtc.toISOString().slice(0, 10);
      const oppNorm = opponent.toLowerCase().trim();
      // game_date is `timestamp` (no TZ) and both importers always store
      // UTC-midnight, so comparing on ::date is both correct and immune to
      // the session timezone (date_trunc on timestamptz truncates in the
      // session TZ, which silently broke dedupe on non-UTC sessions).
      const existing = await db.select().from(bbGames)
        .where(and(
          eq(bbGames.teamId, teamId),
          dsql`${bbGames.gameDate}::date = ${dayStr}::date`,
          dsql`lower(${bbGames.opponent}) = ${oppNorm}`,
        ))
        .limit(1);

      let game: BbGame;
      if (existing[0]) {
        // Update metadata in case the user fixed time/location/scores.
        const [updated] = await db.update(bbGames).set({
          gameTime: cellStr(row, C.gameTime) ?? existing[0].gameTime ?? null,
          location: cellStr(row, C.location) ?? existing[0].location ?? null,
          ourHomeVisitor: ourIsHome === true ? "Home" : ourIsHome === false ? "Visitor" : existing[0].ourHomeVisitor ?? null,
          ourScore: ourScore ?? existing[0].ourScore ?? null,
          oppScore: oppScore ?? existing[0].oppScore ?? null,
        }).where(eq(bbGames.id, existing[0].id)).returning();
        game = updated;
      } else {
        const [created] = await db.insert(bbGames).values({
          teamId,
          gameDate: dayUtc,
          gameTime: cellStr(row, C.gameTime),
          opponent,
          ourHomeVisitor: ourIsHome === true ? "Home" : ourIsHome === false ? "Visitor" : null,
          location: cellStr(row, C.location),
          ourScore,
          oppScore,
          season: currentSeason,
        }).returning();
        game = created;
        result.gamesCreated++;
      }

      // On first encounter of this game in this upload, REPLACE existing rows
      // of the same source so removed players don't linger.
      if (!seenGames.has(game.id)) {
        await db.delete(bbPlayerGame).where(and(eq(bbPlayerGame.gameId, game.id), eq(bbPlayerGame.source, source)));
        // Drop any per-position fielding splits for the replaced rows so the
        // By Position view never serves stale detail that disagrees with the
        // freshly-imported totals.
        await db.delete(bbPlayerFielding).where(and(eq(bbPlayerFielding.gameId, game.id), eq(bbPlayerFielding.source, source)));
        seenGames.add(game.id);
      }
      ctx = { game, ourIsHome };
    }

    // Player stat row (Game # may be blank — context carries forward).
    const playerName = cellStr(row, C.playerName);
    if (!playerName) continue;
    if (!ctx) {
      result.errors.push(`Row ${excelRow}: player row with no active game block`);
      continue;
    }
    const player = playerByName.get(playerName.toLowerCase().trim());
    if (!player) {
      if (!result.playersUnmatched.includes(playerName)) result.playersUnmatched.push(playerName);
      continue;
    }

    const k = cellInt(row, C.k);
    const swing = cellInt(row, C.swing);
    const looking = cellInt(row, C.looking);
    const b1 = cellInt(row, C.b1);
    const b2 = cellInt(row, C.b2);
    const b3 = cellInt(row, C.b3);
    const hr = cellInt(row, C.hr);
    // Derive hits when blank: 1B + 2B + 3B + HR.
    let hits = cellInt(row, C.hits);
    if (hits === null && (b1 || b2 || b3 || hr)) {
      hits = (b1 ?? 0) + (b2 ?? 0) + (b3 ?? 0) + (hr ?? 0);
    }

    const stats = {
      gameId: ctx.game.id,
      playerId: player.id,
      source,
      ab: cellInt(row, C.plateApp),
      r: cellInt(row, C.r),
      h: hits,
      singles: b1,
      doubles: b2,
      triples: b3,
      hr,
      bb: cellInt(row, C.bb),
      k,
      swingK: swing,
      lookingK: looking,
      sb: null, // not tracked in v2 template
      sac: cellInt(row, C.sac),
      rbi: cellInt(row, C.rbi),
      pitchesSeen: cellInt(row, C.pitches),
      reachedBase: cellInt(row, C.reached),
      fc: cellInt(row, C.fc),
      roe: cellInt(row, C.roe),
      summary: cellStr(row, C.summary),
      comments: cellStr(row, C.comments),
      position: cellStr(row, C.fieldPos),
      po: cellInt(row, C.po),
      a: cellInt(row, C.a),
      e: cellInt(row, C.errors),
      pitchingOuts: null,
      pc: null,
      pBb: null,
      so: null,
      pH: null,
      pR: null,
      er: null,
    };

    await db.insert(bbPlayerGame).values(stats).onConflictDoUpdate({
      target: [bbPlayerGame.gameId, bbPlayerGame.playerId, bbPlayerGame.source],
      set: { ...stats, updatedAt: new Date() },
    });
    result.rowsImported++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// GameChanger CSV import
// ---------------------------------------------------------------------------

interface GcFileResult {
  filename: string;
  opponent: string;
  gameDate: string;
  gameCreated: boolean;
  rowsImported: number;
  playersUnmatched: string[];
  warnings: string[];
}

interface GcImportResult {
  files: GcFileResult[];
  totalRows: number;
  totalGamesCreated: number;
}

function parseGcFilename(name: string): { opponent: string; date: Date } | null {
  // Examples handled:
  //   Stars_vs_TN_Crows_3:7:26_1778987102286.csv
  //   Stars_vs_Diamond_Kings_-_3:7:26_1778987102286.csv
  //   Stars vs TN Crows 3-7-26.csv  (defensive fallback)
  const cleaned = name.replace(/\.csv$/i, "");
  const re = /^(?:Stars[_ ]vs[_ ])(.+?)(?:[_ ]-)?[_ ](\d{1,2})[:\-\/](\d{1,2})[:\-\/](\d{2,4})(?:[_ ]\d+)?$/i;
  const m = cleaned.match(re);
  if (!m) return null;
  const opponent = m[1].replace(/[_]+/g, " ").trim();
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  let yy = Number(m[4]);
  if (yy < 100) yy += 2000;
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  if (Number.isNaN(date.getTime())) return null;
  return { opponent, date };
}

function splitCsvLine(line: string): string[] {
  // GameChanger exports use plain commas with no quoted fields containing commas.
  // Defensive: handle quoted fields if they ever appear.
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function gcNum(v: string | undefined): number {
  if (v === undefined) return 0;
  const t = v.trim();
  if (!t || t === "-" || t === "—") return 0;
  // GC uses ".333" style for fractions; we only want integers for our counting stats.
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function gcIpToOuts(v: string | undefined): number {
  if (!v) return 0;
  const t = v.trim();
  if (!t || t === "-") return 0;
  // "3.1" = 3 whole innings + 1/3 = 10 outs; "0.2" = 0 + 2/3 = 2 outs.
  const dot = t.indexOf(".");
  if (dot < 0) {
    const whole = Number(t);
    return Number.isFinite(whole) ? Math.max(0, Math.round(whole)) * 3 : 0;
  }
  const whole = Number(t.slice(0, dot));
  const frac = Number(t.slice(dot + 1));
  if (!Number.isFinite(whole) || !Number.isFinite(frac)) return 0;
  const thirds = frac === 1 ? 1 : frac === 2 ? 2 : 0;
  return Math.max(0, Math.round(whole)) * 3 + thirds;
}

async function importGameChangerCsv(
  buffer: Buffer,
  filename: string,
  teamId: string,
  currentSeason: string,
): Promise<GcFileResult> {
  const parsed = parseGcFilename(filename);
  const result: GcFileResult = {
    filename,
    opponent: parsed?.opponent ?? "(unparsed)",
    gameDate: parsed?.date ? parsed.date.toISOString().slice(0, 10) : "",
    gameCreated: false,
    rowsImported: 0,
    playersUnmatched: [],
    warnings: [],
  };
  if (!parsed) {
    result.warnings.push(`Could not parse opponent + date from filename. Expected something like "Stars_vs_OPPONENT_M:D:YY_NNN.csv".`);
    return result;
  }
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 3) {
    result.warnings.push("CSV has no data rows.");
    return result;
  }
  // Row 0 = section banner (Batting / Pitching / Fielding markers).
  // Row 1 = headers. Players start at row 2; stop at "Totals" or "Glossary".
  const bannerCols = splitCsvLine(lines[0]);
  const headerCols = splitCsvLine(lines[1]);
  const sectionStarts: { name: string; col: number }[] = [];
  bannerCols.forEach((v, i) => {
    const t = v.trim();
    if (t) sectionStarts.push({ name: t.toLowerCase(), col: i });
  });
  const colSection = new Array(headerCols.length).fill("meta");
  for (let i = 0; i < sectionStarts.length; i++) {
    const start = sectionStarts[i].col;
    const end = sectionStarts[i + 1]?.col ?? headerCols.length;
    for (let c = start; c < end; c++) colSection[c] = sectionStarts[i].name;
  }
  const idx: Record<string, number> = {};
  headerCols.forEach((h, i) => {
    const cleanH = h.trim();
    if (!cleanH) return;
    const section = colSection[i] ?? "meta";
    // Section-scoped key (e.g. "batting.bb", "pitching.bb").
    const scoped = `${section}.${cleanH.toLowerCase()}`;
    if (!(scoped in idx)) idx[scoped] = i;
    // Meta columns (Number/Last/First/GP) — accept unscoped too.
    if (section === "meta" || ["number", "last", "first", "gp"].includes(cleanH.toLowerCase())) {
      const flat = cleanH.toLowerCase();
      if (!(flat in idx)) idx[flat] = i;
    }
  });
  const get = (cols: string[], key: string): string | undefined => {
    const i = idx[key.toLowerCase()];
    return i === undefined ? undefined : cols[i];
  };

  // Load roster + ensure game.
  const roster = await db.select().from(bbPlayers).where(eq(bbPlayers.teamId, teamId));
  const byJersey = new Map<string, BbPlayer>();
  for (const p of roster) if (p.jerseyNumber) byJersey.set(String(p.jerseyNumber).trim(), p);
  const byName = new Map<string, BbPlayer>();
  const normName = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");
  for (const p of roster) {
    byName.set(normName(p.name), p);
    for (const part of p.name.split(/\s+/).filter(Boolean)) byName.set(normName(part), p);
  }

  const oppNorm = parsed.opponent.toLowerCase().trim();
  const dayStr = parsed.date.toISOString().slice(0, 10);
  // See note in importExcel: ::date comparison is session-TZ-safe.
  const existing = await db.select().from(bbGames)
    .where(and(
      eq(bbGames.teamId, teamId),
      dsql`${bbGames.gameDate}::date = ${dayStr}::date`,
      dsql`lower(${bbGames.opponent}) = ${oppNorm}`,
    ))
    .limit(1);
  let game: BbGame;
  if (existing[0]) {
    game = existing[0];
  } else {
    const [created] = await db.insert(bbGames).values({
      teamId,
      gameDate: parsed.date,
      opponent: parsed.opponent,
      season: currentSeason,
    }).returning();
    game = created;
    result.gameCreated = true;
  }

  // Process player rows.
  for (let r = 2; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    const first = (cols[0] ?? "").trim();
    if (!first) continue;
    const firstLower = first.toLowerCase();
    if (firstLower === "totals" || firstLower === "glossary" || firstLower.startsWith("glossary")) break;

    const jersey = first; // GC puts jersey number in column 0
    const last = (get(cols, "last") ?? "").trim();
    const firstName = (get(cols, "first") ?? "").trim();
    const fullName = `${firstName} ${last}`.trim();

    let matched: BbPlayer | undefined;
    if (jersey && byJersey.has(jersey)) {
      matched = byJersey.get(jersey);
    } else if (fullName) {
      matched = byName.get(normName(fullName))
        ?? byName.get(normName(last))
        ?? byName.get(normName(firstName));
    }
    if (!matched) {
      const label = `#${jersey} ${fullName}`.trim();
      if (!result.playersUnmatched.includes(label)) result.playersUnmatched.push(label);
      continue;
    }

    // GameChanger reports HBP and SF separately. We now store HBP (it feeds
    // OBP and Reached Base). SF is still merged into SAC on this team's
    // scorebook, so we surface a warning when non-zero rather than silently
    // dropping it.
    const hbp = gcNum(get(cols, "batting.hbp"));
    const sf = gcNum(get(cols, "batting.sf"));
    if (sf > 0) {
      result.warnings.push(`${fullName}: SF=${sf} not stored separately (this team merges sac flies into the SAC column).`);
    }

    // PA → ab (per the team's "AB = total plate appearances" convention).
    const stats = {
      gameId: game.id,
      playerId: matched.id,
      source: "gamechanger" as const,
      ab: gcNum(get(cols, "batting.pa")),
      r: gcNum(get(cols, "batting.r")),
      h: gcNum(get(cols, "batting.h")),
      doubles: gcNum(get(cols, "batting.2b")),
      triples: gcNum(get(cols, "batting.3b")),
      hr: gcNum(get(cols, "batting.hr")),
      bb: gcNum(get(cols, "batting.bb")),
      hbp: hbp || null,
      k: gcNum(get(cols, "batting.so")),
      sb: gcNum(get(cols, "batting.sb")),
      sac: gcNum(get(cols, "batting.sac")),
      rbi: gcNum(get(cols, "batting.rbi")),
      po: gcNum(get(cols, "fielding.po")),
      a: gcNum(get(cols, "fielding.a")),
      e: gcNum(get(cols, "fielding.e")),
      pitchingOuts: gcIpToOuts(get(cols, "pitching.ip")),
      pc: gcNum(get(cols, "pitching.#p")),
      pBb: gcNum(get(cols, "pitching.bb")),
      so: gcNum(get(cols, "pitching.so")),
      pH: gcNum(get(cols, "pitching.h")),
      pR: gcNum(get(cols, "pitching.r")),
      er: gcNum(get(cols, "pitching.er")),
    };

    await db.insert(bbPlayerGame).values(stats).onConflictDoUpdate({
      target: [bbPlayerGame.gameId, bbPlayerGame.playerId, bbPlayerGame.source],
      set: { ...stats, updatedAt: new Date() },
    });
    // A GameChanger CSV carries only the combined fielding total, never a
    // per-position split. Clear any prior GC split for this (game, player) so
    // the By Position view falls back to the freshly-imported total instead of
    // serving a stale, now-inconsistent split.
    await db.delete(bbPlayerFielding).where(and(
      eq(bbPlayerFielding.gameId, stats.gameId),
      eq(bbPlayerFielding.playerId, stats.playerId),
      eq(bbPlayerFielding.source, "gamechanger"),
    ));
    result.rowsImported++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// iScore .xls import
// ---------------------------------------------------------------------------
//
// iScore exports one workbook per game with six sheets:
//   {Visitor,Home} x {Batting,Pitching,Fielding}
// Each sheet: row 0 = title ("Game Stats - M/D/YY <Visitor> at <Home>"),
// a header row ("#","Name",...), one row per player, then a TOTALS row.
// We auto-detect which side is OUR team by matching jersey numbers/names to the
// roster, then merge that side's Batting + Pitching + Fielding into one
// bb_player_game row per player (source = "manual"). iScore carries no
// per-position fielding split, so PO/A/E are stored as the game total only.

interface IScoreFileResult {
  filename: string;
  opponent: string;
  gameDate: string;
  ourSide: "Home" | "Visitor" | null;
  ourScore: number | null;
  oppScore: number | null;
  gameCreated: boolean;
  rowsImported: number;
  playersUnmatched: string[];
  warnings: string[];
}
interface IScoreImportResult {
  files: IScoreFileResult[];
  totalRows: number;
  totalGamesCreated: number;
}

function iNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isNaN(n) ? null : n;
}
// iScore stores IP as a TRUE decimal (4.333 = 4⅓ innings), not baseball
// notation — so multiply by 3, unlike parseIpToOuts ("5.2" = 5⅔).
function iIpToOuts(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const f = parseFloat(String(v).trim());
  if (Number.isNaN(f)) return null;
  return Math.round(f * 3);
}
function iHeaderMap(headerRow: any[]): Map<string, number> {
  const map = new Map<string, number>();
  (headerRow ?? []).forEach((h, i) => {
    const key = String(h ?? "").trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}
function iHeaderRowIdx(aoa: any[][]): number {
  for (let i = 0; i < Math.min(aoa.length, 6); i++) {
    const c0 = String(aoa[i]?.[0] ?? "").trim();
    const c1 = String(aoa[i]?.[1] ?? "").trim().toLowerCase();
    if (c0 === "#" && c1 === "name") return i;
  }
  return 1;
}

async function importIScoreXls(
  buffer: Buffer,
  filename: string,
  teamId: string,
  teamName: string,
  currentSeason: string,
): Promise<IScoreFileResult> {
  const XLSX = await import("xlsx");
  const result: IScoreFileResult = {
    filename,
    opponent: "(unknown)",
    gameDate: "",
    ourSide: null,
    ourScore: null,
    oppScore: null,
    gameCreated: false,
    rowsImported: 0,
    playersUnmatched: [],
    warnings: [],
  };

  let wb: any;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch (e: any) {
    result.warnings.push(`Could not read workbook: ${e?.message ?? e}`);
    return result;
  }
  const aoaOf = (name: string): any[][] | null => {
    const s = wb.Sheets[name];
    if (!s) return null;
    return XLSX.utils.sheet_to_json<any[]>(s, { header: 1, defval: null, blankrows: false });
  };

  const vb = aoaOf("VisitorBatting");
  const hb = aoaOf("HomeBatting");
  if (!vb || !hb) {
    result.warnings.push(`Not an iScore export — missing the VisitorBatting/HomeBatting sheets. Expected six sheets: Visitor/Home × Batting/Pitching/Fielding.`);
    return result;
  }

  // --- Title: date + the two team names ("... M/D/YY <Visitor> at <Home>") ---
  let title = "";
  for (const r of vb.slice(0, 4)) {
    for (const c of r ?? []) {
      if (/Game Stats/i.test(String(c ?? ""))) { title = String(c).trim(); break; }
    }
    if (title) break;
  }
  const m = title.match(/Game Stats\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(.+?)\s+\bat\b\s+(.+?)\s*$/i);
  if (!m) {
    result.warnings.push(`Could not parse the game title ("${title}"). Expected "Game Stats - M/D/YY <Visitor> at <Home>".`);
    return result;
  }
  const mm = parseInt(m[1], 10), dd = parseInt(m[2], 10);
  let yy = parseInt(m[3], 10);
  if (yy < 100) yy += 2000;
  const gameDate = new Date(Date.UTC(yy, mm - 1, dd));
  const visitorTeam = m[4].trim();
  const homeTeam = m[5].trim();
  result.gameDate = gameDate.toISOString().slice(0, 10);

  // --- Roster maps + matcher (jersey first, then normalized name) ---
  const roster = await db.select().from(bbPlayers).where(eq(bbPlayers.teamId, teamId));
  const byJersey = new Map<string, BbPlayer>();
  for (const p of roster) if (p.jerseyNumber) byJersey.set(String(p.jerseyNumber).trim(), p);
  const normName = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");
  const byName = new Map<string, BbPlayer>();
  for (const p of roster) {
    byName.set(normName(p.name), p);
    for (const part of p.name.split(/\s+/).filter(Boolean)) byName.set(normName(part), p);
  }
  const matchPlayer = (jersey: string, name: string): BbPlayer | undefined => {
    const j = jersey.trim();
    if (j && byJersey.has(j)) return byJersey.get(j);
    const nm = name.trim();
    if (nm) return byName.get(normName(nm));
    return undefined;
  };

  // --- Detect which side is us: roster matches dominate; team-name token
  // overlap breaks ties. ---
  const sideMatches = (aoa: any[][]): number => {
    const h = iHeaderRowIdx(aoa);
    let n = 0;
    for (let i = h + 1; i < aoa.length; i++) {
      const row = aoa[i] ?? [];
      const nm = String(row[1] ?? "").trim();
      if (!nm || nm.toLowerCase() === "totals") continue;
      if (matchPlayer(String(row[0] ?? ""), nm)) n++;
    }
    return n;
  };
  const tokenOverlap = (titleTeam: string): number => {
    const mine = new Set(teamName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    return titleTeam.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).filter(t => mine.has(t)).length;
  };
  const visScore = sideMatches(vb) * 100 + tokenOverlap(visitorTeam);
  const homeScore = sideMatches(hb) * 100 + tokenOverlap(homeTeam);
  if (visScore === 0 && homeScore === 0) {
    result.warnings.push(`Could not identify which side is your team — no jersey/name matches on either side. Check that this game's roster matches your team.`);
    return result;
  }
  const ourSide: "Home" | "Visitor" = homeScore >= visScore ? "Home" : "Visitor";
  result.ourSide = ourSide;
  const opponent = ourSide === "Home" ? visitorTeam : homeTeam;
  result.opponent = opponent;

  // --- Scores from each side's batting TOTALS R ---
  const totalsR = (aoa: any[][]): number | null => {
    const h = iHeaderRowIdx(aoa);
    const map = iHeaderMap(aoa[h]);
    const rIdx = map.get("r");
    if (rIdx === undefined) return null;
    for (let i = h + 1; i < aoa.length; i++) {
      const row = aoa[i] ?? [];
      if (String(row[1] ?? "").trim().toLowerCase() === "totals") return iNum(row[rIdx]);
    }
    return null;
  };
  const ourScore = totalsR(ourSide === "Home" ? hb : vb);
  const oppScore = totalsR(ourSide === "Home" ? vb : hb);
  result.ourScore = ourScore;
  result.oppScore = oppScore;

  // --- Find-or-create the game (dedupe by date + opponent, like the other
  // importers; ::date comparison is session-TZ-safe). ---
  const dayStr = result.gameDate;
  const oppNorm = opponent.toLowerCase().trim();
  const existing = await db.select().from(bbGames)
    .where(and(
      eq(bbGames.teamId, teamId),
      dsql`${bbGames.gameDate}::date = ${dayStr}::date`,
      dsql`lower(${bbGames.opponent}) = ${oppNorm}`,
    ))
    .limit(1);
  let game: BbGame;
  if (existing[0]) {
    const [updated] = await db.update(bbGames).set({
      ourHomeVisitor: ourSide,
      ourScore: ourScore ?? existing[0].ourScore ?? null,
      oppScore: oppScore ?? existing[0].oppScore ?? null,
    }).where(eq(bbGames.id, existing[0].id)).returning();
    game = updated;
  } else {
    const [created] = await db.insert(bbGames).values({
      teamId,
      gameDate,
      opponent,
      ourHomeVisitor: ourSide,
      ourScore,
      oppScore,
      season: currentSeason,
    }).returning();
    game = created;
    result.gameCreated = true;
  }

  // Replace existing manual rows for this game so removed players don't linger,
  // and drop any manual per-position fielding splits (iScore has none, so the
  // By Position view must fall back to the freshly-imported totals).
  await db.delete(bbPlayerGame).where(and(eq(bbPlayerGame.gameId, game.id), eq(bbPlayerGame.source, "manual")));
  await db.delete(bbPlayerFielding).where(and(eq(bbPlayerFielding.gameId, game.id), eq(bbPlayerFielding.source, "manual")));

  // --- Merge our side's Batting + Pitching + Fielding, keyed by player ---
  const merged = new Map<string, Record<string, any>>();
  const unmatched = new Set<string>();
  const ensure = (pid: string): Record<string, any> => {
    let s = merged.get(pid);
    if (!s) { s = { gameId: game.id, playerId: pid, source: "manual" as const }; merged.set(pid, s); }
    return s;
  };
  const rowsOf = (aoa: any[][] | null): { idx: Map<string, number>; rows: any[][] } | null => {
    if (!aoa) return null;
    const h = iHeaderRowIdx(aoa);
    return { idx: iHeaderMap(aoa[h]), rows: aoa.slice(h + 1) };
  };
  const cellOf = (idx: Map<string, number>, row: any[], key: string): any => {
    const i = idx.get(key);
    return i === undefined ? null : row[i];
  };
  const eachPlayerRow = (
    section: { idx: Map<string, number>; rows: any[][] } | null,
    fn: (p: BbPlayer, idx: Map<string, number>, row: any[]) => void,
  ): void => {
    if (!section) return;
    for (const row of section.rows) {
      const nm = String(row[1] ?? "").trim();
      if (!nm || nm.toLowerCase() === "totals") continue;
      const jersey = String(row[0] ?? "").trim();
      const p = matchPlayer(jersey, nm);
      if (!p) { unmatched.add(`#${jersey} ${nm}`.trim()); continue; }
      fn(p, section.idx, row);
    }
  };

  // Batting.
  eachPlayerRow(rowsOf(aoaOf(`${ourSide}Batting`)), (p, idx, row) => {
    const sf = iNum(cellOf(idx, row, "sf"));
    if (sf && sf > 0) {
      result.warnings.push(`${p.name}: SF=${sf} not stored separately (this team merges sac flies into SAC).`);
    }
    const s = ensure(p.id);
    s.ab = iNum(cellOf(idx, row, "pa")); // team convention: AB = raw plate appearances
    s.r = iNum(cellOf(idx, row, "r"));
    s.h = iNum(cellOf(idx, row, "h"));
    s.singles = iNum(cellOf(idx, row, "1b"));
    s.doubles = iNum(cellOf(idx, row, "2b"));
    s.triples = iNum(cellOf(idx, row, "3b"));
    s.hr = iNum(cellOf(idx, row, "hr"));
    s.rbi = iNum(cellOf(idx, row, "rbi"));
    s.bb = iNum(cellOf(idx, row, "bb"));
    s.lookingK = iNum(cellOf(idx, row, "kc"));
    s.swingK = iNum(cellOf(idx, row, "ks"));
    s.k = iNum(cellOf(idx, row, "so"));
    s.hbp = iNum(cellOf(idx, row, "hbp"));
    s.sb = iNum(cellOf(idx, row, "sb"));
    s.sac = iNum(cellOf(idx, row, "sac"));
    s.roe = iNum(cellOf(idx, row, "roe"));
    s.fc = iNum(cellOf(idx, row, "fc"));
  });

  // Pitching (only pitchers appear on this sheet).
  eachPlayerRow(rowsOf(aoaOf(`${ourSide}Pitching`)), (p, idx, row) => {
    const s = ensure(p.id);
    s.pitchingOuts = iIpToOuts(cellOf(idx, row, "ip"));
    s.pR = iNum(cellOf(idx, row, "r"));
    s.er = iNum(cellOf(idx, row, "er"));
    s.so = iNum(cellOf(idx, row, "k"));
    s.pH = iNum(cellOf(idx, row, "h"));
    s.pBb = iNum(cellOf(idx, row, "bb"));
    s.pc = iNum(cellOf(idx, row, "pit"));
  });

  // Fielding totals (iScore reports no per-position split).
  eachPlayerRow(rowsOf(aoaOf(`${ourSide}Fielding`)), (p, idx, row) => {
    const s = ensure(p.id);
    s.po = iNum(cellOf(idx, row, "po"));
    s.a = iNum(cellOf(idx, row, "a"));
    s.e = iNum(cellOf(idx, row, "err"));
  });

  for (const stats of merged.values()) {
    await db.insert(bbPlayerGame).values(stats as any).onConflictDoUpdate({
      target: [bbPlayerGame.gameId, bbPlayerGame.playerId, bbPlayerGame.source],
      set: { ...stats, updatedAt: new Date() },
    });
    result.rowsImported++;
  }
  result.playersUnmatched = Array.from(unmatched);
  return result;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

async function getTeamBySlug(slug: string): Promise<BbTeam | null> {
  const rows = await db.select().from(bbTeams).where(eq(bbTeams.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export function registerTeamStatsRoutes(app: Express): void {
  const requireTeamAccess: (slugParam?: string) => RequestHandler = (slugParam = "slug") => async (req, res, next) => {
    const slug = (req.params as Record<string, string>)[slugParam];
    const team = await getTeamBySlug(slug);
    if (!team) return res.status(404).json({ message: "Team not found" });
    if (!hasTeamAccess(req as any, team.id) && !(await isTeamAdminForRequest(req as any, team.id))) {
      return res.status(401).json({ message: "Password required" });
    }
    (req as any).bbTeam = team;
    next();
  };

  const requireTeamAdmin: RequestHandler = async (req, res, next) => {
    const slug = (req.params as Record<string, string>).slug;
    const team = await getTeamBySlug(slug);
    if (!team) return res.status(404).json({ message: "Team not found" });
    if (!(await isTeamAdminForRequest(req as any, team.id))) {
      return res.status(403).json({ message: "Admin only" });
    }
    (req as any).bbTeam = team;
    next();
  };

  // ---- Public-ish (after password): meta + auth -----
  app.get("/api/team/:slug/meta", async (req, res) => {
    const team = await getTeamBySlug(req.params.slug);
    if (!team) return res.status(404).json({ message: "Team not found" });
    const isAdmin = await isTeamAdminForRequest(req as any, team.id);
    res.json({
      slug: team.slug,
      name: team.name,
      season: team.season,
      hasAccess: hasTeamAccess(req as any, team.id) || isAdmin,
      isAdmin,
    });
  });

  app.post("/api/team/:slug/auth", async (req, res) => {
    const team = await getTeamBySlug(req.params.slug);
    if (!team) return res.status(404).json({ message: "Team not found" });
    const body = z.object({ password: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Password required" });
    const ok = await verifyPassword(body.data.password, team.passwordHash, team.passwordSalt);
    if (!ok) return res.status(401).json({ message: "Incorrect password" });
    setTeamAccess(req as any, team.id);
    res.json({ ok: true });
  });

  app.post("/api/team/:slug/logout", async (req, res) => {
    const team = await getTeamBySlug(req.params.slug);
    if (!team) return res.status(404).json({ message: "Team not found" });
    const map = getTeamAccessMap(req as any);
    delete map[team.id];
    (req as any).session.bbTeamAccess = map;
    res.json({ ok: true });
  });

  // Public: list every team (slug, name, season) so the tsteamstats.com
  // landing page can render a directory. No password required — only metadata
  // is exposed, never roster, games, or stats.
  app.get("/api/teams", async (_req, res) => {
    const rows = await db.select({
      slug: bbTeams.slug,
      name: bbTeams.name,
      season: bbTeams.season,
    }).from(bbTeams).orderBy(asc(bbTeams.name));
    res.json({ teams: rows });
  });

  // Public: "Add Your Team" signup form. Fires an email to justin@twinseamsports.com
  // via SendGrid so leads land in his inbox. Rate-limited per IP to deter spam,
  // and a hidden honeypot field traps simple bots. We deliberately don't store
  // these submissions in the DB — Justin handles them by hand and adds a team
  // record once he's spoken with the lead.
  const teamSignupSchema = z.object({
    teamName: z.string().trim().min(1, "Team name required").max(120),
    headCoach: z.string().trim().min(1, "Head coach required").max(120),
    administrator: z.string().trim().max(120).optional().default(""),
    season: z.string().trim().max(60).optional().default(""),
    ageGroup: z.string().trim().max(40).optional().default(""),
    city: z.string().trim().max(80).optional().default(""),
    state: z.string().trim().max(40).optional().default(""),
    contactName: z.string().trim().min(1, "Contact name required").max(120),
    contactEmail: z.string().trim().email("Valid email required").max(200),
    contactPhone: z.string().trim().min(7, "Phone required").max(40),
    address: z.string().trim().max(240).optional().default(""),
    notes: z.string().trim().max(1000).optional().default(""),
    website: z.string().max(200).optional().default(""), // honeypot — should always be empty
  });
  // Rate limiter keyed off BOTH the trusted req.ip (resolved through Express's
  // `trust proxy` setting, so it can't be spoofed by a raw X-Forwarded-For
  // header) AND the submitted email. Either bucket overflowing blocks the send,
  // so a bot that spoofs IPs still gets stopped by the per-email cap, and a bot
  // that cycles emails still gets stopped by the per-IP cap.
  const teamSignupRateLimit = new Map<string, { count: number; resetAt: number }>();
  const WINDOW = 15 * 60 * 1000;
  const MAX_PER_KEY = 3;
  const MAX_LIMITER_ENTRIES = 5000;
  function bumpLimiter(key: string, now: number): boolean {
    // Lazy GC: when the map gets big, sweep expired entries.
    if (teamSignupRateLimit.size > MAX_LIMITER_ENTRIES) {
      for (const [k, v] of teamSignupRateLimit) {
        if (now > v.resetAt) teamSignupRateLimit.delete(k);
      }
      // Hard cap if still oversized — drop oldest by iteration order.
      while (teamSignupRateLimit.size > MAX_LIMITER_ENTRIES) {
        const first = teamSignupRateLimit.keys().next().value;
        if (!first) break;
        teamSignupRateLimit.delete(first);
      }
    }
    const entry = teamSignupRateLimit.get(key);
    if (!entry || now > entry.resetAt) {
      teamSignupRateLimit.set(key, { count: 1, resetAt: now + WINDOW });
      return true;
    }
    if (entry.count >= MAX_PER_KEY) return false;
    entry.count++;
    return true;
  }
  app.post("/api/teams/signup", async (req, res) => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    if (!bumpLimiter(`ip:${ip}`, now)) {
      return res.status(429).json({
        message: "Too many signups from this connection. Please try again in a few minutes.",
      });
    }
    const parsed = teamSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid form data",
      });
    }
    // Honeypot: any value in `website` is almost certainly a bot.
    if (parsed.data.website && parsed.data.website.length > 0) {
      // Pretend success so the bot moves on, but don't actually email.
      return res.json({ ok: true });
    }
    const d = parsed.data;
    // Second axis of rate limiting — by submitted email. Stops a bot that
    // rotates IPs from repeatedly spamming Justin's inbox with the same lead.
    if (!bumpLimiter(`email:${d.contactEmail.toLowerCase()}`, now)) {
      return res.status(429).json({
        message: "We've already received a recent signup with this email. Please wait a few minutes before trying again.",
      });
    }
    const rows: [string, string][] = [
      ["Team Name", d.teamName],
      ["Head Coach", d.headCoach],
      ["Administrator", d.administrator],
      ["Season", d.season],
      ["Age Group", d.ageGroup],
      ["City", d.city],
      ["State", d.state],
      ["Contact Name", d.contactName],
      ["Contact Email", d.contactEmail],
      ["Contact Phone", d.contactPhone],
      ["Address", d.address],
      ["Notes", d.notes],
    ];
    const textBody = rows
      .filter(([, v]) => v && v.length > 0)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const htmlRows = rows
      .filter(([, v]) => v && v.length > 0)
      .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;white-space:nowrap;"><strong>${k}</strong></td><td style="padding:6px 0;color:#111;">${String(v).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</td></tr>`)
      .join("");
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff;">
        <h2 style="color: #1a1a1a; margin-bottom: 6px;">New Team Stats signup</h2>
        <p style="color: #666; font-size: 13px; margin-top: 0;">Submitted via tsteamstats.com</p>
        <table style="border-collapse: collapse; margin-top: 16px; font-size: 14px;">${htmlRows}</table>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">Reply directly to this email to reach ${d.contactName}.</p>
      </div>
    `;
    if (!process.env.SENDGRID_API_KEY) {
      console.log("[team-signup] SendGrid not configured. Payload:\n" + textBody);
      return res.json({ ok: true, dev: true });
    }
    try {
      await sgMail.send({
        from: { name: "TS Team Stats", email: process.env.EMAIL_FROM || "noreply@tssdeals.com" },
        replyTo: { name: d.contactName, email: d.contactEmail },
        to: "justin@twinseamsports.com",
        subject: `[Team Stats Signup] ${d.teamName}${d.ageGroup ? " — " + d.ageGroup : ""}`,
        text: textBody,
        html,
      });
      console.log(`[team-signup] Email sent for ${d.teamName} (${d.contactEmail})`);
      res.json({ ok: true });
    } catch (err) {
      console.error("[team-signup] SendGrid error:", err);
      res.status(500).json({ message: "Could not send signup. Please email justin@twinseamsports.com directly." });
    }
  });

  // ---- Read endpoints (gated) ----
  app.get("/api/team/:slug/roster", requireTeamAccess(), async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const rows = await db.select().from(bbPlayers)
      .where(eq(bbPlayers.teamId, team.id))
      .orderBy(asc(bbPlayers.sortOrder), asc(bbPlayers.name));
    res.json(rows);
  });

  app.get("/api/team/:slug/games", requireTeamAccess(), async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const seasonFilter = typeof req.query.season === "string" && req.query.season.length > 0
      ? req.query.season
      : null;
    const where = seasonFilter
      ? and(eq(bbGames.teamId, team.id), eq(bbGames.season, seasonFilter))
      : eq(bbGames.teamId, team.id);
    const rows = await db.select().from(bbGames)
      .where(where)
      .orderBy(desc(bbGames.gameDate));
    res.json(rows);
  });

  // Distinct list of seasons for which this team has games, plus the current
  // active season (so admins can always see it even before stamping any games).
  app.get("/api/team/:slug/seasons", requireTeamAccess(), async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const rows = await db.select({ season: bbGames.season }).from(bbGames)
      .where(eq(bbGames.teamId, team.id))
      .groupBy(bbGames.season);
    const seasons = new Set<string>(rows.map(r => r.season).filter((s): s is string => !!s));
    if (team.season) seasons.add(team.season);
    res.json({
      current: team.season ?? "Spring 2026",
      seasons: Array.from(seasons).sort(),
    });
  });

  app.get("/api/team/:slug/stats", requireTeamAccess(), async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    try {
      const players = await db.select().from(bbPlayers).where(eq(bbPlayers.teamId, team.id));
      const seasonFilter = typeof req.query.season === "string" && req.query.season.length > 0
        ? req.query.season
        : null;
      const gamesWhere = seasonFilter
        ? and(eq(bbGames.teamId, team.id), eq(bbGames.season, seasonFilter))
        : eq(bbGames.teamId, team.id);
      const games = await db.select().from(bbGames).where(gamesWhere);
      const gameIds = games.map(g => g.id);
      // Optional ?gameIds=a,b,c filter. Intersected with this team's games so a
      // caller can't query across teams. Empty list returns no rows. The full
      // `games` array is still returned so the UI can render filter controls.
      const requestedIds = typeof req.query.gameIds === "string" && req.query.gameIds.length > 0
        ? req.query.gameIds.split(",").map(s => s.trim()).filter(Boolean)
        : null;
      const allowedSet = new Set(gameIds);
      const effectiveIds = requestedIds ? requestedIds.filter(id => allowedSet.has(id)) : gameIds;
      const rawRows = effectiveIds.length
        ? await db.select().from(bbPlayerGame).where(inArray(bbPlayerGame.gameId, effectiveIds))
        : [];
      const mode = parseMode(req.query.mode);
      const rows = applyMode(rawRows, mode);
      // Per-player game counts use distinct gameIds within the filtered rows,
      // so combined mode counts each game once even if both sources had a line.
      const byPlayer = new Map<string, BbPlayerGame[]>();
      for (const r of rows) {
        const arr = byPlayer.get(r.playerId) ?? [];
        arr.push(r); byPlayer.set(r.playerId, arr);
      }
      const leaderboard = players.map(p => ({
        player: p,
        stats: aggregate(byPlayer.get(p.id) ?? []),
      }));
      const teamAgg = aggregate(rows);
      // Counts of source coverage so the UI can hint "GC has X games not in manual".
      const manualGameIds = new Set(rawRows.filter(r => r.source === "manual").map(r => r.gameId));
      const gcGameIds = new Set(rawRows.filter(r => r.source === "gamechanger").map(r => r.gameId));
      const sourceCoverage = {
        manualGames: manualGameIds.size,
        gamechangerGames: gcGameIds.size,
        gamechangerOnlyGames: Array.from(gcGameIds).filter(id => !manualGameIds.has(id)).length,
      };
      res.json({ leaderboard, team: teamAgg, players, games, mode, sourceCoverage });
    } catch (err) {
      console.error(`[team-stats] /stats failed for ${team.slug}:`, err);
      res.status(500).json({ error: "Failed to load stats", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // Per-game / running-total trend series for charting. Honors ?season= and
  // ?mode= like /stats, plus ?window=all|25|20|15|10|5 (last N games by date).
  // Returns offensive + defensive stats only (no pitching). Three values are
  // computed per point: `perGame` (that game alone), `cumulative` (season-to-date),
  // and `windowCumulative` (accumulates across only the selected window). All use
  // the shared aggregate() so rate stats are recomputed from totals, never
  // averaged. Points align positionally to the returned `games` array.
  app.get("/api/team/:slug/trends", requireTeamAccess(), async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    try {
      const players = await db.select().from(bbPlayers).where(eq(bbPlayers.teamId, team.id));
      const seasonFilter = typeof req.query.season === "string" && req.query.season.length > 0
        ? req.query.season
        : null;
      const gamesWhere = seasonFilter
        ? and(eq(bbGames.teamId, team.id), eq(bbGames.season, seasonFilter))
        : eq(bbGames.teamId, team.id);
      const games = await db.select().from(bbGames).where(gamesWhere);
      // Chronological ascending; id as a stable tiebreaker for same-day games.
      const ordered = games.slice().sort((a, b) => {
        const t = new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime();
        return t !== 0 ? t : a.id.localeCompare(b.id);
      });
      // window = last N games (by date). "all" or unparseable -> every game.
      const windowParam = typeof req.query.window === "string" ? req.query.window : "all";
      const windowN = windowParam === "all" ? null : parseInt(windowParam, 10);
      const windowed = windowN && windowN > 0 ? ordered.slice(-windowN) : ordered;
      const windowedIds = new Set(windowed.map(g => g.id));
      const mode = parseMode(req.query.mode);
      // Fetch rows for the FULL season (every ordered game), not just the
      // window, so the cumulative (running-total) line is season-to-date even
      // when a narrow window is selected. Per-game values are unaffected; we
      // only DISPLAY the windowed games.
      const allGameIds = ordered.map(g => g.id);
      const rawRows = allGameIds.length
        ? await db.select().from(bbPlayerGame).where(inArray(bbPlayerGame.gameId, allGameIds))
        : [];
      const rows = applyMode(rawRows, mode);
      // playerId -> (gameId -> single row). applyMode collapses to one row per
      // (game, player), so a plain Map is sufficient.
      const byPlayerGame = new Map<string, Map<string, BbPlayerGame>>();
      for (const r of rows) {
        let m = byPlayerGame.get(r.playerId);
        if (!m) { m = new Map(); byPlayerGame.set(r.playerId, m); }
        m.set(r.gameId, r);
      }
      type TrendPoint = {
        gameId: string;
        played: boolean;
        perGame: ReturnType<typeof trendStats> | null;
        cumulative: ReturnType<typeof trendStats> | null;
        windowCumulative: ReturnType<typeof trendStats> | null;
      };
      const series = players.map(p => {
        const gm = byPlayerGame.get(p.id);
        const acc: BbPlayerGame[] = [];        // season-to-date accumulator
        const accWindow: BbPlayerGame[] = [];  // accumulates only within the window
        let appeared = false;
        // Walk the FULL season so `cumulative` accumulates from the first game,
        // but only emit points for games inside the selected window. A separate
        // `windowCumulative` resets at the window start and builds across the
        // selected games only.
        const points: TrendPoint[] = [];
        for (const g of ordered) {
          const row = gm?.get(g.id) ?? null;
          if (row) acc.push(row);
          const inWindow = windowedIds.has(g.id);
          if (inWindow && row) accWindow.push(row);
          if (!inWindow) continue;
          let perGame: ReturnType<typeof trendStats> | null = null;
          if (row) { appeared = true; perGame = trendStats(aggregate([row])); }
          // cumulative is season-to-date (carries forward across non-played
          // games; null before the player's first appearance of the season).
          const cumulative = acc.length ? trendStats(aggregate(acc)) : null;
          // windowCumulative builds only across the selected games; null before
          // the player's first appearance within the window.
          const windowCumulative = accWindow.length ? trendStats(aggregate(accWindow)) : null;
          points.push({ gameId: g.id, played: !!row, perGame, cumulative, windowCumulative });
        }
        return { player: p, appeared, points };
      });
      const gamesOut = windowed.map(g => ({
        id: g.id, gameDate: g.gameDate, opponent: g.opponent,
        ourScore: g.ourScore, oppScore: g.oppScore,
      }));
      res.json({ games: gamesOut, series, mode, window: windowParam });
    } catch (err) {
      console.error(`[team-stats] /trends failed for ${team.slug}:`, err);
      res.status(500).json({ error: "Failed to load trends", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // Fielding broken down by position (1-10 + UA). Honors ?season= and ?mode=
  // exactly like /stats. Uses bb_player_fielding detail rows where present and
  // falls back to the single (position, po, a, e) on bb_player_game otherwise.
  app.get("/api/team/:slug/fielding-by-position", requireTeamAccess(), async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    try {
      const players = await db.select().from(bbPlayers).where(eq(bbPlayers.teamId, team.id));
      const playerName = new Map(players.map(p => [p.id, p.name]));
      const seasonFilter = typeof req.query.season === "string" && req.query.season.length > 0
        ? req.query.season
        : null;
      const gamesWhere = seasonFilter
        ? and(eq(bbGames.teamId, team.id), eq(bbGames.season, seasonFilter))
        : eq(bbGames.teamId, team.id);
      const games = await db.select().from(bbGames).where(gamesWhere);
      const gameIds = games.map(g => g.id);
      const mode = parseMode(req.query.mode);

      const pgRows = gameIds.length
        ? await db.select().from(bbPlayerGame).where(inArray(bbPlayerGame.gameId, gameIds))
        : [];
      const detailRows = gameIds.length
        ? await db.select().from(bbPlayerFielding).where(inArray(bbPlayerFielding.gameId, gameIds))
        : [];

      // Decide which source to use per (game, player) under the chosen mode,
      // mirroring applyMode: manual/gamechanger pick that source; combined
      // prefers manual and falls back to gamechanger.
      const chosenSource = new Map<string, "manual" | "gamechanger">();
      for (const r of pgRows) {
        const key = `${r.gameId}|${r.playerId}`;
        const src = r.source === "gamechanger" ? "gamechanger" : "manual";
        if (mode === "manual" && src !== "manual") continue;
        if (mode === "gamechanger" && src !== "gamechanger") continue;
        const cur = chosenSource.get(key);
        if (!cur || (cur !== "manual" && src === "manual")) chosenSource.set(key, src);
      }

      const detailByKey = new Map<string, BbPlayerFielding[]>();
      for (const d of detailRows) {
        const key = `${d.gameId}|${d.playerId}|${d.source}`;
        const arr = detailByKey.get(key) ?? [];
        arr.push(d); detailByKey.set(key, arr);
      }

      // pos -> { po, a, e, players: Map<playerId, {po,a,e}> }
      const byPos = new Map<string, { po: number; a: number; e: number; players: Map<string, { po: number; a: number; e: number }> }>();
      const bump = (pos: string, playerId: string, po: number, a: number, e: number) => {
        if (po === 0 && a === 0 && e === 0) return;
        const code = normalizePosition(pos);
        let entry = byPos.get(code);
        if (!entry) { entry = { po: 0, a: 0, e: 0, players: new Map() }; byPos.set(code, entry); }
        entry.po += po; entry.a += a; entry.e += e;
        const pp = entry.players.get(playerId) ?? { po: 0, a: 0, e: 0 };
        pp.po += po; pp.a += a; pp.e += e;
        entry.players.set(playerId, pp);
      };

      for (const r of pgRows) {
        const key = `${r.gameId}|${r.playerId}`;
        const src = r.source === "gamechanger" ? "gamechanger" : "manual";
        if (chosenSource.get(key) !== src) continue;
        const details = detailByKey.get(`${r.gameId}|${r.playerId}|${src}`);
        if (details && details.length) {
          for (const d of details) bump(d.position, r.playerId, num(d.po), num(d.a), num(d.e));
        } else {
          bump(r.position ?? "UA", r.playerId, num(r.po), num(r.a), num(r.e));
        }
      }

      // Fold in team-level (player-less) fielding so each position total
      // COMBINES per-player chances with team-only entries. Surfaced as a
      // synthetic "Team (unattributed)" breakdown line. Mode is honored per
      // (game, position): manual/gamechanger pick that source; combined prefers
      // manual and falls back to gamechanger.
      const teamRows = gameIds.length
        ? await db.select().from(bbTeamFielding).where(inArray(bbTeamFielding.gameId, gameIds))
        : [];
      const chosenTeamSrc = new Map<string, "manual" | "gamechanger">();
      for (const r of teamRows) {
        const key = `${r.gameId}|${normalizePosition(r.position)}`;
        const src = r.source === "gamechanger" ? "gamechanger" : "manual";
        if (mode === "manual" && src !== "manual") continue;
        if (mode === "gamechanger" && src !== "gamechanger") continue;
        const cur = chosenTeamSrc.get(key);
        if (!cur || (cur !== "manual" && src === "manual")) chosenTeamSrc.set(key, src);
      }
      if (teamRows.length) playerName.set("__team__", "Team (unattributed)");
      for (const r of teamRows) {
        const code = normalizePosition(r.position);
        const src = r.source === "gamechanger" ? "gamechanger" : "manual";
        if (chosenTeamSrc.get(`${r.gameId}|${code}`) !== src) continue;
        bump(code, "__team__", num(r.po), num(r.a), num(r.e));
      }

      const positions = Array.from(byPos.entries())
        .map(([code, v]) => {
          const chances = v.po + v.a + v.e;
          return {
            position: code,
            label: FIELD_POS_LABEL.get(code) ?? code,
            po: v.po, a: v.a, e: v.e,
            fpct: chances > 0 ? (v.po + v.a) / chances : null,
            players: Array.from(v.players.entries())
              .map(([playerId, s]) => ({ playerId, name: playerName.get(playerId) ?? "Unknown", po: s.po, a: s.a, e: s.e }))
              .sort((x, y) => (y.po + y.a + y.e) - (x.po + x.a + x.e) || x.name.localeCompare(y.name)),
          };
        })
        .sort((x, y) => (FIELD_POS_ORDER.get(x.position) ?? 99) - (FIELD_POS_ORDER.get(y.position) ?? 99));

      res.json({ positions, mode, season: seasonFilter });
    } catch (err) {
      console.error(`[team-stats] /fielding-by-position failed for ${team.slug}:`, err);
      res.status(500).json({ error: "Failed to load fielding", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // Side-by-side Manual vs GameChanger comparison.
  // Query: ?gameIds=a,b,c (optional). If omitted, defaults to all games that have BOTH sources.
  app.get("/api/team/:slug/compare", requireTeamAccess(), async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    try {
      const players = await db.select().from(bbPlayers).where(eq(bbPlayers.teamId, team.id));
      const cmpSeasonFilter = typeof req.query.season === "string" && req.query.season.length > 0
        ? req.query.season
        : null;
      const cmpGamesWhere = cmpSeasonFilter
        ? and(eq(bbGames.teamId, team.id), eq(bbGames.season, cmpSeasonFilter))
        : eq(bbGames.teamId, team.id);
      const allGames = await db.select().from(bbGames).where(cmpGamesWhere);
      const allGameIds = allGames.map(g => g.id);
      const allRows = allGameIds.length
        ? await db.select().from(bbPlayerGame).where(inArray(bbPlayerGame.gameId, allGameIds))
        : [];
      // Games that have at least one manual row AND at least one gamechanger row.
      const manualByGame = new Set(allRows.filter(r => r.source === "manual").map(r => r.gameId));
      const gcByGame = new Set(allRows.filter(r => r.source === "gamechanger").map(r => r.gameId));
      const overlappingGameIds = allGames
        .filter(g => manualByGame.has(g.id) && gcByGame.has(g.id))
        .map(g => g.id);
      // Parse optional gameIds filter; restrict to the overlap set so callers can't compare apples to oranges.
      const requested = typeof req.query.gameIds === "string" && req.query.gameIds.length > 0
        ? req.query.gameIds.split(",").map(s => s.trim()).filter(Boolean)
        : null;
      const selectedIds = (requested ?? overlappingGameIds).filter(id => overlappingGameIds.includes(id));
      const selectedSet = new Set(selectedIds);
      const selectedGames = allGames.filter(g => selectedSet.has(g.id));
      const inScope = allRows.filter(r => selectedSet.has(r.gameId));
      const rows = players.map(p => {
        const manualRows = inScope.filter(r => r.playerId === p.id && r.source === "manual");
        const gcRows = inScope.filter(r => r.playerId === p.id && r.source === "gamechanger");
        return { player: p, manual: aggregate(manualRows), gc: aggregate(gcRows) };
      });
      res.json({ rows, games: selectedGames, overlappingGameIds, allGames });
    } catch (err) {
      console.error(`[team-stats] /compare failed for ${team.slug}:`, err);
      res.status(500).json({ error: "Failed to load comparison", detail: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/team/:slug/game/:gameId/stats", requireTeamAccess(), async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const game = await db.select().from(bbGames)
      .where(and(eq(bbGames.id, req.params.gameId), eq(bbGames.teamId, team.id))).limit(1);
    if (!game[0]) return res.status(404).json({ message: "Game not found" });
    const rawRows = await db.select().from(bbPlayerGame).where(eq(bbPlayerGame.gameId, req.params.gameId));
    const mode = parseMode(req.query.mode);
    const rows = applyMode(rawRows, mode);
    res.json({ game: game[0], rows, mode });
  });

  // ---- Admin endpoints (TSS admin only) ----
  app.post("/api/team/:slug/admin/players", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = z.object({
      name: z.string().min(1),
      jerseyNumber: z.string().optional(),
      position: z.string().optional(),
      sortOrder: z.number().int().optional(),
    }).parse(req.body);
    const [row] = await db.insert(bbPlayers).values({ teamId: team.id, ...body }).returning();
    res.status(201).json(row);
  });

  app.patch("/api/team/:slug/admin/players/:id", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = z.object({
      name: z.string().min(1).optional(),
      jerseyNumber: z.string().nullable().optional(),
      position: z.string().nullable().optional(),
      active: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    }).parse(req.body);
    const [row] = await db.update(bbPlayers).set(body)
      .where(and(eq(bbPlayers.id, req.params.id), eq(bbPlayers.teamId, team.id))).returning();
    if (!row) return res.status(404).json({ message: "Player not found" });
    res.json(row);
  });

  app.delete("/api/team/:slug/admin/players/:id", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    await db.delete(bbPlayers).where(and(eq(bbPlayers.id, req.params.id), eq(bbPlayers.teamId, team.id)));
    res.json({ ok: true });
  });

  app.post("/api/team/:slug/admin/games", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = z.object({
      gameDate: z.string(),
      opponent: z.string().min(1),
      location: z.string().nullable().optional(),
      ourScore: z.number().int().nullable().optional(),
      oppScore: z.number().int().nullable().optional(),
      notes: z.string().nullable().optional(),
    }).parse(req.body);
    const [row] = await db.insert(bbGames).values({
      teamId: team.id, ...body, gameDate: new Date(body.gameDate),
      season: team.season ?? "Spring 2026",
    }).returning();
    res.status(201).json(row);
  });

  app.patch("/api/team/:slug/admin/games/:id", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = z.object({
      gameDate: z.string().optional(),
      opponent: z.string().min(1).optional(),
      location: z.string().nullable().optional(),
      ourScore: z.number().int().nullable().optional(),
      oppScore: z.number().int().nullable().optional(),
      notes: z.string().nullable().optional(),
      season: z.string().min(1).max(50).optional(),
    }).parse(req.body);
    const patch: Record<string, unknown> = { ...body };
    if (body.gameDate) patch.gameDate = new Date(body.gameDate);
    const [row] = await db.update(bbGames).set(patch)
      .where(and(eq(bbGames.id, req.params.id), eq(bbGames.teamId, team.id))).returning();
    if (!row) return res.status(404).json({ message: "Game not found" });
    return res.json(row);
  });

  // Update the team's current active season. New games (manual entry, scorebook
  // scan, Excel/GC upload) are stamped with this value going forward. Existing
  // games keep their original season tag — admins can move individual games
  // between seasons via the per-game PATCH if needed.
  app.patch("/api/team/:slug/admin/season", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = z.object({ season: z.string().min(1).max(50) }).parse(req.body);
    const next = body.season.trim();
    if (!next) return res.status(400).json({ message: "Season cannot be blank" });
    const [updated] = await db.update(bbTeams).set({ season: next })
      .where(eq(bbTeams.id, team.id)).returning();
    res.json({ ok: true, season: updated.season });
  });

  app.delete("/api/team/:slug/admin/games/:id", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    await db.delete(bbGames).where(and(eq(bbGames.id, req.params.id), eq(bbGames.teamId, team.id)));
    res.json({ ok: true });
  });

  // Full per-game admin view: the game + every attached stat-line row (both
  // manual and GameChanger sources) joined with player name/jersey. Powers
  // the Game Details dialog in the admin tab so the admin can inspect and
  // edit each player's line without leaving the games list.
  app.get("/api/team/:slug/admin/game/:id/stats", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const [game] = await db.select().from(bbGames)
      .where(and(eq(bbGames.id, req.params.id), eq(bbGames.teamId, team.id))).limit(1);
    if (!game) return res.status(404).json({ message: "Game not found" });
    const rows = await db
      .select({
        row: bbPlayerGame,
        playerName: bbPlayers.name,
        jerseyNumber: bbPlayers.jerseyNumber,
        playerSort: bbPlayers.sortOrder,
      })
      .from(bbPlayerGame)
      .innerJoin(bbPlayers, eq(bbPlayers.id, bbPlayerGame.playerId))
      .where(eq(bbPlayerGame.gameId, req.params.id));
    // Sort by source (manual first), then by batting order (nulls last), then
    // by roster sort order, then by name.
    rows.sort((a, b) => {
      if (a.row.source !== b.row.source) return a.row.source === "manual" ? -1 : 1;
      const ba = a.row.battingOrder ?? 9999, bb_ = b.row.battingOrder ?? 9999;
      if (ba !== bb_) return ba - bb_;
      const sa = a.playerSort ?? 9999, sb = b.playerSort ?? 9999;
      if (sa !== sb) return sa - sb;
      return a.playerName.localeCompare(b.playerName);
    });
    res.json({
      game,
      rows: rows.map(r => ({ ...r.row, playerName: r.playerName, jerseyNumber: r.jerseyNumber })),
    });
  });

  // Delete one specific player_game stat row by id (any source). Used by the
  // Game Details dialog to remove a wrong entry without affecting the game
  // itself or that player's other games.
  app.delete("/api/team/:slug/admin/stats/:id", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    // Verify the stat row belongs to one of this team's games before deleting.
    const [row] = await db
      .select({ id: bbPlayerGame.id, gameId: bbPlayerGame.gameId, playerId: bbPlayerGame.playerId, source: bbPlayerGame.source })
      .from(bbPlayerGame)
      .innerJoin(bbGames, eq(bbGames.id, bbPlayerGame.gameId))
      .where(and(eq(bbPlayerGame.id, req.params.id), eq(bbGames.teamId, team.id)))
      .limit(1);
    if (!row) return res.status(404).json({ message: "Stat row not found" });
    await db.delete(bbPlayerGame).where(eq(bbPlayerGame.id, req.params.id));
    // Remove the matching per-position fielding split so it can't reappear if a
    // stat line is later recreated for the same (game, player, source).
    await db.delete(bbPlayerFielding).where(and(
      eq(bbPlayerFielding.gameId, row.gameId),
      eq(bbPlayerFielding.playerId, row.playerId),
      eq(bbPlayerFielding.source, row.source),
    ));
    res.json({ ok: true });
  });

  // How many stat rows are attached to one game, grouped by source.
  // Powers the "live reconcile" warning on the Edit/Add Game dialog so the admin
  // can see what data will be carried with the game (or what they'd be detaching
  // from future GameChanger uploads by changing the date/opponent).
  app.get("/api/team/:slug/admin/games/:id/attached-stats", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const game = await db.select().from(bbGames)
      .where(and(eq(bbGames.id, req.params.id), eq(bbGames.teamId, team.id))).limit(1);
    if (!game[0]) return res.status(404).json({ message: "Game not found" });
    const rows = await db.select().from(bbPlayerGame).where(eq(bbPlayerGame.gameId, req.params.id));
    const manual = rows.filter(r => r.source === "manual").length;
    const gamechanger = rows.filter(r => r.source === "gamechanger").length;
    const playerIdsManual = new Set(rows.filter(r => r.source === "manual").map(r => r.playerId));
    const playerIdsGc = new Set(rows.filter(r => r.source === "gamechanger").map(r => r.playerId));
    res.json({
      game: game[0],
      manual, gamechanger,
      players: { manual: playerIdsManual.size, gamechanger: playerIdsGc.size },
    });
  });

  // Find likely duplicate games across sources so the admin can merge them.
  // A pair is flagged when two games look like the same real-world game:
  //   - same date, similar opponent (Levenshtein ratio >= 0.6 after normalizing)
  //   - adjacent dates (<=1 day apart) with the same normalized opponent
  // The response also surfaces the per-source stat-row counts on each side so
  // the admin can pick which to keep.
  app.get("/api/team/:slug/admin/reconcile", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const games = await db.select().from(bbGames).where(eq(bbGames.teamId, team.id));
    if (games.length < 2) return res.json({ pairs: [] });
    const allRows = await db.select().from(bbPlayerGame).where(inArray(bbPlayerGame.gameId, games.map(g => g.id)));
    const counts = new Map<string, { manual: number; gamechanger: number }>();
    for (const g of games) counts.set(g.id, { manual: 0, gamechanger: 0 });
    for (const r of allRows) {
      const c = counts.get(r.gameId); if (!c) continue;
      if (r.source === "manual") c.manual++;
      else if (r.source === "gamechanger") c.gamechanger++;
    }
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    const dayKey = (d: Date | string) => {
      const s = typeof d === "string" ? d : d.toISOString();
      return s.slice(0, 10);
    };
    const dayDelta = (a: Date | string, b: Date | string) => {
      const ax = new Date(typeof a === "string" ? a : a.toISOString()).getTime();
      const bx = new Date(typeof b === "string" ? b : b.toISOString()).getTime();
      return Math.abs(ax - bx) / 86400000;
    };
    function lev(a: string, b: string): number {
      if (a === b) return 0;
      const m = a.length, n = b.length;
      if (!m) return n; if (!n) return m;
      let prev = new Array<number>(n + 1);
      for (let j = 0; j <= n; j++) prev[j] = j;
      for (let i = 1; i <= m; i++) {
        const cur = new Array<number>(n + 1);
        cur[0] = i;
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        prev = cur;
      }
      return prev[n];
    }
    const pairs: any[] = [];
    for (let i = 0; i < games.length; i++) {
      for (let j = i + 1; j < games.length; j++) {
        const a = games[i], b = games[j];
        const na = norm(a.opponent), nb = norm(b.opponent);
        const sameDay = dayKey(a.gameDate) === dayKey(b.gameDate);
        const closeDay = dayDelta(a.gameDate, b.gameDate) <= 1;
        let reason: string | null = null;
        if (sameDay && na === nb) reason = "Same date and opponent (possible duplicate)";
        else if (sameDay) {
          const d = lev(na, nb);
          const ratio = 1 - d / Math.max(na.length, nb.length, 1);
          if (ratio >= 0.6 || na.includes(nb) || nb.includes(na)) reason = "Same date, similar opponent";
        } else if (closeDay && na === nb) {
          reason = "Adjacent dates, same opponent";
        }
        if (!reason) continue;
        const ca = counts.get(a.id) ?? { manual: 0, gamechanger: 0 };
        const cb = counts.get(b.id) ?? { manual: 0, gamechanger: 0 };
        pairs.push({ a: { ...a, counts: ca }, b: { ...b, counts: cb }, reason });
      }
    }
    res.json({ pairs });
  });

  // Merge `mergeFromId` into `keepId`: re-parents every stat row from the source
  // game onto the kept game, then deletes the source game. Conflicts on
  // (game_id, player_id, source) are resolved by keeping the row already on the
  // target game (the source row is dropped). Both games must belong to this team.
  app.post("/api/team/:slug/admin/games/:keepId/merge", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = z.object({ mergeFromId: z.string().min(1) }).parse(req.body);
    const keepId = req.params.keepId;
    if (keepId === body.mergeFromId) return res.status(400).json({ message: "keepId and mergeFromId must differ" });
    const both = await db.select().from(bbGames)
      .where(and(inArray(bbGames.id, [keepId, body.mergeFromId]), eq(bbGames.teamId, team.id)));
    if (both.length !== 2) return res.status(404).json({ message: "One or both games not found for this team" });
    const fromRows = await db.select().from(bbPlayerGame).where(eq(bbPlayerGame.gameId, body.mergeFromId));
    const keepRows = await db.select().from(bbPlayerGame).where(eq(bbPlayerGame.gameId, keepId));
    const keepKeySet = new Set(keepRows.map(r => `${r.playerId}|${r.source}`));
    let moved = 0, dropped = 0;
    for (const r of fromRows) {
      const k = `${r.playerId}|${r.source}`;
      if (keepKeySet.has(k)) {
        // Conflict: target already has this player+source — drop the source row
        // and its per-position fielding split (keep game's data wins).
        await db.delete(bbPlayerGame).where(eq(bbPlayerGame.id, r.id));
        await db.delete(bbPlayerFielding).where(and(
          eq(bbPlayerFielding.gameId, body.mergeFromId),
          eq(bbPlayerFielding.playerId, r.playerId),
          eq(bbPlayerFielding.source, r.source),
        ));
        dropped++;
      } else {
        await db.update(bbPlayerGame).set({ gameId: keepId, updatedAt: new Date() }).where(eq(bbPlayerGame.id, r.id));
        // Re-parent the matching fielding split onto the kept game. No unique
        // conflict is possible: keep had no row for this (player, source).
        await db.update(bbPlayerFielding).set({ gameId: keepId }).where(and(
          eq(bbPlayerFielding.gameId, body.mergeFromId),
          eq(bbPlayerFielding.playerId, r.playerId),
          eq(bbPlayerFielding.source, r.source),
        ));
        moved++;
        keepKeySet.add(k);
      }
    }
    // Re-parent team-level (player-less) fielding the same way, keyed by
    // (position, source). Conflicts keep the target game's row. Without this the
    // FK cascade on game delete would silently drop the source game's team
    // fielding.
    const fromTeamFielding = await db.select().from(bbTeamFielding).where(eq(bbTeamFielding.gameId, body.mergeFromId));
    const keepTeamFielding = await db.select().from(bbTeamFielding).where(eq(bbTeamFielding.gameId, keepId));
    const keepTfKeys = new Set(keepTeamFielding.map(r => `${r.position}|${r.source}`));
    for (const r of fromTeamFielding) {
      const k = `${r.position}|${r.source}`;
      if (keepTfKeys.has(k)) {
        await db.delete(bbTeamFielding).where(eq(bbTeamFielding.id, r.id));
      } else {
        await db.update(bbTeamFielding).set({ gameId: keepId, updatedAt: new Date() }).where(eq(bbTeamFielding.id, r.id));
        keepTfKeys.add(k);
      }
    }
    await db.delete(bbGames).where(and(eq(bbGames.id, body.mergeFromId), eq(bbGames.teamId, team.id)));
    res.json({ ok: true, moved, dropped });
  });

  // ---------------------------------------------------------------------------
  // Coach Poll — public submit + admin review.
  // The poll is open to anyone with the team URL (no team password gate); each
  // coach role can only have ONE response, removable by the TSS admin.
  // ---------------------------------------------------------------------------
  type CoachRoster = { role: string; firstName: string; lastName: string; variations: string[] };
  const COACH_ROSTER: CoachRoster[] = [
    { role: "Head Coach", firstName: "Skyler", lastName: "Kinsey", variations: ["Coach Skyler", "Sky", "HC"] },
    { role: "Asst 1", firstName: "Wesley", lastName: "Horan", variations: ["Wes", "Coach Wes", "Coach Wesley"] },
    { role: "Asst 2", firstName: "Davey", lastName: "Templeton", variations: ["Dave", "David"] },
    { role: "Asst 3", firstName: "Bradley", lastName: "Mynatt", variations: ["Brad"] },
    { role: "Asst 4", firstName: "Johnny", lastName: "Hill", variations: ["John", "Jonni", "Jon"] },
    { role: "Asst 5", firstName: "Brent", lastName: "Holley", variations: [] },
    { role: "Asst 6", firstName: "Nathan", lastName: "Capps", variations: ["Nate"] },
  ];
  function normalizeName(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
  }
  function matchCoachByName(input: string): CoachRoster | null {
    const norm = normalizeName(input);
    if (!norm) return null;
    for (const c of COACH_ROSTER) {
      const candidates = [c.firstName, c.lastName, ...c.variations].map(normalizeName);
      if (candidates.includes(norm)) return c;
    }
    return null;
  }
  const rankingSchema = z.object({
    speed: z.number().int().min(1).max(5),
    brIQ: z.number().int().min(1).max(5),
  });
  const pollSubmitSchema = z.object({
    name: z.string().min(1).max(80),
    rankings: z.record(z.string(), rankingSchema),
  });

  // Public meta: returns the active roster (player names + ids), the coach
  // roles list, and which roles have already submitted (no rankings exposed).
  app.get("/api/team/:slug/poll/meta", async (req, res) => {
    const team = await getTeamBySlug(req.params.slug);
    if (!team) return res.status(404).json({ message: "Team not found" });
    const players = await db.select().from(bbPlayers)
      .where(and(eq(bbPlayers.teamId, team.id), eq(bbPlayers.active, true)))
      .orderBy(asc(bbPlayers.sortOrder), asc(bbPlayers.name));
    const responses = await db.select({ coachRole: bbCoachPollResponses.coachRole, isCoach: bbCoachPollResponses.isCoach })
      .from(bbCoachPollResponses).where(eq(bbCoachPollResponses.teamId, team.id));
    const submitted = new Set(responses.filter(r => r.isCoach && r.coachRole).map(r => r.coachRole as string));
    res.json({
      players: players.map(p => ({ id: p.id, name: p.name, jerseyNumber: p.jerseyNumber })),
      coachRoles: COACH_ROSTER.map(c => ({
        role: c.role,
        firstName: c.firstName,
        lastName: c.lastName,
        variations: c.variations,
        submitted: submitted.has(c.role),
      })),
    });
  });

  // Validate the entered name and tell the caller (a) whether the name matches
  // a rostered coach (and which role) or (b) it's a non-coach submission, and
  // (c) whether THAT identity has already submitted (coach: by role; non-coach:
  // by lower-cased name).
  app.post("/api/team/:slug/poll/check-name", requireTeamAccess(), async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = z.object({ name: z.string().min(1).max(80) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Name required" });
    const match = matchCoachByName(body.data.name);
    if (match) {
      const existing = await db.select().from(bbCoachPollResponses)
        .where(and(
          eq(bbCoachPollResponses.teamId, team.id),
          eq(bbCoachPollResponses.isCoach, true),
          eq(bbCoachPollResponses.coachRole, match.role),
        ))
        .limit(1);
      return res.json({ isCoach: true, role: match.role, alreadySubmitted: !!existing[0] });
    }
    const nameLower = body.data.name.trim().toLowerCase();
    const existing = await db.select().from(bbCoachPollResponses)
      .where(and(
        eq(bbCoachPollResponses.teamId, team.id),
        eq(bbCoachPollResponses.isCoach, false),
        dsql`lower(${bbCoachPollResponses.submittedName}) = ${nameLower}`,
      ))
      .limit(1);
    res.json({ isCoach: false, role: null, alreadySubmitted: !!existing[0] });
  });

  app.post("/api/team/:slug/poll/submit", requireTeamAccess(), async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const parsed = pollSubmitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid submission" });
    const match = matchCoachByName(parsed.data.name);
    const isCoach = !!match;
    // Validate every playerId belongs to this team + every player is ranked.
    const players = await db.select().from(bbPlayers)
      .where(and(eq(bbPlayers.teamId, team.id), eq(bbPlayers.active, true)));
    const playerIds = new Set(players.map(p => p.id));
    const submittedIds = Object.keys(parsed.data.rankings);
    for (const id of submittedIds) {
      if (!playerIds.has(id)) return res.status(400).json({ message: "Unknown player in rankings" });
    }
    for (const p of players) {
      const r = parsed.data.rankings[p.id];
      if (!r) return res.status(400).json({ message: `Missing ranking for ${p.name}` });
    }
    // Refuse if this identity has already submitted — admin must remove first.
    if (isCoach) {
      const existing = await db.select().from(bbCoachPollResponses)
        .where(and(
          eq(bbCoachPollResponses.teamId, team.id),
          eq(bbCoachPollResponses.isCoach, true),
          eq(bbCoachPollResponses.coachRole, match!.role),
        ))
        .limit(1);
      if (existing[0]) {
        return res.status(409).json({
          message: "This coach already submitted answers. Please text Justin at 865-468-8946 to have your previous response removed.",
        });
      }
    } else {
      const nameLower = parsed.data.name.trim().toLowerCase();
      const existing = await db.select().from(bbCoachPollResponses)
        .where(and(
          eq(bbCoachPollResponses.teamId, team.id),
          eq(bbCoachPollResponses.isCoach, false),
          dsql`lower(${bbCoachPollResponses.submittedName}) = ${nameLower}`,
        ))
        .limit(1);
      if (existing[0]) {
        return res.status(409).json({
          message: "You've already submitted a response. Please text Justin at 865-468-8946 to have your previous response removed.",
        });
      }
    }
    const [row] = await db.insert(bbCoachPollResponses).values({
      teamId: team.id,
      coachRole: isCoach ? match!.role : null,
      isCoach,
      submittedName: parsed.data.name.trim(),
      rankings: parsed.data.rankings,
    }).returning();
    res.json({ ok: true, id: row.id, role: isCoach ? match!.role : null, isCoach });
  });

  // Admin: list all responses for review. Returns two buckets — `coaches`
  // (every rostered role, even unsubmitted ones, so admins see who's missing)
  // and `nonCoaches` (everyone else who submitted, identified by name).
  app.get("/api/team/:slug/admin/poll-responses", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const rows = await db.select().from(bbCoachPollResponses)
      .where(eq(bbCoachPollResponses.teamId, team.id));
    const byRole = new Map<string, BbCoachPollResponse>();
    for (const r of rows) {
      if (r.isCoach && r.coachRole) byRole.set(r.coachRole, r);
    }
    const coaches = COACH_ROSTER.map(c => {
      const r = byRole.get(c.role);
      return {
        role: c.role,
        firstName: c.firstName,
        lastName: c.lastName,
        variations: c.variations,
        response: r ? {
          id: r.id,
          submittedName: r.submittedName,
          rankings: r.rankings as Record<string, { speed: number; brIQ: number }>,
          createdAt: r.createdAt,
        } : null,
      };
    });
    const nonCoaches = rows
      .filter(r => !r.isCoach)
      .map(r => ({
        id: r.id,
        submittedName: r.submittedName,
        rankings: r.rankings as Record<string, { speed: number; brIQ: number }>,
        createdAt: r.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // Back-compat: keep the old `responses` field so existing clients don't break.
    res.json({ coaches, nonCoaches, responses: coaches });
  });

  // Admin: delete a single coach response by role so the coach can resubmit.
  app.delete("/api/team/:slug/admin/poll-responses/:coachRole", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const role = decodeURIComponent((req.params as Record<string, string>).coachRole);
    await db.delete(bbCoachPollResponses)
      .where(and(
        eq(bbCoachPollResponses.teamId, team.id),
        eq(bbCoachPollResponses.isCoach, true),
        eq(bbCoachPollResponses.coachRole, role),
      ));
    res.json({ ok: true });
  });

  // Admin: download an Excel summary of the speed / baserunning poll.
  // Includes three summary sheets (All / Coaches Only / Non-Coaches Only) with
  // per-player average Speed + average brIQ + #ratings, plus a Raw Responses
  // sheet that lists every (responder x player) row.
  app.get("/api/team/:slug/admin/poll-responses/export.xlsx", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const rows = await db.select().from(bbCoachPollResponses)
      .where(eq(bbCoachPollResponses.teamId, team.id));
    const players = await db.select().from(bbPlayers)
      .where(eq(bbPlayers.teamId, team.id));
    const playersSorted = [...players].sort((a, b) => {
      const ja = Number(a.jerseyNumber ?? 9999), jb = Number(b.jerseyNumber ?? 9999);
      if (ja !== jb) return ja - jb;
      return a.name.localeCompare(b.name);
    });

    type Agg = { speedSum: number; speedN: number; iqSum: number; iqN: number };
    const summarize = (subset: typeof rows) => {
      const agg = new Map<string, Agg>();
      for (const r of subset) {
        const ranks = (r.rankings as Record<string, { speed?: number; brIQ?: number }>) || {};
        for (const [pid, v] of Object.entries(ranks)) {
          const a = agg.get(pid) ?? { speedSum: 0, speedN: 0, iqSum: 0, iqN: 0 };
          if (typeof v?.speed === "number") { a.speedSum += v.speed; a.speedN += 1; }
          if (typeof v?.brIQ === "number") { a.iqSum += v.brIQ; a.iqN += 1; }
          agg.set(pid, a);
        }
      }
      return playersSorted.map(p => {
        const a = agg.get(p.id);
        return {
          jersey: p.jerseyNumber ?? "",
          name: p.name,
          avgSpeed: a && a.speedN ? Number((a.speedSum / a.speedN).toFixed(2)) : null,
          avgIq: a && a.iqN ? Number((a.iqSum / a.iqN).toFixed(2)) : null,
          n: Math.max(a?.speedN ?? 0, a?.iqN ?? 0),
        };
      });
    };

    const coachRows = rows.filter(r => r.isCoach);
    const nonCoachRows = rows.filter(r => !r.isCoach);
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const buildSheet = (label: string, subset: typeof rows) => {
      const summary = summarize(subset);
      // Sort by avg speed desc (nulls last) so fastest perceived players sit on top.
      summary.sort((a, b) => {
        const sa = a.avgSpeed ?? -Infinity, sb = b.avgSpeed ?? -Infinity;
        return sb - sa;
      });
      const aoa: any[][] = [
        [`${label}`, "", "", "", ""],
        [`Responses included: ${subset.length}`, "", "", "", ""],
        [],
        ["Player #", "Player", "Avg Speed", "Avg brIQ", "# Ratings"],
        ...summary.map(s => [s.jersey, s.name, s.avgSpeed ?? "", s.avgIq ?? "", s.n]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      (ws as any)["!cols"] = [{ wch: 8 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
      return ws;
    };

    XLSX.utils.book_append_sheet(wb, buildSheet("Summary — All Responses", rows), "All");
    XLSX.utils.book_append_sheet(wb, buildSheet("Summary — Coaches Only", coachRows), "Coaches");
    XLSX.utils.book_append_sheet(wb, buildSheet("Summary — Non-Coaches Only", nonCoachRows), "Non-Coaches");

    // Raw responses sheet
    const rawAoa: any[][] = [
      ["Submitted Name", "Type", "Coach Role", "Submitted At", "Player #", "Player", "Speed", "brIQ"],
    ];
    const playerById = new Map(playersSorted.map(p => [p.id, p]));
    const rowsSorted = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    for (const r of rowsSorted) {
      const ranks = (r.rankings as Record<string, { speed?: number; brIQ?: number }>) || {};
      for (const p of playersSorted) {
        const v = ranks[p.id];
        if (!v) continue;
        rawAoa.push([
          r.submittedName,
          r.isCoach ? "Coach" : "Non-Coach",
          r.coachRole ?? "",
          new Date(r.createdAt).toISOString(),
          p.jerseyNumber ?? "",
          p.name,
          typeof v.speed === "number" ? v.speed : "",
          typeof v.brIQ === "number" ? v.brIQ : "",
        ]);
      }
    }
    const wsRaw = XLSX.utils.aoa_to_sheet(rawAoa);
    (wsRaw as any)["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 8 }, { wch: 24 }, { wch: 8 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, wsRaw, "Raw Responses");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${team.slug}-coach-poll-${today}.xlsx"`);
    res.send(buf);
  });

  // Admin: delete a non-coach response by id.
  app.delete("/api/team/:slug/admin/poll-responses/non-coach/:id", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const id = (req.params as Record<string, string>).id;
    await db.delete(bbCoachPollResponses)
      .where(and(
        eq(bbCoachPollResponses.teamId, team.id),
        eq(bbCoachPollResponses.isCoach, false),
        eq(bbCoachPollResponses.id, id),
      ));
    res.json({ ok: true });
  });

  const statLineSchema = z.object({
    gameId: z.string(),
    playerId: z.string(),
    source: z.enum(["manual", "gamechanger"]).optional(),
    ab: z.number().int().nullable().optional(),
    r: z.number().int().nullable().optional(),
    h: z.number().int().nullable().optional(),
    doubles: z.number().int().nullable().optional(),
    triples: z.number().int().nullable().optional(),
    hr: z.number().int().nullable().optional(),
    bb: z.number().int().nullable().optional(),
    k: z.number().int().nullable().optional(),
    sb: z.number().int().nullable().optional(),
    sac: z.number().int().nullable().optional(),
    rbi: z.number().int().nullable().optional(),
    po: z.number().int().nullable().optional(),
    a: z.number().int().nullable().optional(),
    e: z.number().int().nullable().optional(),
    // Position the player started the game at ("1"-"10"/"UA"); "" clears it.
    startingPosition: z.string().max(10).nullable().optional(),
    // Per-game lineup spot (1 = leadoff). Null clears it.
    battingOrder: z.number().int().nullable().optional(),
    // Offensive: batter reached base because of a fielder's error. Tracked
    // separately from the fielding `e` column above (which is defensive errors
    // charged TO this player).
    roe: z.number().int().nullable().optional(),
    // Offensive: fielder's choice (batter reached safely on an out elsewhere).
    fc: z.number().int().nullable().optional(),
    // Hit-by-pitch. Feeds OBP and Reached Base.
    hbp: z.number().int().nullable().optional(),
    pitchingOuts: z.number().int().nullable().optional(),
    pc: z.number().int().nullable().optional(),
    pBb: z.number().int().nullable().optional(),
    so: z.number().int().nullable().optional(),
    pH: z.number().int().nullable().optional(),
    pR: z.number().int().nullable().optional(),
    er: z.number().int().nullable().optional(),
  });

  app.put("/api/team/:slug/admin/stats", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = statLineSchema.parse(req.body);
    const gameOk = await db.select().from(bbGames)
      .where(and(eq(bbGames.id, body.gameId), eq(bbGames.teamId, team.id))).limit(1);
    if (!gameOk[0]) return res.status(404).json({ message: "Game not in team" });
    const playerOk = await db.select().from(bbPlayers)
      .where(and(eq(bbPlayers.id, body.playerId), eq(bbPlayers.teamId, team.id))).limit(1);
    if (!playerOk[0]) return res.status(404).json({ message: "Player not in team" });
    const source = body.source ?? "manual";
    // Treat an empty starting-position selection as "cleared" (null) so the
    // upsert doesn't store a meaningless "" in the column.
    if (body.startingPosition === "") body.startingPosition = null;
    const values = { ...body, source };
    // Detect create-vs-update so the client can show an accurate toast when an
    // admin tries to "add" a stat line that already exists (e.g. a race or a
    // stale UI). Cheap pre-check is fine here — the upsert below is still
    // authoritative on conflict.
    const [existing] = await db
      .select({ id: bbPlayerGame.id, po: bbPlayerGame.po, a: bbPlayerGame.a, e: bbPlayerGame.e })
      .from(bbPlayerGame)
      .where(and(
        eq(bbPlayerGame.gameId, body.gameId),
        eq(bbPlayerGame.playerId, body.playerId),
        eq(bbPlayerGame.source, source),
      ))
      .limit(1);
    const [row] = await db.insert(bbPlayerGame).values(values).onConflictDoUpdate({
      target: [bbPlayerGame.gameId, bbPlayerGame.playerId, bbPlayerGame.source],
      set: { ...values, updatedAt: new Date() },
    }).returning();
    // If this save deliberately changes the fielding TOTAL (po/a/e) for the
    // line — e.g. a scorebook scan re-commit or a direct total edit — drop any
    // per-position fielding split for this (game, player, source) so the
    // By Position view never disagrees with the cached total. Routine hitting
    // edits don't send po/a/e, so existing splits are preserved.
    const fieldingProvided = "po" in body || "a" in body || "e" in body;
    if (fieldingProvided) {
      const changed =
        num(existing?.po) !== num(body.po ?? null) ||
        num(existing?.a) !== num(body.a ?? null) ||
        num(existing?.e) !== num(body.e ?? null);
      if (changed) {
        await db.delete(bbPlayerFielding).where(and(
          eq(bbPlayerFielding.gameId, body.gameId),
          eq(bbPlayerFielding.playerId, body.playerId),
          eq(bbPlayerFielding.source, source),
        ));
      }
    }
    res.json({ row, created: !existing });
  });

  // Bulk upsert — save stat lines for many players in one game at once. Each
  // line follows the same partial-upsert contract as the single PUT: only the
  // keys present on a line are written, so blank fields never null out existing
  // values, and fielding splits are cleared only when po/a/e actually change.
  const bulkStatsSchema = z.object({
    gameId: z.string(),
    source: z.enum(["manual", "gamechanger"]).optional(),
    lines: z.array(statLineSchema.omit({ gameId: true, source: true })),
  });
  app.put("/api/team/:slug/admin/stats/bulk", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = bulkStatsSchema.parse(req.body);
    const source = body.source ?? "manual";
    const [gameOk] = await db.select().from(bbGames)
      .where(and(eq(bbGames.id, body.gameId), eq(bbGames.teamId, team.id))).limit(1);
    if (!gameOk) return res.status(404).json({ message: "Game not in team" });
    const teamPlayers = await db.select({ id: bbPlayers.id }).from(bbPlayers).where(eq(bbPlayers.teamId, team.id));
    const validIds = new Set(teamPlayers.map(p => p.id));

    let saved = 0;
    for (const line of body.lines) {
      if (!validIds.has(line.playerId)) continue;
      if (line.startingPosition === "") line.startingPosition = null;
      const values = { ...line, gameId: body.gameId, source };
      const [existing] = await db
        .select({ po: bbPlayerGame.po, a: bbPlayerGame.a, e: bbPlayerGame.e })
        .from(bbPlayerGame)
        .where(and(
          eq(bbPlayerGame.gameId, body.gameId),
          eq(bbPlayerGame.playerId, line.playerId),
          eq(bbPlayerGame.source, source),
        ))
        .limit(1);
      await db.insert(bbPlayerGame).values(values).onConflictDoUpdate({
        target: [bbPlayerGame.gameId, bbPlayerGame.playerId, bbPlayerGame.source],
        set: { ...values, updatedAt: new Date() },
      });
      const fieldingProvided = "po" in line || "a" in line || "e" in line;
      if (fieldingProvided) {
        const changed =
          num(existing?.po) !== num(line.po ?? null) ||
          num(existing?.a) !== num(line.a ?? null) ||
          num(existing?.e) !== num(line.e ?? null);
        if (changed) {
          await db.delete(bbPlayerFielding).where(and(
            eq(bbPlayerFielding.gameId, body.gameId),
            eq(bbPlayerFielding.playerId, line.playerId),
            eq(bbPlayerFielding.source, source),
          ));
        }
      }
      saved++;
    }
    res.json({ ok: true, saved });
  });

  // --- Per-position fielding entry ---
  // Load the current per-position fielding lines for a (game, player, source).
  // Returns detail rows if any exist; otherwise synthesizes a single line from
  // the cached total on bb_player_game so the editor opens pre-filled.
  app.get("/api/team/:slug/admin/fielding/:gameId/:playerId", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const { gameId, playerId } = req.params;
    const source = req.query.source === "gamechanger" ? "gamechanger" : "manual";
    const [gameOk] = await db.select().from(bbGames)
      .where(and(eq(bbGames.id, gameId), eq(bbGames.teamId, team.id))).limit(1);
    if (!gameOk) return res.status(404).json({ message: "Game not in team" });
    const details = await db.select().from(bbPlayerFielding).where(and(
      eq(bbPlayerFielding.gameId, gameId),
      eq(bbPlayerFielding.playerId, playerId),
      eq(bbPlayerFielding.source, source),
    ));
    if (details.length) {
      const lines = details
        .map(d => ({ position: d.position, po: num(d.po), a: num(d.a), e: num(d.e) }))
        .sort((x, y) => (FIELD_POS_ORDER.get(x.position) ?? 99) - (FIELD_POS_ORDER.get(y.position) ?? 99));
      return res.json({ lines, fromDetail: true });
    }
    const [pg] = await db.select().from(bbPlayerGame).where(and(
      eq(bbPlayerGame.gameId, gameId),
      eq(bbPlayerGame.playerId, playerId),
      eq(bbPlayerGame.source, source),
    )).limit(1);
    const total = num(pg?.po) + num(pg?.a) + num(pg?.e);
    const lines = total > 0
      ? [{ position: normalizePosition(pg?.position), po: num(pg?.po), a: num(pg?.a), e: num(pg?.e) }]
      : [];
    res.json({ lines, fromDetail: false });
  });

  // Replace the full set of per-position fielding lines for a (game, player,
  // source). Recomputes the cached PO/A/E total + primary position on
  // bb_player_game so the leaderboard / Fielding totals stay in sync.
  const fieldingSetSchema = z.object({
    gameId: z.string(),
    playerId: z.string(),
    source: z.enum(["manual", "gamechanger"]).optional(),
    lines: z.array(z.object({
      position: z.string(),
      po: z.number().int().nullable().optional(),
      a: z.number().int().nullable().optional(),
      e: z.number().int().nullable().optional(),
    })),
  });
  app.put("/api/team/:slug/admin/fielding", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = fieldingSetSchema.parse(req.body);
    const source = body.source ?? "manual";
    const [gameOk] = await db.select().from(bbGames)
      .where(and(eq(bbGames.id, body.gameId), eq(bbGames.teamId, team.id))).limit(1);
    if (!gameOk) return res.status(404).json({ message: "Game not in team" });
    const [playerOk] = await db.select().from(bbPlayers)
      .where(and(eq(bbPlayers.id, body.playerId), eq(bbPlayers.teamId, team.id))).limit(1);
    if (!playerOk) return res.status(404).json({ message: "Player not in team" });

    // Collapse to one entry per normalized position, dropping empties.
    const merged = new Map<string, { po: number; a: number; e: number }>();
    for (const ln of body.lines) {
      const po = num(ln.po), a = num(ln.a), e = num(ln.e);
      if (po === 0 && a === 0 && e === 0) continue;
      const code = normalizePosition(ln.position);
      const cur = merged.get(code) ?? { po: 0, a: 0, e: 0 };
      cur.po += po; cur.a += a; cur.e += e;
      merged.set(code, cur);
    }

    await db.delete(bbPlayerFielding).where(and(
      eq(bbPlayerFielding.gameId, body.gameId),
      eq(bbPlayerFielding.playerId, body.playerId),
      eq(bbPlayerFielding.source, source),
    ));
    let totPo = 0, totA = 0, totE = 0;
    let primaryPos: string | null = null, primaryChances = -1;
    if (merged.size) {
      const toInsert = Array.from(merged.entries()).map(([position, s]) => {
        totPo += s.po; totA += s.a; totE += s.e;
        const chances = s.po + s.a + s.e;
        if (chances > primaryChances) { primaryChances = chances; primaryPos = position; }
        return { gameId: body.gameId, playerId: body.playerId, position, po: s.po, a: s.a, e: s.e, source };
      });
      await db.insert(bbPlayerFielding).values(toInsert);
    }

    // Sync the cached fielding total + primary position onto bb_player_game,
    // creating the line if the player had none yet.
    await db.insert(bbPlayerGame).values({
      gameId: body.gameId, playerId: body.playerId, source,
      po: totPo, a: totA, e: totE, position: primaryPos,
    }).onConflictDoUpdate({
      target: [bbPlayerGame.gameId, bbPlayerGame.playerId, bbPlayerGame.source],
      set: { po: totPo, a: totA, e: totE, position: primaryPos, updatedAt: new Date() },
    });

    res.json({ ok: true, total: { po: totPo, a: totA, e: totE }, primaryPos });
  });

  // --- Team fielding by position (player-less) ---
  // Load the team's per-position fielding for a (game, source).
  app.get("/api/team/:slug/admin/team-fielding/:gameId", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const { gameId } = req.params;
    const source = req.query.source === "gamechanger" ? "gamechanger" : "manual";
    const [gameOk] = await db.select().from(bbGames)
      .where(and(eq(bbGames.id, gameId), eq(bbGames.teamId, team.id))).limit(1);
    if (!gameOk) return res.status(404).json({ message: "Game not in team" });
    const rows = await db.select().from(bbTeamFielding).where(and(
      eq(bbTeamFielding.gameId, gameId),
      eq(bbTeamFielding.source, source),
    ));
    const lines = rows
      .map(r => ({ position: r.position, po: num(r.po), a: num(r.a), e: num(r.e) }))
      .sort((x, y) => (FIELD_POS_ORDER.get(x.position) ?? 99) - (FIELD_POS_ORDER.get(y.position) ?? 99));
    res.json({ lines });
  });

  // Replace the team's full per-position fielding set for a (game, source).
  const teamFieldingSetSchema = z.object({
    gameId: z.string(),
    source: z.enum(["manual", "gamechanger"]).optional(),
    lines: z.array(z.object({
      position: z.string(),
      po: z.number().int().nullable().optional(),
      a: z.number().int().nullable().optional(),
      e: z.number().int().nullable().optional(),
    })),
  });
  app.put("/api/team/:slug/admin/team-fielding", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = teamFieldingSetSchema.parse(req.body);
    const source = body.source ?? "manual";
    const [gameOk] = await db.select().from(bbGames)
      .where(and(eq(bbGames.id, body.gameId), eq(bbGames.teamId, team.id))).limit(1);
    if (!gameOk) return res.status(404).json({ message: "Game not in team" });

    // Collapse to one entry per normalized position, dropping all-zero rows.
    const merged = new Map<string, { po: number; a: number; e: number }>();
    for (const ln of body.lines) {
      const po = num(ln.po), a = num(ln.a), e = num(ln.e);
      if (po === 0 && a === 0 && e === 0) continue;
      const code = normalizePosition(ln.position);
      const cur = merged.get(code) ?? { po: 0, a: 0, e: 0 };
      cur.po += po; cur.a += a; cur.e += e;
      merged.set(code, cur);
    }
    await db.delete(bbTeamFielding).where(and(
      eq(bbTeamFielding.gameId, body.gameId),
      eq(bbTeamFielding.source, source),
    ));
    if (merged.size) {
      await db.insert(bbTeamFielding).values(
        Array.from(merged.entries()).map(([position, s]) => ({
          gameId: body.gameId, position, po: s.po, a: s.a, e: s.e, source,
        })),
      );
    }
    res.json({ ok: true, positions: merged.size });
  });

  app.get("/api/team/:slug/admin/template.xlsx", requireTeamAdmin, async (_req, res) => {
    const buf = await buildTemplateWorkbook();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="team-stats-template.xlsx"');
    res.send(buf);
  });

  app.post("/api/team/:slug/admin/upload", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const multer = (await import("multer")).default;
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single("file");
    upload(req, res, async (err: unknown) => {
      if (err) return res.status(400).json({ message: String(err) });
      const file = (req as any).file as { buffer: Buffer } | undefined;
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      // Excel upload is for manual scorebook entry only. GameChanger data has
      // its own CSV import endpoint; do not let a client-supplied `source`
      // here cause this upload's clean-replace behavior to delete GC rows.
      const source = "manual" as const;
      try {
        const result = await importExcel(file.buffer, team.id, source, team.season ?? "Spring 2026");
        res.json({ ...result, source });
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "Import failed" });
      }
    });
  });

  app.post("/api/team/:slug/admin/import-gamechanger", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const multer = (await import("multer")).default;
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 20 },
    }).array("files", 20);
    upload(req, res, async (err: unknown) => {
      if (err) return res.status(400).json({ message: String(err) });
      const files = ((req as any).files as Array<{ buffer: Buffer; originalname: string }>) || [];
      if (files.length === 0) return res.status(400).json({ message: "No files uploaded" });
      try {
        const out: GcImportResult = { files: [], totalRows: 0, totalGamesCreated: 0 };
        for (const f of files) {
          const r = await importGameChangerCsv(f.buffer, f.originalname, team.id, team.season ?? "Spring 2026");
          out.files.push(r);
          out.totalRows += r.rowsImported;
          if (r.gameCreated) out.totalGamesCreated++;
        }
        res.json(out);
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "Import failed" });
      }
    });
  });

  app.post("/api/team/:slug/admin/import-iscore", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const multer = (await import("multer")).default;
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 20 },
    }).array("files", 20);
    upload(req, res, async (err: unknown) => {
      if (err) return res.status(400).json({ message: String(err) });
      const files = ((req as any).files as Array<{ buffer: Buffer; originalname: string }>) || [];
      if (files.length === 0) return res.status(400).json({ message: "No files uploaded" });
      try {
        const out: IScoreImportResult = { files: [], totalRows: 0, totalGamesCreated: 0 };
        for (const f of files) {
          const r = await importIScoreXls(f.buffer, f.originalname, team.id, team.name, team.season ?? "Spring 2026");
          out.files.push(r);
          out.totalRows += r.rowsImported;
          if (r.gameCreated) out.totalGamesCreated++;
        }
        res.json(out);
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "Import failed" });
      }
    });
  });

  app.post("/api/team/:slug/admin/scan-scorebook", requireTeamAdmin, async (req, res) => {
    // Cost-abuse mitigation: paid OpenAI call. Enforce same-origin via shared helper.
    if (!enforceSameOrigin(req, res)) return;
    const team = (req as any).bbTeam as BbTeam;
    const multer = (await import("multer")).default;
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024, files: 4 },
    }).array("images", 4);
    upload(req, res, async (err: unknown) => {
      if (err) return res.status(400).json({ message: String(err) });
      const files = ((req as any).files as Array<{ buffer: Buffer; mimetype: string }>) || [];
      if (files.length === 0) return res.status(400).json({ message: "No images uploaded" });
      try {
        const roster = await db
          .select()
          .from(bbPlayers)
          .where(eq(bbPlayers.teamId, team.id))
          .orderBy(asc(bbPlayers.sortOrder), asc(bbPlayers.name));
        const result = await scanScorebookImages(files, roster);
        res.json(result);
      } catch (e: any) {
        res.status(400).json({ message: e?.message ?? "Scan failed" });
      }
    });
  });

  // -------------------------------------------------------------------------
  // Team admin grants (promote / list / revoke). TSS admin always has admin
  // access independently of this table; team admins may also add / remove
  // other team admins (private team, low griefing risk).
  // -------------------------------------------------------------------------
  app.get("/api/team/:slug/admin/admins", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const rows = await db
      .select()
      .from(bbTeamAdmins)
      .where(eq(bbTeamAdmins.teamId, team.id))
      .orderBy(asc(bbTeamAdmins.email));
    res.json({
      tssAdminEmail: "justin@twinseamsports.com",
      admins: rows,
    });
  });

  app.post("/api/team/:slug/admin/admins", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    const body = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Valid email required" });
    const email = body.data.email.trim().toLowerCase();
    if (email === "justin@twinseamsports.com") {
      return res.status(400).json({ message: "TSS admin already has access by default" });
    }
    try {
      await db.insert(bbTeamAdmins).values({
        teamId: team.id,
        email,
        grantedByEmail: getReqEmail(req as any),
      });
    } catch (e: any) {
      if (String(e?.message ?? "").toLowerCase().includes("unique")) {
        return res.status(409).json({ message: "User already has admin access" });
      }
      throw e;
    }
    res.json({ ok: true });
  });

  app.delete("/api/team/:slug/admin/admins/:id", requireTeamAdmin, async (req, res) => {
    const team = (req as any).bbTeam as BbTeam;
    await db
      .delete(bbTeamAdmins)
      .where(and(eq(bbTeamAdmins.id, req.params.id), eq(bbTeamAdmins.teamId, team.id)));
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // AI Lineup Generator. Always returns BOTH a Coach-only-poll view and an
  // All-responses view (no divergence skip). Uses GPT-4o with season-to-date
  // offensive stats plus poll averages (speed / brIQ) for each player.
  // -------------------------------------------------------------------------
  app.post("/api/team/:slug/admin/ai-lineup", requireTeamAdmin, async (req, res) => {
    if (!enforceSameOrigin(req, res)) return;
    const team = (req as any).bbTeam as BbTeam;
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ message: "OPENAI_API_KEY is not configured" });
    }
    const parsedBody = z.object({
      window: z.enum(["season", "last10", "last5"]).default("season"),
    }).safeParse(req.body ?? {});
    if (!parsedBody.success) return res.status(400).json({ message: "Invalid window" });
    const lineupWindow = parsedBody.data.window;
    try {
      const players = await db
        .select()
        .from(bbPlayers)
        .where(eq(bbPlayers.teamId, team.id))
        .orderBy(asc(bbPlayers.sortOrder), asc(bbPlayers.name));
      if (players.length === 0) return res.status(400).json({ message: "Roster is empty" });

      const allSeasonGames = await db
        .select()
        .from(bbGames)
        .where(and(eq(bbGames.teamId, team.id), eq(bbGames.season, team.season)))
        .orderBy(desc(bbGames.gameDate));
      const games =
        lineupWindow === "last10" ? allSeasonGames.slice(0, 10)
        : lineupWindow === "last5" ? allSeasonGames.slice(0, 5)
        : allSeasonGames;
      const gameIds = games.map(g => g.id);
      const rawRows = gameIds.length
        ? await db.select().from(bbPlayerGame).where(inArray(bbPlayerGame.gameId, gameIds))
        : [];
      const rows = applyMode(rawRows, "combined");
      const byPlayer = new Map<string, BbPlayerGame[]>();
      for (const r of rows) {
        const arr = byPlayer.get(r.playerId) ?? [];
        arr.push(r);
        byPlayer.set(r.playerId, arr);
      }

      const pollRows = await db
        .select()
        .from(bbCoachPollResponses)
        .where(eq(bbCoachPollResponses.teamId, team.id));
      const pollAvg = (filterCoach: "coach" | "all") => {
        const filtered = filterCoach === "coach" ? pollRows.filter(p => p.isCoach) : pollRows;
        const acc = new Map<string, { speedSum: number; brIQSum: number; n: number }>();
        for (const r of filtered) {
          const rk = (r.rankings as Record<string, { speed?: number; brIQ?: number }>) || {};
          for (const [pid, v] of Object.entries(rk)) {
            const cur = acc.get(pid) ?? { speedSum: 0, brIQSum: 0, n: 0 };
            cur.speedSum += Number(v?.speed ?? 0);
            cur.brIQSum += Number(v?.brIQ ?? 0);
            cur.n += 1;
            acc.set(pid, cur);
          }
        }
        return acc;
      };
      const coachAvg = pollAvg("coach");
      const allAvg = pollAvg("all");

      const buildPlayerData = (which: "coach" | "all") => {
        const src = which === "coach" ? coachAvg : allAvg;
        return players.map(p => {
          const s = aggregate(byPlayer.get(p.id) ?? []);
          const pa = src.get(p.id);
          return {
            playerId: p.id,
            name: p.name,
            jersey: p.jerseyNumber ?? null,
            pollSpeed: pa && pa.n > 0 ? +(pa.speedSum / pa.n).toFixed(2) : null,
            pollBrIQ: pa && pa.n > 0 ? +(pa.brIQSum / pa.n).toFixed(2) : null,
            pollVoters: pa?.n ?? 0,
            stats: {
              games: s.games,
              pa: s.pa,
              h: s.h,
              bb: s.bb,
              k: s.k,
              sb: s.sb,
              hr: s.hr,
              rbi: s.rbi,
              xbh: s.xbh,
              avg: s.avg,
              obp: s.obp,
              slg: s.slg,
              ops: s.ops,
              bbRate: s.bbRate,
              kRate: s.kRate,
            },
          };
        });
      };

      const windowLabel =
        lineupWindow === "season" ? `Full ${team.season} season (${games.length} games)`
        : lineupWindow === "last10" ? `Last 10 games of ${team.season} (${games.length} games actual)`
        : `Last 5 games of ${team.season} (${games.length} games actual)`;

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const runLineup = async (label: string, data: ReturnType<typeof buildPlayerData>) => {
        const prompt = `You are a youth baseball coach building the optimal batting order for a 7-year-old (7U) team. Offensive stats below cover this window: ${windowLabel}. The "${label}" data set is below.

Priorities for 7U batting order (different from MLB):
- Slots 1-2: highest on-base ability (OBP, contact, low K%) and the best baserunners (high pollSpeed + pollBrIQ). At 7U, putting fast, smart baserunners early matters more than power.
- Slots 3-4: best overall offensive producers (OPS, RBI, XBH).
- Slots 5-6: secondary producers; protect the heart of the order.
- Slots 7+: developing hitters or smaller sample sizes; alternate a contact bat near the bottom to turn the order over.
- Treat fewer than 5 PA as a small sample and lean on poll signals.
- 'pollSpeed' and 'pollBrIQ' are 1-5 (5=best). 'pollVoters' is the number of poll respondents; trust the signal less when voters < 2.

Build ONE optimal batting order using ALL ${data.length} players. Each player appears exactly once.

Return strict JSON:
{
  "lineup": [{"slot": 1, "playerId": "...", "name": "...", "why": "one short sentence"}, ...],
  "strategy": "2-3 sentence overall reasoning",
  "flags": ["any concerns about small samples / missing data"]
}

PLAYERS:
${JSON.stringify(data, null, 2)}`;
        const r = await openai.chat.completions.create({
          model: "gpt-4o",
          response_format: { type: "json_object" },
          temperature: 0.2,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2500,
        });
        const text = r.choices[0]?.message?.content ?? "{}";
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          return { lineup: [], strategy: "AI returned invalid JSON", flags: ["parse error"] };
        }
        const shape = z.object({
          lineup: z.array(z.object({
            slot: z.number(),
            playerId: z.string(),
            name: z.string(),
            why: z.string().default(""),
          })).default([]),
          strategy: z.string().default(""),
          flags: z.array(z.string()).default([]),
        }).safeParse(raw);
        if (!shape.success) {
          return { lineup: [], strategy: "AI returned an unexpected response shape", flags: ["shape error"] };
        }
        return shape.data;
      };

      const coachData = buildPlayerData("coach");
      const allData = buildPlayerData("all");
      const [coachLineup, allLineup] = await Promise.all([
        runLineup("Coach view (coach poll responses only)", coachData),
        runLineup("All view (every poll response, coach + non-coach)", allData),
      ]);

      res.json({
        season: team.season,
        window: lineupWindow,
        windowLabel,
        gamesInWindow: games.length,
        coachVoterCount: pollRows.filter(p => p.isCoach).length,
        allVoterCount: pollRows.length,
        coachView: coachLineup,
        allView: allLineup,
      });
    } catch (e: any) {
      console.error(`[team-stats] ai-lineup failed for ${team.slug}:`, e);
      res.status(500).json({ message: e?.message ?? "AI lineup failed" });
    }
  });

  // -------------------------------------------------------------------------
  // AI Player Evaluation. Body: { window: "season" | "last10" | "last5" }.
  // Ranks players by offensive output for that window with 7U-tuned commentary
  // (emphasis on contact, OBP, baserunning over power). Two audiences share the
  // same server-computed stats and only differ in the prompt tone:
  //  - "family" (viewer, requireTeamAccess): warm, encouraging; constructive
  //    criticism only when it genuinely helps.
  //  - "coach"  (admin, requireTeamAdmin): candid, critical, decision-grade.
  // -------------------------------------------------------------------------
  const aiEvaluateHandler = (audience: "family" | "coach"): RequestHandler => async (req, res) => {
    if (!enforceSameOrigin(req, res)) return;
    const team = (req as any).bbTeam as BbTeam;
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ message: "OPENAI_API_KEY is not configured" });
    }
    const parsed = z.object({
      window: z.enum(["season", "last10", "last5"]).default("season"),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Invalid window" });
    const window = parsed.data.window;

    try {
      const players = await db
        .select()
        .from(bbPlayers)
        .where(eq(bbPlayers.teamId, team.id))
        .orderBy(asc(bbPlayers.sortOrder), asc(bbPlayers.name));
      if (players.length === 0) return res.status(400).json({ message: "Roster is empty" });

      const allGames = await db
        .select()
        .from(bbGames)
        .where(and(eq(bbGames.teamId, team.id), eq(bbGames.season, team.season)))
        .orderBy(desc(bbGames.gameDate));
      const limited =
        window === "last10" ? allGames.slice(0, 10)
        : window === "last5" ? allGames.slice(0, 5)
        : allGames;
      const gameIds = limited.map(g => g.id);
      const rawRows = gameIds.length
        ? await db.select().from(bbPlayerGame).where(inArray(bbPlayerGame.gameId, gameIds))
        : [];
      const rows = applyMode(rawRows, "combined");
      const byPlayer = new Map<string, BbPlayerGame[]>();
      for (const r of rows) {
        const arr = byPlayer.get(r.playerId) ?? [];
        arr.push(r);
        byPlayer.set(r.playerId, arr);
      }

      const data = players.map(p => {
        const s = aggregate(byPlayer.get(p.id) ?? []);
        return {
          playerId: p.id,
          name: p.name,
          jersey: p.jerseyNumber ?? null,
          games: s.games,
          pa: s.pa,
          h: s.h,
          bb: s.bb,
          k: s.k,
          sb: s.sb,
          hr: s.hr,
          rbi: s.rbi,
          xbh: s.xbh,
          avg: s.avg,
          obp: s.obp,
          slg: s.slg,
          ops: s.ops,
          bbRate: s.bbRate,
          kRate: s.kRate,
          iso: s.iso,
        };
      });

      const windowLabel =
        window === "season" ? `Full ${team.season} season (${limited.length} games)`
        : window === "last10" ? `Last 10 games of ${team.season} (${limited.length} games actual)`
        : `Last 5 games of ${team.season} (${limited.length} games actual)`;

      const toneRules = audience === "coach" ? `
AUDIENCE: COACHING STAFF ONLY (private). Write candidly and critically — this informs playing time, lineup, and development decisions.
- Give an honest, direct assessment. Name the real weaknesses and the highest-priority things each player must work on.
- Stay age-appropriate and professional (never demeaning), but do NOT sugar-coat, pad, or inflate. Avoid empty praise.
- ALWAYS provide at least one concrete, prioritized "improvements" item for every player.` : `
AUDIENCE: the players' FAMILIES (parents and the kids themselves). Write warmly and positively — every child should finish feeling proud and motivated.
- Lead with strengths and the progress the player is making.
- Include an "improvements" item ONLY when it genuinely helps, framed as an encouraging "fun next thing to work on" — never as a criticism or weakness. Leaving "improvements" empty is perfectly fine.
- Do NOT mention rankings, standings, "best/worst", "top/bottom", or compare who is ahead of or behind another player — speak about each child on their own terms.
- Keep the whole write-up celebratory and supportive.`;

      const prompt = `You are evaluating offensive performance for a 7-year-old (7U) baseball team across this window: ${windowLabel}.
${toneRules}

7U-specific evaluation rules:
- Reward CONTACT and ON-BASE skills (low K%, high OBP/BB%) — these matter more than power at this age.
- Reward aggressive, smart baserunning (high SB given PA).
- De-emphasize raw HR/SLG/ISO — power at 7U is rare and often situational.
- Note small samples: fewer than 5 PA = explicitly flag "small sample" and lower confidence.
- AB on this team is recorded as raw plate appearances (BB/SAC/HBP NOT subtracted), so AVG/OBP/SLG read lower than official MLB figures — acknowledge this implicitly by reasoning on rates relatively across the roster, not absolute thresholds.
- Be specific and age-appropriate (e.g. "needs reps on two-strike approach" rather than "bad hitter").

Rank players 1..N by overall offensive output in this window. Each player appears exactly once.

Return strict JSON:
{
  "ranked": [
    {
      "rank": 1,
      "playerId": "...",
      "name": "...",
      "summary": "1-2 sentence summary",
      "strengths": ["short bullet", "..."],
      "improvements": ["short bullet", "..."],
      "smallSample": true|false
    }, ...
  ],
  "teamNotes": "2-4 sentence overall team trend for this window"
}

PLAYERS (${data.length} total):
${JSON.stringify(data, null, 2)}`;

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 3500,
      });
      const text = r.choices[0]?.message?.content ?? "{}";
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        raw = null;
      }
      const evalShape = z.object({
        ranked: z.array(z.object({
          rank: z.number(),
          playerId: z.string(),
          name: z.string(),
          summary: z.string().default(""),
          strengths: z.array(z.string()).default([]),
          improvements: z.array(z.string()).default([]),
          smallSample: z.boolean().default(false),
        })).default([]),
        teamNotes: z.string().default(""),
      }).safeParse(raw);
      const parsedReport = evalShape.success
        ? evalShape.data
        : { ranked: [], teamNotes: raw == null ? "AI returned invalid JSON" : "AI returned an unexpected response shape" };
      // Drop any GPT rows referencing unknown players (no hallucinated roster).
      const validIds = new Set(players.map(p => p.id));
      res.json({
        window,
        windowLabel,
        season: team.season,
        gamesInWindow: limited.length,
        audience,
        ...parsedReport,
        ranked: (parsedReport.ranked ?? []).filter((e: any) => validIds.has(e.playerId)),
      });
    } catch (e: any) {
      console.error(`[team-stats] ai-evaluate (${audience}) failed for ${team.slug}:`, e);
      res.status(500).json({ message: "AI evaluation failed" });
    }
  };
  app.post("/api/team/:slug/ai-evaluate", requireTeamAccess(), aiEvaluateHandler("family"));
  app.post("/api/team/:slug/admin/ai-evaluate", requireTeamAdmin, aiEvaluateHandler("coach"));

  // -------------------------------------------------------------------------
  // AI Season Progression Report. Body: { scheme: "auto"|"thirds"|"quarters",
  // coachPitch?: boolean }. Splits the season chronologically into periods,
  // computes per-period offensive + defensive aggregates (combined mode:
  // manual preferred, GameChanger fallback), and asks GPT-4o for a narrative
  // of each player's offensive trajectory plus an offensive ranking and a
  // defensive ranking (only when the fielding sample is large enough). All
  // numbers shown to the user are server-computed; GPT only writes prose.
  // -------------------------------------------------------------------------
  const aiSeasonReportHandler = (audience: "family" | "coach"): RequestHandler => async (req, res) => {
    if (!enforceSameOrigin(req, res)) return;
    const team = (req as any).bbTeam as BbTeam;
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ message: "OPENAI_API_KEY is not configured" });
    }
    const parsed = z.object({
      scheme: z.enum(["auto", "thirds", "quarters"]).default("auto"),
      coachPitch: z.boolean().optional(),
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Invalid request" });
    const { scheme: schemeReq } = parsed.data;

    // Coach pitch: 8U and under has no walks / stolen bases / real pitching.
    // Derive from the team name's age (e.g. "Knox Stars 7U" -> 7), overridable.
    const ageMatch = /(\d+)\s*[uU]\b/.exec(team.name);
    const derivedCoachPitch = ageMatch ? parseInt(ageMatch[1], 10) <= 8 : false;
    const coachPitch = parsed.data.coachPitch ?? derivedCoachPitch;

    try {
      const players = await db
        .select()
        .from(bbPlayers)
        .where(eq(bbPlayers.teamId, team.id))
        .orderBy(asc(bbPlayers.sortOrder), asc(bbPlayers.name));
      if (players.length === 0) return res.status(400).json({ message: "Roster is empty" });

      // Season games, chronological ascending (id tiebreaker for same-day games).
      const seasonGames = await db
        .select()
        .from(bbGames)
        .where(and(eq(bbGames.teamId, team.id), eq(bbGames.season, team.season)));
      const ordered = seasonGames.slice().sort((a, b) => {
        const t = new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime();
        return t !== 0 ? t : a.id.localeCompare(b.id);
      });
      const total = ordered.length;
      if (total === 0) return res.status(400).json({ message: "No games in this season yet" });

      // Number of periods: explicit scheme, else adaptive by game count.
      let n =
        schemeReq === "quarters" ? 4
        : schemeReq === "thirds" ? 3
        : total >= 16 ? 4 : total >= 9 ? 3 : total >= 4 ? 2 : 1;
      n = Math.max(1, Math.min(n, total));
      const schemeLabel = n === 4 ? "quarters" : n === 3 ? "thirds" : n === 2 ? "halves" : "season";
      const ord = ["1st", "2nd", "3rd", "4th"];
      const unit = n === 4 ? "quarter" : n === 3 ? "third" : n === 2 ? "half" : "season";

      // Split games into n roughly-equal chronological buckets.
      const buckets: (typeof ordered)[] = [];
      for (let i = 0; i < n; i++) {
        const start = Math.floor((i * total) / n);
        const end = Math.floor(((i + 1) * total) / n);
        buckets.push(ordered.slice(start, end));
      }
      const isoDate = (d: any) => String(new Date(d).toISOString()).slice(0, 10);
      const periods = buckets.map((games, i) => ({
        index: i,
        label: n === 1 ? "Full season" : `${ord[i]} ${unit}`,
        games: games.length,
        startDate: games.length ? isoDate(games[0].gameDate) : null,
        endDate: games.length ? isoDate(games[games.length - 1].gameDate) : null,
      }));
      const bucketIdByGame = new Map<string, number>();
      buckets.forEach((games, i) => games.forEach(g => bucketIdByGame.set(g.id, i)));

      // Stat rows for the whole season (combined mode), grouped by player.
      const gameIds = ordered.map(g => g.id);
      const rawRows = gameIds.length
        ? await db.select().from(bbPlayerGame).where(inArray(bbPlayerGame.gameId, gameIds))
        : [];
      const rows = applyMode(rawRows, "combined");
      const byPlayer = new Map<string, BbPlayerGame[]>();
      for (const r of rows) {
        const arr = byPlayer.get(r.playerId) ?? [];
        arr.push(r);
        byPlayer.set(r.playerId, arr);
      }

      const r3 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);
      // Full numeric projection returned to the client (server-authoritative).
      const proj = (s: ReturnType<typeof aggregate>) => ({
        games: s.games, pa: s.pa, ab: s.ab, h: s.h, r: s.r, rbi: s.rbi,
        doubles: s.doubles, triples: s.triples, hr: s.hr, xbh: s.xbh, tb: s.tb,
        bb: s.bb, k: s.k, sb: s.sb,
        avg: r3(s.avg), obp: r3(s.obp), slg: r3(s.slg), ops: r3(s.ops),
        iso: r3(s.iso), babip: r3(s.babip), secAvg: r3(s.secAvg),
        bbRate: r3(s.bbRate), kRate: r3(s.kRate),
        po: s.po, a: s.a, e: s.e, fpct: r3(s.fpct),
        chances: s.po + s.a + s.e,
      });

      type PlayerBlock = {
        playerId: string; name: string; jersey: string | null;
        chances: number; season: ReturnType<typeof proj>;
        perPeriod: (ReturnType<typeof proj> & { period: number })[];
      };
      const blocks: PlayerBlock[] = [];
      const noData: { playerId: string; name: string }[] = [];
      for (const p of players) {
        const pr = byPlayer.get(p.id) ?? [];
        const seasonAgg = aggregate(pr);
        if (seasonAgg.pa === 0) { noData.push({ playerId: p.id, name: p.name }); continue; }
        const perPeriod = buckets.map((_, i) => {
          const periodRows = pr.filter(r => bucketIdByGame.get(r.gameId) === i);
          return { period: i, ...proj(aggregate(periodRows)) };
        });
        blocks.push({
          playerId: p.id, name: p.name, jersey: p.jerseyNumber ?? null,
          chances: seasonAgg.po + seasonAgg.a + seasonAgg.e,
          season: proj(seasonAgg), perPeriod,
        });
      }
      if (blocks.length === 0) return res.status(400).json({ message: "No offensive data recorded this season yet" });

      // Defensive ranking gate: fpct on a handful of chances is pure noise.
      const maxChances = blocks.reduce((m, b) => Math.max(m, b.chances), 0);
      const qualifyingDef = blocks.filter(b => b.chances >= 5).length;
      const defensiveEligible = maxChances >= 10 && qualifyingDef >= 3;

      // Compact, rounded payload for GPT. Coach-pitch OMITS walk/steal fields
      // entirely (the only reliable way to prevent that commentary). secAvg is
      // dropped too because its formula includes BB and SB.
      const gpt = blocks.map(b => {
        const trim = (x: ReturnType<typeof proj> & { period?: number }) => {
          const base: Record<string, number | null> = {
            g: x.games, pa: x.pa, h: x.h, r: x.r, rbi: x.rbi, hr: x.hr, xbh: x.xbh,
            k: x.k, avg: x.avg, obp: x.obp, slg: x.slg, ops: x.ops, iso: x.iso,
            kRate: x.kRate, po: x.po, a: x.a, e: x.e, fpct: x.fpct, chances: x.chances,
          };
          if (!coachPitch) { base.bb = x.bb; base.sb = x.sb; base.bbRate = x.bbRate; base.secAvg = x.secAvg; }
          return base;
        };
        return {
          playerId: b.playerId, name: b.name, chances: b.chances,
          season: trim(b.season),
          byPeriod: b.perPeriod.map(pp => ({ period: periods[pp.period].label, ...trim(pp) })),
        };
      });

      const ageDesc = ageMatch ? `${ageMatch[1]}U` : "youth";
      const coachPitchRules = coachPitch ? `
This is a ${ageDesc} COACH-PITCH team. There are NO walks, NO stolen bases, and pitchers are not really pitching (a coach pitches). Therefore:
- Do NOT mention walks, walk rate, "drawing more walks", plate discipline via walks, stolen bases, or baserunning steals.
- Do NOT mention pitching, ERA, runs allowed, or evaluate anyone "as a pitcher".
- On-base ability still matters (reaching via hits and hit-by-pitch) — you may discuss OBP.
- Focus offense on contact, hits, extra-base hits, RBIs, runs scored, and reducing strikeouts.` : `
This team has walks, stolen bases, and live pitching in play for baserunning/discipline commentary (still no pitching evaluation is requested here).`;

      const audienceRules = audience === "coach" ? `
AUDIENCE: COACHING STAFF ONLY (private). Be candid and critical — this report drives lineup and development decisions. Call out decline, stagnation, and the most important fixes honestly. Stay age-appropriate and never demeaning, but do NOT sugar-coat or inflate; empty praise is worse than useful criticism.` : `
AUDIENCE: the players' FAMILIES (parents and the kids). Be warm, positive, and encouraging — every child should finish feeling proud of their season. Lead with growth and strengths. Mention something to work on ONLY when it genuinely helps, framed as an encouraging next step, never as a criticism. Celebrate effort and improvement, and be gentle about any down periods (especially small samples or absences). Do NOT reference rankings, standings, or who is ahead of/behind whom in the narratives or team notes — speak about each child on their own terms.`;

      const prompt = `You are writing a SEASON PROGRESSION REPORT for a ${ageDesc} team's ${team.season} season. The season is divided into ${n} chronological ${unit === "season" ? "period" : unit + "s"}: ${periods.map(p => p.label).join(", ")}.
${audienceRules}
${coachPitchRules}

Important data conventions:
- AB is recorded as raw plate appearances (BB/SAC/HBP NOT subtracted), so AVG/OBP/SLG read LOWER than official figures — reason relatively across the roster, not against absolute MLB thresholds.
- For a player, a period with "g": 0 means they were ABSENT that period — do NOT describe it as a slump or decline; simply note limited data.
- Flag small samples (a period or season with very few PA) and lower your confidence accordingly.
- "chances" = fielding chances (PO+A+E); fielding percentage on few chances is unreliable.

Your job:
1. For EACH player, write a DETAILED narrative (3-6 sentences) describing how their offensive categories CHANGED across the ${unit === "season" ? "season" : unit + "s"} — call out specific movements in batting average, on-base, slugging/OPS, RBIs, runs scored, hits, and strikeouts. Be concrete and reference the period-over-period direction. Set "trend" to "up", "down", "steady", or "mixed".
2. Produce an OFFENSIVE RANKING of all players (rank 1 = most valuable offensive contributor across the season). Each player exactly once, with a one-sentence rationale.
3. ${defensiveEligible
  ? `Produce a DEFENSIVE RANKING using PO/A/E/fpct and chances. Only rank players with a meaningful number of chances; for those with thin samples, either omit them or explicitly hedge. Set "defensiveRanking" to the array.`
  : `There is NOT enough defensive data this season to rank defense reliably. Set "defensiveRanking" to null and put a one-sentence explanation in "defensiveNote".`}

Return STRICT JSON:
{
  "evaluations": [ { "playerId": "...", "narrative": "...", "trend": "up|down|steady|mixed", "smallSample": true|false } ],
  "offensiveRanking": [ { "rank": 1, "playerId": "...", "name": "...", "summary": "one sentence" } ],
  "defensiveRanking": ${defensiveEligible ? `[ { "rank": 1, "playerId": "...", "name": "...", "summary": "one sentence" } ]` : "null"},
  "defensiveNote": "string (empty if a ranking is provided)",
  "teamNotes": "3-5 sentence overall team offensive trend across the season"
}

PLAYERS (${gpt.length}):
${JSON.stringify(gpt)}`;

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: 0.4,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 9000,
      });
      const text = completion.choices[0]?.message?.content ?? "{}";
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { raw = null; }
      const shape = z.object({
        evaluations: z.array(z.object({
          playerId: z.string(),
          narrative: z.string().default(""),
          trend: z.enum(["up", "down", "steady", "mixed"]).default("mixed"),
          smallSample: z.boolean().default(false),
        })).default([]),
        offensiveRanking: z.array(z.object({
          rank: z.number(), playerId: z.string(), name: z.string().default(""), summary: z.string().default(""),
        })).default([]),
        defensiveRanking: z.array(z.object({
          rank: z.number(), playerId: z.string(), name: z.string().default(""), summary: z.string().default(""),
        })).nullable().default(null),
        defensiveNote: z.string().default(""),
        teamNotes: z.string().default(""),
      }).safeParse(raw);
      const report = shape.success
        ? shape.data
        : { evaluations: [], offensiveRanking: [], defensiveRanking: null,
            defensiveNote: "", teamNotes: raw == null ? "AI returned invalid JSON" : "AI returned an unexpected response shape" };

      // Drop any GPT rows referencing unknown players (no hallucinated roster).
      const validIds = new Set(blocks.map(b => b.playerId));
      report.evaluations = report.evaluations.filter(e => validIds.has(e.playerId));
      report.offensiveRanking = report.offensiveRanking.filter(e => validIds.has(e.playerId));
      if (report.defensiveRanking) report.defensiveRanking = report.defensiveRanking.filter(e => validIds.has(e.playerId));
      if (!defensiveEligible) {
        report.defensiveRanking = null;
        if (!report.defensiveNote) report.defensiveNote = "Not enough defensive data this season to rank fielding reliably.";
      }

      res.json({
        season: team.season,
        scheme: schemeLabel,
        coachPitch,
        derivedCoachPitch,
        gamesInSeason: total,
        defensiveEligible,
        audience,
        periods,
        players: blocks,
        noData,
        ...report,
      });
    } catch (e: any) {
      console.error(`[team-stats] ai-season-report (${audience}) failed for ${team.slug}:`, e);
      res.status(500).json({ message: "AI season report failed" });
    }
  };
  app.post("/api/team/:slug/ai-season-report", requireTeamAccess(), aiSeasonReportHandler("family"));
  app.post("/api/team/:slug/admin/ai-season-report", requireTeamAdmin, aiSeasonReportHandler("coach"));
}

// ---------------------------------------------------------------------------
// Scorebook OCR (OpenAI Vision)
// ---------------------------------------------------------------------------

interface ScannedRow {
  jersey: string | null;
  name: string | null;
  matchedPlayerId: string | null;
  matchConfidence: "jersey" | "name" | "none";
  mergedFromCount?: number;
  notes: string;
  ab: number; r: number; h: number;
  doubles: number; triples: number; hr: number;
  bb: number; k: number; sb: number; sac: number; rbi: number;
  po: number; a: number; e: number;
}

const STAT_FIELDS: Array<keyof Pick<ScannedRow,
  "ab"|"r"|"h"|"doubles"|"triples"|"hr"|"bb"|"k"|"sb"|"sac"|"rbi"|"po"|"a"|"e">> = [
  "ab","r","h","doubles","triples","hr","bb","k","sb","sac","rbi","po","a","e",
];

function buildScorePrompt(roster: BbPlayer[]): string {
  // Give the model the actual roster so it can self-correct handwriting on names
  // and jerseys instead of guessing in the dark. Names + jersey numbers only —
  // never any stats, so the model can't bias the totals it reads.
  const rosterLines = roster
    .filter(p => p.active !== false)
    .map(p => `  - #${p.jerseyNumber ?? "?"} ${p.name}`)
    .join("\n");
  return `You are reading the TOTALS column from a hand-kept baseball scorebook page.

The team's roster (use this to self-correct sloppy handwriting on names and jersey numbers):
${rosterLines || "  (no roster provided)"}

Each player row has TWO stacked sub-rows of seven boxes labelled:
  Row 1: AB  R  H  2B  3B  HR  BB
  Row 2: K   SB SAC RBI PO  A   E
Some books place these totals on the RIGHT EDGE of the page; others place them at the BOTTOM of each player row. Find the totals column FIRST, then walk down it player by player.

Return strict JSON:
{"rows":[
  {"jersey":"27","name":"Neyland","ab":3,"r":1,"h":2,"doubles":1,"triples":0,"hr":0,"bb":1,"k":0,"sb":1,"sac":0,"rbi":2,"po":1,"a":0,"e":0,"notes":""},
  ...
]}

Rules:
- Read EVERY player row that has a name OR jersey number, even if some totals boxes are blank.
- For jersey: match the # column to the roster above when handwriting is unclear. Output the matched jersey as a string (e.g. "7" or "27"), or null if you truly cannot read it.
- For name: match to a roster name when handwriting is unclear. Use the name as written on the scorebook if it doesn't match the roster.
- All 14 stat fields are non-negative integers.
- A truly EMPTY / blank box is 0. A "—" or "." is also 0.
- If a digit is hard to read, write your BEST GUESS rather than 0, and put a short note in the "notes" field (e.g. "AB unclear — could be 2 or 3"). Do NOT default to 0 just because handwriting is messy.
- Do NOT compute or invent totals from individual at-bats — ONLY transcribe the totals column.
- "notes" is an empty string when everything is clear.
- Return ONLY the JSON object, no commentary.`;
}

async function scanOnePage(
  openai: OpenAI,
  file: { buffer: Buffer; mimetype: string },
  prompt: string,
): Promise<unknown[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${file.mimetype || "image/jpeg"};base64,${file.buffer.toString("base64")}`,
            detail: "high",
          },
        },
      ],
    }],
    max_tokens: 4000,
  });
  const text = response.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(text) as { rows?: unknown };
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    throw new Error("Vision model returned non-JSON response");
  }
}

async function scanScorebookImages(
  files: Array<{ buffer: Buffer; mimetype: string }>,
  roster: BbPlayer[],
): Promise<{ rows: ScannedRow[]; warnings: string[]; rawCount: number }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = buildScorePrompt(roster);
  // Send each page as its own call — vision quality degrades sharply when
  // a single request has to juggle multiple images. Parallel keeps latency low.
  const perPageResults = await Promise.allSettled(
    files.map(f => scanOnePage(openai, f, prompt)),
  );
  const pageWarnings: string[] = [];
  const rawRows: unknown[] = [];
  perPageResults.forEach((r, idx) => {
    if (r.status === "fulfilled") {
      rawRows.push(...r.value);
    } else {
      pageWarnings.push(`Page ${idx + 1} could not be read (${r.reason?.message ?? "unknown error"}) — re-upload that image to retry it.`);
    }
  });
  if (rawRows.length === 0 && pageWarnings.length > 0) {
    throw new Error(pageWarnings.join(" | "));
  }
  const intField = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };
  const strField = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  };
  const byJersey = new Map<string, BbPlayer>();
  for (const p of roster) {
    if (p.jerseyNumber) byJersey.set(String(p.jerseyNumber).trim(), p);
  }
  const normName = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");
  const byName = new Map<string, BbPlayer>();
  for (const p of roster) {
    const parts = p.name.split(/\s+/).filter(Boolean);
    for (const part of parts) byName.set(normName(part), p);
    byName.set(normName(p.name), p);
  }
  const warnings: string[] = [...pageWarnings];
  const rows: ScannedRow[] = [];
  for (const r of rawRows as any[]) {
    const jersey = strField(r?.jersey);
    const name = strField(r?.name);
    let matched: BbPlayer | undefined;
    let matchConfidence: ScannedRow["matchConfidence"] = "none";
    if (jersey && byJersey.has(jersey)) {
      matched = byJersey.get(jersey);
      matchConfidence = "jersey";
    } else if (name) {
      const key = normName(name);
      if (byName.has(key)) {
        matched = byName.get(key);
        matchConfidence = "name";
      } else {
        for (const [k, p] of byName.entries()) {
          if (k.length >= 3 && (k.startsWith(key) || key.startsWith(k))) {
            matched = p;
            matchConfidence = "name";
            break;
          }
        }
      }
    }
    const rawNotes = typeof r?.notes === "string" ? r.notes.trim() : "";
    const scanned: ScannedRow = {
      jersey,
      name,
      matchedPlayerId: matched?.id ?? null,
      matchConfidence,
      notes: rawNotes,
      ab: intField(r?.ab),
      r: intField(r?.r),
      h: intField(r?.h),
      doubles: intField(r?.doubles ?? r?.["2b"]),
      triples: intField(r?.triples ?? r?.["3b"]),
      hr: intField(r?.hr),
      bb: intField(r?.bb),
      k: intField(r?.k),
      sb: intField(r?.sb),
      sac: intField(r?.sac),
      rbi: intField(r?.rbi),
      po: intField(r?.po),
      a: intField(r?.a),
      e: intField(r?.e),
    };
    if (!matched) {
      warnings.push(`Unmatched: ${[jersey && `#${jersey}`, name].filter(Boolean).join(" ") || "(blank row)"}`);
    }
    rows.push(scanned);
  }
  // Dedupe: when multiple OCR rows map to the same player (overlapping photos,
  // hitting + fielding pages of same game), merge into one preview row using
  // MAX per stat so a zero from one read can't silently wipe a nonzero from
  // another. Unmatched rows are kept as-is for the admin to resolve manually.
  const byPlayer = new Map<string, ScannedRow>();
  const merged: ScannedRow[] = [];
  for (const r of rows) {
    if (!r.matchedPlayerId) { merged.push(r); continue; }
    const existing = byPlayer.get(r.matchedPlayerId);
    if (!existing) {
      const copy = { ...r, mergedFromCount: 1 };
      byPlayer.set(r.matchedPlayerId, copy);
      merged.push(copy);
      continue;
    }
    for (const f of STAT_FIELDS) {
      existing[f] = Math.max(existing[f], r[f]);
    }
    existing.mergedFromCount = (existing.mergedFromCount ?? 1) + 1;
    if (r.notes) {
      existing.notes = existing.notes ? `${existing.notes}; ${r.notes}` : r.notes;
    }
  }
  for (const m of merged) {
    if ((m.mergedFromCount ?? 1) > 1) {
      warnings.push(`Merged ${m.mergedFromCount} reads for ${m.name ?? m.jersey ?? "player"} (kept the highest value per stat)`);
    }
  }
  return { rows: merged, warnings, rawCount: rawRows.length };
}
