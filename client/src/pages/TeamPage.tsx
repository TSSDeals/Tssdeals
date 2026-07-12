import { useState, useMemo, useEffect, Fragment } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Lock, Upload, Plus, Trash2, Pencil, Download, LogOut, Camera, Sparkles, Check, X, Wand2, Printer, ShieldCheck, Loader2, Eye, ChevronDown, ChevronRight, TrendingUp } from "lucide-react";
import Seo from "@/components/Seo";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import knoxStarLogo from "@assets/Knox_Star_Logo_transparent.png";

function KnoxStarsBrand({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const dims = size === "lg" ? "w-20 h-20" : size === "sm" ? "w-10 h-10" : "w-14 h-14";
  const textSize = size === "lg" ? "text-3xl md:text-4xl" : size === "sm" ? "text-base" : "text-xl md:text-2xl";
  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid="brand-knox-stars">
      <img src={knoxStarLogo} alt="Knoxville Stars logo" className={`${dims} object-contain shrink-0`} />
      <span className={`knox-stars-wordmark ${textSize} whitespace-nowrap`}>KNOXVILLE STARS — 7U</span>
    </div>
  );
}

interface BbPlayer {
  id: string; teamId: string; name: string;
  jerseyNumber: string | null; position: string | null;
  active: boolean; sortOrder: number;
}
interface BbGame {
  id: string; teamId: string; gameDate: string; opponent: string;
  location: string | null; ourScore: number | null; oppScore: number | null; notes: string | null;
}
interface BbStatLine {
  id: string; gameId: string; playerId: string;
  ab: number | null; r: number | null; h: number | null;
  doubles: number | null; triples: number | null; hr: number | null;
  bb: number | null; k: number | null; sb: number | null; sac: number | null; rbi: number | null;
  // Offensive on-base extras. hbp feeds OBP. roe + fc feed Reached Base but
  // NOT OBP (official rules). `e` below is the unrelated defensive errors col.
  hbp: number | null;
  roe: number | null;
  fc: number | null;
  po: number | null; a: number | null; e: number | null;
  pitchingOuts: number | null; pc: number | null; pBb: number | null;
  so: number | null; pH: number | null; pR: number | null; er: number | null;
  // Per-game lineup/defense fields (admin-entered).
  startingPosition: string | null;
  battingOrder: number | null;
}
interface AggregateStats {
  games: number; pa: number; ab: number; r: number; h: number;
  singles: number; doubles: number; triples: number; hr: number;
  bb: number; k: number; sb: number; sac: number; rbi: number; tb: number;
  hbp: number; fc: number; roe: number;
  // RB = H + BB + HBP + ROE + FC. RB% = RB / PA. OBP stays per-rulebook.
  rb: number; rbPct: number | null;
  avg: number | null; obp: number | null; slg: number | null; ops: number | null;
  iso: number | null; babip: number | null;
  bbRate: number | null; kRate: number | null;
  xbh: number; xbhRate: number | null; secAvg: number | null;
  po: number; a: number; e: number; fpct: number | null;
  pitchingOuts: number; ipDecimal: number; ipDisplay: string;
  pc: number; pBb: number; so: number; pH: number; pR: number; er: number;
  era: number | null; whip: number | null; kPer9: number | null;
}
interface TeamMeta {
  slug: string; name: string; season: string | null;
  hasAccess: boolean; isAdmin: boolean;
}
type StatMode = "manual" | "combined" | "gamechanger";
interface SourceCoverage {
  manualGames: number;
  gamechangerGames: number;
  gamechangerOnlyGames: number;
}
interface StatsResponse {
  leaderboard: { player: BbPlayer; stats: AggregateStats }[];
  team: AggregateStats;
  players: BbPlayer[];
  games: BbGame[];
  mode: StatMode;
  sourceCoverage: SourceCoverage;
}

// Game dates are stored as UTC-midnight timestamps. Parsing them through
// `new Date(...).toLocaleDateString()` in US timezones shifts back a day
// (e.g. an April 12 game shows as April 11). Format the YYYY-MM-DD portion
// directly so the displayed day always matches what was entered.
function formatGameDate(d: string | null | undefined): string {
  if (!d) return "—";
  const s = String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const [, y, mo, da] = m;
  return `${parseInt(mo, 10)}/${parseInt(da, 10)}/${y}`;
}

const fmt3 = (n: number | null): string => n === null ? "—" : (n < 1 && n > -1 ? n.toFixed(3).replace(/^(-?)0/, "$1") : n.toFixed(3));
const fmt2 = (n: number | null): string => n === null ? "—" : n.toFixed(2);
const fmtInt = (n: number): string => String(n);
const fmtPct = (n: number | null): string => n === null ? "—" : `${(n * 100).toFixed(1)}%`;

// ---------- Sortable table helpers ----------
type SortDir = "asc" | "desc";
interface SortState<K extends string> { key: K; dir: SortDir }

function useSort<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggle = (key: K, defaultDir: SortDir = "desc") => {
    setSort(s => s.key === key ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir });
  };
  return { sort, toggle };
}

function SortHead<K extends string>(props: {
  k: K; label: string; align?: "left" | "right"; sort: SortState<K>;
  toggle: (k: K, d?: SortDir) => void; defaultDir?: SortDir;
}) {
  const { k, label, align = "right", sort, toggle, defaultDir = "desc" } = props;
  const active = sort.key === k;
  const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => toggle(k, defaultDir)}
        className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""} ${active ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}
        data-testid={`sort-${k}`}
      >
        {label}{arrow}
      </button>
    </TableHead>
  );
}

function sortRows<T, K extends string>(
  rows: T[],
  accessors: Record<K, (r: T) => number | string | null>,
  sort: SortState<K>,
): T[] {
  const get = accessors[sort.key];
  const dirMul = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b);
    const aNull = va === null || va === undefined;
    const bNull = vb === null || vb === undefined;
    if (aNull && bNull) return 0;
    if (aNull) return 1; // nulls always at the bottom
    if (bNull) return -1;
    if (typeof va === "string" && typeof vb === "string") return dirMul * va.localeCompare(vb);
    return dirMul * ((va as number) - (vb as number));
  });
}

export default function TeamPage() {
  const { slug = "stars7u" } = useParams<{ slug?: string }>();
  const { data: meta, isLoading: metaLoading } = useQuery<TeamMeta>({
    queryKey: ["/api/team", slug, "meta"],
  });

  if (metaLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!meta) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Team not found</div>;

  return (
    <>
      <Seo
        title={`${meta.name} — Team Stats`}
        description={`Stats for ${meta.name}`}
        noindex
      />
      {meta.hasAccess ? <TeamDashboard slug={slug} meta={meta} /> : <PasswordGate slug={slug} meta={meta} />}
    </>
  );
}

function PasswordGate({ slug, meta }: { slug: string; meta: TeamMeta }) {
  const [password, setPassword] = useState("");
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: async (pw: string) => apiRequest("POST", `/api/team/${slug}/auth`, { password: pw }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "meta"] });
    },
    onError: (e: any) => toast({ title: "Wrong password", description: e?.message ?? "", variant: "destructive" }),
  });
  return (
    <div className="min-h-screen px-4 py-8 bg-muted/30">
      <div className="max-w-2xl mx-auto space-y-6">
        {slug === "stars7u" && <KnoxStarsBrand size="lg" className="justify-center" />}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="w-4 h-4" /> {meta.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={e => { e.preventDefault(); if (password) mut.mutate(password); }} className="space-y-4">
              <div>
                <Label htmlFor="team-password">Team password</Label>
                <Input
                  id="team-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoFocus
                  data-testid="input-team-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={mut.isPending || !password} data-testid="button-team-login">
                {mut.isPending ? "Checking..." : "Enter"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// -------------------- Coach Poll (public-facing) --------------------

interface PollPlayer { id: string; name: string; jerseyNumber: string | null }
interface PollCoachRole { role: string; firstName: string; lastName: string; variations: string[]; submitted: boolean }
interface PollMeta { players: PollPlayer[]; coachRoles: PollCoachRole[] }

function CoachPollCard({ slug }: { slug: string }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<PollMeta>({
    queryKey: ["/api/team", slug, "poll", "meta"],
    queryFn: async () => {
      const r = await fetch(`/api/team/${slug}/poll/meta`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load poll");
      return r.json();
    },
  });
  const [name, setName] = useState("");
  // `identity` carries the matched coach role (or null for a confirmed non-coach
  // submission). `started` tells us the name has been verified and the ranking
  // table should be shown.
  const [identity, setIdentity] = useState<{ isCoach: boolean; role: string | null } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [rankings, setRankings] = useState<Record<string, { speed: number; brIQ: number }>>({});
  const [submitted, setSubmitted] = useState(false);

  const checkName = useMutation({
    mutationFn: async (n: string) => {
      const r = await fetch(`/api/team/${slug}/poll/check-name`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.message ?? "Could not match name");
      return body as { isCoach: boolean; role: string | null; alreadySubmitted: boolean };
    },
    onSuccess: (res) => {
      if (res.alreadySubmitted) {
        setNameError(res.isCoach
          ? "This coach already submitted answers. Please text Justin at 865-468-8946 to have your previous response removed."
          : "You've already submitted a response under this name. Please text Justin at 865-468-8946 to have your previous response removed.");
        setIdentity(null);
        return;
      }
      setNameError(null);
      setIdentity({ isCoach: res.isCoach, role: res.role });
    },
    onError: (e: any) => {
      setIdentity(null);
      setNameError(e?.message ?? "Could not check name — please try again");
    },
  });

  const submit = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/team/${slug}/poll/submit`, { name, rankings }),
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "poll", "meta"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "poll-responses"] });
      toast({ title: "Thanks!", description: "Your rankings were submitted." });
    },
    onError: (e: any) => {
      const msg = e?.message ?? "Submission failed";
      toast({ title: "Submission failed", description: msg, variant: "destructive" });
      // 409 already-submitted: surface the canonical message inline too.
      if (typeof msg === "string" && msg.includes("865-468-8946")) setNameError(msg);
    },
  });

  const players = data?.players ?? [];
  const allRanked = identity !== null && players.length > 0 && players.every(p => rankings[p.id]?.speed && rankings[p.id]?.brIQ);

  if (submitted) {
    return (
      <Card data-testid="card-poll-submitted">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Check className="w-5 h-5 text-green-600" /> Thanks, coach!</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Your speed & baserunning IQ rankings have been submitted. Only the head coach can view results.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-coach-poll">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Coach Poll — Speed & Baserunning IQ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Rank each player <strong>1–5</strong> on each scale. <strong>Speed:</strong> 5 = fastest, 1 = slowest. <strong>Baserunning IQ:</strong> 5 = highest, 1 = lowest. Multiple players can share the same number. Only the head coach can see results.
        </p>
        <div className="space-y-2">
          <Label htmlFor="poll-name">Your name</Label>
          <div className="flex gap-2">
            <Input
              id="poll-name"
              value={name}
              onChange={e => { setName(e.target.value); setIdentity(null); setNameError(null); }}
              placeholder="Your name (first, last, or nickname)"
              data-testid="input-poll-name"
              disabled={identity !== null}
            />
            {identity === null ? (
              <Button
                type="button"
                onClick={() => name.trim() && checkName.mutate(name.trim())}
                disabled={!name.trim() || checkName.isPending}
                data-testid="button-poll-check-name"
              >
                {checkName.isPending ? "Checking..." : "Continue"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => { setIdentity(null); setRankings({}); }}
                data-testid="button-poll-change-name"
              >
                Change
              </Button>
            )}
          </div>
          {nameError && <p className="text-sm text-destructive" data-testid="text-poll-name-error">{nameError}</p>}
          {identity && (
            <p className="text-xs text-muted-foreground" data-testid="text-poll-role">
              {identity.isCoach
                ? <>Submitting as <strong>{identity.role}</strong></>
                : <>Submitting as <strong>Non-Coach</strong> (visible to admin only)</>}
            </p>
          )}
        </div>
        {identity && (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="w-28">Speed (1–5)</TableHead>
                    <TableHead className="w-28">BR IQ (1–5)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.map(p => {
                    const cur = rankings[p.id] ?? {};
                    return (
                      <TableRow key={p.id} data-testid={`poll-row-${p.id}`}>
                        <TableCell>
                          {p.jerseyNumber && <span className="text-muted-foreground mr-2">#{p.jerseyNumber}</span>}
                          {p.name}
                        </TableCell>
                        <TableCell>
                          <select
                            className="border rounded-md px-2 py-1 text-sm bg-background"
                            value={cur.speed ?? ""}
                            onChange={e => setRankings(r => ({ ...r, [p.id]: { ...(r[p.id] ?? { brIQ: 0 }), speed: Number(e.target.value) } }))}
                            data-testid={`select-poll-speed-${p.id}`}
                          >
                            <option value="">—</option>
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </TableCell>
                        <TableCell>
                          <select
                            className="border rounded-md px-2 py-1 text-sm bg-background"
                            value={cur.brIQ ?? ""}
                            onChange={e => setRankings(r => ({ ...r, [p.id]: { ...(r[p.id] ?? { speed: 0 }), brIQ: Number(e.target.value) } }))}
                            data-testid={`select-poll-briq-${p.id}`}
                          >
                            <option value="">—</option>
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Button
              type="button"
              onClick={() => submit.mutate()}
              disabled={!allRanked || submit.isPending}
              data-testid="button-poll-submit"
            >
              {submit.isPending ? "Submitting..." : allRanked ? "Submit rankings" : "Rank every player to submit"}
            </Button>
          </>
        )}
        {isLoading && <p className="text-sm text-muted-foreground">Loading roster...</p>}
      </CardContent>
    </Card>
  );
}

type GameFilter =
  | { kind: "all" }
  | { kind: "lastN"; n: number }
  | { kind: "custom"; ids: string[] };

// `null` means "any". Used to scope the record header + stats tabs to e.g.
// only games vs the Eagles, or only games at a specific location. These are
// applied as a further intersection on top of the preset/custom GameFilter.
type OpponentSel = string | null;
type LocationSel = string | null;

function sortGamesDesc(games: BbGame[]): BbGame[] {
  return [...games].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
}

function computeFilterIds(filter: GameFilter, games: BbGame[]): string[] | null {
  if (filter.kind === "all") return null;
  if (filter.kind === "lastN") return sortGamesDesc(games).slice(0, filter.n).map(g => g.id);
  return filter.ids;
}

function matchesExtras(g: BbGame, opp: OpponentSel, loc: LocationSel): boolean {
  if (opp !== null && g.opponent !== opp) return false;
  if (loc !== null && (g.location ?? "") !== loc) return false;
  return true;
}

// Returns the effective list of game IDs to query the stats API with after
// applying the preset filter AND the opponent/location selectors. `null` means
// "no scoping — use every game".
function resolveEffectiveIds(
  filter: GameFilter, games: BbGame[], opp: OpponentSel, loc: LocationSel,
): string[] | null {
  const baseIds = computeFilterIds(filter, games);
  const extrasActive = opp !== null || loc !== null;
  if (baseIds === null && !extrasActive) return null;
  const baseSet = baseIds ? new Set(baseIds) : null;
  return games
    .filter(g => (baseSet === null || baseSet.has(g.id)) && matchesExtras(g, opp, loc))
    .map(g => g.id);
}

function computeRecord(games: BbGame[]): { w: number; l: number; t: number } {
  let w = 0, l = 0, t = 0;
  for (const g of games) {
    if (g.ourScore == null || g.oppScore == null) continue;
    if (g.ourScore > g.oppScore) w++;
    else if (g.ourScore < g.oppScore) l++;
    else t++;
  }
  return { w, l, t };
}

// ---------- Trends tab ----------
type TrendStatKind = "rate" | "pct" | "count";
interface TrendStatDef { key: string; label: string; group: string; kind: TrendStatKind }
const TREND_STATS: TrendStatDef[] = [
  { key: "avg", label: "AVG", group: "Offense — Rate", kind: "rate" },
  { key: "obp", label: "OBP", group: "Offense — Rate", kind: "rate" },
  { key: "slg", label: "SLG", group: "Offense — Rate", kind: "rate" },
  { key: "ops", label: "OPS", group: "Offense — Rate", kind: "rate" },
  { key: "iso", label: "ISO", group: "Offense — Rate", kind: "rate" },
  { key: "babip", label: "BABIP", group: "Offense — Rate", kind: "rate" },
  { key: "secAvg", label: "Sec. Avg", group: "Offense — Rate", kind: "rate" },
  { key: "bbRate", label: "BB%", group: "Offense — Rate", kind: "pct" },
  { key: "kRate", label: "K%", group: "Offense — Rate", kind: "pct" },
  { key: "xbhRate", label: "XBH%", group: "Offense — Rate", kind: "pct" },
  { key: "h", label: "Hits", group: "Offense — Counting", kind: "count" },
  { key: "hr", label: "HR", group: "Offense — Counting", kind: "count" },
  { key: "rbi", label: "RBI", group: "Offense — Counting", kind: "count" },
  { key: "r", label: "Runs", group: "Offense — Counting", kind: "count" },
  { key: "doubles", label: "2B", group: "Offense — Counting", kind: "count" },
  { key: "triples", label: "3B", group: "Offense — Counting", kind: "count" },
  { key: "xbh", label: "XBH", group: "Offense — Counting", kind: "count" },
  { key: "tb", label: "Total Bases", group: "Offense — Counting", kind: "count" },
  { key: "bb", label: "Walks", group: "Offense — Counting", kind: "count" },
  { key: "k", label: "Strikeouts", group: "Offense — Counting", kind: "count" },
  { key: "sb", label: "SB", group: "Offense — Counting", kind: "count" },
  { key: "po", label: "Putouts", group: "Defense", kind: "count" },
  { key: "a", label: "Assists", group: "Defense", kind: "count" },
  { key: "e", label: "Errors", group: "Defense", kind: "count" },
  { key: "fpct", label: "Fielding %", group: "Defense", kind: "rate" },
];
const TREND_GROUPS = ["Offense — Rate", "Offense — Counting", "Defense"];
const TREND_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", "#0891b2",
  "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#b45309",
];
const TREND_WINDOWS = [
  { value: "all", label: "All season" },
  { value: "25", label: "Last 25" },
  { value: "20", label: "Last 20" },
  { value: "15", label: "Last 15" },
  { value: "10", label: "Last 10" },
  { value: "5", label: "Last 5" },
];

interface TrendStatPoint {
  h: number; hr: number; rbi: number; r: number; doubles: number; triples: number;
  xbh: number; tb: number; bb: number; k: number; sb: number; pa: number; ab: number;
  avg: number | null; obp: number | null; slg: number | null; ops: number | null;
  iso: number | null; babip: number | null; secAvg: number | null;
  bbRate: number | null; kRate: number | null; xbhRate: number | null;
  po: number; a: number; e: number; fpct: number | null;
}
interface TrendPoint { gameId: string; played: boolean; perGame: TrendStatPoint | null; cumulative: TrendStatPoint | null; windowCumulative: TrendStatPoint | null }
type TrendValueMode = "seasonCum" | "windowCum" | "perGame";
interface TrendSeries { player: BbPlayer; appeared: boolean; points: TrendPoint[] }
interface TrendGame { id: string; gameDate: string; opponent: string; ourScore: number | null; oppScore: number | null }
interface TrendsResponse { games: TrendGame[]; series: TrendSeries[]; mode: StatMode; window: string }

const fmtTrendVal = (v: number | null, kind: TrendStatKind): string =>
  v == null ? "—" : kind === "count" ? String(v) : kind === "pct" ? `${(v * 100).toFixed(1)}%` : fmt3(v);

function TrendsTab({ slug, mode, season }: { slug: string; mode: StatMode; season: string }) {
  const [stat, setStat] = useState<string>("ops");
  const [valueMode, setValueMode] = useState<TrendValueMode>("seasonCum");
  const [windowSel, setWindowSel] = useState<string>("all");
  // null = "default selection"; an explicit Set once the user toggles a chip.
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const { data, isLoading, error } = useQuery<TrendsResponse>({
    queryKey: ["/api/team", slug, "trends", mode, season, windowSel],
    queryFn: async () => {
      const parts = [`mode=${mode}`, `season=${encodeURIComponent(season)}`, `window=${windowSel}`];
      const r = await fetch(`/api/team/${slug}/trends?${parts.join("&")}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load trends (HTTP ${r.status})`);
      return r.json();
    },
    staleTime: 30_000,
  });

  const statMeta = TREND_STATS.find(s => s.key === stat) ?? TREND_STATS[0];

  if (error) {
    return (
      <Card className="mt-4">
        <CardContent className="py-6 text-sm">
          <div className="text-destructive font-medium mb-1">Couldn't load trends</div>
          <div className="text-muted-foreground">{(error as Error).message}</div>
        </CardContent>
      </Card>
    );
  }
  if (isLoading || !data) {
    return <Card className="mt-4"><CardContent className="py-6 text-muted-foreground">Loading trends...</CardContent></Card>;
  }

  const appeared = data.series.filter(s => s.appeared);
  // Stable color per player by appearance order, independent of selection.
  const colorById = new Map<string, string>();
  appeared.forEach((s, i) => colorById.set(s.player.id, TREND_COLORS[i % TREND_COLORS.length]));
  const nameById = new Map<string, string>();
  appeared.forEach(s => nameById.set(s.player.id, s.player.name + (s.player.jerseyNumber ? ` #${s.player.jerseyNumber}` : "")));
  const seriesById = new Map<string, TrendSeries>();
  data.series.forEach(s => seriesById.set(s.player.id, s));

  const defaultIds = appeared.slice(0, 5).map(s => s.player.id);
  const effective = selected ?? new Set(defaultIds);
  // Keep chart line order + colors stable by iterating appearance order.
  const activeIds = appeared.map(s => s.player.id).filter(id => effective.has(id));

  const toggle = (id: string) => {
    const next = new Set(effective);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const getVal = (pt: TrendPoint | undefined, key: string): number | null => {
    if (!pt) return null;
    const src = valueMode === "seasonCum" ? pt.cumulative
      : valueMode === "windowCum" ? pt.windowCumulative
      : pt.perGame;
    if (!src) return null;
    const v = (src as unknown as Record<string, number | null>)[key];
    return typeof v === "number" ? v : null;
  };

  const chartData = data.games.map((g, i) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(g.gameDate));
    const row: Record<string, number | string | null> = {
      label: m ? `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}` : `G${i + 1}`,
      full: `${formatGameDate(g.gameDate)} vs ${g.opponent}`,
    };
    for (const id of activeIds) row[id] = getVal(seriesById.get(id)?.points[i], stat);
    return row;
  });

  const yTickFmt = (v: number) =>
    statMeta.kind === "count" ? String(v) : statMeta.kind === "pct" ? `${Math.round(v * 100)}%` : fmt3(v);

  const TrendTooltip = ({ active, payload }: { active?: boolean; payload?: { dataKey: string; value: number | null; color: string; payload: { full: string } }[] }) => {
    if (!active || !payload?.length) return null;
    const full = payload[0]?.payload?.full;
    const rows = payload.filter(e => e.value != null);
    if (!rows.length) return null;
    return (
      <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md min-w-[140px]">
        <div className="font-semibold mb-1">{full}</div>
        {rows.map(e => (
          <div key={e.dataKey} className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
            <span className="truncate">{nameById.get(e.dataKey) ?? e.dataKey}</span>
            <span className="ml-auto font-medium tabular-nums">{fmtTrendVal(e.value, statMeta.kind)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Player trends</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Stat</Label>
            <select
              className="border rounded-md px-2 py-1.5 text-sm bg-background min-w-[160px]"
              value={stat}
              onChange={e => setStat(e.target.value)}
              data-testid="select-trend-stat"
            >
              {TREND_GROUPS.map(g => (
                <optgroup key={g} label={g}>
                  {TREND_STATS.filter(s => s.group === g).map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">View</Label>
            <div className="flex">
              <Button
                size="sm"
                variant={valueMode === "perGame" ? "default" : "secondary"}
                className="rounded-r-none toggle-elevate"
                onClick={() => setValueMode("perGame")}
                data-testid="button-trend-pergame"
              >
                Per game
              </Button>
              <Button
                size="sm"
                variant={valueMode === "windowCum" ? "default" : "secondary"}
                className="rounded-none toggle-elevate"
                onClick={() => setValueMode("windowCum")}
                data-testid="button-trend-windowcum"
              >
                Cumulative (window)
              </Button>
              <Button
                size="sm"
                variant={valueMode === "seasonCum" ? "default" : "secondary"}
                className="rounded-l-none toggle-elevate"
                onClick={() => setValueMode("seasonCum")}
                data-testid="button-trend-cumulative"
              >
                Cumulative (season)
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Games</Label>
            <div className="flex flex-wrap gap-1" data-testid="trend-window-selector">
              {TREND_WINDOWS.map(w => (
                <Button
                  key={w.value}
                  size="sm"
                  variant={windowSel === w.value ? "default" : "ghost"}
                  onClick={() => setWindowSel(w.value)}
                  data-testid={`button-trend-window-${w.value}`}
                >
                  {w.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {valueMode === "seasonCum"
            ? "Cumulative (season): season-to-date — includes every game up to each point, even games before the selected range (rate stats recompute from cumulative totals)."
            : valueMode === "windowCum"
            ? "Cumulative (window): builds across only the selected games — resets at the start of the chosen range and accumulates game by game (rate stats recompute from those totals)."
            : "Per-game values; a gap means the player didn't appear in that game. At 7U single-game rate stats are very noisy — a cumulative view is usually clearer."}
          {" "}AB is recorded as raw plate appearances, so rate stats read lower than official figures.
        </p>

        {appeared.length === 0 ? (
          <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No games with stats in this season/window yet.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium mr-1">Players:</span>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set(appeared.map(s => s.player.id)))} data-testid="button-trend-select-all">
                Select all ({appeared.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())} data-testid="button-trend-clear">
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {appeared.map(s => {
                const on = effective.has(s.player.id);
                const color = colorById.get(s.player.id)!;
                return (
                  <button
                    key={s.player.id}
                    type="button"
                    onClick={() => toggle(s.player.id)}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${on ? "border-foreground/30 bg-muted" : "bg-background hover-elevate opacity-60"}`}
                    data-testid={`button-trend-player-${s.player.id}`}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: on ? color : "transparent", border: on ? undefined : `1px solid ${color}` }} />
                    {s.player.name}{s.player.jerseyNumber ? ` #${s.player.jerseyNumber}` : ""}
                  </button>
                );
              })}
            </div>

            {activeIds.length === 0 ? (
              <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Select one or more players above to plot {statMeta.label}.
              </div>
            ) : (
              <div className="h-72 w-full" data-testid="trend-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={yTickFmt} tickLine={false} width={44} allowDecimals={statMeta.kind !== "count"} />
                    <RechartsTooltip content={<TrendTooltip />} />
                    {activeIds.map(id => (
                      <Line
                        key={id}
                        type="monotone"
                        dataKey={id}
                        name={nameById.get(id)}
                        stroke={colorById.get(id)}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                        connectNulls={valueMode !== "perGame"}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TeamDashboard({ slug, meta }: { slug: string; meta: TeamMeta }) {
  const [mode, setMode] = useState<StatMode>("combined");
  const [gameFilter, setGameFilter] = useState<GameFilter>({ kind: "all" });
  const [opponent, setOpponent] = useState<OpponentSel>(null);
  const [location, setLocation] = useState<LocationSel>(null);
  // Selected season for viewing (defaults to the team's current active season).
  // Switching this re-fetches every season-scoped query.
  const [viewSeason, setViewSeason] = useState<string>(meta.season ?? "Spring 2026");
  const { data: seasonsData } = useQuery<{ current: string; seasons: string[] }>({
    queryKey: ["/api/team", slug, "seasons"],
    queryFn: async () => {
      const r = await fetch(`/api/team/${slug}/seasons`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load seasons");
      return r.json();
    },
    staleTime: 60_000,
  });
  const seasonOptions = (() => {
    const set = new Set<string>(seasonsData?.seasons ?? []);
    set.add(viewSeason);
    if (seasonsData?.current) set.add(seasonsData.current);
    return Array.from(set).sort();
  })();
  // Always fetch all games + an unfiltered baseline so we can render the filter
  // controls even before any pick is made. Scoped to the selected season.
  const { data: baseline } = useQuery<StatsResponse>({
    queryKey: ["/api/team", slug, "stats", "combined", "all", viewSeason],
    queryFn: async () => {
      const r = await fetch(`/api/team/${slug}/stats?mode=combined&season=${encodeURIComponent(viewSeason)}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load stats (HTTP ${r.status})`);
      return r.json();
    },
    staleTime: 60_000,
  });
  const allGames = baseline?.games ?? [];
  const filterIds = resolveEffectiveIds(gameFilter, allGames, opponent, location);
  const filterKey = filterIds ? filterIds.slice().sort().join(",") || "none" : "all";
  // Games actually in scope (after every filter) — drives the record header
  // and the "showing X of Y" labels.
  const filteredGames = filterIds === null
    ? allGames
    : allGames.filter(g => filterIds.includes(g.id));
  const record = computeRecord(filteredGames);
  const { data, isLoading, error, refetch } = useQuery<StatsResponse>({
    queryKey: ["/api/team", slug, "stats", mode, filterKey, viewSeason],
    queryFn: async () => {
      const parts = [`mode=${mode}`, `season=${encodeURIComponent(viewSeason)}`];
      if (filterIds) {
        parts.push(filterIds.length === 0 ? "gameIds=__none__" : `gameIds=${encodeURIComponent(filterIds.join(","))}`);
      }
      const r = await fetch(`/api/team/${slug}/stats?${parts.join("&")}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load stats (HTTP ${r.status})`);
      return r.json();
    },
    retry: 1,
    staleTime: 30_000,
  });
  const logoutMut = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/team/${slug}/logout`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "meta"] }),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            {slug === "stars7u" ? (
              <KnoxStarsBrand size="md" />
            ) : (
              <h1 className="text-xl font-semibold" data-testid="text-team-name">{meta.name}</h1>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Season</span>
              <select
                className="border rounded-md px-2 py-1 text-sm bg-background"
                value={viewSeason}
                onChange={e => setViewSeason(e.target.value)}
                data-testid="select-view-season"
              >
                {seasonOptions.map(s => (
                  <option key={s} value={s}>{s}{seasonsData?.current === s ? " (current)" : ""}</option>
                ))}
              </select>
            </div>
            <RecordBadge w={record.w} l={record.l} t={record.t} scoped={filterIds !== null} total={filteredGames.length} />
            <Button variant="ghost" size="sm" onClick={() => logoutMut.mutate()} data-testid="button-team-logout">
              <LogOut className="w-4 h-4 mr-1" /> Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <StatSourceBar mode={mode} setMode={setMode} coverage={data?.sourceCoverage} />
        <GameFilterBar
          games={allGames}
          filter={gameFilter}
          setFilter={setGameFilter}
          opponent={opponent}
          setOpponent={setOpponent}
          location={location}
          setLocation={setLocation}
          activeCount={filterIds === null ? allGames.length : filterIds.length}
        />
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <div className="font-medium text-destructive mb-1">Couldn't load stats</div>
            <div className="text-muted-foreground mb-3">{(error as Error).message}. The server may be busy — try again.</div>
            <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-retry-stats">Retry</Button>
          </div>
        ) : isLoading || !data ? (
          <div className="text-muted-foreground">Loading stats...</div>
        ) : (
          <Tabs defaultValue="leaderboard">
            <TabsList>
              <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">Leaderboard</TabsTrigger>
              <TabsTrigger value="games" data-testid="tab-games">Games</TabsTrigger>
              <TabsTrigger value="pitching" data-testid="tab-pitching">Pitching</TabsTrigger>
              <TabsTrigger value="fielding" data-testid="tab-fielding">Fielding</TabsTrigger>
              <TabsTrigger value="compare" data-testid="tab-compare">Compare</TabsTrigger>
              <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
              <TabsTrigger value="poll" data-testid="tab-poll">Coach Poll</TabsTrigger>
              <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
              {meta.isAdmin && <TabsTrigger value="admin" data-testid="tab-admin">Admin</TabsTrigger>}
            </TabsList>
            <TabsContent value="leaderboard"><LeaderboardTab data={data} /></TabsContent>
            <TabsContent value="games"><GamesTab slug={slug} mode={mode} data={data} /></TabsContent>
            <TabsContent value="pitching"><PitchingTab data={data} /></TabsContent>
            <TabsContent value="fielding"><FieldingTab data={data} slug={slug} mode={mode} season={viewSeason} /></TabsContent>
            <TabsContent value="compare"><CompareTab slug={slug} season={viewSeason} /></TabsContent>
            <TabsContent value="trends"><TrendsTab slug={slug} mode={mode} season={viewSeason} /></TabsContent>
            <TabsContent value="poll"><div className="mt-4"><CoachPollCard slug={slug} /></div></TabsContent>
            <TabsContent value="reports">
              <div className="space-y-6 mt-4">
                <AIEvaluationCard slug={slug} players={data.players} currentSeason={seasonsData?.current ?? meta.season ?? "Spring 2026"} audience="family" />
                <SeasonReportCard slug={slug} players={data.players} audience="family" />
              </div>
            </TabsContent>
            {meta.isAdmin && <TabsContent value="admin"><AdminTab slug={slug} data={data} currentSeason={seasonsData?.current ?? meta.season ?? "Spring 2026"} /></TabsContent>}
          </Tabs>
        )}
      </main>
    </div>
  );
}

function StatSourceBar({ mode, setMode, coverage }: { mode: StatMode; setMode: (m: StatMode) => void; coverage?: SourceCoverage }) {
  const options: { value: StatMode; label: string; hint: string }[] = [
    { value: "manual", label: "Manual only", hint: "Only games scored from the scorebook" },
    { value: "combined", label: "Manual + GameChanger gap-fill", hint: "Manual where available, GameChanger fills the rest" },
    { value: "gamechanger", label: "GameChanger only", hint: "Only GameChanger imports" },
  ];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 border rounded-md p-3 bg-muted/30">
      <div className="text-sm font-medium">Stat source:</div>
      <div className="flex flex-wrap gap-1">
        {options.map(o => (
          <Button
            key={o.value}
            variant={mode === o.value ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(o.value)}
            title={o.hint}
            data-testid={`button-mode-${o.value}`}
          >
            {o.label}
          </Button>
        ))}
      </div>
      {coverage && (
        <div className="text-xs text-muted-foreground ml-auto">
          Manual: {coverage.manualGames} game(s) · GameChanger: {coverage.gamechangerGames} game(s)
          {coverage.gamechangerOnlyGames > 0 && ` · ${coverage.gamechangerOnlyGames} GC-only`}
        </div>
      )}
    </div>
  );
}

function OpponentLocationSelects({
  games, opponent, setOpponent, location, setLocation,
}: {
  games: BbGame[];
  opponent: OpponentSel; setOpponent: (o: OpponentSel) => void;
  location: LocationSel; setLocation: (l: LocationSel) => void;
}) {
  // Distinct values pulled straight from the games list. Sorted with a simple
  // locale compare; "(no location)" surfaces games with a null location so
  // they can be picked individually.
  const opponents = Array.from(new Set(games.map(g => g.opponent))).sort((a, b) => a.localeCompare(b));
  const locations = Array.from(new Set(games.map(g => g.location ?? ""))).sort((a, b) => a.localeCompare(b));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="border rounded-md px-2 py-1 text-sm bg-background"
        value={opponent ?? ""}
        onChange={e => setOpponent(e.target.value === "" ? null : e.target.value)}
        data-testid="select-filter-opponent"
        title="Filter to games against one opponent"
      >
        <option value="">All opponents</option>
        {opponents.map(o => <option key={o} value={o}>vs {o}</option>)}
      </select>
      <select
        className="border rounded-md px-2 py-1 text-sm bg-background"
        value={location === null ? "__ALL__" : location}
        onChange={e => setLocation(e.target.value === "__ALL__" ? null : e.target.value)}
        data-testid="select-filter-location"
        title="Filter to games at one location"
      >
        <option value="__ALL__">All locations</option>
        {locations.map(l => (
          <option key={l || "__none__"} value={l}>{l === "" ? "(no location)" : l}</option>
        ))}
      </select>
      {(opponent !== null || location !== null) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setOpponent(null); setLocation(null); }}
          data-testid="button-clear-extra-filters"
        >
          Clear
        </Button>
      )}
    </div>
  );
}

function RecordBadge({ w, l, t, scoped, total }: { w: number; l: number; t: number; scoped: boolean; total: number }) {
  const played = w + l + t;
  const pct = played > 0 ? (w + t * 0.5) / played : null;
  return (
    <div
      className="flex items-baseline gap-2 rounded-md border bg-card px-3 py-1.5"
      data-testid="badge-record"
      title={scoped ? "Record for the games currently in scope" : "Season record"}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {scoped ? "Filtered" : "Record"}
      </div>
      <div className="text-lg font-semibold leading-none">
        {w}<span className="text-muted-foreground font-normal">-</span>{l}{t > 0 ? <><span className="text-muted-foreground font-normal">-</span>{t}</> : null}
      </div>
      <div className="text-xs text-muted-foreground">
        {played === 0 ? `${total} game${total === 1 ? "" : "s"}` : pct !== null ? `${(pct * 100).toFixed(0)}%` : ""}
      </div>
    </div>
  );
}

function GameFilterBar({
  games, filter, setFilter,
  opponent, setOpponent, location, setLocation,
  activeCount,
}: {
  games: BbGame[];
  filter: GameFilter;
  setFilter: (f: GameFilter) => void;
  opponent: OpponentSel;
  setOpponent: (o: OpponentSel) => void;
  location: LocationSel;
  setLocation: (l: LocationSel) => void;
  activeCount: number;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const total = games.length;
  const sorted = sortGamesDesc(games);

  const openCustom = () => {
    const initial = filter.kind === "custom" ? new Set(filter.ids) : new Set(sorted.map(g => g.id));
    setDraft(initial);
    setCustomOpen(true);
  };
  const applyCustom = () => {
    setFilter({ kind: "custom", ids: Array.from(draft) });
    setCustomOpen(false);
  };
  const toggleDraft = (id: string) => {
    setDraft(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const presets: Array<{ label: string; n: number }> = [
    { label: "Last 5", n: 5 },
    { label: "Last 10", n: 10 },
    { label: "Last 15", n: 15 },
    { label: "Last 20", n: 20 },
  ];
  const isAll = filter.kind === "all";
  const isLastN = (n: number) => filter.kind === "lastN" && filter.n === n;
  const isCustom = filter.kind === "custom";

  let label = `All games (${total})`;
  if (filter.kind === "lastN") label = `Last ${filter.n} games (showing ${activeCount})`;
  if (filter.kind === "custom") label = `Custom: ${filter.ids.length} game${filter.ids.length === 1 ? "" : "s"}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 border rounded-md p-3 bg-muted/30" data-testid="bar-game-filter">
        <div className="text-sm font-medium">Games:</div>
        <div className="flex flex-wrap gap-1">
          <Button
            variant={isAll ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter({ kind: "all" })}
            data-testid="button-game-filter-all"
          >
            All ({total})
          </Button>
          {presets.map(p => (
            <Button
              key={p.n}
              variant={isLastN(p.n) ? "default" : "outline"}
              size="sm"
              disabled={total < p.n}
              onClick={() => setFilter({ kind: "lastN", n: p.n })}
              data-testid={`button-game-filter-last-${p.n}`}
              title={total < p.n ? `Only ${total} game(s) played` : ""}
            >
              {p.label}
            </Button>
          ))}
          <Button
            variant={isCustom ? "default" : "outline"}
            size="sm"
            onClick={openCustom}
            disabled={total === 0}
            data-testid="button-game-filter-custom"
          >
            Custom...
          </Button>
        </div>
        <OpponentLocationSelects
          games={games}
          opponent={opponent}
          setOpponent={setOpponent}
          location={location}
          setLocation={setLocation}
        />
        <div className="text-xs text-muted-foreground ml-auto" data-testid="text-game-filter-label">{label}</div>
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pick games to include</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            <Button size="sm" variant="outline" onClick={() => setDraft(new Set(sorted.map(g => g.id)))} data-testid="button-custom-select-all">Select all</Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(new Set())} data-testid="button-custom-clear">Clear</Button>
            <span className="ml-auto self-center text-muted-foreground">{draft.size} of {total} selected</span>
          </div>
          <div className="max-h-80 overflow-y-auto border rounded-md divide-y">
            {sorted.map(g => (
              <label key={g.id} className="flex items-center gap-3 px-3 py-2 hover-elevate cursor-pointer text-sm" data-testid={`row-custom-game-${g.id}`}>
                <input
                  type="checkbox"
                  checked={draft.has(g.id)}
                  onChange={() => toggleDraft(g.id)}
                  data-testid={`checkbox-custom-game-${g.id}`}
                />
                <div className="flex-1">
                  <div className="font-medium">{formatGameDate(g.gameDate)} — vs {g.opponent}</div>
                  {g.ourScore != null && g.oppScore != null && (
                    <div className="text-xs text-muted-foreground">{g.ourScore}–{g.oppScore}</div>
                  )}
                </div>
              </label>
            ))}
            {sorted.length === 0 && (
              <div className="px-3 py-6 text-center text-muted-foreground text-sm">No games yet.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)} data-testid="button-custom-cancel">Cancel</Button>
            <Button onClick={applyCustom} data-testid="button-custom-apply">Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- Tabs ----------

type LbKey = "jersey" | "name" | "games" | "pa" | "ab" | "h" | "r" | "rbi" | "doubles" | "triples" | "hr" | "bb" | "k" | "sb" | "xbh" | "rb" | "rbPct" | "avg" | "obp" | "slg" | "ops" | "iso" | "babip" | "bbRate" | "kRate" | "xbhRate" | "secAvg";

function LeaderboardTab({ data }: { data: StatsResponse }) {
  const { sort, toggle } = useSort<LbKey>({ key: "ops", dir: "desc" });
  const accessors: Record<LbKey, (r: { player: BbPlayer; stats: AggregateStats }) => number | string | null> = {
    jersey: r => {
      // Keep accessor mono-typed (number) so sortRows comparator stays well-defined.
      // Non-numeric jerseys (e.g. "A1") and missing jerseys sort to the bottom.
      const n = r.player.jerseyNumber ? Number(r.player.jerseyNumber) : NaN;
      return Number.isFinite(n) ? n : null;
    },
    name: r => r.player.name,
    games: r => r.stats.games, pa: r => r.stats.pa, ab: r => r.stats.ab,
    h: r => r.stats.h, r: r => r.stats.r, rbi: r => r.stats.rbi,
    doubles: r => r.stats.doubles, triples: r => r.stats.triples, hr: r => r.stats.hr,
    bb: r => r.stats.bb, k: r => r.stats.k, sb: r => r.stats.sb, xbh: r => r.stats.xbh,
    rb: r => r.stats.rb, rbPct: r => r.stats.rbPct,
    avg: r => r.stats.avg, obp: r => r.stats.obp, slg: r => r.stats.slg, ops: r => r.stats.ops,
    iso: r => r.stats.iso, babip: r => r.stats.babip,
    bbRate: r => r.stats.bbRate, kRate: r => r.stats.kRate,
    xbhRate: r => r.stats.xbhRate, secAvg: r => r.stats.secAvg,
  };
  const rows = sortRows(data.leaderboard, accessors, sort);
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Hitting</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead k="jersey" label="#" align="left" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="name" label="Player" align="left" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="games" label="G" sort={sort} toggle={toggle} />
              <SortHead k="pa" label="PA" sort={sort} toggle={toggle} />
              <SortHead k="ab" label="AB" sort={sort} toggle={toggle} />
              <SortHead k="h" label="H" sort={sort} toggle={toggle} />
              <SortHead k="r" label="R" sort={sort} toggle={toggle} />
              <SortHead k="rbi" label="RBI" sort={sort} toggle={toggle} />
              <SortHead k="doubles" label="2B" sort={sort} toggle={toggle} />
              <SortHead k="triples" label="3B" sort={sort} toggle={toggle} />
              <SortHead k="hr" label="HR" sort={sort} toggle={toggle} />
              <SortHead k="bb" label="BB" sort={sort} toggle={toggle} />
              <SortHead k="k" label="K" sort={sort} toggle={toggle} />
              <SortHead k="sb" label="SB" sort={sort} toggle={toggle} />
              <SortHead k="xbh" label="XBH" sort={sort} toggle={toggle} />
              <SortHead k="rb" label="RB" sort={sort} toggle={toggle} />
              <SortHead k="rbPct" label="RB%" sort={sort} toggle={toggle} />
              <SortHead k="avg" label="AVG" sort={sort} toggle={toggle} />
              <SortHead k="obp" label="OBP" sort={sort} toggle={toggle} />
              <SortHead k="slg" label="SLG" sort={sort} toggle={toggle} />
              <SortHead k="ops" label="OPS" sort={sort} toggle={toggle} />
              <SortHead k="iso" label="ISO" sort={sort} toggle={toggle} />
              <SortHead k="babip" label="BABIP" sort={sort} toggle={toggle} />
              <SortHead k="bbRate" label="BB%" sort={sort} toggle={toggle} />
              <SortHead k="kRate" label="K%" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="xbhRate" label="XBH%" sort={sort} toggle={toggle} />
              <SortHead k="secAvg" label="SecA" sort={sort} toggle={toggle} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ player, stats }) => (
              <TableRow key={player.id} data-testid={`row-leader-${player.id}`}>
                <TableCell className="text-muted-foreground">{player.jerseyNumber ?? ""}</TableCell>
                <TableCell className="font-medium whitespace-nowrap">{player.name}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.games)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.pa)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.ab)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.h)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.r)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.rbi)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.doubles)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.triples)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.hr)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.bb)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.k)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.sb)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.xbh)}</TableCell>
                <TableCell className="text-right">{fmtInt(stats.rb)}</TableCell>
                <TableCell className="text-right">{fmtPct(stats.rbPct)}</TableCell>
                <TableCell className="text-right font-medium">{fmt3(stats.avg)}</TableCell>
                <TableCell className="text-right">{fmt3(stats.obp)}</TableCell>
                <TableCell className="text-right">{fmt3(stats.slg)}</TableCell>
                <TableCell className="text-right font-medium">{fmt3(stats.ops)}</TableCell>
                <TableCell className="text-right">{fmt3(stats.iso)}</TableCell>
                <TableCell className="text-right">{fmt3(stats.babip)}</TableCell>
                <TableCell className="text-right">{fmtPct(stats.bbRate)}</TableCell>
                <TableCell className="text-right">{fmtPct(stats.kRate)}</TableCell>
                <TableCell className="text-right">{fmtPct(stats.xbhRate)}</TableCell>
                <TableCell className="text-right">{fmt3(stats.secAvg)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={27} className="text-center text-muted-foreground py-6">No stats yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground mt-3">
          Click any column header to sort. The <strong>AB</strong> column shows the raw <strong>total of plate appearances</strong> as tallied in the scorebook; rate stats (AVG, OBP, SLG, OPS, ISO, BABIP, BB%, K%, XBH%, SecA) all use the official formulas with the official AB = PA − BB − SAC − HBP. <strong>RB</strong> (Reached Base) = H + BB + HBP + ROE + FC — any way the batter got on. <strong>RB%</strong> = RB ÷ PA. <strong>OBP</strong> is the official rulebook stat = (H + BB + HBP) ÷ (officialAB + BB + HBP + SF); ROE and FC are <em>not</em> credited to OBP. ISO = SLG − AVG. BABIP = (H − HR) ÷ (officialAB − K − HR). SecA = (TB − H + BB + SB) ÷ officialAB. Missing HBP/ROE/FC values default to 0. Sac flies are merged into the SAC column on this team's scorebook.
        </p>
      </CardContent>
    </Card>
  );
}

type PitchKey = "name" | "ip" | "pc" | "pH" | "pR" | "er" | "pBb" | "so" | "era" | "whip" | "kPer9";

function PitchingTab({ data }: { data: StatsResponse }) {
  const { sort, toggle } = useSort<PitchKey>({ key: "era", dir: "asc" });
  const filtered = data.leaderboard.filter(r => r.stats.pitchingOuts > 0);
  const accessors: Record<PitchKey, (r: { player: BbPlayer; stats: AggregateStats }) => number | string | null> = {
    name: r => r.player.name,
    ip: r => r.stats.ipDecimal, pc: r => r.stats.pc,
    pH: r => r.stats.pH, pR: r => r.stats.pR, er: r => r.stats.er,
    pBb: r => r.stats.pBb, so: r => r.stats.so,
    era: r => r.stats.era, whip: r => r.stats.whip, kPer9: r => r.stats.kPer9,
  };
  const rows = sortRows(filtered, accessors, sort);
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Pitching</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead k="name" label="Player" align="left" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="ip" label="IP" sort={sort} toggle={toggle} />
              <SortHead k="pc" label="PC" sort={sort} toggle={toggle} />
              <SortHead k="pH" label="H" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="pR" label="R" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="er" label="ER" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="pBb" label="BB" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="so" label="SO" sort={sort} toggle={toggle} />
              <SortHead k="era" label="ERA" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="whip" label="WHIP" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="kPer9" label="K/9" sort={sort} toggle={toggle} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ player, stats }) => (
              <TableRow key={player.id}>
                <TableCell className="font-medium">{player.name}</TableCell>
                <TableCell className="text-right">{stats.ipDisplay}</TableCell>
                <TableCell className="text-right">{stats.pc}</TableCell>
                <TableCell className="text-right">{stats.pH}</TableCell>
                <TableCell className="text-right">{stats.pR}</TableCell>
                <TableCell className="text-right">{stats.er}</TableCell>
                <TableCell className="text-right">{stats.pBb}</TableCell>
                <TableCell className="text-right">{stats.so}</TableCell>
                <TableCell className="text-right font-medium">{fmt2(stats.era)}</TableCell>
                <TableCell className="text-right">{fmt2(stats.whip)}</TableCell>
                <TableCell className="text-right">{fmt2(stats.kPer9)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">No pitching data yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type FieldKey = "name" | "po" | "a" | "e" | "fpct";

interface FieldPosPlayer { playerId: string; name: string; po: number; a: number; e: number }
interface FieldPosRow { position: string; label: string; po: number; a: number; e: number; fpct: number | null; players: FieldPosPlayer[] }
interface FieldByPositionResponse { positions: FieldPosRow[]; mode: StatMode; season: string | null }

function FieldingTab({ data, slug, mode, season }: { data: StatsResponse; slug: string; mode: StatMode; season: string | null }) {
  const { sort, toggle } = useSort<FieldKey>({ key: "fpct", dir: "desc" });
  const filtered = data.leaderboard.filter(r => (r.stats.po + r.stats.a + r.stats.e) > 0);
  const accessors: Record<FieldKey, (r: { player: BbPlayer; stats: AggregateStats }) => number | string | null> = {
    name: r => r.player.name,
    po: r => r.stats.po, a: r => r.stats.a, e: r => r.stats.e, fpct: r => r.stats.fpct,
  };
  const rows = sortRows(filtered, accessors, sort);

  const posQ = useQuery<FieldByPositionResponse>({
    queryKey: ["/api/team", slug, "fielding-by-position", mode, season ?? "all"],
    queryFn: () => {
      const params = new URLSearchParams({ mode });
      if (season) params.set("season", season);
      return fetch(`/api/team/${slug}/fielding-by-position?${params}`, { credentials: "include" }).then(r => {
        if (!r.ok) throw new Error("Failed to load fielding by position");
        return r.json();
      });
    },
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (code: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });
  const positions = posQ.data?.positions ?? [];

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader><CardTitle>Fielding</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <SortHead k="name" label="Player" align="left" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="po" label="PO" sort={sort} toggle={toggle} />
              <SortHead k="a" label="A" sort={sort} toggle={toggle} />
              <SortHead k="e" label="E" sort={sort} toggle={toggle} defaultDir="asc" />
              <SortHead k="fpct" label="FPCT" sort={sort} toggle={toggle} />
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(({ player, stats }) => (
                <TableRow key={player.id}>
                  <TableCell className="font-medium">{player.name}</TableCell>
                  <TableCell className="text-right">{stats.po}</TableCell>
                  <TableCell className="text-right">{stats.a}</TableCell>
                  <TableCell className="text-right">{stats.e}</TableCell>
                  <TableCell className="text-right font-medium">{fmt3(stats.fpct)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No fielding data yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fielding by Position</CardTitle>
          <p className="text-sm text-muted-foreground">Putouts, assists, and errors grouped by position played. Click a row to see which players contributed.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {posQ.isLoading ? (
            <p className="text-muted-foreground py-6 text-center">Loading…</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Position</TableHead>
                <TableHead className="text-right">PO</TableHead>
                <TableHead className="text-right">A</TableHead>
                <TableHead className="text-right">E</TableHead>
                <TableHead className="text-right">FPCT</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {positions.map(p => (
                  <Fragment key={p.position}>
                    <TableRow
                      className="cursor-pointer hover-elevate"
                      onClick={() => toggleExpand(p.position)}
                      data-testid={`row-position-${p.position}`}
                    >
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-1">
                          {expanded.has(p.position) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {p.label}
                          {p.position !== "UA" && <span className="text-muted-foreground">({p.position})</span>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{p.po}</TableCell>
                      <TableCell className="text-right">{p.a}</TableCell>
                      <TableCell className="text-right">{p.e}</TableCell>
                      <TableCell className="text-right font-medium">{fmt3(p.fpct)}</TableCell>
                    </TableRow>
                    {expanded.has(p.position) && p.players.map(pl => (
                      <TableRow key={`${p.position}-${pl.playerId}`} className="bg-muted/40">
                        <TableCell className="pl-9 text-sm text-muted-foreground">{pl.name}</TableCell>
                        <TableCell className="text-right text-sm">{pl.po}</TableCell>
                        <TableCell className="text-right text-sm">{pl.a}</TableCell>
                        <TableCell className="text-right text-sm">{pl.e}</TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
                {positions.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No fielding data yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Compare tab ----------

interface CompareRow { player: BbPlayer; manual: AggregateStats; gc: AggregateStats }
interface CompareResponse {
  rows: CompareRow[];
  games: BbGame[];
  overlappingGameIds: string[];
  allGames: BbGame[];
}
type CmpKey = "name" | "pa" | "h" | "rbi" | "hr" | "bb" | "k" | "sb" | "avg" | "obp" | "slg" | "ops";

function deltaCell(m: number | null, g: number | null, format: (n: number) => string) {
  if (m === null || g === null) return <TableCell className="text-right text-muted-foreground">—</TableCell>;
  const d = m - g;
  const eps = format === fmtIntSigned ? 0.5 : 0.0005;
  const color = Math.abs(d) < eps ? "text-muted-foreground"
    : d > 0 ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  return <TableCell className={`text-right tabular-nums ${color}`}>{format(d)}</TableCell>;
}
const fmtIntSigned = (n: number): string => (n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`);
const fmt3Signed = (n: number): string => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(3).replace(/^0/, "");

function CompareTab({ slug, season }: { slug: string; season: string }) {
  const [selected, setSelected] = useState<Set<string> | null>(null); // null = "all overlapping"
  const selectedKey = selected ? Array.from(selected).sort().join(",") || "none" : "all";
  const { data, isLoading, error } = useQuery<CompareResponse>({
    queryKey: ["/api/team", slug, "compare", selectedKey, season],
    queryFn: async () => {
      const parts = [`season=${encodeURIComponent(season)}`];
      if (selected) parts.push(selected.size === 0 ? "gameIds=__none__" : `gameIds=${encodeURIComponent(Array.from(selected).join(","))}`);
      const r = await fetch(`/api/team/${slug}/compare?${parts.join("&")}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load comparison (HTTP ${r.status})`);
      return r.json();
    },
    staleTime: 30_000,
  });
  const { sort, toggle } = useSort<CmpKey>({ key: "ops", dir: "desc" });

  // Check error BEFORE the loading/no-data branch — otherwise a failed fetch
  // (data === undefined) gets stuck on the loading state instead of surfacing the error.
  if (error) {
    return (
      <Card className="mt-4">
        <CardContent className="py-6 text-sm">
          <div className="text-destructive font-medium mb-1">Couldn't load comparison</div>
          <div className="text-muted-foreground">{(error as Error).message}</div>
        </CardContent>
      </Card>
    );
  }
  if (isLoading || !data) {
    return <Card className="mt-4"><CardContent className="py-6 text-muted-foreground">Loading comparison...</CardContent></Card>;
  }

  const overlapGames = data.allGames
    .filter(g => data.overlappingGameIds.includes(g.id))
    .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime());
  const effective = selected ?? new Set(overlapGames.map(g => g.id));
  const toggleGame = (id: string) => {
    const next = new Set(effective);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const accessors: Record<CmpKey, (r: CompareRow) => number | string | null> = {
    name: r => r.player.name,
    pa: r => r.manual.pa + r.gc.pa,
    h: r => r.manual.h + r.gc.h,
    rbi: r => r.manual.rbi + r.gc.rbi,
    hr: r => r.manual.hr + r.gc.hr,
    bb: r => r.manual.bb + r.gc.bb,
    k: r => r.manual.k + r.gc.k,
    sb: r => r.manual.sb + r.gc.sb,
    avg: r => r.manual.avg, obp: r => r.manual.obp,
    slg: r => r.manual.slg, ops: r => r.manual.ops,
  };
  const rows = sortRows(
    data.rows.filter(r => r.manual.pa > 0 || r.gc.pa > 0),
    accessors,
    sort,
  );

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Manual vs GameChanger comparison</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {overlapGames.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No games yet have both manual scorebook entries AND a GameChanger import. Add manual stats (Admin → Manual Stat Entry, Excel Upload, or Scan Scorebook) for one or more games that also have GameChanger imports to enable side-by-side comparison.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium mr-2">Games to compare:</div>
              <Button size="sm" variant="outline" onClick={() => setSelected(null)} data-testid="button-compare-select-all">
                Select all ({overlapGames.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelected(new Set())} data-testid="button-compare-clear">
                Clear
              </Button>
              <div className="text-xs text-muted-foreground ml-auto">
                {effective.size} of {overlapGames.length} game(s) selected
              </div>
            </div>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto border rounded-md p-2">
              {overlapGames.map(g => {
                const on = effective.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGame(g.id)}
                    className={`text-xs px-2 py-1 rounded border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover-elevate"}`}
                    data-testid={`button-compare-game-${g.id}`}
                  >
                    {formatGameDate(g.gameDate)} vs {g.opponent}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Green Δ = manual scorebook is higher than GameChanger. Red = lower. Same AB-as-PA convention applies to both sources, so rate stats are directly comparable.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead k="name" label="Player" align="left" sort={sort} toggle={toggle} defaultDir="asc" />
                    <TableHead className="text-right">Source</TableHead>
                    <SortHead k="pa" label="PA" sort={sort} toggle={toggle} />
                    <SortHead k="h" label="H" sort={sort} toggle={toggle} />
                    <SortHead k="rbi" label="RBI" sort={sort} toggle={toggle} />
                    <SortHead k="hr" label="HR" sort={sort} toggle={toggle} />
                    <SortHead k="bb" label="BB" sort={sort} toggle={toggle} />
                    <SortHead k="k" label="K" sort={sort} toggle={toggle} />
                    <SortHead k="sb" label="SB" sort={sort} toggle={toggle} />
                    <SortHead k="avg" label="AVG" sort={sort} toggle={toggle} />
                    <SortHead k="obp" label="OBP" sort={sort} toggle={toggle} />
                    <SortHead k="slg" label="SLG" sort={sort} toggle={toggle} />
                    <SortHead k="ops" label="OPS" sort={sort} toggle={toggle} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-6">No players have stats in the selected games.</TableCell></TableRow>
                  ) : rows.flatMap(({ player, manual: m, gc: g }) => [
                    <TableRow key={`${player.id}-m`} data-testid={`row-cmp-manual-${player.id}`} className="border-b-0">
                      <TableCell rowSpan={3} className="font-medium align-top whitespace-nowrap border-r">
                        {player.name}{player.jerseyNumber ? ` #${player.jerseyNumber}` : ""}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">Manual</TableCell>
                      <TableCell className="text-right">{fmtInt(m.pa)}</TableCell>
                      <TableCell className="text-right">{fmtInt(m.h)}</TableCell>
                      <TableCell className="text-right">{fmtInt(m.rbi)}</TableCell>
                      <TableCell className="text-right">{fmtInt(m.hr)}</TableCell>
                      <TableCell className="text-right">{fmtInt(m.bb)}</TableCell>
                      <TableCell className="text-right">{fmtInt(m.k)}</TableCell>
                      <TableCell className="text-right">{fmtInt(m.sb)}</TableCell>
                      <TableCell className="text-right">{fmt3(m.avg)}</TableCell>
                      <TableCell className="text-right">{fmt3(m.obp)}</TableCell>
                      <TableCell className="text-right">{fmt3(m.slg)}</TableCell>
                      <TableCell className="text-right">{fmt3(m.ops)}</TableCell>
                    </TableRow>,
                    <TableRow key={`${player.id}-g`} data-testid={`row-cmp-gc-${player.id}`} className="border-b-0">
                      <TableCell className="text-right text-xs text-muted-foreground">GC</TableCell>
                      <TableCell className="text-right">{fmtInt(g.pa)}</TableCell>
                      <TableCell className="text-right">{fmtInt(g.h)}</TableCell>
                      <TableCell className="text-right">{fmtInt(g.rbi)}</TableCell>
                      <TableCell className="text-right">{fmtInt(g.hr)}</TableCell>
                      <TableCell className="text-right">{fmtInt(g.bb)}</TableCell>
                      <TableCell className="text-right">{fmtInt(g.k)}</TableCell>
                      <TableCell className="text-right">{fmtInt(g.sb)}</TableCell>
                      <TableCell className="text-right">{fmt3(g.avg)}</TableCell>
                      <TableCell className="text-right">{fmt3(g.obp)}</TableCell>
                      <TableCell className="text-right">{fmt3(g.slg)}</TableCell>
                      <TableCell className="text-right">{fmt3(g.ops)}</TableCell>
                    </TableRow>,
                    <TableRow key={`${player.id}-d`} data-testid={`row-cmp-delta-${player.id}`}>
                      <TableCell className="text-right text-xs text-muted-foreground">Δ</TableCell>
                      {deltaCell(m.pa, g.pa, fmtIntSigned)}
                      {deltaCell(m.h, g.h, fmtIntSigned)}
                      {deltaCell(m.rbi, g.rbi, fmtIntSigned)}
                      {deltaCell(m.hr, g.hr, fmtIntSigned)}
                      {deltaCell(m.bb, g.bb, fmtIntSigned)}
                      {deltaCell(m.k, g.k, fmtIntSigned)}
                      {deltaCell(m.sb, g.sb, fmtIntSigned)}
                      {deltaCell(m.avg, g.avg, fmt3Signed)}
                      {deltaCell(m.obp, g.obp, fmt3Signed)}
                      {deltaCell(m.slg, g.slg, fmt3Signed)}
                      {deltaCell(m.ops, g.ops, fmt3Signed)}
                    </TableRow>,
                  ])}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function GamesTab({ slug, mode, data }: { slug: string; mode: StatMode; data: StatsResponse }) {
  const [openGame, setOpenGame] = useState<BbGame | null>(null);
  const sorted = [...data.games].sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime());
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>Game Log</CardTitle></CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground">No games yet.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map(g => {
              const us = g.ourScore ?? null, them = g.oppScore ?? null;
              const result = us !== null && them !== null ? (us > them ? "W" : us < them ? "L" : "T") : "—";
              return (
                <button
                  key={g.id}
                  onClick={() => setOpenGame(g)}
                  className="w-full flex items-center justify-between border rounded-md p-3 hover-elevate text-left"
                  data-testid={`button-game-${g.id}`}
                >
                  <div>
                    <div className="font-medium">vs {g.opponent}</div>
                    <div className="text-xs text-muted-foreground">{formatGameDate(g.gameDate)}{g.location ? ` · ${g.location}` : ""}</div>
                  </div>
                  <div className="text-right">
                    {us !== null && them !== null && <div className="font-medium">{us} — {them}</div>}
                    <div className="text-xs text-muted-foreground">{result}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
      {openGame && <GameDetailDialog slug={slug} mode={mode} game={openGame} players={data.players} onClose={() => setOpenGame(null)} />}
    </Card>
  );
}

function GameDetailDialog({ slug, mode, game, players, onClose }: { slug: string; mode: StatMode; game: BbGame; players: BbPlayer[]; onClose: () => void }) {
  const { data } = useQuery<{ game: BbGame; rows: BbStatLine[] }>({
    queryKey: ["/api/team", slug, "game", game.id, "stats", mode],
    queryFn: async () => {
      const r = await fetch(`/api/team/${slug}/game/${game.id}/stats?mode=${mode}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load game stats");
      return r.json();
    },
  });
  const playerById = new Map(players.map(p => [p.id, p]));
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>vs {game.opponent} — {formatGameDate(game.gameDate)}</DialogTitle>
        </DialogHeader>
        {!data ? <p className="text-muted-foreground">Loading...</p> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">AB</TableHead><TableHead className="text-right">R</TableHead>
                <TableHead className="text-right">H</TableHead><TableHead className="text-right">2B</TableHead>
                <TableHead className="text-right">3B</TableHead><TableHead className="text-right">HR</TableHead>
                <TableHead className="text-right">BB</TableHead><TableHead className="text-right">K</TableHead>
                <TableHead className="text-right">RBI</TableHead><TableHead className="text-right">SB</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{playerById.get(r.playerId)?.name ?? "?"}</TableCell>
                    <TableCell className="text-right">{r.ab ?? 0}</TableCell>
                    <TableCell className="text-right">{r.r ?? 0}</TableCell>
                    <TableCell className="text-right">{r.h ?? 0}</TableCell>
                    <TableCell className="text-right">{r.doubles ?? 0}</TableCell>
                    <TableCell className="text-right">{r.triples ?? 0}</TableCell>
                    <TableCell className="text-right">{r.hr ?? 0}</TableCell>
                    <TableCell className="text-right">{r.bb ?? 0}</TableCell>
                    <TableCell className="text-right">{r.k ?? 0}</TableCell>
                    <TableCell className="text-right">{r.rbi ?? 0}</TableCell>
                    <TableCell className="text-right">{r.sb ?? 0}</TableCell>
                  </TableRow>
                ))}
                {data.rows.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-4">No stats recorded for this game.</TableCell></TableRow>}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              Note: <strong>AB</strong> is total plate appearances as scored — walks, sacrifices, and other non-AB outcomes are <em>not</em> removed. Not the official MLB at-bat stat.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Admin Tab ----------

function SeasonAdmin({ slug, currentSeason }: { slug: string; currentSeason: string }) {
  const { toast } = useToast();
  const [next, setNext] = useState("");
  const mut = useMutation({
    mutationFn: async (season: string) => apiRequest("PATCH", `/api/team/${slug}/admin/season`, { season }),
    onSuccess: () => {
      toast({ title: "Active season updated", description: "New games will be tagged with the new season." });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "meta"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "seasons"] });
      setNext("");
    },
    onError: (err: Error) => toast({ title: "Couldn't update season", description: err.message, variant: "destructive" }),
  });
  return (
    <Card data-testid="card-season-admin">
      <CardHeader>
        <CardTitle className="text-lg">Active Season</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The current active season is <span className="font-medium text-foreground" data-testid="text-current-season">{currentSeason}</span>.
          Any new game (manual entry, Excel upload, GameChanger import, scorebook scan) will be tagged with this value.
          Existing games keep their original tag — change the season here when you start a new one (e.g. "Fall 2026").
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder='e.g. "Fall 2026"'
            value={next}
            onChange={e => setNext(e.target.value)}
            maxLength={50}
            data-testid="input-new-season"
          />
          <Button
            onClick={() => mut.mutate(next.trim())}
            disabled={!next.trim() || next.trim() === currentSeason || mut.isPending}
            data-testid="button-set-season"
          >
            Set as active season
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminTab({ slug, data, currentSeason }: { slug: string; data: StatsResponse; currentSeason: string }) {
  return (
    <div className="space-y-6 mt-4">
      <SeasonAdmin slug={slug} currentSeason={currentSeason} />
      <AILineupAdmin slug={slug} players={data.players} />
      <AIEvaluationCard slug={slug} players={data.players} currentSeason={currentSeason} audience="coach" />
      <SeasonReportCard slug={slug} players={data.players} audience="coach" />
      <TeamAdminsAdmin slug={slug} />
      <RosterAdmin slug={slug} players={data.players} />
      <GamesAdmin slug={slug} games={data.games} players={data.players} />
      <PollResponsesAdmin slug={slug} players={data.players} />
      <ReconcileSection slug={slug} />
      <StatEntry slug={slug} players={data.players} games={data.games} />
      <BulkStatEntry slug={slug} players={data.players} games={data.games} />
      <FieldingByPositionAdmin slug={slug} players={data.players} games={data.games} />
      <TeamFieldingAdmin slug={slug} games={data.games} />
      <ScorebookScan slug={slug} players={data.players} games={data.games} />
      <IScoreImport slug={slug} />
      <GameChangerImport slug={slug} />
      <ExcelUpload slug={slug} />
    </div>
  );
}

// -------------------- Admin: Poll Responses --------------------

interface AdminPollRow {
  role: string;
  firstName: string;
  lastName: string;
  variations: string[];
  response: {
    id: string;
    submittedName: string;
    rankings: Record<string, { speed: number; brIQ: number }>;
    createdAt: string;
  } | null;
}

interface AdminNonCoachRow {
  id: string;
  submittedName: string;
  rankings: Record<string, { speed: number; brIQ: number }>;
  createdAt: string;
}

function RankingsTable({ rankings, players }: { rankings: Record<string, { speed: number; brIQ: number }>; players: BbPlayer[] }) {
  const playerById = new Map(players.map(p => [p.id, p]));
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Player</TableHead>
            <TableHead className="w-20 text-right">Speed</TableHead>
            <TableHead className="w-20 text-right">BR IQ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(rankings).map(([pid, r]) => {
            const p = playerById.get(pid);
            return (
              <TableRow key={pid}>
                <TableCell>
                  {p ? (
                    <>
                      {p.jerseyNumber && <span className="text-muted-foreground mr-2">#{p.jerseyNumber}</span>}
                      {p.name}
                    </>
                  ) : (
                    <span className="text-muted-foreground">(unknown player)</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.speed}</TableCell>
                <TableCell className="text-right tabular-nums">{r.brIQ}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function PollResponsesAdmin({ slug, players }: { slug: string; players: BbPlayer[] }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ coaches: AdminPollRow[]; nonCoaches: AdminNonCoachRow[] }>({
    queryKey: ["/api/team", slug, "admin", "poll-responses"],
    queryFn: async () => {
      const r = await fetch(`/api/team/${slug}/admin/poll-responses`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load poll responses");
      return r.json();
    },
  });
  const removeCoach = useMutation({
    mutationFn: async (role: string) =>
      apiRequest("DELETE", `/api/team/${slug}/admin/poll-responses/${encodeURIComponent(role)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "poll-responses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "poll", "meta"] });
      toast({ title: "Response removed", description: "Coach can now resubmit." });
    },
    onError: (e: any) => toast({ title: "Remove failed", description: e?.message ?? "", variant: "destructive" }),
  });
  const removeNonCoach = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/team/${slug}/admin/poll-responses/non-coach/${encodeURIComponent(id)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "poll-responses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "poll", "meta"] });
      toast({ title: "Response removed", description: "They can now resubmit." });
    },
    onError: (e: any) => toast({ title: "Remove failed", description: e?.message ?? "", variant: "destructive" }),
  });
  const coaches = data?.coaches ?? [];
  const nonCoaches = data?.nonCoaches ?? [];
  const coachCount = coaches.filter(r => r.response).length;

  // ----- Summary aggregation (client-side; data already loaded) -----
  const [summaryFilter, setSummaryFilter] = useState<"all" | "coaches" | "noncoaches">("all");
  const summaryRows = (() => {
    const coachResponses = coaches.filter(c => c.response).map(c => c.response!);
    const filtered =
      summaryFilter === "coaches" ? coachResponses :
      summaryFilter === "noncoaches" ? nonCoaches :
      [...coachResponses, ...nonCoaches];
    const agg = new Map<string, { speedSum: number; speedN: number; iqSum: number; iqN: number }>();
    for (const r of filtered) {
      const ranks = (r.rankings as Record<string, { speed?: number; brIQ?: number }>) || {};
      for (const [pid, v] of Object.entries(ranks)) {
        const a = agg.get(pid) ?? { speedSum: 0, speedN: 0, iqSum: 0, iqN: 0 };
        if (typeof v?.speed === "number") { a.speedSum += v.speed; a.speedN += 1; }
        if (typeof v?.brIQ === "number") { a.iqSum += v.brIQ; a.iqN += 1; }
        agg.set(pid, a);
      }
    }
    const playersSorted = [...players].sort((a, b) => {
      const ja = Number(a.jerseyNumber ?? 9999), jb = Number(b.jerseyNumber ?? 9999);
      if (ja !== jb) return ja - jb;
      return a.name.localeCompare(b.name);
    });
    return playersSorted.map(p => {
      const a = agg.get(p.id);
      return {
        player: p,
        avgSpeed: a && a.speedN ? a.speedSum / a.speedN : null,
        avgIq: a && a.iqN ? a.iqSum / a.iqN : null,
        n: Math.max(a?.speedN ?? 0, a?.iqN ?? 0),
      };
    }).sort((a, b) => (b.avgSpeed ?? -Infinity) - (a.avgSpeed ?? -Infinity));
  })();
  const summaryResponseCount =
    summaryFilter === "coaches" ? coachCount :
    summaryFilter === "noncoaches" ? nonCoaches.length :
    coachCount + nonCoaches.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Poll Summary</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { window.location.href = `/api/team/${slug}/admin/poll-responses/export.xlsx`; }}
              data-testid="button-poll-export-xlsx"
            >
              <Download className="w-4 h-4 mr-1" /> Download Excel
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Average Speed and Baserunning IQ per player (5 = highest, 1 = lowest), computed across the selected respondents. The Excel download includes all three filter views plus a Raw Responses sheet.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-xs text-muted-foreground">Filter:</Label>
            <div className="inline-flex rounded-md border overflow-hidden" role="tablist">
              {([
                { key: "all", label: "All" },
                { key: "coaches", label: "Coaches only" },
                { key: "noncoaches", label: "Non-coaches only" },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSummaryFilter(opt.key)}
                  className={`px-3 py-1 text-xs ${summaryFilter === opt.key ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  data-testid={`button-summary-filter-${opt.key}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground" data-testid="text-summary-count">
              {summaryResponseCount} response{summaryResponseCount === 1 ? "" : "s"} included
            </span>
          </div>
          {summaryResponseCount === 0 ? (
            <p className="text-sm text-muted-foreground">No responses in this filter yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Avg Speed</TableHead>
                  <TableHead className="text-right">Avg brIQ</TableHead>
                  <TableHead className="text-right"># Ratings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryRows.map(s => (
                  <TableRow key={s.player.id} data-testid={`summary-row-${s.player.id}`}>
                    <TableCell>
                      {s.player.jerseyNumber && <span className="text-muted-foreground mr-2">#{s.player.jerseyNumber}</span>}
                      {s.player.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.avgSpeed != null ? s.avgSpeed.toFixed(2) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.avgIq != null ? s.avgIq.toFixed(2) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.n}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> Coach Poll Responses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Speed (5 = fastest, 1 = slowest) and Baserunning IQ (5 = highest, 1 = lowest), submitted by your coaching staff. {coachCount} of {coaches.length} coaches have responded.
          </p>
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {coaches.map(row => (
            <div key={row.role} className="border rounded-md p-3 space-y-2" data-testid={`poll-admin-${row.role}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-medium">{row.role} — {row.firstName} {row.lastName}</div>
                  {row.response ? (
                    <div className="text-xs text-muted-foreground">
                      Submitted as <strong>{row.response.submittedName}</strong> · {new Date(row.response.createdAt).toLocaleString()}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">(no response yet)</div>
                  )}
                </div>
                {row.response && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={removeCoach.isPending && removeCoach.variables === row.role}
                    onClick={() => {
                      if (!confirm(`Remove ${row.role}'s response? They will be able to resubmit.`)) return;
                      removeCoach.mutate(row.role);
                    }}
                    data-testid={`button-remove-poll-${row.role}`}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    {removeCoach.isPending && removeCoach.variables === row.role ? "Removing..." : "Remove response"}
                  </Button>
                )}
              </div>
              {row.response && <RankingsTable rankings={row.response.rankings} players={players} />}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> Non-Coach Responses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Submissions from people whose name didn't match the coaching staff roster. Admin-only — never shown in the public poll view. {nonCoaches.length} response{nonCoaches.length === 1 ? "" : "s"}.
          </p>
          {nonCoaches.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">No non-coach responses yet.</p>
          )}
          {nonCoaches.map(row => (
            <div key={row.id} className="border rounded-md p-3 space-y-2" data-testid={`poll-admin-noncoach-${row.id}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-medium">{row.submittedName}</div>
                  <div className="text-xs text-muted-foreground">
                    Non-Coach · {new Date(row.createdAt).toLocaleString()}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={removeNonCoach.isPending && removeNonCoach.variables === row.id}
                  onClick={() => {
                    if (!confirm(`Remove ${row.submittedName}'s response? They will be able to resubmit.`)) return;
                    removeNonCoach.mutate(row.id);
                  }}
                  data-testid={`button-remove-poll-noncoach-${row.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {removeNonCoach.isPending && removeNonCoach.variables === row.id ? "Removing..." : "Remove response"}
                </Button>
              </div>
              <RankingsTable rankings={row.rankings} players={players} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

interface ReconcilePair {
  a: BbGame & { counts: { manual: number; gamechanger: number } };
  b: BbGame & { counts: { manual: number; gamechanger: number } };
  reason: string;
}

function ReconcileSection({ slug }: { slug: string }) {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useQuery<{ pairs: ReconcilePair[] }>({
    queryKey: ["/api/team", slug, "admin", "reconcile"],
    queryFn: async () => {
      const r = await fetch(`/api/team/${slug}/admin/reconcile`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load reconcile candidates");
      return r.json();
    },
    staleTime: 30_000,
  });
  const merge = useMutation({
    mutationFn: async ({ keepId, mergeFromId }: { keepId: string; mergeFromId: string }) =>
      apiRequest("POST", `/api/team/${slug}/admin/games/${keepId}/merge`, { mergeFromId }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "reconcile"] });
      toast({
        title: "Games merged",
        description: `Moved ${result?.moved ?? 0} stat row(s); dropped ${result?.dropped ?? 0} conflict(s).`,
      });
    },
    onError: (e: any) => toast({ title: "Merge failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const pairs = data?.pairs ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> Reconcile Duplicate Games
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Finds games that look like they might be the same real-world game split across two rows (e.g. one created manually, another created by a GameChanger upload with a slightly different opponent spelling). Both sources are <strong>kept</strong> — Manual rows and GameChanger rows live side-by-side on the surviving game (the Combined viewer prefers Manual where they overlap). If the pair is one all-Manual row and one all-GameChanger row, use the green <strong>Combine GC + Manual</strong> button to merge them in one click (Manual side wins game-level metadata like time/score). Otherwise pick the side to keep manually.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} data-testid="button-reconcile-refresh">
            {isLoading ? "Scanning..." : "Rescan"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {isLoading ? "" : `${pairs.length} candidate pair${pairs.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {!isLoading && pairs.length === 0 && (
          <p className="text-sm text-muted-foreground">No duplicate candidates found — every game looks distinct.</p>
        )}
        <div className="space-y-3">
          {pairs.map((p, idx) => {
            const key = `${p.a.id}-${p.b.id}`;
            const pending = merge.isPending && merge.variables && (merge.variables.keepId === p.a.id || merge.variables.keepId === p.b.id) && (merge.variables.mergeFromId === p.a.id || merge.variables.mergeFromId === p.b.id);
            const doMerge = (keep: BbGame, drop: BbGame) => {
              if (!confirm(
                `Merge "${formatGameDate(drop.gameDate)} vs ${drop.opponent}" INTO "${formatGameDate(keep.gameDate)} vs ${keep.opponent}"?\n\nStat rows will move onto the kept game; the other row will be deleted. This can't be undone.`
              )) return;
              merge.mutate({ keepId: keep.id, mergeFromId: drop.id });
            };
            // One-click combine is offered when the pair is cleanly split:
            // one side is all-Manual (and has no GC rows) and the other is
            // all-GameChanger (and has no Manual rows). Manual side is kept
            // so its game-level metadata (time, score, H/V) survives.
            const aManualOnly = p.a.counts.manual > 0 && p.a.counts.gamechanger === 0;
            const aGcOnly = p.a.counts.gamechanger > 0 && p.a.counts.manual === 0;
            const bManualOnly = p.b.counts.manual > 0 && p.b.counts.gamechanger === 0;
            const bGcOnly = p.b.counts.gamechanger > 0 && p.b.counts.manual === 0;
            let combineKeep: BbGame | null = null;
            let combineDrop: BbGame | null = null;
            if (aManualOnly && bGcOnly) { combineKeep = p.a; combineDrop = p.b; }
            else if (bManualOnly && aGcOnly) { combineKeep = p.b; combineDrop = p.a; }
            return (
              <div key={key} className="border rounded-md p-3 space-y-2" data-testid={`reconcile-pair-${idx}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs text-muted-foreground">{p.reason}</div>
                  {combineKeep && combineDrop && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      disabled={pending}
                      onClick={() => doMerge(combineKeep!, combineDrop!)}
                      data-testid={`button-combine-gc-manual-${idx}`}
                    >
                      {pending ? "Combining..." : "Combine GC + Manual"}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {[p.a, p.b].map((g, i) => {
                    const other = i === 0 ? p.b : p.a;
                    return (
                      <div key={g.id} className="border rounded-md p-2 flex flex-col gap-1">
                        <div className="font-medium">{formatGameDate(g.gameDate)} vs {g.opponent}</div>
                        <div className="text-xs text-muted-foreground">
                          {g.location ? `${g.location} · ` : ""}
                          {g.ourScore != null && g.oppScore != null ? `${g.ourScore}–${g.oppScore}` : "(no score)"}
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Manual:</span> {g.counts.manual}
                          {"  ·  "}
                          <span className="text-muted-foreground">GameChanger:</span> {g.counts.gamechanger}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => doMerge(g, other)}
                          data-testid={`button-merge-keep-${g.id}`}
                        >
                          {pending ? "Merging..." : `Keep this, merge other in`}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RosterAdmin({ slug, players }: { slug: string; players: BbPlayer[] }) {
  const [name, setName] = useState("");
  const [num, setNum] = useState("");
  const [pos, setPos] = useState("");
  const [editing, setEditing] = useState<BbPlayer | null>(null);
  const { toast } = useToast();
  const create = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/team/${slug}/admin/players`, { name, jerseyNumber: num || undefined, position: pos || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
      setName(""); setNum(""); setPos("");
      toast({ title: "Player added" });
    },
  });
  const patch = useMutation({
    mutationFn: async (p: BbPlayer) => apiRequest("PATCH", `/api/team/${slug}/admin/players/${p.id}`, {
      name: p.name, jerseyNumber: p.jerseyNumber, position: p.position, active: p.active, sortOrder: p.sortOrder,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] }); setEditing(null); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/team/${slug}/admin/players/${id}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Roster</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={e => { e.preventDefault(); if (name) create.mutate(); }} className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[160px]"><Label htmlFor="p-name">Name</Label><Input id="p-name" value={name} onChange={e => setName(e.target.value)} data-testid="input-player-name" /></div>
          <div className="w-20"><Label htmlFor="p-num">#</Label><Input id="p-num" value={num} onChange={e => setNum(e.target.value)} data-testid="input-player-num" /></div>
          <div className="w-24"><Label htmlFor="p-pos">Pos</Label><Input id="p-pos" value={pos} onChange={e => setPos(e.target.value)} data-testid="input-player-pos" /></div>
          <Button type="submit" disabled={create.isPending || !name} data-testid="button-add-player"><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </form>
        <Table>
          <TableHeader><TableRow>
            <TableHead>#</TableHead><TableHead>Name</TableHead><TableHead>Pos</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {players.map(p => (
              <TableRow key={p.id}>
                <TableCell>{p.jerseyNumber}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.position}</TableCell>
                <TableCell>{p.active ? "Yes" : "No"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(p)} data-testid={`button-edit-player-${p.id}`}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Remove ${p.name}? This also deletes their stat lines.`)) del.mutate(p.id); }} data-testid={`button-delete-player-${p.id}`}><Trash2 className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {editing && (
          <Dialog open onOpenChange={() => setEditing(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Edit player</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
                <div><Label>Jersey #</Label><Input value={editing.jerseyNumber ?? ""} onChange={e => setEditing({ ...editing, jerseyNumber: e.target.value })} /></div>
                <div><Label>Position</Label><Input value={editing.position ?? ""} onChange={e => setEditing({ ...editing, position: e.target.value })} /></div>
                <div className="flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> <Label>Active</Label></div>
              </div>
              <DialogFooter><Button onClick={() => patch.mutate(editing)} disabled={patch.isPending}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

function toDateInputValue(d: string): string {
  // gameDate from the server is an ISO string; <input type="date"> wants YYYY-MM-DD.
  if (!d) return "";
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function GamesAdmin({ slug, games, players }: { slug: string; games: BbGame[]; players: BbPlayer[] }) {
  const [date, setDate] = useState("");
  const [opp, setOpp] = useState("");
  const [loc, setLoc] = useState("");
  const [us, setUs] = useState("");
  const [them, setThem] = useState("");
  const [editing, setEditing] = useState<BbGame | null>(null);
  const [viewing, setViewing] = useState<BbGame | null>(null);
  const { toast } = useToast();
  const create = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/team/${slug}/admin/games`, {
      gameDate: date, opponent: opp, location: loc || null,
      ourScore: us === "" ? null : parseInt(us, 10),
      oppScore: them === "" ? null : parseInt(them, 10),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
      setDate(""); setOpp(""); setLoc(""); setUs(""); setThem("");
      toast({ title: "Game added" });
    },
  });
  const del = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/team/${slug}/admin/games/${id}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] }),
  });
  const sortedGames = [...games].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  return (
    <Card>
      <CardHeader><CardTitle>Games</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={e => { e.preventDefault(); if (date && opp) create.mutate(); }} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div className="col-span-2"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-game-date" /></div>
          <div className="col-span-2"><Label>Opponent</Label><Input value={opp} onChange={e => setOpp(e.target.value)} data-testid="input-game-opponent" /></div>
          <div className="col-span-2"><Label>Location</Label><Input value={loc} onChange={e => setLoc(e.target.value)} /></div>
          <div><Label>Us</Label><Input value={us} onChange={e => setUs(e.target.value)} inputMode="numeric" /></div>
          <div><Label>Them</Label><Input value={them} onChange={e => setThem(e.target.value)} inputMode="numeric" /></div>
          <Button type="submit" disabled={create.isPending || !date || !opp} className="col-span-2" data-testid="button-add-game"><Plus className="w-4 h-4 mr-1" /> Add Game</Button>
        </form>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Opponent</TableHead><TableHead>Location</TableHead><TableHead>Score</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {sortedGames.map(g => (
              <TableRow key={g.id} data-testid={`row-admin-game-${g.id}`}>
                <TableCell>{formatGameDate(g.gameDate)}</TableCell>
                <TableCell>{g.opponent}</TableCell>
                <TableCell className="text-muted-foreground">{g.location ?? "—"}</TableCell>
                <TableCell>{g.ourScore ?? "—"} — {g.oppScore ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setViewing(g)} title="View game details" data-testid={`button-view-game-${g.id}`}><Eye className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(g)} title="Edit game" data-testid={`button-edit-game-${g.id}`}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete game vs ${g.opponent}?`)) del.mutate(g.id); }} title="Delete game" data-testid={`button-delete-game-${g.id}`}><Trash2 className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {sortedGames.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No games yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
        {editing && <EditGameDialog slug={slug} game={editing} onClose={() => setEditing(null)} />}
        {viewing && (
          <GameDetailsDialog
            slug={slug}
            game={viewing}
            players={players}
            onEdit={() => { setEditing(viewing); setViewing(null); }}
            onClose={() => setViewing(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface AttachedStats { game: BbGame; manual: number; gamechanger: number; players: { manual: number; gamechanger: number } }

function EditGameDialog({ slug, game, onClose }: { slug: string; game: BbGame; onClose: () => void }) {
  const [date, setDate] = useState(toDateInputValue(game.gameDate));
  const [opp, setOpp] = useState(game.opponent);
  const [loc, setLoc] = useState(game.location ?? "");
  const [us, setUs] = useState(game.ourScore == null ? "" : String(game.ourScore));
  const [them, setThem] = useState(game.oppScore == null ? "" : String(game.oppScore));
  const [notes, setNotes] = useState(game.notes ?? "");
  const { toast } = useToast();
  // Pull the live count of stat rows already attached to this game so the
  // admin can see what's tied to it (and decide whether a key change risks
  // future GameChanger uploads landing on a new game row instead of this one).
  const { data: attached } = useQuery<AttachedStats>({
    queryKey: ["/api/team", slug, "admin", "games", game.id, "attached-stats"],
    queryFn: async () => {
      const r = await fetch(`/api/team/${slug}/admin/games/${game.id}/attached-stats`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load attached stats");
      return r.json();
    },
    staleTime: 30_000,
  });
  const originalDate = toDateInputValue(game.gameDate);
  const dateChanged = date !== originalDate;
  const opponentChanged = opp.trim() !== game.opponent.trim();
  const keyChanged = dateChanged || opponentChanged;
  const save = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/team/${slug}/admin/games/${game.id}`, {
      gameDate: date,
      opponent: opp,
      location: loc.trim() === "" ? null : loc.trim(),
      ourScore: us === "" ? null : parseInt(us, 10),
      oppScore: them === "" ? null : parseInt(them, 10),
      notes: notes.trim() === "" ? null : notes.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
      toast({ title: "Game updated" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message ?? "", variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit game</DialogTitle></DialogHeader>
        {attached && (attached.manual > 0 || attached.gamechanger > 0) && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs space-y-1" data-testid="panel-attached-stats">
            <div className="font-medium">Stat rows attached to this game:</div>
            <div>
              <span className="text-muted-foreground">Manual:</span> {attached.manual} row{attached.manual === 1 ? "" : "s"} ({attached.players.manual} player{attached.players.manual === 1 ? "" : "s"})
              {"  ·  "}
              <span className="text-muted-foreground">GameChanger:</span> {attached.gamechanger} row{attached.gamechanger === 1 ? "" : "s"} ({attached.players.gamechanger} player{attached.players.gamechanger === 1 ? "" : "s"})
            </div>
          </div>
        )}
        {keyChanged && attached && attached.gamechanger > 0 && (
          <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-900/20 p-2 text-xs text-amber-900 dark:text-amber-100" data-testid="warn-key-change">
            <strong>Heads up:</strong> changing the {dateChanged && opponentChanged ? "date and opponent" : dateChanged ? "date" : "opponent"} keeps the existing GameChanger rows tied to this game, but a future GameChanger upload using the original {dateChanged && opponentChanged ? "date/opponent" : dateChanged ? "date" : "opponent"} will create a brand-new game row instead of merging here. If GameChanger and your scorebook disagree on the spelling, prefer matching GameChanger to avoid duplicates.
          </div>
        )}
        <form
          id="edit-game-form"
          onSubmit={e => { e.preventDefault(); if (date && opp.trim()) save.mutate(); }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-edit-game-date" /></div>
          <div className="col-span-2"><Label>Opponent</Label><Input value={opp} onChange={e => setOpp(e.target.value)} data-testid="input-edit-game-opponent" /></div>
          <div className="col-span-2"><Label>Location</Label><Input value={loc} onChange={e => setLoc(e.target.value)} data-testid="input-edit-game-location" /></div>
          <div><Label>Us</Label><Input value={us} onChange={e => setUs(e.target.value)} inputMode="numeric" data-testid="input-edit-game-us" /></div>
          <div><Label>Them</Label><Input value={them} onChange={e => setThem(e.target.value)} inputMode="numeric" data-testid="input-edit-game-them" /></div>
          <div className="col-span-2"><Label>Notes</Label><Input value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-edit-game-notes" /></div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-edit-game-cancel">Cancel</Button>
          <Button form="edit-game-form" type="submit" disabled={save.isPending || !date || !opp.trim()} data-testid="button-edit-game-save">
            {save.isPending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- Admin: Game Details (per-game stat rows) -----------------

interface AdminGameStatRow extends BbStatLine {
  source: "manual" | "gamechanger";
  playerName: string;
  jerseyNumber: string | null;
}
interface AdminGameStatsResponse { game: BbGame; rows: AdminGameStatRow[] }

// Format pitching outs (17) as scorebook IP ("5.2").
function ipDisplay(outs: number | null | undefined): string {
  if (outs == null || outs <= 0) return "0.0";
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

function GameDetailsDialog({
  slug, game, players, onEdit, onClose,
}: {
  slug: string;
  game: BbGame;
  players: BbPlayer[];
  onEdit: () => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<AdminGameStatsResponse>({
    queryKey: ["/api/team", slug, "admin", "game", game.id, "stats"],
    queryFn: async () => {
      const r = await fetch(`/api/team/${slug}/admin/game/${game.id}/stats`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load game stats");
      return r.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "game", game.id, "stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
    // Edit Game dialog reads attached-stats counts; keep it fresh after any
    // add/edit/delete inside Game Details so the warning panel reflects reality.
    queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "games", game.id, "attached-stats"] });
  };

  const rows = data?.rows ?? [];
  const manualRows = rows.filter(r => r.source === "manual");
  const gcRows = rows.filter(r => r.source === "gamechanger");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[96vw] w-[96vw] sm:max-w-[96vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Game details — {formatGameDate(game.gameDate)} vs {game.opponent}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Header card with editable summary */}
          <div className="rounded-md border p-3 flex flex-wrap gap-x-6 gap-y-2 items-center">
            <div className="text-sm"><span className="text-muted-foreground">Date:</span> <span className="font-medium">{formatGameDate(game.gameDate)}</span></div>
            <div className="text-sm"><span className="text-muted-foreground">Opponent:</span> <span className="font-medium">{game.opponent}</span></div>
            <div className="text-sm"><span className="text-muted-foreground">Location:</span> <span className="font-medium">{game.location ?? "—"}</span></div>
            <div className="text-sm"><span className="text-muted-foreground">Score:</span> <span className="font-medium">{game.ourScore ?? "—"} — {game.oppScore ?? "—"}</span></div>
            <div className="text-sm"><span className="text-muted-foreground">Season:</span> <span className="font-medium">{game.season ?? "—"}</span></div>
            <Button size="sm" variant="outline" onClick={onEdit} className="ml-auto" data-testid="button-details-edit-game">
              <Pencil className="w-4 h-4 mr-1" /> Edit game info
            </Button>
          </div>
          {game.notes && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="text-xs text-muted-foreground mb-1">Notes</div>
              <div className="whitespace-pre-wrap">{game.notes}</div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            AB is the team's raw plate-appearance convention (walks/sacrifices/HBP/SF are not subtracted). Pitching is read-only here — use Manual Stat Entry for pitching edits.
          </p>

          {isLoading && <div className="text-sm text-muted-foreground py-4">Loading…</div>}

          {!isLoading && rows.length === 0 && (
            <div className="text-sm text-muted-foreground italic py-2">No stat lines attached to this game yet. Add one below.</div>
          )}

          {manualRows.length > 0 && (
            <StatRowGroup
              slug={slug}
              source="manual"
              rows={manualRows}
              onChanged={invalidate}
              toast={toast}
            />
          )}
          {gcRows.length > 0 && (
            <StatRowGroup
              slug={slug}
              source="gamechanger"
              rows={gcRows}
              onChanged={invalidate}
              toast={toast}
            />
          )}

          <AddStatLineRow
            slug={slug}
            gameId={game.id}
            players={players}
            existing={rows}
            onAdded={invalidate}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-details-close">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatRowGroup({
  slug, source, rows, onChanged, toast,
}: {
  slug: string;
  source: "manual" | "gamechanger";
  rows: AdminGameStatRow[];
  onChanged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          {source === "manual" ? "Manual (scorebook)" : "GameChanger"} — {rows.length} player{rows.length === 1 ? "" : "s"}
        </h3>
        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${source === "manual" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" : "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100"}`}>
          {source}
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px]">Player</TableHead>
              <TableHead className="text-center px-1.5 text-xs">Order</TableHead>
              <TableHead className="text-center px-1.5 text-xs">Start</TableHead>
              {STAT_KEYS.map(({ key, label }) => (
                <TableHead key={key as string} className="text-center px-1.5 text-xs">{label}</TableHead>
              ))}
              <TableHead className="text-center text-xs">IP</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <EditableStatRow key={row.id} slug={slug} row={row} onChanged={onChanged} toast={toast} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EditableStatRow({
  slug, row, onChanged, toast,
}: {
  slug: string;
  row: AdminGameStatRow;
  onChanged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const { key } of STAT_KEYS) v[key as string] = row[key] == null ? "" : String(row[key]);
    return v;
  }, [row]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const initialStart = row.startingPosition ?? "";
  const [startPos, setStartPos] = useState<string>(initialStart);
  const initialOrder = row.battingOrder == null ? "" : String(row.battingOrder);
  const [order, setOrder] = useState<string>(initialOrder);
  // Resync local edit state when the underlying row is replaced by a refetch
  // (e.g. after a successful save the server's canonical values come back and
  // we want the dirty flag to clear instead of sticking on "01" vs "1").
  useEffect(() => { setValues(initial); }, [initial]);
  useEffect(() => { setStartPos(row.startingPosition ?? ""); }, [row.startingPosition]);
  useEffect(() => { setOrder(row.battingOrder == null ? "" : String(row.battingOrder)); }, [row.battingOrder]);
  const dirty = STAT_KEYS.some(({ key }) => (values[key as string] ?? "") !== (initial[key as string] ?? ""))
    || startPos !== initialStart
    || order !== initialOrder;

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        gameId: row.gameId, playerId: row.playerId, source: row.source,
        startingPosition: startPos,
        battingOrder: order === "" ? null : parseInt(order, 10),
      };
      for (const { key } of STAT_KEYS) {
        const v = values[key as string];
        payload[key] = v === undefined || v === "" ? null : parseInt(v, 10);
      }
      return apiRequest("PUT", `/api/team/${slug}/admin/stats`, payload);
    },
    onSuccess: () => { onChanged(); toast({ title: "Stat line saved" }); },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/team/${slug}/admin/stats/${row.id}`, {}),
    onSuccess: () => { onChanged(); toast({ title: "Stat line deleted" }); },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message ?? "", variant: "destructive" }),
  });

  return (
    <TableRow data-testid={`row-stat-${row.id}`}>
      <TableCell className="font-medium">
        {row.jerseyNumber ? <span className="text-muted-foreground">#{row.jerseyNumber} </span> : null}
        {row.playerName}
      </TableCell>
      <TableCell className="p-1">
        <Input
          inputMode="numeric"
          className="h-8 w-12 text-center px-1 text-sm"
          value={order}
          onChange={e => setOrder(e.target.value.replace(/[^0-9]/g, ""))}
          data-testid={`input-batting-order-${row.id}`}
        />
      </TableCell>
      <TableCell className="p-1">
        <select
          className="h-8 w-[68px] rounded-md border bg-background px-1 text-sm"
          value={startPos}
          onChange={e => setStartPos(e.target.value)}
          data-testid={`select-start-pos-${row.id}`}
        >
          <option value="">—</option>
          {FIELD_POSITION_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
        </select>
      </TableCell>
      {STAT_KEYS.map(({ key, label }) => (
        <TableCell key={key as string} className="p-1">
          <Input
            inputMode="numeric"
            className="h-8 w-12 text-center px-1 text-sm"
            value={values[key as string] ?? ""}
            onChange={e => setValues(v => ({ ...v, [key as string]: e.target.value.replace(/[^0-9]/g, "") }))}
            data-testid={`input-stat-${row.id}-${label}`}
          />
        </TableCell>
      ))}
      <TableCell className="text-center text-xs text-muted-foreground" title="Pitching IP — read-only here">
        {row.pitchingOuts && row.pitchingOuts > 0 ? ipDisplay(row.pitchingOuts) : "—"}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Button
          size="sm"
          variant={dirty ? "default" : "outline"}
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          data-testid={`button-save-stat-${row.id}`}
        >
          {save.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={del.isPending}
          onClick={() => { if (confirm(`Delete this stat line for ${row.playerName}?`)) del.mutate(); }}
          data-testid={`button-delete-stat-${row.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function AddStatLineRow({
  slug, gameId, players, existing, onAdded,
}: {
  slug: string;
  gameId: string;
  players: BbPlayer[];
  existing: AdminGameStatRow[];
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [playerId, setPlayerId] = useState("");
  const [source, setSource] = useState<"manual" | "gamechanger">("manual");
  const taken = new Set(existing.filter(r => r.source === source).map(r => r.playerId));
  const available = players.filter(p => !taken.has(p.id));
  const add = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("PUT", `/api/team/${slug}/admin/stats`, { gameId, playerId, source });
      return (await r.json()) as { row: BbStatLine; created: boolean };
    },
    onSuccess: (d) => {
      onAdded();
      setPlayerId("");
      if (d.created) {
        toast({ title: "Stat line added", description: "Now fill in the numbers and click Save." });
      } else {
        toast({ title: "Stat line already existed", description: "Loaded the existing row for editing." });
      }
    },
    onError: (e: any) => toast({ title: "Add failed", description: e?.message ?? "", variant: "destructive" }),
  });
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="text-sm font-medium">Add a player stat line</div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">Source</Label>
          <select
            className="block border rounded-md px-2 py-1.5 bg-background text-sm"
            value={source}
            onChange={e => setSource(e.target.value as "manual" | "gamechanger")}
            data-testid="select-add-stat-source"
          >
            <option value="manual">Manual</option>
            <option value="gamechanger">GameChanger</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Player</Label>
          <select
            className="block w-full border rounded-md px-2 py-1.5 bg-background text-sm"
            value={playerId}
            onChange={e => setPlayerId(e.target.value)}
            data-testid="select-add-stat-player"
          >
            <option value="">Select player...</option>
            {available.map(p => (
              <option key={p.id} value={p.id}>
                {p.jerseyNumber ? `#${p.jerseyNumber} ` : ""}{p.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          disabled={!playerId || add.isPending}
          onClick={() => add.mutate()}
          data-testid="button-add-stat-line"
        >
          {add.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
          Add row
        </Button>
      </div>
      {available.length === 0 && (
        <div className="text-xs text-muted-foreground italic">Every roster player already has a {source} stat line for this game.</div>
      )}
    </div>
  );
}

const STAT_KEYS: { key: keyof BbStatLine; label: string }[] = [
  { key: "ab", label: "AB" }, { key: "r", label: "R" }, { key: "h", label: "H" },
  { key: "doubles", label: "2B" }, { key: "triples", label: "3B" }, { key: "hr", label: "HR" },
  { key: "bb", label: "BB" }, { key: "hbp", label: "HBP" }, { key: "k", label: "K" },
  { key: "sb", label: "SB" }, { key: "sac", label: "SAC" }, { key: "rbi", label: "RBI" },
  { key: "roe", label: "ROE" }, { key: "fc", label: "FC" },
  // PO/A/E below are FIELDING stats. The "E (def)" column maps to the `e`
  // database column = defensive errors charged to this player. Reached-on-error
  // (offensive) is the separate ROE column above.
  { key: "po", label: "PO" }, { key: "a", label: "A" }, { key: "e", label: "E (def)" },
];

function StatEntry({ slug, players, games }: { slug: string; players: BbPlayer[]; games: BbGame[] }) {
  const [gameId, setGameId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [startPos, setStartPos] = useState("");
  const [order, setOrder] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const save = useMutation({
    mutationFn: async () => {
      // This card is a quick-entry surface that does NOT prefill existing
      // values, so send only the fields the admin actually filled. Omitted keys
      // are left untouched by the server upsert (true partial update) — this
      // prevents a blank field here from nulling out an existing value or
      // wiping per-position fielding splits when po/a/e aren't being edited.
      const payload: any = { gameId, playerId };
      if (startPos !== "") payload.startingPosition = startPos;
      if (order !== "") payload.battingOrder = parseInt(order, 10);
      for (const { key } of STAT_KEYS) {
        const v = values[key as string];
        if (v !== undefined && v !== "") payload[key] = parseInt(v, 10);
      }
      return apiRequest("PUT", `/api/team/${slug}/admin/stats`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
      setValues({});
      setStartPos("");
      setOrder("");
      toast({ title: "Stat line saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Manual Stat Entry</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Enter <strong>AB</strong> as the total plate appearances for the game — don't subtract walks, sacrifices, HBP, or sac flies. This is a raw scorebook total, not the official MLB at-bat stat.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-3">
          <div>
            <Label>Game</Label>
            <select className="w-full border rounded-md px-3 h-11 bg-background" value={gameId} onChange={e => setGameId(e.target.value)} data-testid="select-stat-game">
              <option value="">Select game...</option>
              {[...games].sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime()).map(g => (
                <option key={g.id} value={g.id}>{formatGameDate(g.gameDate)} vs {g.opponent}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Player</Label>
            <select className="w-full border rounded-md px-3 h-11 bg-background" value={playerId} onChange={e => setPlayerId(e.target.value)} data-testid="select-stat-player">
              <option value="">Select player...</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.jerseyNumber ? `#${p.jerseyNumber} ` : ""}{p.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Starting position</Label>
            <select className="w-full md:w-44 border rounded-md px-3 h-11 bg-background" value={startPos} onChange={e => setStartPos(e.target.value)} data-testid="select-stat-start-pos">
              <option value="">— None —</option>
              {FIELD_POSITION_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Batting order</Label>
            <Input
              inputMode="numeric"
              className="w-full md:w-24 h-11 text-center text-base"
              placeholder="#"
              value={order}
              onChange={e => setOrder(e.target.value.replace(/[^0-9]/g, ""))}
              data-testid="input-stat-batting-order"
            />
          </div>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-x-3 gap-y-2">
          {STAT_KEYS.map(({ key, label }) => (
            <div key={key as string}>
              <Label className="text-xs">{label}</Label>
              <Input
                inputMode="numeric"
                className="h-11 text-center text-base"
                value={values[key as string] ?? ""}
                onChange={e => setValues(v => ({ ...v, [key as string]: e.target.value.replace(/[^0-9]/g, "") }))}
                data-testid={`input-stat-${label}`}
              />
            </div>
          ))}
        </div>
        <Button size="lg" disabled={!gameId || !playerId || save.isPending} onClick={() => save.mutate()} data-testid="button-save-stats">
          {save.isPending ? "Saving..." : "Save Stat Line"}
        </Button>
      </CardContent>
    </Card>
  );
}

const FIELD_POSITION_OPTIONS: { code: string; label: string }[] = [
  { code: "1", label: "P (1)" },
  { code: "2", label: "C (2)" },
  { code: "3", label: "1B (3)" },
  { code: "4", label: "2B (4)" },
  { code: "5", label: "3B (5)" },
  { code: "6", label: "SS (6)" },
  { code: "7", label: "LF (7)" },
  { code: "8", label: "CF (8)" },
  { code: "9", label: "RF (9)" },
  { code: "10", label: "SF (10)" },
  { code: "UA", label: "Unassigned" },
];

interface FieldingLine { position: string; po: string; a: string; e: string }

function FieldingByPositionAdmin({ slug, players, games }: { slug: string; players: BbPlayer[]; games: BbGame[] }) {
  const [gameId, setGameId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [source, setSource] = useState<"manual" | "gamechanger">("manual");
  const [lines, setLines] = useState<FieldingLine[]>([]);
  const { toast } = useToast();

  const loadable = !!gameId && !!playerId;
  const loadQ = useQuery<{ lines: { position: string; po: number; a: number; e: number }[]; fromDetail: boolean }>({
    queryKey: ["/api/team", slug, "admin", "fielding", gameId, playerId, source],
    enabled: loadable,
    queryFn: async () => {
      const r = await fetch(`/api/team/${slug}/admin/fielding/${gameId}/${playerId}?source=${source}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load fielding");
      return r.json();
    },
  });
  useEffect(() => {
    if (!loadable) { setLines([]); return; }
    if (loadQ.data) {
      const loaded = loadQ.data.lines.map(l => ({ position: l.position, po: String(l.po || ""), a: String(l.a || ""), e: String(l.e || "") }));
      setLines(loaded.length ? loaded : [{ position: "", po: "", a: "", e: "" }]);
    }
  }, [loadQ.data, loadable]);

  const setLine = (i: number, patch: Partial<FieldingLine>) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine = () => setLines(prev => [...prev, { position: "", po: "", a: "", e: "" }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        gameId, playerId, source,
        lines: lines
          .filter(l => l.position)
          .map(l => ({
            position: l.position,
            po: l.po === "" ? null : parseInt(l.po, 10),
            a: l.a === "" ? null : parseInt(l.a, 10),
            e: l.e === "" ? null : parseInt(l.e, 10),
          })),
      };
      return apiRequest("PUT", `/api/team/${slug}/admin/fielding`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "fielding-by-position"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "fielding", gameId, playerId, source] });
      toast({ title: "Fielding saved", description: "Position totals updated." });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const totals = lines.reduce((acc, l) => ({
    po: acc.po + (parseInt(l.po, 10) || 0),
    a: acc.a + (parseInt(l.a, 10) || 0),
    e: acc.e + (parseInt(l.e, 10) || 0),
  }), { po: 0, a: 0, e: 0 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fielding by Position</CardTitle>
        <p className="text-sm text-muted-foreground">
          Log putouts, assists, and errors at each position a player played in a game. Saving here replaces the player's fielding total for that game and recomputes their primary position. Leave this untouched if you only track combined fielding totals in Manual Stat Entry.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <Label>Game</Label>
            <select className="w-full border rounded-md px-2 py-2 bg-background" value={gameId} onChange={e => setGameId(e.target.value)} data-testid="select-fielding-game">
              <option value="">Select game...</option>
              {[...games].sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime()).map(g => (
                <option key={g.id} value={g.id}>{formatGameDate(g.gameDate)} vs {g.opponent}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Player</Label>
            <select className="w-full border rounded-md px-2 py-2 bg-background" value={playerId} onChange={e => setPlayerId(e.target.value)} data-testid="select-fielding-player">
              <option value="">Select player...</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Source</Label>
            <select className="w-full border rounded-md px-2 py-2 bg-background" value={source} onChange={e => setSource(e.target.value as "manual" | "gamechanger")} data-testid="select-fielding-source">
              <option value="manual">Manual (scorebook)</option>
              <option value="gamechanger">GameChanger</option>
            </select>
          </div>
        </div>

        {loadable && loadQ.data && !loadQ.data.fromDetail && lines.some(l => l.position) && (
          <p className="text-xs text-muted-foreground">No per-position split saved yet — pre-filled from the existing fielding total. Adjust the positions below and save to split it out.</p>
        )}

        {loadable ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center text-xs text-muted-foreground font-medium">
              <span>Position</span><span className="w-14 text-center">PO</span><span className="w-14 text-center">A</span><span className="w-14 text-center">E</span><span className="w-8" />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
                <select
                  className="w-full border rounded-md px-2 py-2 bg-background"
                  value={l.position}
                  onChange={e => setLine(i, { position: e.target.value })}
                  data-testid={`select-fielding-position-${i}`}
                >
                  <option value="">Select position...</option>
                  {FIELD_POSITION_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>
                <Input className="w-14 text-center" inputMode="numeric" value={l.po} onChange={e => setLine(i, { po: e.target.value.replace(/[^0-9]/g, "") })} data-testid={`input-fielding-po-${i}`} />
                <Input className="w-14 text-center" inputMode="numeric" value={l.a} onChange={e => setLine(i, { a: e.target.value.replace(/[^0-9]/g, "") })} data-testid={`input-fielding-a-${i}`} />
                <Input className="w-14 text-center" inputMode="numeric" value={l.e} onChange={e => setLine(i, { e: e.target.value.replace(/[^0-9]/g, "") })} data-testid={`input-fielding-e-${i}`} />
                <Button variant="ghost" size="icon" onClick={() => removeLine(i)} data-testid={`button-fielding-remove-${i}`}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <Button variant="outline" size="sm" onClick={addLine} data-testid="button-fielding-add-line"><Plus className="h-4 w-4 mr-1" /> Add position</Button>
              <span className="text-xs text-muted-foreground">Totals — PO {totals.po} · A {totals.a} · E {totals.e}</span>
            </div>
            <Button disabled={save.isPending} onClick={() => save.mutate()} data-testid="button-save-fielding">
              {save.isPending ? "Saving..." : "Save Fielding"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a game and player to log fielding by position.</p>
        )}
      </CardContent>
    </Card>
  );
}

// Bulk manual stat entry — add every player and save all rows for a game at
// once. Rows sort live by the batting-order field (blank sorts last, then
// roster order). Only rows with at least one filled field are saved; the
// server applies the same partial-upsert + fielding-split rules as single entry.
interface BulkRow { order: string; start: string; vals: Record<string, string> }
function BulkStatEntry({ slug, players, games }: { slug: string; players: BbPlayer[]; games: BbGame[] }) {
  const [gameId, setGameId] = useState("");
  const [rows, setRows] = useState<Record<string, BulkRow>>({});
  const { toast } = useToast();
  const activePlayers = players.filter(p => p.active);

  const getRow = (pid: string): BulkRow => rows[pid] ?? { order: "", start: "", vals: {} };
  const setOrder = (pid: string, v: string) =>
    setRows(prev => ({ ...prev, [pid]: { ...getRow(pid), order: v.replace(/[^0-9]/g, "") } }));
  const setStart = (pid: string, v: string) =>
    setRows(prev => ({ ...prev, [pid]: { ...getRow(pid), start: v } }));
  const setVal = (pid: string, key: string, v: string) =>
    setRows(prev => ({ ...prev, [pid]: { ...getRow(pid), vals: { ...getRow(pid).vals, [key]: v.replace(/[^0-9]/g, "") } } }));

  const ordered = [...activePlayers].sort((a, b) => {
    const oa = parseInt(rows[a.id]?.order ?? "", 10);
    const ob = parseInt(rows[b.id]?.order ?? "", 10);
    const va = isNaN(oa) ? Infinity : oa;
    const vb = isNaN(ob) ? Infinity : ob;
    if (va !== vb) return va - vb;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  const save = useMutation({
    mutationFn: async () => {
      const lines = activePlayers.map(p => {
        const r = rows[p.id];
        if (!r) return null;
        const line: any = { playerId: p.id };
        let has = false;
        if (r.order !== "") { line.battingOrder = parseInt(r.order, 10); has = true; }
        if (r.start !== "") { line.startingPosition = r.start; has = true; }
        for (const { key } of STAT_KEYS) {
          const v = r.vals[key as string];
          if (v !== undefined && v !== "") { line[key] = parseInt(v, 10); has = true; }
        }
        return has ? line : null;
      }).filter(Boolean);
      if (!lines.length) throw new Error("Nothing to save — fill in at least one player.");
      const res = await apiRequest("PUT", `/api/team/${slug}/admin/stats/bulk`, { gameId, source: "manual", lines });
      return res.json() as Promise<{ saved: number }>;
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "game", gameId, "stats"] });
      setRows({});
      toast({ title: `Saved ${d.saved} stat line(s)` });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Stat Entry</CardTitle>
        <p className="text-sm text-muted-foreground">
          Add every player's line for one game at once, then save all rows together. Rows reorder by the Order column as you type it. Blank fields are left untouched — only players with at least one value are saved. AB is the raw plate-appearance total (walks/sacrifices/HBP/SF not subtracted).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Game</Label>
          <select className="w-full md:w-96 border rounded-md px-3 h-11 bg-background" value={gameId} onChange={e => setGameId(e.target.value)} data-testid="select-bulk-game">
            <option value="">Select game...</option>
            {[...games].sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime()).map(g => (
              <option key={g.id} value={g.id}>{formatGameDate(g.gameDate)} vs {g.opponent}</option>
            ))}
          </select>
        </div>
        {!gameId ? (
          <p className="text-sm text-muted-foreground">Select a game to start entering stats for the roster.</p>
        ) : activePlayers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active players on the roster.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Player</TableHead>
                    <TableHead className="text-center px-1.5 text-xs">Order</TableHead>
                    <TableHead className="text-center px-1.5 text-xs">Start</TableHead>
                    {STAT_KEYS.map(({ key, label }) => (
                      <TableHead key={key as string} className="text-center px-1.5 text-xs">{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordered.map(p => {
                    const r = getRow(p.id);
                    return (
                      <TableRow key={p.id} data-testid={`row-bulk-${p.id}`}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {p.jerseyNumber ? <span className="text-muted-foreground">#{p.jerseyNumber} </span> : null}{p.name}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input inputMode="numeric" className="h-8 w-12 text-center px-1 text-sm" value={r.order} onChange={e => setOrder(p.id, e.target.value)} data-testid={`input-bulk-order-${p.id}`} />
                        </TableCell>
                        <TableCell className="p-1">
                          <select className="h-8 w-[68px] rounded-md border bg-background px-1 text-sm" value={r.start} onChange={e => setStart(p.id, e.target.value)} data-testid={`select-bulk-start-${p.id}`}>
                            <option value="">—</option>
                            {FIELD_POSITION_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                          </select>
                        </TableCell>
                        {STAT_KEYS.map(({ key, label }) => (
                          <TableCell key={key as string} className="p-1">
                            <Input inputMode="numeric" className="h-8 w-12 text-center px-1 text-sm" value={r.vals[key as string] ?? ""} onChange={e => setVal(p.id, key as string, e.target.value)} data-testid={`input-bulk-${p.id}-${label}`} />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Button size="lg" disabled={save.isPending} onClick={() => save.mutate()} data-testid="button-save-bulk">
              {save.isPending ? "Saving..." : "Save All Rows"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Team fielding by position (player-less). Records PO/A/E at a position that the
// admin can't attribute to a specific player. The viewer's "By Position" card
// COMBINES these with per-player fielding into the team total per position.
function TeamFieldingAdmin({ slug, games }: { slug: string; games: BbGame[] }) {
  const [gameId, setGameId] = useState("");
  const [source, setSource] = useState<"manual" | "gamechanger">("manual");
  const [lines, setLines] = useState<Record<string, { po: string; a: string; e: string }>>({});
  const { toast } = useToast();

  const loadQ = useQuery<{ lines: { position: string; po: number; a: number; e: number }[] }>({
    queryKey: ["/api/team", slug, "admin", "team-fielding", gameId, source],
    enabled: !!gameId,
    queryFn: async () => {
      const r = await fetch(`/api/team/${slug}/admin/team-fielding/${gameId}?source=${source}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load team fielding");
      return r.json();
    },
  });
  useEffect(() => {
    if (!gameId) { setLines({}); return; }
    if (loadQ.data) {
      const next: Record<string, { po: string; a: string; e: string }> = {};
      for (const l of loadQ.data.lines) {
        next[l.position] = { po: String(l.po || ""), a: String(l.a || ""), e: String(l.e || "") };
      }
      setLines(next);
    }
  }, [loadQ.data, gameId]);

  const getLine = (code: string) => lines[code] ?? { po: "", a: "", e: "" };
  const setCell = (code: string, field: "po" | "a" | "e", v: string) =>
    setLines(prev => ({ ...prev, [code]: { ...getLine(code), [field]: v.replace(/[^0-9]/g, "") } }));

  const totals = FIELD_POSITION_OPTIONS.reduce((acc, o) => {
    const l = getLine(o.code);
    return { po: acc.po + (parseInt(l.po, 10) || 0), a: acc.a + (parseInt(l.a, 10) || 0), e: acc.e + (parseInt(l.e, 10) || 0) };
  }, { po: 0, a: 0, e: 0 });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        gameId, source,
        lines: FIELD_POSITION_OPTIONS.map(o => {
          const l = getLine(o.code);
          return {
            position: o.code,
            po: l.po === "" ? null : parseInt(l.po, 10),
            a: l.a === "" ? null : parseInt(l.a, 10),
            e: l.e === "" ? null : parseInt(l.e, 10),
          };
        }),
      };
      return apiRequest("PUT", `/api/team/${slug}/admin/team-fielding`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "fielding-by-position"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "team-fielding", gameId, source] });
      toast({ title: "Team fielding saved", description: "Combined into the By Position view." });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Fielding by Position</CardTitle>
        <p className="text-sm text-muted-foreground">
          Log putouts, assists, and errors at a position when you can't attribute them to a specific player. These are combined with per-player fielding in the "By Position" view (shown as "Team (unattributed)"). They do not affect any individual player's stat line.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <Label>Game</Label>
            <select className="w-full border rounded-md px-2 py-2 bg-background" value={gameId} onChange={e => setGameId(e.target.value)} data-testid="select-team-fielding-game">
              <option value="">Select game...</option>
              {[...games].sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime()).map(g => (
                <option key={g.id} value={g.id}>{formatGameDate(g.gameDate)} vs {g.opponent}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Source</Label>
            <select className="w-full border rounded-md px-2 py-2 bg-background" value={source} onChange={e => setSource(e.target.value as "manual" | "gamechanger")} data-testid="select-team-fielding-source">
              <option value="manual">Manual (scorebook)</option>
              <option value="gamechanger">GameChanger</option>
            </select>
          </div>
        </div>
        {!gameId ? (
          <p className="text-sm text-muted-foreground">Select a game to log team fielding by position.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center text-xs text-muted-foreground font-medium">
              <span>Position</span><span className="w-14 text-center">PO</span><span className="w-14 text-center">A</span><span className="w-14 text-center">E</span>
            </div>
            {FIELD_POSITION_OPTIONS.map(o => {
              const l = getLine(o.code);
              return (
                <div key={o.code} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                  <span className="text-sm">{o.label}</span>
                  <Input className="w-14 text-center" inputMode="numeric" value={l.po} onChange={e => setCell(o.code, "po", e.target.value)} data-testid={`input-team-fielding-po-${o.code}`} />
                  <Input className="w-14 text-center" inputMode="numeric" value={l.a} onChange={e => setCell(o.code, "a", e.target.value)} data-testid={`input-team-fielding-a-${o.code}`} />
                  <Input className="w-14 text-center" inputMode="numeric" value={l.e} onChange={e => setCell(o.code, "e", e.target.value)} data-testid={`input-team-fielding-e-${o.code}`} />
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">Totals — PO {totals.po} · A {totals.a} · E {totals.e}</span>
            </div>
            <Button disabled={save.isPending} onClick={() => save.mutate()} data-testid="button-save-team-fielding">
              {save.isPending ? "Saving..." : "Save Team Fielding"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExcelUpload({ slug }: { slug: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<"manual" | "gamechanger">("manual");
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Select a file");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", source);
      const res = await fetch(`/api/team/${slug}/admin/upload`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message ?? "Upload failed");
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
      toast({ title: `Imported ${data.rowsImported} row(s) as ${data.source}, ${data.gamesCreated} new game(s)` });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e?.message ?? "", variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Excel Upload</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Download the template, fill in one row per player per game, then upload.
          Players must match roster names exactly (case-insensitive).
          Pitching columns are optional — leave blank for non-pitchers. IP uses baseball notation (5.2 = 5⅔ innings).
          Tag the source — the same player+game can have a Manual line and a GameChanger line, and the viewer toggle controls which is used.
        </p>
        <p className="text-xs text-muted-foreground">
          <strong>AB</strong> = raw total plate appearances from the scorebook. Do <em>not</em> subtract walks, sacrifices, HBP, or sac flies. This is not the official MLB at-bat stat.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label className="text-xs">Source</Label>
            <select
              className="block border rounded-md px-2 py-2 bg-background"
              value={source}
              onChange={e => setSource(e.target.value as "manual" | "gamechanger")}
              data-testid="select-upload-source"
            >
              <option value="manual">Manual (scorebook)</option>
              <option value="gamechanger">GameChanger export</option>
            </select>
          </div>
          <a href={`/api/team/${slug}/admin/template.xlsx`} className="inline-flex">
            <Button variant="outline" type="button" data-testid="button-download-template"><Download className="w-4 h-4 mr-1" /> Template</Button>
          </a>
          <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] ?? null)} data-testid="input-excel-file" />
          <Button disabled={!file || upload.isPending} onClick={() => upload.mutate()} data-testid="button-upload-excel">
            <Upload className="w-4 h-4 mr-1" /> {upload.isPending ? `Uploading...` : `Upload as ${source === "manual" ? "Manual" : "GameChanger"}`}
          </Button>
        </div>
        {result && (
          <div className="text-sm border rounded-md p-3 bg-muted/30">
            <div>Rows imported: {result.rowsImported}</div>
            <div>New games created: {result.gamesCreated}</div>
            {result.playersUnmatched?.length > 0 && (
              <div className="text-amber-700 dark:text-amber-400">
                Unmatched players (not in roster, skipped): {result.playersUnmatched.join(", ")}
              </div>
            )}
            {result.errors?.length > 0 && (
              <div className="text-destructive">Errors: {result.errors.join("; ")}</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GameChangerImport({ slug }: { slug: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();
  const upload = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error("Select one or more GameChanger CSV files");
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch(`/api/team/${slug}/admin/import-gamechanger`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message ?? "Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
      toast({ title: `Imported ${data.totalRows} row(s) across ${data.files.length} file(s), ${data.totalGamesCreated} new game(s)` });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e?.message ?? "", variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Download className="w-5 h-5" /> GameChanger CSV Import</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Export the per-game stats CSV from GameChanger (one file per game) and drop them in here. Keep the original filename — the opponent and date are read from it
          (e.g. <code className="text-xs">Stars_vs_TN_Crows_3:7:26_NNN.csv</code>). Rows are saved as <strong>GameChanger</strong> source and merged with manual entries via the viewer toggle.
        </p>
        <p className="text-xs text-muted-foreground">
          GameChanger's <strong>PA</strong> column is stored as our <strong>AB</strong> (raw plate appearances). AVG/OBP/SLG then reproduce GameChanger's official numbers because the formulas already subtract walks, sacrifices, and HBP from AB.
          <strong>HBP</strong> is now imported and feeds OBP + Reached Base. <strong>SF</strong> is still merged into our single SAC column — a warning is surfaced when non-zero.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            data-testid="input-gc-files"
          />
          <Button
            disabled={files.length === 0 || upload.isPending}
            onClick={() => upload.mutate()}
            data-testid="button-import-gc"
          >
            <Upload className="w-4 h-4 mr-1" /> {upload.isPending ? "Importing..." : `Import ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
          </Button>
        </div>
        {result && (
          <div className="text-sm border rounded-md p-3 bg-muted/30 space-y-2">
            <div>Total rows imported: <strong>{result.totalRows}</strong> &middot; New games: <strong>{result.totalGamesCreated}</strong></div>
            {result.files?.map((f: any, i: number) => (
              <div key={i} className="border-t pt-2" data-testid={`row-gc-result-${i}`}>
                <div className="font-medium">{f.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {f.gameDate || "?"} vs {f.opponent} &middot; {f.rowsImported} row(s) {f.gameCreated ? "(new game created)" : "(existing game)"}
                </div>
                {f.playersUnmatched?.length > 0 && (
                  <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    Unmatched (not in roster, skipped): {f.playersUnmatched.join(", ")}
                  </div>
                )}
                {f.warnings?.length > 0 && (
                  <ul className="text-xs text-amber-700 dark:text-amber-400 mt-1 list-disc list-inside">
                    {f.warnings.map((w: string, j: number) => <li key={j}>{w}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IScoreImport({ slug }: { slug: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();
  const upload = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error("Select one or more iScore .xls files");
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch(`/api/team/${slug}/admin/import-iscore`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message ?? "Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "fielding-by-position"] });
      toast({ title: `Imported ${data.totalRows} row(s) across ${data.files.length} file(s), ${data.totalGamesCreated} new game(s)` });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e?.message ?? "", variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> iScore Import (.xls)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Export each game from iScore as an Excel (.xls) file and drop them in here — one file per game, multiple at once. The tool reads all six iScore sheets, auto-detects which side is your team by matching jersey numbers/names to your roster, and pulls hitting, pitching, and fielding totals. Rows are saved as <strong>Manual</strong> source. The opponent and date come from the file's game title.
        </p>
        <p className="text-xs text-muted-foreground">
          iScore's <strong>PA</strong> column is stored as our <strong>AB</strong> (raw plate appearances), matching this team's scorebook convention. iScore has no per-position fielding split, so PO/A/E are saved as the game total. Re-uploading the same game replaces its existing manual rows.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            type="file"
            accept=".xls,.xlsx"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            data-testid="input-iscore-files"
          />
          <Button
            disabled={files.length === 0 || upload.isPending}
            onClick={() => upload.mutate()}
            data-testid="button-import-iscore"
          >
            <Upload className="w-4 h-4 mr-1" /> {upload.isPending ? "Importing..." : `Import ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
          </Button>
        </div>
        {result && (
          <div className="text-sm border rounded-md p-3 bg-muted/30 space-y-2">
            <div>Total rows imported: <strong>{result.totalRows}</strong> &middot; New games: <strong>{result.totalGamesCreated}</strong></div>
            {result.files?.map((f: any, i: number) => (
              <div key={i} className="border-t pt-2" data-testid={`row-iscore-result-${i}`}>
                <div className="font-medium">{f.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {f.gameDate || "?"} vs {f.opponent} {f.ourSide ? `(${f.ourSide})` : ""} &middot; {f.ourScore ?? "?"}–{f.oppScore ?? "?"} &middot; {f.rowsImported} row(s) {f.gameCreated ? "(new game created)" : "(existing game updated)"}
                </div>
                {f.playersUnmatched?.length > 0 && (
                  <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    Unmatched (not in roster, skipped): {f.playersUnmatched.join(", ")}
                  </div>
                )}
                {f.warnings?.length > 0 && (
                  <ul className="text-xs text-amber-700 dark:text-amber-400 mt-1 list-disc list-inside">
                    {f.warnings.map((w: string, j: number) => <li key={j}>{w}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ScannedRow {
  jersey: string | null;
  name: string | null;
  matchedPlayerId: string | null;
  matchConfidence: "jersey" | "name" | "none";
  mergedFromCount?: number;
  notes?: string;
  ab: number; r: number; h: number;
  doubles: number; triples: number; hr: number;
  bb: number; k: number; sb: number; sac: number; rbi: number;
  po: number; a: number; e: number;
}

const SCAN_STAT_KEYS: Array<{ key: keyof Pick<ScannedRow, "ab"|"r"|"h"|"doubles"|"triples"|"hr"|"bb"|"k"|"sb"|"sac"|"rbi"|"po"|"a"|"e">; label: string }> = [
  { key: "ab", label: "AB" }, { key: "r", label: "R" }, { key: "h", label: "H" },
  { key: "doubles", label: "2B" }, { key: "triples", label: "3B" }, { key: "hr", label: "HR" }, { key: "bb", label: "BB" },
  { key: "k", label: "K" }, { key: "sb", label: "SB" }, { key: "sac", label: "SAC" }, { key: "rbi", label: "RBI" },
  { key: "po", label: "PO" }, { key: "a", label: "A" }, { key: "e", label: "E" },
];

function ScorebookScan({ slug, players, games }: { slug: string; players: BbPlayer[]; games: BbGame[] }) {
  const [gameId, setGameId] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ScannedRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ saved: number; failed: number; errors: string[] } | null>(null);
  const { toast } = useToast();

  const scan = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error("Add at least one image");
      const fd = new FormData();
      for (const f of files) fd.append("images", f);
      const res = await fetch(`/api/team/${slug}/admin/scan-scorebook`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "Scan failed");
      return res.json() as Promise<{ rows: ScannedRow[]; warnings: string[]; rawCount: number }>;
    },
    onSuccess: (data) => {
      setRows(data.rows);
      setWarnings(data.warnings);
      setCommitResult(null);
      toast({ title: `Scanned ${data.rawCount} row(s) \u2014 review below before saving` });
    },
    onError: (e: any) => toast({ title: "Scan failed", description: e?.message ?? "", variant: "destructive" }),
  });

  const updateRow = (idx: number, patch: Partial<ScannedRow>) => {
    setRows(prev => prev ? prev.map((r, i) => i === idx ? { ...r, ...patch } : r) : prev);
  };
  const removeRow = (idx: number) => {
    setRows(prev => prev ? prev.filter((_, i) => i !== idx) : prev);
  };

  const commit = async () => {
    if (!gameId) { toast({ title: "Pick a game first", variant: "destructive" }); return; }
    if (!rows || rows.length === 0) return;
    setCommitting(true);
    const errors: string[] = [];
    let saved = 0; let failed = 0;
    const matched = rows.filter(r => r.matchedPlayerId);
    const skipped = rows.length - matched.length;
    if (skipped > 0) {
      failed += skipped;
      errors.push(`Skipped ${skipped} unmatched row(s)`);
    }
    const isAllZero = (r: ScannedRow) => SCAN_STAT_KEYS.every(s => (r[s.key] ?? 0) === 0);
    const zeroOnly = matched.filter(isAllZero);
    const toSave = matched.filter(r => !isAllZero(r));
    if (zeroOnly.length > 0) {
      errors.push(`Skipped ${zeroOnly.length} row(s) with all zeros (would overwrite any existing manual stats). Edit a stat above 0 to save them.`);
    }
    const saveOne = async (r: ScannedRow) => {
      try {
        await apiRequest("PUT", `/api/team/${slug}/admin/stats`, {
          gameId, playerId: r.matchedPlayerId, source: "manual",
          ab: r.ab, r: r.r, h: r.h,
          doubles: r.doubles, triples: r.triples, hr: r.hr,
          bb: r.bb, k: r.k, sb: r.sb, sac: r.sac, rbi: r.rbi,
          po: r.po, a: r.a, e: r.e,
        });
        saved++;
      } catch (e: any) {
        failed++;
        errors.push(`${r.name ?? r.jersey ?? "row"}: ${e?.message ?? "save failed"}`);
      }
    };
    // Bounded parallel writes (concurrency cap 6) — fast without overwhelming the DB.
    const CONCURRENCY = 6;
    const queue = [...toSave];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const next = queue.shift();
        if (next) await saveOne(next);
      }
    });
    await Promise.all(workers);
    setCommitting(false);
    setCommitResult({ saved, failed, errors });
    queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "stats"] });
    toast({ title: `Saved ${saved} row(s)${failed ? `, ${failed} failed` : ""}` });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="w-5 h-5" /> Scan Scorebook</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Snap a photo of the scorebook page after you've tallied each player's totals on the right-edge column
          (AB R H 2B 3B HR BB / K SB SAC RBI PO A E). Upload 1–4 images per game (e.g. hitting page + fielding page).
          The AI reads only the totals column — review and edit before saving. Saved rows are tagged <strong>Manual</strong> source.
        </p>
        <p className="text-xs text-muted-foreground">
          <strong>AB</strong> in the totals column should be raw plate appearances — walks, sacrifices, HBP, and sac flies are <em>not</em> subtracted. This is a scorebook total, not the official MLB at-bat stat.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[220px]">
            <Label className="text-xs">Game</Label>
            <select
              className="block w-full border rounded-md px-2 py-2 bg-background"
              value={gameId}
              onChange={e => setGameId(e.target.value)}
              data-testid="select-scan-game"
            >
              <option value="">Select a game...</option>
              {games.map(g => (
                <option key={g.id} value={g.id}>
                  {formatGameDate(g.gameDate)} — vs {g.opponent}{g.ourScore != null && g.oppScore != null ? ` (${g.ourScore}–${g.oppScore})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Scorebook photo(s)</Label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 4))}
              data-testid="input-scan-images"
              className="block"
            />
          </div>
          <Button
            type="button"
            onClick={() => scan.mutate()}
            disabled={files.length === 0 || scan.isPending}
            data-testid="button-scan-scorebook"
          >
            <Sparkles className="w-4 h-4 mr-1" />
            {scan.isPending ? "Reading photo..." : `Scan ${files.length || ""} image${files.length === 1 ? "" : "s"}`}
          </Button>
        </div>
        {files.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Selected: {files.map(f => f.name).join(", ")}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="text-sm text-amber-700 dark:text-amber-400 border rounded-md p-3 bg-amber-50 dark:bg-amber-950/30">
            <div className="font-medium mb-1">Heads up:</div>
            <ul className="list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {rows && rows.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Review &amp; edit before saving:</div>
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Player (matched)</TableHead>
                    <TableHead className="text-xs">Read as</TableHead>
                    {SCAN_STAT_KEYS.map(s => <TableHead key={s.key} className="text-center text-xs px-1">{s.label}</TableHead>)}
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i} data-testid={`row-scanned-${i}`}>
                      <TableCell>
                        <select
                          className="w-full border rounded px-1 py-1 text-sm bg-background"
                          value={r.matchedPlayerId ?? ""}
                          onChange={e => updateRow(i, { matchedPlayerId: e.target.value || null })}
                          data-testid={`select-scanned-player-${i}`}
                        >
                          <option value="">— unmatched —</option>
                          {players.map(p => (
                            <option key={p.id} value={p.id}>{p.jerseyNumber ? `#${p.jerseyNumber} ` : ""}{p.name}</option>
                          ))}
                        </select>
                        {r.matchConfidence === "jersey" && <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> jersey match</div>}
                        {r.matchConfidence === "name" && <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> name match</div>}
                        {r.matchConfidence === "none" && <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1"><X className="w-3 h-3" /> pick manually</div>}
                        {(r.mergedFromCount ?? 1) > 1 && <div className="text-xs text-muted-foreground mt-1">merged from {r.mergedFromCount} reads</div>}
                        {r.notes && <div className="text-xs text-amber-700 dark:text-amber-400 mt-1" data-testid={`text-scanned-notes-${i}`}>⚠ {r.notes}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.jersey && <div>#{r.jersey}</div>}
                        {r.name && <div>{r.name}</div>}
                      </TableCell>
                      {SCAN_STAT_KEYS.map(s => (
                        <TableCell key={s.key} className="px-1">
                          <Input
                            type="number"
                            min={0}
                            className="w-14 h-8 text-center px-1"
                            value={r[s.key]}
                            onChange={e => updateRow(i, { [s.key]: Math.max(0, Math.round(Number(e.target.value) || 0)) } as Partial<ScannedRow>)}
                            data-testid={`input-scanned-${s.key}-${i}`}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => removeRow(i)} data-testid={`button-remove-scanned-${i}`}><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                type="button"
                onClick={commit}
                disabled={!gameId || committing || rows.every(r => !r.matchedPlayerId)}
                data-testid="button-commit-scanned"
              >
                <Upload className="w-4 h-4 mr-1" />
                {committing ? "Saving..." : `Save ${rows.filter(r => r.matchedPlayerId).length} row(s) to selected game`}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setRows(null); setWarnings([]); setCommitResult(null); }} data-testid="button-discard-scanned">
                Discard
              </Button>
              {!gameId && <div className="text-xs text-amber-600 dark:text-amber-400">Select a game above before saving.</div>}
            </div>
            {commitResult && (
              <div className="text-sm border rounded-md p-3 bg-muted/30">
                <div>Saved: {commitResult.saved}</div>
                {commitResult.failed > 0 && <div className="text-destructive">Failed: {commitResult.failed}</div>}
                {commitResult.errors.length > 0 && (
                  <ul className="list-disc pl-5 text-destructive text-xs mt-1">{commitResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------- Admin: Team Admin Grants --------------------

interface TeamAdminRow { id: string; email: string; grantedByEmail: string | null; createdAt: string }

function TeamAdminsAdmin({ slug }: { slug: string }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const { data, isLoading } = useQuery<{ tssAdminEmail: string; admins: TeamAdminRow[] }>({
    queryKey: ["/api/team", slug, "admin", "admins"],
  });
  const addMut = useMutation({
    mutationFn: async (e: string) => apiRequest("POST", `/api/team/${slug}/admin/admins`, { email: e }),
    onSuccess: () => {
      toast({ title: "Admin added", description: "They can now access the Admin tab on this team." });
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "admins"] });
    },
    onError: (err: Error) => toast({ title: "Couldn't add admin", description: err.message, variant: "destructive" }),
  });
  const delMut = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/team/${slug}/admin/admins/${id}`),
    onSuccess: () => {
      toast({ title: "Admin removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/team", slug, "admin", "admins"] });
    },
    onError: (err: Error) => toast({ title: "Couldn't remove admin", description: err.message, variant: "destructive" }),
  });
  return (
    <Card data-testid="card-team-admins">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Admin Access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Anyone added here can use every admin feature on this team (lineups, stats entry, scans, etc).
          They sign in with their normal account (magic link or Replit) — access matches their email.
          The Twin Seam Sports admin ({data?.tssAdminEmail ?? "justin@twinseamsports.com"}) always has access by default.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="coach@example.com"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            data-testid="input-team-admin-email"
          />
          <Button
            onClick={() => addMut.mutate(email.trim())}
            disabled={!email.trim() || addMut.isPending}
            data-testid="button-add-team-admin"
          >
            <Plus className="w-4 h-4 mr-1" /> Add admin
          </Button>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (data?.admins.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground italic">No additional admins yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Granted by</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.admins.map(a => (
                <TableRow key={a.id} data-testid={`row-team-admin-${a.id}`}>
                  <TableCell className="font-mono text-sm">{a.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.grantedByEmail ?? "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => delMut.mutate(a.id)}
                      disabled={delMut.isPending}
                      data-testid={`button-remove-team-admin-${a.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------- Admin: AI Lineup Generator --------------------

interface AILineupSlot { slot: number; playerId: string; name: string; why: string }
interface AILineupView { lineup: AILineupSlot[]; strategy: string; flags: string[] }
interface AILineupResponse {
  season: string;
  window: EvalWindow;
  windowLabel: string;
  gamesInWindow: number;
  coachVoterCount: number;
  allVoterCount: number;
  coachView: AILineupView;
  allView: AILineupView;
}

function LineupCard({ title, view, voterCount }: { title: string; view: AILineupView; voterCount: number }) {
  return (
    <div className="border rounded-md p-4 space-y-3 print:break-inside-avoid" data-testid={`lineup-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-baseline justify-between">
        <h4 className="font-semibold text-base">{title}</h4>
        <span className="text-xs text-muted-foreground">{voterCount} {voterCount === 1 ? "voter" : "voters"}</span>
      </div>
      <p className="text-sm text-muted-foreground italic">{view.strategy}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Player</TableHead>
            <TableHead>Reasoning</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.lineup.map(s => (
            <TableRow key={`${title}-${s.slot}-${s.playerId}`}>
              <TableCell className="font-mono font-semibold">{s.slot}</TableCell>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{s.why}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {view.flags.length > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400">
          <div className="font-medium">Notes:</div>
          <ul className="list-disc pl-5">{view.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function AILineupAdmin({ slug, players }: { slug: string; players: BbPlayer[] }) {
  const { toast } = useToast();
  const [lineupWindow, setLineupWindow] = useState<EvalWindow>("season");
  const [result, setResult] = useState<AILineupResponse | null>(null);
  const mut = useMutation({
    mutationFn: async (w: EvalWindow) => {
      const r = await apiRequest("POST", `/api/team/${slug}/admin/ai-lineup`, { window: w });
      return (await r.json()) as AILineupResponse;
    },
    onSuccess: (d) => setResult(d),
    onError: (err: Error) => toast({ title: "AI lineup failed", description: err.message, variant: "destructive" }),
  });
  const windowLabel = (w: EvalWindow) => w === "season" ? "Full Season" : w === "last10" ? "Last 10 Games" : "Last 5 Games";
  return (
    <Card data-testid="card-ai-lineup">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Wand2 className="w-5 h-5" /> AI Lineup Generator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Builds the optimal batting order from your current roster ({players.length} players) using offensive stats
          from the window you pick plus the speed/baserunning-IQ poll. Stats prefer manual scorebook entries and fall
          back to GameChanger per game. You'll always get both views — coach-only poll average and full all-responses
          average — so you can compare and pick. Uses OpenAI GPT-4o.
        </p>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {(["season", "last10", "last5"] as const).map(w => (
            <Button
              key={w}
              variant={lineupWindow === w ? "default" : "outline"}
              size="sm"
              onClick={() => setLineupWindow(w)}
              data-testid={`button-lineup-window-${w}`}
            >
              {windowLabel(w)}
            </Button>
          ))}
          <Button
            onClick={() => mut.mutate(lineupWindow)}
            disabled={mut.isPending || players.length === 0}
            className="ml-2"
            data-testid="button-generate-lineup"
          >
            {mut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <><Wand2 className="w-4 h-4 mr-2" /> Generate lineup</>}
          </Button>
          {result && (
            <Button variant="outline" onClick={() => window.print()} data-testid="button-print-lineup">
              <Printer className="w-4 h-4 mr-2" /> Print / Save as PDF
            </Button>
          )}
        </div>
        {result && (
          <div className="space-y-4 print:block" id="ai-lineup-print">
            <div className="text-sm text-muted-foreground print:hidden">
              <span className="font-medium text-foreground">{result.windowLabel}</span> · {result.gamesInWindow} games
            </div>
            <div className="hidden print:block">
              <h2 className="text-xl font-bold">Knox Stars 7U — AI Lineup</h2>
              <div className="text-sm text-muted-foreground">{result.windowLabel} · {result.gamesInWindow} games · Season: {result.season}</div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <LineupCard title="Coach View" view={result.coachView} voterCount={result.coachVoterCount} />
              <LineupCard title="All Responses View" view={result.allView} voterCount={result.allVoterCount} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------- AI Evaluation Report (family + coach) --------------------

type EvalWindow = "season" | "last10" | "last5";

interface AIEvalPlayer {
  rank: number;
  playerId: string;
  name: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  smallSample: boolean;
}
interface AIEvalResponse {
  window: EvalWindow;
  windowLabel: string;
  season: string;
  gamesInWindow: number;
  ranked: AIEvalPlayer[];
  teamNotes: string;
}

function AIEvaluationCard({ slug, players, currentSeason, audience }: { slug: string; players: BbPlayer[]; currentSeason: string; audience: "family" | "coach" }) {
  const { toast } = useToast();
  const [window, setWindow] = useState<EvalWindow>("season");
  const [result, setResult] = useState<AIEvalResponse | null>(null);
  const endpoint = audience === "coach" ? `/api/team/${slug}/admin/ai-evaluate` : `/api/team/${slug}/ai-evaluate`;
  const mut = useMutation({
    mutationFn: async (w: EvalWindow) => {
      const r = await apiRequest("POST", endpoint, { window: w });
      return (await r.json()) as AIEvalResponse;
    },
    onSuccess: (d) => setResult(d),
    onError: (err: Error) => toast({ title: "AI evaluation failed", description: err.message, variant: "destructive" }),
  });

  const windowLabel = (w: EvalWindow) => w === "season" ? "Full Season" : w === "last10" ? "Last 10 Games" : "Last 5 Games";

  return (
    <Card data-testid="card-ai-evaluation">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Sparkles className="w-5 h-5" /> {audience === "coach" ? "Player Evaluations — Coaches" : "Player Evaluations"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {audience === "coach"
            ? `A candid, coach-only offensive evaluation of every player (${players.length} on roster) with honest strengths and the top things to work on — more critical, for staff decisions.`
            : `A positive, encouraging offensive write-up of every player (${players.length} on roster), celebrating strengths and offering a fun next step to work on only when it helps. Great to share with families.`}
          {" "}Tuned for 7U: rewards contact, on-base, and baserunning over power. Pick a window, then print or save as a PDF.
        </p>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {(["season", "last10", "last5"] as const).map(w => (
            <Button
              key={w}
              variant={window === w ? "default" : "outline"}
              size="sm"
              onClick={() => setWindow(w)}
              data-testid={`button-window-${w}`}
            >
              {windowLabel(w)}
            </Button>
          ))}
          <Button
            onClick={() => mut.mutate(window)}
            disabled={mut.isPending}
            className="ml-2"
            data-testid="button-generate-evaluation"
          >
            {mut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate report</>}
          </Button>
          {result && (
            <Button variant="outline" onClick={() => globalThis.window.print()} data-testid="button-print-evaluation">
              <Printer className="w-4 h-4 mr-2" /> Print / Save as PDF
            </Button>
          )}
        </div>
        {result && (
          <div className="space-y-4" id="ai-eval-print">
            <div className="hidden print:block">
              <h2 className="text-xl font-bold">Knox Stars 7U — Player Evaluations</h2>
              <div className="text-sm text-muted-foreground">{result.windowLabel} · Season: {result.season} · {result.gamesInWindow} games</div>
            </div>
            <div className="text-sm text-muted-foreground print:hidden">
              <span className="font-medium text-foreground">{result.windowLabel}</span> · {result.gamesInWindow} games
            </div>
            <div className="border rounded-md p-3 bg-muted/30 print:bg-transparent print:border-2">
              <div className="font-semibold mb-1">Team notes</div>
              <p className="text-sm">{result.teamNotes}</p>
            </div>
            <div className="grid gap-3">
              {(audience === "family"
                ? result.ranked.slice().sort((a, b) => a.name.localeCompare(b.name))
                : result.ranked
              ).map(p => (
                <div
                  key={p.playerId}
                  className="border rounded-md p-3 space-y-2 print:break-inside-avoid"
                  data-testid={`eval-player-${p.playerId}`}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-3">
                      {audience === "coach" && <span className="font-mono font-bold text-lg">#{p.rank}</span>}
                      <span className="font-semibold">{p.name}</span>
                      {p.smallSample && <span className="text-xs text-amber-700 dark:text-amber-400">small sample</span>}
                    </div>
                  </div>
                  <p className="text-sm">{p.summary}</p>
                  {p.strengths.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">Strengths:</span>{" "}
                      <span>{p.strengths.join(" · ")}</span>
                    </div>
                  )}
                  {p.improvements.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium text-blue-700 dark:text-blue-400">Work on:</span>{" "}
                      <span>{p.improvements.join(" · ")}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground italic print:text-[10px]">
              Reminder: AB on this team is recorded as raw plate appearances (BB/SAC/HBP not subtracted), so rate stats read lower than official figures. Evaluations compare players relatively within the roster.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------- Season Progression Report (family + coach) --------------------

type SRScheme = "auto" | "thirds" | "quarters";
type SRCoach = "auto" | "coach" | "kid";

interface SRProj {
  games: number; pa: number; ab: number; h: number; r: number; rbi: number;
  doubles: number; triples: number; hr: number; xbh: number; tb: number;
  bb: number; k: number; sb: number;
  avg: number | null; obp: number | null; slg: number | null; ops: number | null;
  iso: number | null; babip: number | null; secAvg: number | null;
  bbRate: number | null; kRate: number | null;
  po: number; a: number; e: number; fpct: number | null; chances: number;
}
interface SRPeriodProj extends SRProj { period: number }
interface SRPeriod { index: number; label: string; games: number; startDate: string | null; endDate: string | null }
interface SRPlayer { playerId: string; name: string; jersey: string | null; chances: number; season: SRProj; perPeriod: SRPeriodProj[] }
interface SREval { playerId: string; narrative: string; trend: "up" | "down" | "steady" | "mixed"; smallSample: boolean }
interface SRRank { rank: number; playerId: string; name: string; summary: string }
interface SeasonReportResponse {
  season: string; scheme: string; coachPitch: boolean; derivedCoachPitch: boolean;
  gamesInSeason: number; defensiveEligible: boolean;
  periods: SRPeriod[]; players: SRPlayer[]; noData: { playerId: string; name: string }[];
  evaluations: SREval[]; offensiveRanking: SRRank[]; defensiveRanking: SRRank[] | null;
  defensiveNote: string; teamNotes: string;
}

const srAvg = (v: number | null) => v == null ? "—" : (v < 1 ? v.toFixed(3).replace(/^0/, "") : v.toFixed(3));

const SR_TREND: Record<SREval["trend"], { label: string; cls: string }> = {
  up: { label: "↑ improving", cls: "text-emerald-700 dark:text-emerald-400" },
  down: { label: "↓ declining", cls: "text-red-700 dark:text-red-400" },
  steady: { label: "→ steady", cls: "text-muted-foreground" },
  mixed: { label: "~ mixed", cls: "text-amber-700 dark:text-amber-400" },
};

function SeasonReportCard({ slug, players, audience }: { slug: string; players: BbPlayer[]; audience: "family" | "coach" }) {
  const { toast } = useToast();
  const [scheme, setScheme] = useState<SRScheme>("auto");
  const [coach, setCoach] = useState<SRCoach>("auto");
  const [result, setResult] = useState<SeasonReportResponse | null>(null);
  const endpoint = audience === "coach" ? `/api/team/${slug}/admin/ai-season-report` : `/api/team/${slug}/ai-season-report`;
  const mut = useMutation({
    mutationFn: async () => {
      const body: { scheme: SRScheme; coachPitch?: boolean } = { scheme };
      if (coach !== "auto") body.coachPitch = coach === "coach";
      const r = await apiRequest("POST", endpoint, body);
      return (await r.json()) as SeasonReportResponse;
    },
    onSuccess: (d) => setResult(d),
    onError: (err: Error) => toast({ title: "Season report failed", description: err.message, variant: "destructive" }),
  });

  const rankMap = new Map<string, SRRank>((result?.offensiveRanking ?? []).map(r => [r.playerId, r]));
  const evalMap = new Map<string, SREval>((result?.evaluations ?? []).map(e => [e.playerId, e]));
  const orderedPlayers = result
    ? result.players.slice().sort((a, b) => {
        if (audience === "family") return a.name.localeCompare(b.name);
        const ra = rankMap.get(a.playerId)?.rank ?? 999;
        const rb = rankMap.get(b.playerId)?.rank ?? 999;
        return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
      })
    : [];

  return (
    <Card data-testid="card-season-report">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="w-5 h-5" /> {audience === "coach" ? "Season Progression Report — Coaches" : "Season Progression Report"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Splits the season into chronological periods (thirds or quarters) and shows how each player's OFFENSE changed
          over time — batting average, on-base, slugging/OPS, RBIs, runs, hits, and strikeouts — with a written narrative
          {audience === "coach" ? ", an offensive ranking, and a defensive ranking when there's enough fielding data." : " for each player."}{" "}
          {audience === "coach"
            ? "Candid, coach-only tone for development decisions."
            : "Positive, encouraging tone written for families."}{" "}
          Stats prefer manual scorebook entries and fall back to GameChanger per game.
        </p>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs font-medium text-muted-foreground">Periods:</span>
          {(["auto", "thirds", "quarters"] as const).map(s => (
            <Button key={s} variant={scheme === s ? "default" : "outline"} size="sm" onClick={() => setScheme(s)} data-testid={`button-sr-scheme-${s}`}>
              {s === "auto" ? "Auto" : s === "thirds" ? "Thirds" : "Quarters"}
            </Button>
          ))}
          <span className="text-xs font-medium text-muted-foreground ml-2">Age level:</span>
          {(["auto", "coach", "kid"] as const).map(c => (
            <Button key={c} variant={coach === c ? "default" : "outline"} size="sm" onClick={() => setCoach(c)} data-testid={`button-sr-coach-${c}`}>
              {c === "auto" ? "Auto (by age)" : c === "coach" ? "Coach pitch" : "Kid pitch"}
            </Button>
          ))}
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || players.length === 0} className="ml-2" data-testid="button-generate-season-report">
            {mut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <><TrendingUp className="w-4 h-4 mr-2" /> Generate report</>}
          </Button>
          {result && (
            <Button variant="outline" onClick={() => globalThis.window.print()} data-testid="button-print-season-report">
              <Printer className="w-4 h-4 mr-2" /> Print / Save as PDF
            </Button>
          )}
        </div>

        {result && (
          <div className="space-y-5" id="season-report-print">
            <div className="hidden print:block">
              <h2 className="text-xl font-bold">Knox Stars — Season Progression Report</h2>
              <div className="text-sm text-muted-foreground">Season: {result.season} · {result.gamesInSeason} games · split into {result.scheme}</div>
            </div>
            <div className="text-sm text-muted-foreground print:hidden">
              Season <span className="font-medium text-foreground">{result.season}</span> · {result.gamesInSeason} games · split into{" "}
              <span className="font-medium text-foreground">{result.scheme}</span> ·{" "}
              {result.coachPitch ? "coach-pitch rules (no walks/steals/pitching)" : "kid-pitch rules"}
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {result.periods.map(p => (
                <span key={p.index} className="border rounded px-2 py-1" data-testid={`sr-period-${p.index}`}>
                  <span className="font-medium">{p.label}</span>: {p.games} {p.games === 1 ? "game" : "games"}
                  {p.startDate && <span className="text-muted-foreground"> ({p.startDate}{p.endDate && p.endDate !== p.startDate ? `–${p.endDate}` : ""})</span>}
                </span>
              ))}
            </div>

            {result.teamNotes && (
              <div className="border rounded-md p-3 bg-muted/30 print:bg-transparent print:border-2">
                <div className="font-semibold mb-1">Team notes</div>
                <p className="text-sm">{result.teamNotes}</p>
              </div>
            )}

            {audience === "coach" && result.offensiveRanking.length > 0 && (
              <div className="print:break-inside-avoid">
                <h3 className="font-semibold mb-2">Offensive ranking</h3>
                <Table>
                  <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Player</TableHead><TableHead>Why</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.offensiveRanking.slice().sort((a, b) => a.rank - b.rank).map(r => (
                      <TableRow key={r.playerId} data-testid={`sr-off-rank-${r.playerId}`}>
                        <TableCell className="font-mono font-semibold">{r.rank}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.summary}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {audience === "coach" && (
            <div className="print:break-inside-avoid">
              <h3 className="font-semibold mb-2">Defensive ranking</h3>
              {result.defensiveRanking && result.defensiveRanking.length > 0 ? (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Player</TableHead><TableHead>Why</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.defensiveRanking.slice().sort((a, b) => a.rank - b.rank).map(r => (
                      <TableRow key={r.playerId} data-testid={`sr-def-rank-${r.playerId}`}>
                        <TableCell className="font-mono font-semibold">{r.rank}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.summary}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="sr-def-note">{result.defensiveNote || "Not enough defensive data to rank fielding this season."}</p>
              )}
            </div>
            )}

            <div className="space-y-4">
              <h3 className="font-semibold">Player-by-player progression</h3>
              {orderedPlayers.map(pl => {
                const ev = evalMap.get(pl.playerId);
                const rank = rankMap.get(pl.playerId)?.rank;
                const trend = ev ? SR_TREND[ev.trend] : null;
                return (
                  <div key={pl.playerId} className="border rounded-md p-3 space-y-2 print:break-inside-avoid" data-testid={`sr-player-${pl.playerId}`}>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      {audience === "coach" && rank != null && <span className="font-mono font-bold">#{rank}</span>}
                      <span className="font-semibold">{pl.name}</span>
                      {pl.jersey && <span className="text-xs text-muted-foreground">#{pl.jersey}</span>}
                      {trend && <span className={`text-xs font-medium ${trend.cls}`}>{trend.label}</span>}
                      {ev?.smallSample && <span className="text-xs text-amber-700 dark:text-amber-400">small sample</span>}
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period</TableHead>
                            <TableHead className="text-right">G</TableHead>
                            <TableHead className="text-right">PA</TableHead>
                            <TableHead className="text-right">AVG</TableHead>
                            <TableHead className="text-right">OBP</TableHead>
                            <TableHead className="text-right">SLG</TableHead>
                            <TableHead className="text-right">OPS</TableHead>
                            <TableHead className="text-right">R</TableHead>
                            <TableHead className="text-right">RBI</TableHead>
                            <TableHead className="text-right">H</TableHead>
                            <TableHead className="text-right">K</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pl.perPeriod.map(pp => {
                            const lbl = result.periods[pp.period]?.label ?? `P${pp.period + 1}`;
                            const absent = pp.games === 0;
                            return (
                              <TableRow key={pp.period} className={absent ? "text-muted-foreground" : ""}>
                                <TableCell className="font-medium">{lbl}</TableCell>
                                <TableCell className="text-right font-mono">{pp.games}</TableCell>
                                <TableCell className="text-right font-mono">{absent ? "—" : pp.pa}</TableCell>
                                <TableCell className="text-right font-mono">{srAvg(pp.avg)}</TableCell>
                                <TableCell className="text-right font-mono">{srAvg(pp.obp)}</TableCell>
                                <TableCell className="text-right font-mono">{srAvg(pp.slg)}</TableCell>
                                <TableCell className="text-right font-mono">{srAvg(pp.ops)}</TableCell>
                                <TableCell className="text-right font-mono">{absent ? "—" : pp.r}</TableCell>
                                <TableCell className="text-right font-mono">{absent ? "—" : pp.rbi}</TableCell>
                                <TableCell className="text-right font-mono">{absent ? "—" : pp.h}</TableCell>
                                <TableCell className="text-right font-mono">{absent ? "—" : pp.k}</TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="border-t-2 font-medium">
                            <TableCell>Season</TableCell>
                            <TableCell className="text-right font-mono">{pl.season.games}</TableCell>
                            <TableCell className="text-right font-mono">{pl.season.pa}</TableCell>
                            <TableCell className="text-right font-mono">{srAvg(pl.season.avg)}</TableCell>
                            <TableCell className="text-right font-mono">{srAvg(pl.season.obp)}</TableCell>
                            <TableCell className="text-right font-mono">{srAvg(pl.season.slg)}</TableCell>
                            <TableCell className="text-right font-mono">{srAvg(pl.season.ops)}</TableCell>
                            <TableCell className="text-right font-mono">{pl.season.r}</TableCell>
                            <TableCell className="text-right font-mono">{pl.season.rbi}</TableCell>
                            <TableCell className="text-right font-mono">{pl.season.h}</TableCell>
                            <TableCell className="text-right font-mono">{pl.season.k}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                    {ev?.narrative && <p className="text-sm">{ev.narrative}</p>}
                  </div>
                );
              })}
            </div>

            {result.noData.length > 0 && (
              <p className="text-xs text-muted-foreground">
                No offensive data this season (excluded): {result.noData.map(n => n.name).join(", ")}.
              </p>
            )}

            <p className="text-xs text-muted-foreground italic print:text-[10px]">
              Reminder: AB on this team is recorded as raw plate appearances (BB/SAC/HBP not subtracted), so rate stats read lower than official figures. Evaluations compare players relatively within the roster.
              {result.coachPitch && " Coach-pitch rules applied: walks, stolen bases, and pitching are not evaluated."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
