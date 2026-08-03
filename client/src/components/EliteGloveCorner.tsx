import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DealCard } from "@/components/DealCard";
import { useSources } from "@/hooks/use-taxonomy";

export function EliteGloveCorner() {
  const preview = useQuery({
    queryKey: ["/api/deal-categories", "elite-baseball-gloves"],
    queryFn: async () => {
      const response = await fetch("/api/deal-categories/elite-baseball-gloves", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load Elite Glove Corner");
      return response.json();
    },
  });
  const sources = useSources();
  const sourceById = useMemo(() => {
    const map = new Map<string, any>();
    ((sources.data ?? []) as any[]).forEach((source: any) => map.set(source.id, source));
    return map;
  }, [sources.data]);
  const deals = (preview.data?.deals ?? []).slice(0, 6);

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-slate-950 via-slate-900 to-primary/80 p-5 text-white shadow-xl shadow-primary/10 md:p-7" data-testid="elite-glove-corner">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]">
            <Sparkles className="h-3.5 w-3.5" /> Premium fielding gloves only
          </div>
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Elite Glove Corner</h2>
          <p className="mt-2 text-sm leading-6 text-slate-200">Every currently available glove that meets the Elite standard—not only discounted listings. Sort the full collection by savings, price, or freshness.</p>
        </div>
        <Link href="/app/top-deals/elite-baseball-gloves">
          <Button className="shrink-0 rounded-xl bg-white text-slate-950 hover:bg-slate-100" data-testid="button-open-elite-gloves">
            Explore elite gloves <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
      </div>
      {deals.length > 0 ? (
        <div className="mt-5 flex snap-x gap-4 overflow-x-auto pb-2 scrollbar-hide" data-testid="elite-glove-preview">
          {deals.map((deal: any, index: number) => {
            const source = sourceById.get(deal.sourceId);
            return (
              <div key={deal.id} className="w-[88%] shrink-0 snap-start text-foreground sm:w-[390px]">
                <DealCard deal={deal} sourceName={source?.name} ourStore={source?.isOurStore} eliteCornerAction="remove" data-testid={`elite-preview-card-${index}`} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-white/30 bg-white/5 px-4 py-5 text-sm text-slate-200">The Brain is checking current fielding-glove listings against the Elite standard.</div>
      )}
    </section>
  );
}
