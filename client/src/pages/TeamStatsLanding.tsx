import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Lock, LogIn, Mail, MapPin, Phone, Sparkles, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useMagicLink } from "@/components/MagicLinkDialog";
import tssLogo from "@assets/TSS_Logo_1779117500363.png";
import knoxStarLogo from "@assets/Knox_Star_Logo_transparent.png";
import dirtDawgsLogo from "@assets/Dirt_Dawgs_Logo_1779116645720.png";

function AdminLink() {
  const { data } = useQuery<{ email?: string }>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
  });
  if ((data?.email || "").toLowerCase() !== "justin@twinseamsports.com") return null;
  return (
    <a href="/admin/invoices" className="block hover:underline" data-testid="link-admin-invoices">Admin: Invoices →</a>
  );
}

interface TeamSummary {
  slug: string;
  name: string;
  season: string | null;
}

const COMING_SOON_TEAMS: { slug: string; name: string; subtitle: string; logo: string }[] = [
  { slug: "dirtdawgs10u", name: "Dirt Dawgs — 10U", subtitle: "Fastpitch Softball", logo: dirtDawgsLogo },
];

export default function TeamStatsLanding() {
  const { data, isLoading } = useQuery<{ teams: TeamSummary[] }>({
    queryKey: ["/api/teams"],
    queryFn: async () => {
      const r = await fetch("/api/teams", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load teams");
      return r.json();
    },
  });
  const liveTeams = data?.teams ?? [];

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <TopNav />
      <Hero />
      <CurrentTeams isLoading={isLoading} liveTeams={liveTeams} />
      <AddYourTeamSection />
      <SiteFooter />
    </div>
  );
}

function TopNav() {
  const { openDialog } = useMagicLink();
  return (
    <header className="border-b bg-white/95 dark:bg-slate-950/95 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3" data-testid="link-home">
          <img src={tssLogo} alt="Twin Seam Sports" className="w-10 h-10 object-contain" />
          <div className="leading-tight">
            <div className="text-sm font-extrabold tracking-tight">TWIN SEAM SPORTS</div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Team Stats</div>
          </div>
        </Link>
        <div className="flex items-center gap-5">
          <nav className="hidden md:flex items-center gap-5 text-sm">
            <a href="#teams" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white" data-testid="link-nav-teams">Teams</a>
            <a href="#add" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white" data-testid="link-nav-add">Add Your Team</a>
            <a href="https://www.twinseamsports.com" target="_blank" rel="noreferrer" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white" data-testid="link-nav-shop">Shop</a>
            <a href="https://www.tssdeals.com" target="_blank" rel="noreferrer" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white" data-testid="link-nav-deals">Deals</a>
          </nav>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={() => openDialog("email")}
            data-testid="button-sign-in"
          >
            <LogIn className="mr-1.5 h-4 w-4" />
            Sign in
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 600px 300px at 18% 22%, rgba(255,255,255,0.18), transparent 60%)," +
          "radial-gradient(ellipse 500px 260px at 82% 28%, rgba(255,255,255,0.14), transparent 60%)," +
          "linear-gradient(180deg, #0b1220 0%, #0a0f1c 60%, #050810 100%)",
      }}
      data-testid="hero"
    >
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="relative max-w-6xl mx-auto px-4 py-20 md:py-28 text-white">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs md:text-sm text-white/80 mb-6">
          <li>✔ Built for Coaches & Families</li>
          <li>✔ Private, Password-Protected</li>
          <li>✔ Manual + GameChanger Tracking</li>
          <li>✔ Scorebook Photo Scan</li>
        </ul>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[0.95] mb-5" data-testid="text-hero-title">
          Twin Seam Sports<br />
          <span className="text-white/85">Team Stats</span>
        </h1>
        <p className="text-lg md:text-xl text-white/85 max-w-2xl mb-8" data-testid="text-hero-tagline">
          Private stat trackers for travel baseball and softball teams. Leaderboards, pitching,
          fielding, and a coach poll — all behind your team's password.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild className="bg-white text-slate-900 hover:bg-white/90 rounded-full px-7" data-testid="button-hero-teams">
            <a href="#teams">See Teams <ArrowRight className="w-4 h-4 ml-1" /></a>
          </Button>
          <Button size="lg" variant="outline" asChild className="rounded-full px-7 bg-transparent text-white border-white/40 hover:bg-white/10 hover:text-white" data-testid="button-hero-add">
            <a href="#add">Add Your Team</a>
          </Button>
        </div>
      </div>
    </section>
  );
}

function CurrentTeams({ isLoading, liveTeams }: { isLoading: boolean; liveTeams: TeamSummary[] }) {
  return (
    <section id="teams" className="max-w-6xl mx-auto px-4 py-16 md:py-20">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Current Teams</div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Pick your team</h2>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading teams…</p>}

      <div className="grid sm:grid-cols-2 gap-5">
        {liveTeams.map(t => (
          <TeamCard
            key={t.slug}
            slug={t.slug}
            name={t.name}
            subtitle={t.season ? `Active season: ${t.season}` : "Active team"}
            logo={t.slug === "stars7u" ? knoxStarLogo : null}
            status="live"
          />
        ))}
        {COMING_SOON_TEAMS.map(t => (
          <TeamCard
            key={t.slug}
            slug={t.slug}
            name={t.name}
            subtitle={t.subtitle}
            logo={t.logo}
            status="coming-soon"
          />
        ))}
      </div>
    </section>
  );
}

function TeamCard({
  slug, name, subtitle, logo, status,
}: {
  slug: string; name: string; subtitle: string; logo: string | null; status: "live" | "coming-soon";
}) {
  const inner = (
    <Card
      className={`h-full transition border-2 ${status === "live"
        ? "hover-elevate border-transparent"
        : "border-dashed border-slate-200 dark:border-slate-800 opacity-90"}`}
      data-testid={`card-team-${slug}`}
    >
      <CardContent className="p-5 flex items-center gap-4">
        <div className="w-20 h-20 shrink-0 rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center overflow-hidden">
          {logo ? (
            <img src={logo} alt={`${name} logo`} className="w-full h-full object-contain p-1" />
          ) : (
            <Lock className="w-6 h-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-lg leading-tight truncate" data-testid={`text-team-name-${slug}`}>{name}</div>
          <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
          {status === "live" ? (
            <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Lock className="w-3 h-3" /> Password-protected
            </div>
          ) : (
            <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Sparkles className="w-3 h-3" /> Coming soon
            </div>
          )}
        </div>
        {status === "live" && (
          <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
        )}
      </CardContent>
    </Card>
  );

  if (status === "live") {
    return (
      <Link href={`/team/${slug}`} className="block" data-testid={`link-team-${slug}`}>
        {inner}
      </Link>
    );
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-left w-full" data-testid={`button-team-${slug}`}>{inner}</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            This team's stats tracker is coming soon. For early access or to be notified when it
            launches, text Justin at <strong>865-468-8946</strong> or email{" "}
            <a href="mailto:justin@twinseamsports.com" className="underline">justin@twinseamsports.com</a>.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

const signupSchema = z.object({
  teamName: z.string().trim().min(1, "Required").max(120),
  headCoach: z.string().trim().min(1, "Required").max(120),
  administrator: z.string().trim().max(120).optional().default(""),
  season: z.string().trim().max(60).optional().default(""),
  ageGroup: z.string().trim().max(40).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  state: z.string().trim().max(40).optional().default(""),
  contactName: z.string().trim().min(1, "Required").max(120),
  contactEmail: z.string().trim().email("Valid email required").max(200),
  contactPhone: z.string().trim().min(7, "Phone required").max(40),
  address: z.string().trim().max(240).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  website: z.string().max(200).optional().default(""),
});
type SignupValues = z.infer<typeof signupSchema>;

function AddYourTeamSection() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      teamName: "", headCoach: "", administrator: "", season: "", ageGroup: "",
      city: "", state: "", contactName: "", contactEmail: "", contactPhone: "",
      address: "", notes: "", website: "",
    },
  });
  const submit = useMutation({
    mutationFn: async (values: SignupValues) => apiRequest("POST", "/api/teams/signup", values),
    onSuccess: () => {
      setSubmitted(true);
      form.reset();
      toast({ title: "Thanks!", description: "Justin will reach out shortly." });
    },
    onError: (e: any) => {
      toast({
        title: "Could not submit",
        description: e?.message ?? "Please email justin@twinseamsports.com",
        variant: "destructive",
      });
    },
  });

  return (
    <section id="add" className="bg-slate-50 dark:bg-slate-900/40 border-y border-slate-200 dark:border-slate-800">
      <div className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <div className="grid md:grid-cols-[1fr_1.2fr] gap-10 items-start">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Get Started</div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">Add Your Team</h2>
            <p className="text-muted-foreground mb-6">
              Tell us a little about your team and Justin will reach out to walk you through
              setup — roster import, GameChanger sync, season tagging, and scorebook scanning.
            </p>
            <ul className="space-y-3 text-sm">
              <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> Private stats — only your coaches & families see them</li>
              <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> Manual entry, Excel upload, GameChanger CSV, or scorebook photo scan</li>
              <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> Hitting, pitching, fielding leaderboards + per-game breakdown</li>
              <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> Coach poll for speed & baserunning IQ</li>
            </ul>
            <div className="mt-8 text-sm text-muted-foreground">
              Prefer to call? <a href="tel:8654688946" className="font-semibold text-slate-900 dark:text-white underline">865-468-8946</a>
            </div>
          </div>

          <Card>
            <CardContent className="p-6">
              {submitted ? (
                <div className="text-center py-10" data-testid="signup-success">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                  <div className="font-semibold text-lg mb-1">Thanks — we got it!</div>
                  <p className="text-sm text-muted-foreground mb-5">
                    Justin will reach out within a day or two to walk you through setup.
                  </p>
                  <Button variant="outline" onClick={() => setSubmitted(false)} data-testid="button-signup-another">
                    Submit another team
                  </Button>
                </div>
              ) : (
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(v => submit.mutate(v))}
                    className="space-y-4"
                    data-testid="form-team-signup"
                  >
                    <div className="grid sm:grid-cols-2 gap-3">
                      <FormField control={form.control} name="teamName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team Name *</FormLabel>
                          <FormControl><Input placeholder="Knox Stars" {...field} data-testid="input-teamName" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="ageGroup" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age Group</FormLabel>
                          <FormControl><Input placeholder="10U" {...field} data-testid="input-ageGroup" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                      <FormField control={form.control} name="headCoach" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Head Coach *</FormLabel>
                          <FormControl><Input {...field} data-testid="input-headCoach" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="administrator" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Administrator</FormLabel>
                          <FormControl><Input {...field} data-testid="input-administrator" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="season" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Season</FormLabel>
                        <FormControl><Input placeholder="Spring 2026" {...field} data-testid="input-season" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid sm:grid-cols-[1fr_120px] gap-3">
                      <FormField control={form.control} name="city" render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl><Input {...field} data-testid="input-city" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="state" render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl><Input placeholder="TN" {...field} data-testid="input-state" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl><Input placeholder="Street, City, ST" {...field} data-testid="input-address" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="pt-2 border-t" />

                    <div className="grid sm:grid-cols-2 gap-3">
                      <FormField control={form.control} name="contactName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Name *</FormLabel>
                          <FormControl><Input {...field} data-testid="input-contactName" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="contactPhone" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Phone *</FormLabel>
                          <FormControl><Input placeholder="865-555-1234" {...field} data-testid="input-contactPhone" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="contactEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email *</FormLabel>
                        <FormControl><Input type="email" {...field} data-testid="input-contactEmail" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Anything else?</FormLabel>
                        <FormControl>
                          <Textarea
                            rows={3}
                            placeholder="Roster size, season timing, current tracking tool, etc."
                            {...field}
                            data-testid="input-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Honeypot — hidden from humans, bots fill it in. */}
                    <div
                      aria-hidden="true"
                      style={{ position: "absolute", left: "-10000px", width: "1px", height: "1px", overflow: "hidden" }}
                    >
                      <label>
                        Website
                        <input type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
                      </label>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={submit.isPending}
                      data-testid="button-submit-signup"
                    >
                      {submit.isPending ? "Sending…" : "Send signup request"}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      We'll email <strong>justin@twinseamsports.com</strong> with your info and get back to you directly.
                    </p>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t bg-white dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-10 grid sm:grid-cols-3 gap-6 text-sm">
        <div className="flex items-center gap-3">
          <img src={tssLogo} alt="Twin Seam Sports" className="w-10 h-10 object-contain" />
          <div className="leading-tight">
            <div className="font-extrabold">TWIN SEAM SPORTS</div>
            <div className="text-xs text-muted-foreground">Team Stats — Maryville, TN</div>
          </div>
        </div>
        <div className="space-y-2 text-muted-foreground">
          <div className="flex items-center gap-2"><Mail className="w-4 h-4" /> <a href="mailto:justin@twinseamsports.com" className="hover:underline">justin@twinseamsports.com</a></div>
          <div className="flex items-center gap-2"><Phone className="w-4 h-4" /> <a href="tel:8654688946" className="hover:underline">865-468-8946</a></div>
          <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Maryville, Tennessee</div>
        </div>
        <div className="space-y-2 text-muted-foreground">
          <a href="https://www.twinseamsports.com" target="_blank" rel="noreferrer" className="block hover:underline">Twin Seam Sports Shop →</a>
          <a href="https://www.tssdeals.com" target="_blank" rel="noreferrer" className="block hover:underline">TwinSeamSports Deals →</a>
          <AdminLink />
        </div>
      </div>
      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Twin Seam Sports. All rights reserved.
      </div>
    </footer>
  );
}
