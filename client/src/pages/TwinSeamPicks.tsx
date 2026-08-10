import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Club, Gem, MessageSquareText, Sparkles, Store } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DealCard } from "@/components/DealCard";
import { useSources } from "@/hooks/use-taxonomy";

type PicksSectionKey = "texted" | "twinSeamSports" | "eliteGloves" | "batsAndGolf";

const sectionCopy: Array<{
  key: PicksSectionKey;
  title: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    key: "texted",
    title: "Top Deals Found Around the Web",
    description: "Hand-picked finds sent directly by Twin Seam.",
    icon: MessageSquareText,
  },
  {
    key: "twinSeamSports",
    title: "From TwinSeamSports.com",
    description: "Standout values from our own shop.",
    icon: Store,
  },
  {
    key: "eliteGloves",
    title: "Incredible Deals on Incredible Gloves",
    description: "Five elite gloves worth a closer look.",
    icon: Gem,
  },
  {
    key: "batsAndGolf",
    title: "Premium Bat & Golf Deals",
    description: "Our strongest bat and golf-club values over $150.",
    icon: Club,
  },
];

function useTwinSeamPicks() {
  return useQuery({
    queryKey: ["/api/twin-seam-picks"],
    queryFn: async () => {
      const response = await fetch("/api/twin-seam-picks", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch Twin Seam Picks");
      return response.json();
    },
  });
}

export default function TwinSeamPicks() {
  const picks = useTwinSeamPicks();
  const sources = useSources();
  const sourceById = useMemo(() => {
    const map = new Map<string, any>();
    ((sources.data ?? []) as any[]).forEach((source: any) => map.set(source.id, source));
    return map;
  }, [sources.data]);

  return (
    <AppShell title="Twin Seam Picks" subtitle="A focused shortlist chosen by Twin Seam Sports and the TSSDeals Brain">
      <div className="space-y-8" data-testid="twin-seam-picks-page">
        <section className="overflow-hidden rounded-[1.75rem] border border-primary/25 bg-gradient-to-br from-slate-950 via-slate-900 to-primary/80 p-6 text-white shadow-xl shadow-primary/10">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Personally curated</div>
              <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">The deals we would tell a friend about</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
                Direct submissions, trusted Twin Seam inventory, elite gloves, and premium bat or golf values—kept together in one easy-to-find collection.
              </p>
            </div>
          </div>
        </section>

        {picks.isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-56 rounded-3xl shimmer" />)}
          </div>
        ) : sectionCopy.map((section) => {
          const sectionDeals = (picks.data?.sections?.[section.key] ?? []) as any[];
          if (sectionDeals.length === 0) return null;
          const Icon = section.icon;
          return (
            <section key={section.key} data-testid={`picks-section-${section.key}`}>
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">{section.title}</h2>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </div>
              </div>
              <div className="flex snap-x gap-4 overflow-x-auto pb-3 scrollbar-hide">
                {sectionDeals.map((deal, index) => {
                  const source = sourceById.get(deal.sourceId);
                  return (
                    <div key={deal.id} className="w-[88%] shrink-0 snap-start sm:w-[390px]">
                      <DealCard
                        deal={deal}
                        sourceName={source?.name}
                        ourStore={source?.isOurStore}
                        data-testid={`pick-${section.key}-${index}`}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {!picks.isLoading && (picks.data?.deals ?? []).length === 0 ? (
          <div className="card-elevated p-10 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <div className="mt-3 font-display text-lg font-bold">Fresh picks are being prepared</div>
            <p className="mt-1 text-sm text-muted-foreground">Check back after the next deal refresh or text a deal to add it here.</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
