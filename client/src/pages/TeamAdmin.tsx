import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Check, Copy, Loader2, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { redirectToLogin } from "@/lib/auth-utils";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SignupRequest {
  id: string;
  teamName: string;
  headCoach: string;
  administrator: string | null;
  season: string | null;
  ageGroup: string | null;
  city: string | null;
  state: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string | null;
  notes: string | null;
  status: "pending" | "fulfilled" | "dismissed";
  fulfilledTeamId: string | null;
  createdAt: string;
}

interface SourceGame {
  id: string;
  gameDate: string;
  opponent: string;
  ourScore: number | null;
  oppScore: number | null;
  season: string;
  playerStatRows: number;
  playerFieldingRows: number;
  teamFieldingRows: number;
  hasStats: boolean;
}

interface SourceTeam {
  id: string;
  slug: string;
  name: string;
  ageGroup: string | null;
  season: string | null;
  games: SourceGame[];
}

interface ProvisioningData {
  requests: SignupRequest[];
  teams: SourceTeam[];
}

const blankForm = {
  requestId: "",
  name: "",
  slug: "",
  ageGroup: "",
  season: "",
  password: "",
  headCoach: "",
  city: "",
  state: "",
  adminEmail: "",
  sourceTeamId: "",
  sourceSeason: "",
};

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function TeamAdmin() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const isAdmin = (user as any)?.isAdmin === true;
  const [form, setForm] = useState(blankForm);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<any>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) redirectToLogin((options) => toast(options as any));
  }, [isLoading, isAuthenticated, toast]);

  const dashboard = useQuery<ProvisioningData>({
    queryKey: ["/api/admin/team-provisioning"],
    enabled: isAuthenticated && isAdmin,
  });

  const sourceTeam = dashboard.data?.teams.find((team) => team.id === form.sourceTeamId);
  const seasons = useMemo(() =>
    Array.from(new Set((sourceTeam?.games ?? []).map((game) => game.season))).sort().reverse(),
    [sourceTeam],
  );
  const availableGames = useMemo(() =>
    (sourceTeam?.games ?? []).filter((game) => game.season === form.sourceSeason),
    [sourceTeam, form.sourceSeason],
  );

  const useRequest = (request: SignupRequest) => {
    const name = [request.teamName, request.ageGroup, request.season?.split(/\s+/)[0]]
      .filter(Boolean).join(" ").replace(/\b(\w+)(?:\s+\1\b)+/gi, "$1");
    setForm({
      ...blankForm,
      requestId: request.id,
      name: request.teamName,
      slug: slugify(name),
      ageGroup: request.ageGroup ?? "",
      season: request.season ?? "",
      headCoach: request.headCoach,
      city: request.city ?? "",
      state: request.state ?? "",
      adminEmail: request.contactEmail,
    });
    setSelectedGames(new Set());
    setCreated(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createTeam = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/team-provisioning", {
        ...form,
        requestId: form.requestId || undefined,
        sourceTeamId: form.sourceTeamId || undefined,
        sourceSeason: form.sourceSeason || undefined,
        gameIds: Array.from(selectedGames),
      });
      return response.json();
    },
    onSuccess: async (result) => {
      setCreated(result);
      setForm(blankForm);
      setSelectedGames(new Set());
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/team-provisioning"] });
      toast({ title: "Team created", description: `${result.team.name} is ready with ${result.copied.games} copied games.` });
    },
    onError: (error: any) => toast({
      title: "Team creation failed",
      description: error?.message ?? "Could not create the team.",
      variant: "destructive",
    }),
  });

  const updateRequest = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "pending" | "dismissed" }) =>
      apiRequest("PATCH", `/api/admin/team-signups/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/team-provisioning"] }),
  });

  if (isLoading || (!isAuthenticated && !user)) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return <div className="min-h-screen grid place-items-center p-6"><Card><CardContent className="p-8">Administrator access is required.</CardContent></Card></div>;
  }

  const pending = (dashboard.data?.requests ?? []).filter((request) => request.status === "pending");
  const reviewed = (dashboard.data?.requests ?? []).filter((request) => request.status !== "pending");
  const update = (key: keyof typeof blankForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const toggleGame = (id: string, checked: boolean) => setSelectedGames((current) => {
    const next = new Set(current);
    if (checked) next.add(id); else next.delete(id);
    return next;
  });
  const chooseFourRecent = () => setSelectedGames(new Set(
    availableGames.filter((game) => game.hasStats).slice(0, 4).map((game) => game.id),
  ));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-red-600" /><h1 className="text-2xl font-bold">Team Setup Admin</h1></div>
            <p className="text-sm text-muted-foreground">Review requests, create a secure team, and copy selected historical games.</p>
          </div>
          <Button variant="outline" asChild><Link href="/">Back to Team Stats</Link></Button>
        </div>

        {created && (
          <Card className="border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30">
            <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3"><Check className="h-5 w-5 text-emerald-600 mt-0.5" /><div><strong>{created.team.name} is live.</strong><div className="text-sm text-muted-foreground">Copied {created.copied.games} games, {created.copied.players} players, and {created.copied.playerStats} player stat rows.</div></div></div>
              <Button asChild><a href={`/team/${created.team.slug}`}>Open team</a></Button>
            </CardContent>
          </Card>
        )}

        <div className="grid xl:grid-cols-[1.35fr_0.65fr] gap-6 items-start">
          <Card>
            <CardHeader><CardTitle>Create team</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Team name" value={form.name} onChange={(v) => { update("name", v); if (!form.slug) update("slug", slugify(v)); }} />
                <Field label="URL slug" value={form.slug} onChange={(v) => update("slug", slugify(v))} placeholder="stars-8u-fall" />
                <Field label="Age group" value={form.ageGroup} onChange={(v) => update("ageGroup", v)} placeholder="8U" />
                <Field label="Season" value={form.season} onChange={(v) => update("season", v)} placeholder="Fall 2026" />
                <Field label="Head coach" value={form.headCoach} onChange={(v) => update("headCoach", v)} />
                <Field label="Team administrator email" type="email" value={form.adminEmail} onChange={(v) => update("adminEmail", v)} />
                <Field label="City" value={form.city} onChange={(v) => update("city", v)} />
                <Field label="State" value={form.state} onChange={(v) => update("state", v)} />
                <Field label="Team password" type="password" value={form.password} onChange={(v) => update("password", v)} placeholder="At least 8 characters" />
              </div>

              <div className="border-t pt-5 space-y-4">
                <div><h3 className="font-semibold flex items-center gap-2"><Copy className="h-4 w-4" /> Copy games from an existing team</h3><p className="text-sm text-muted-foreground">Optional. Every associated player, hitting, pitching, fielding, lineup, score, and game detail is copied to independent new records.</p></div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Source team</Label><Select value={form.sourceTeamId || "none"} onValueChange={(v) => { const id = v === "none" ? "" : v; update("sourceTeamId", id); const team = dashboard.data?.teams.find((t) => t.id === id); update("sourceSeason", team?.season ?? ""); setSelectedGames(new Set()); }}><SelectTrigger><SelectValue placeholder="No source team" /></SelectTrigger><SelectContent><SelectItem value="none">No game copy</SelectItem>{dashboard.data?.teams.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Source season</Label><Select value={form.sourceSeason} onValueChange={(v) => { update("sourceSeason", v); setSelectedGames(new Set()); }} disabled={!sourceTeam}><SelectTrigger><SelectValue placeholder="Choose a season" /></SelectTrigger><SelectContent>{seasons.map((season) => <SelectItem key={season} value={season}>{season}</SelectItem>)}</SelectContent></Select></div>
                </div>

                {form.sourceSeason && (
                  <div className="rounded-lg border">
                    <div className="flex items-center justify-between gap-3 p-3 border-b bg-muted/40"><span className="text-sm font-medium">Select games ({selectedGames.size})</span><Button type="button" size="sm" variant="outline" onClick={chooseFourRecent}>Select 4 most recent with stats</Button></div>
                    <div className="max-h-80 overflow-auto divide-y">
                      {availableGames.map((game) => (
                        <label key={game.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30">
                          <Checkbox checked={selectedGames.has(game.id)} onCheckedChange={(checked) => toggleGame(game.id, checked === true)} />
                          <div className="min-w-0 flex-1"><div className="font-medium">{new Date(game.gameDate).toLocaleDateString()} vs. {game.opponent}</div><div className="text-xs text-muted-foreground">{game.ourScore ?? "–"}–{game.oppScore ?? "–"} · {game.playerStatRows} player stat rows · {game.playerFieldingRows + game.teamFieldingRows} fielding detail rows</div></div>
                          <span className={`text-xs font-medium ${game.hasStats ? "text-emerald-600" : "text-amber-600"}`}>{game.hasStats ? "Stats recorded" : "No stats"}</span>
                        </label>
                      ))}
                      {availableGames.length === 0 && <div className="p-4 text-sm text-muted-foreground">No games in this season.</div>}
                    </div>
                  </div>
                )}
              </div>

              <Button className="w-full" size="lg" disabled={createTeam.isPending || !form.name || !form.slug || !form.season || form.password.length < 8} onClick={() => createTeam.mutate()}>
                {createTeam.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating team…</> : "Create team"}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Pending requests ({pending.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {pending.map((request) => <RequestCard key={request.id} request={request} onUse={() => useRequest(request)} onStatus={(status) => updateRequest.mutate({ id: request.id, status })} />)}
                {!dashboard.isLoading && pending.length === 0 && <p className="text-sm text-muted-foreground">No pending signup requests.</p>}
              </CardContent>
            </Card>
            {reviewed.length > 0 && <Card><CardHeader><CardTitle className="text-base">Reviewed requests</CardTitle></CardHeader><CardContent className="space-y-2">{reviewed.map((request) => <div key={request.id} className="text-sm flex justify-between gap-3 border-b pb-2"><span>{request.teamName}</span><span className="capitalize text-muted-foreground">{request.status}</span></div>)}</CardContent></Card>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>;
}

function RequestCard({ request, onUse, onStatus }: { request: SignupRequest; onUse: () => void; onStatus: (status: "pending" | "dismissed") => void }) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div><div className="font-semibold">{request.teamName}{request.ageGroup ? ` · ${request.ageGroup}` : ""}</div><div className="text-xs text-muted-foreground">{request.season || "Season not supplied"} · {new Date(request.createdAt).toLocaleDateString()}</div></div>
      <div className="text-sm"><div>{request.contactName} · {request.contactEmail}</div><div>{request.contactPhone}</div>{request.notes && <p className="mt-2 text-muted-foreground whitespace-pre-wrap">{request.notes}</p>}</div>
      <div className="flex gap-2"><Button size="sm" onClick={onUse}>Set up team</Button><Button size="sm" variant="ghost" onClick={() => onStatus("dismissed")}>Dismiss</Button></div>
    </div>
  );
}
