import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DealCard } from "@/components/DealCard";
import { useSources } from "@/hooks/use-taxonomy";

type DigestCategory = { name: string; path: string; deals: any[] };

export default function TodaysPicks() {
  const picks = useQuery<{ generatedAt: string; categories: DigestCategory[] }>({
    queryKey: ["/api/todays-picks"],
    queryFn: async () => {
      const response = await fetch("/api/todays-picks");
      if (!response.ok) throw new Error("Failed to load today's picks");
      return response.json();
    },
  });
  const sources = useSources();
  const sourceById = useMemo(() => new Map(((sources.data ?? []) as any[]).map((source) => [source.id, source])), [sources.data]);

  return (
    <AppShell title="Today's Deal Alert Picks" subtitle="Every item that qualifies for the latest Twin Seam deal update">
      <div className="space-y-8" data-testid="todays-picks-page">
        <section className="rounded-[1.75rem] border border-primary/25 bg-gradient-to-br from-slate-950 via-slate-900 to-primary/80 p-6 text-white shadow-xl shadow-primary/10">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20"><BellRing className="h-6 w-6" /></div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-300">Twice-daily shortlist</div>
              <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">All of today's qualifying deals</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">Verified price evidence plus Twin Seam model-specific buy thresholds—organized here so texts stay short without hiding good opportunities.</p>
            </div>
          </div>
        </section>

        {picks.isLoading ? <div className="h-64 rounded-3xl shimmer" /> : (picks.data?.categories ?? []).map((category) => (
          <section key={category.name} className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-bold">{category.name} <span className="text-sm font-normal text-muted-foreground">({category.deals.length})</span></h2>
            </div>
            {category.deals.length ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {category.deals.map((deal, index) => {
                  const source: any = sourceById.get(deal.sourceId);
                  return <DealCard key={deal.id} deal={deal} sourceName={source?.name} ourStore={source?.isOurStore} data-testid={`today-pick-${index}`} />;
                })}
              </div>
            ) : <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No deals currently meet this category's standards.</div>}
          </section>
        ))}

        {!picks.isLoading && !(picks.data?.categories ?? []).some((category) => category.deals.length) ? (
          <div className="card-elevated p-10 text-center"><Sparkles className="mx-auto h-10 w-10 text-muted-foreground/40" /><p className="mt-3">Fresh qualifying deals are being gathered.</p></div>
        ) : null}
      </div>
    </AppShell>
  );
}
