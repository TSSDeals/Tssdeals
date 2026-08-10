import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AppShell } from "@/components/AppShell";
import { DealCard } from "@/components/DealCard";
import { HorizontalCarousel } from "@/components/HorizontalCarousel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useSources } from "@/hooks/use-taxonomy";
import { cn } from "@/lib/utils";
import { resolveTopDealsCategory, resolveTopDealsSlugFromLocation } from "@/lib/top-deals-page";
import {
  Trophy,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  TrendingUp,
  Flame,
  ExternalLink,
} from "lucide-react";

function useCategories() {
  return useQuery({
    queryKey: ["/api/deal-categories"],
    queryFn: async () => {
      const res = await fetch("/api/deal-categories", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
  });
}

function useCategoryDeals(slug: string | null) {
  return useQuery({
    queryKey: ["/api/deal-categories", slug],
    queryFn: async () => {
      if (!slug) return null;
      const res = await fetch(`/api/deal-categories/${slug}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch category deals");
      return res.json();
    },
    enabled: !!slug,
  });
}

function usePopularSearches() {
  return useQuery({
    queryKey: ["/api/popular-searches"],
    queryFn: async () => {
      const res = await fetch("/api/popular-searches", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch popular searches");
      return res.json();
    },
  });
}

function useTwinSeamPicks() {
  return useQuery({
    queryKey: ["/api/twin-seam-picks"],
    queryFn: async () => {
      const res = await fetch("/api/twin-seam-picks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Twin Seam picks");
      return res.json();
    },
  });
}

function CategoryCard({
  category,
  onClick,
}: {
  category: any;
  onClick: () => void;
}) {
  const isPredefined = category.isPredefined;
  const isDynamic = category.isDynamic;

  return (
    <Card
      className={cn(
        "group cursor-pointer transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg",
      )}
      onClick={onClick}
      data-testid={`category-card-${category.slug}`}
    >
      <div className="flex items-center gap-4 p-4">
        <div
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-2xl shadow-sm",
            isPredefined
              ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground"
              : "bg-gradient-to-br from-accent to-accent/70 text-accent-foreground",
          )}
        >
          {isPredefined ? (
            <Trophy className="h-5 w-5" />
          ) : (
            <TrendingUp className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="line-clamp-1 font-display text-sm font-bold leading-tight"
            data-testid={`category-name-${category.slug}`}
          >
            {category.name}
          </h3>
          {category.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {category.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isDynamic ? (
            <Badge className="border-accent/25 bg-accent/10 text-accent" data-testid={`category-dynamic-${category.slug}`}>
              <Sparkles className="mr-0.5 h-3 w-3" />
              Trending
            </Badge>
          ) : null}
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Card>
  );
}

function EliteGloveCorner({
  onOpen,
}: {
  onOpen: () => void;
}) {
  const preview = useCategoryDeals("elite-baseball-gloves");
  const sources = useSources();
  const sourceById = useMemo(() => {
    const map = new Map<string, any>();
    ((sources.data ?? []) as any[]).forEach((source: any) => map.set(source.id, source));
    return map;
  }, [sources.data]);
  const deals = (preview.data?.deals ?? []).slice(0, 6);

  return (
    <section
      className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-slate-950 via-slate-900 to-primary/80 p-5 text-white shadow-xl shadow-primary/10 md:p-7"
      data-testid="elite-glove-corner"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]">
            <Sparkles className="h-3.5 w-3.5" />
            Premium fielding gloves only
          </div>
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Elite Glove Corner</h2>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            Pro-grade and specialty-maker gloves from trusted sellers, screened to exclude batting gloves, sliding mitts, trainers, and memorabilia.
          </p>
        </div>
        <Button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-xl bg-white text-slate-950 hover:bg-slate-100"
          data-testid="button-open-elite-gloves"
        >
          Explore elite gloves
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      {deals.length > 0 ? (
        <HorizontalCarousel className="mt-5" label="Elite Glove Corner" testId="elite-glove-preview">
          {deals.map((deal: any, idx: number) => {
            const source = sourceById.get(deal.sourceId);
            return (
              <div key={deal.id} data-carousel-card className="w-[88%] shrink-0 snap-start text-foreground sm:w-[390px]">
                <DealCard
                  deal={deal}
                  sourceName={source?.name}
                  ourStore={source?.isOurStore}
                  data-testid={`elite-preview-card-${idx}`}
                />
              </div>
            );
          })}
        </HorizontalCarousel>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="mt-5 w-full rounded-2xl border border-dashed border-white/30 bg-white/5 px-4 py-5 text-left text-sm text-slate-200 hover:bg-white/10"
        >
          The collection is ready. Open it to see which verified listings currently meet the Elite standard.
        </button>
      )}
    </section>
  );
}

function CategoryDetail({
  slug,
  categories,
  onBack,
}: {
  slug: string;
  categories: any[];
  onBack: () => void;
}) {
  const { data, isLoading } = useCategoryDeals(slug);
  const sources = useSources();
  const [eliteSort, setEliteSort] = useState("recommended");

  const sourceById = useMemo(() => {
    const m = new Map<string, any>();
    const list = (sources.data ?? []) as any[];
    list.forEach((s: any) => m.set(s.id, s));
    return m;
  }, [sources.data]);

  const category = resolveTopDealsCategory(data?.category, categories, slug);
  const deals = useMemo(() => {
    const list = [...(data?.deals ?? [])];
    if (slug !== "elite-baseball-gloves" || eliteSort === "recommended") return list;
    if (eliteSort === "discount") return list.sort((a: any, b: any) => Number(b.percentOff ?? -1) - Number(a.percentOff ?? -1));
    if (eliteSort === "price-low") return list.sort((a: any, b: any) => Number(a.priceCents) - Number(b.priceCents));
    if (eliteSort === "price-high") return list.sort((a: any, b: any) => Number(b.priceCents) - Number(a.priceCents));
    if (eliteSort === "newest") return list.sort((a: any, b: any) => new Date(b.lastPriceConfirmedAt ?? b.lastSeenAt ?? b.foundAt ?? 0).getTime() - new Date(a.lastPriceConfirmedAt ?? a.lastSeenAt ?? a.foundAt ?? 0).getTime());
    return list;
  }, [data?.deals, eliteSort, slug]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={onBack} className="gap-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          Back to categories
        </Button>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card-elevated p-5">
              <div className="flex gap-4">
                <div className="h-28 w-28 rounded-2xl shimmer" />
                <div className="flex-1 space-y-3">
                  <div className="h-4 w-3/4 rounded-full shimmer" />
                  <div className="h-3 w-2/3 rounded-full shimmer" />
                  <div className="h-8 w-full rounded-2xl shimmer" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="gap-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <h2 className="font-display text-xl font-bold" data-testid="category-detail-title">
            {category?.name}
          </h2>
          {category?.description ? (
            <p className="text-sm text-muted-foreground">{category.description}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Ranked by verified value, product quality, freshness, and shopper interest—not claimed discount alone.
          </p>
        </div>
      </div>

      {slug === "elite-baseball-gloves" && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="elite-sort-controls">
          <div>
            <div className="text-sm font-bold">Sort the complete Elite collection</div>
            <div className="text-xs text-muted-foreground">Discount is optional; every listing must first meet the Elite glove standard.</div>
          </div>
          <select value={eliteSort} onChange={(event) => setEliteSort(event.target.value)} className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm" aria-label="Sort Elite gloves" data-testid="elite-sort">
            <option value="recommended">Brain recommended</option>
            <option value="discount">Biggest verified discount</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
            <option value="newest">Recently confirmed</option>
          </select>
        </div>
      )}

      {deals.length === 0 ? (
        <div className="card-elevated flex flex-col items-center gap-3 p-10 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <div className="font-display text-lg font-bold">No verified deals right now</div>
            <div className="text-sm text-muted-foreground">
              No verified deals currently meet this category&apos;s quality standard. Check back after the next refresh.
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {deals.map((deal: any, idx: number) => {
            const src = sourceById.get(deal.sourceId);
            return (
              <DealCard
                key={deal.id}
                deal={deal}
                sourceName={src?.name}
                ourStore={src?.isOurStore}
                eliteCornerAction={slug === "elite-baseball-gloves" ? "remove" : undefined}
                data-testid={`deal-card-${idx}`}
              />
            );
          })}
        </div>
      )}

      <div className="text-center text-xs text-muted-foreground">
        Showing {deals.length} verified {deals.length === 1 ? "deal" : "deals"} · Unverified savings claims are hidden
      </div>
    </div>
  );
}

export default function TopDealsPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  // Read the concrete location instead of rematching the already-selected
  // parent route. This remains reliable with Replit's production router/base
  // handling and with direct/deep links.
  const selectedSlug = resolveTopDealsSlugFromLocation(location);

  const categories = useCategories();
  const popularSearches = usePopularSearches();
  const twinSeamPicks = useTwinSeamPicks();

  const predefined = useMemo(
    () => (categories.data ?? []).filter((c: any) => c.isPredefined),
    [categories.data]
  );
  const dynamic = useMemo(
    () => (categories.data ?? []).filter((c: any) => c.isDynamic),
    [categories.data]
  );
  const eliteCategory = useMemo(
    () => predefined.find((category: any) => category.slug === "elite-baseball-gloves"),
    [predefined],
  );
  const standardPredefined = useMemo(
    () => predefined.filter((category: any) => category.slug !== "elite-baseball-gloves"),
    [predefined],
  );

  const handleSelectCategory = (slug: string) => {
    setLocation(`/app/top-deals/${slug}`);
  };

  const handleBack = () => {
    setLocation("/app/top-deals");
  };

  return (
    <AppShell
      title="Top Deals"
      subtitle="Curated lists of the best deals updated throughout the day"
    >
      {selectedSlug ? (
        <CategoryDetail
          slug={selectedSlug}
          categories={(categories.data ?? []) as any[]}
          onBack={handleBack}
        />
      ) : (
        <div className="space-y-8">
          {(twinSeamPicks.data?.deals ?? []).length > 0 ? (
            <section className="rounded-3xl border border-primary/25 bg-primary/5 p-4 sm:p-5" data-testid="twin-seam-picks">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">Twin Seam Picks</h2>
                  <p className="text-xs text-muted-foreground">Deals personally submitted by Twin Seam Sports</p>
                </div>
              </div>
              <HorizontalCarousel label="Twin Seam Picks" testId="top-deals-twin-seam-picks-carousel">
                {(twinSeamPicks.data.deals as any[]).map((deal: any, idx: number) => {
                  return (
                    <div key={deal.id} data-carousel-card className="min-w-[min(88vw,360px)] snap-start sm:min-w-[360px]">
                      <DealCard deal={deal} data-testid={`twin-seam-pick-${idx}`} />
                    </div>
                  );
                })}
              </HorizontalCarousel>
            </section>
          ) : null}

          {eliteCategory ? (
            <EliteGloveCorner
              onOpen={() => handleSelectCategory(eliteCategory.slug)}
            />
          ) : null}

          <section data-testid="curated-categories">
            <div className="mb-4 flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
                <Flame className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold">Curated Categories</h2>
                <p className="text-xs text-muted-foreground">
                  Always-on verified deal lists across key equipment categories
                </p>
              </div>
            </div>

            {categories.isLoading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-[72px] rounded-2xl shimmer" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {standardPredefined.map((cat: any) => (
                  <CategoryCard
                    key={cat.id}
                    category={cat}
                    onClick={() => handleSelectCategory(cat.slug)}
                  />
                ))}
              </div>
            )}
          </section>

          {dynamic.length > 0 ? (
            <section data-testid="dynamic-categories">
              <Separator className="mb-6" />
              <div className="mb-4 flex items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent/70 shadow-lg shadow-accent/20">
                  <TrendingUp className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">Trending Categories</h2>
                  <p className="text-xs text-muted-foreground">
                    Auto-generated from popular user searches
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {dynamic.map((cat: any) => (
                  <CategoryCard
                    key={cat.id}
                    category={cat}
                    onClick={() => handleSelectCategory(cat.slug)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {(popularSearches.data ?? []).length > 0 ? (
            <section data-testid="popular-searches">
              <Separator className="mb-6" />
              <div className="mb-4 flex items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background/60 shadow-sm">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">Popular Searches</h2>
                  <p className="text-xs text-muted-foreground">
                    What other users are searching for right now
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(popularSearches.data ?? []).map((item: any, idx: number) => (
                  <Link key={idx} href={`/app/deals?q=${encodeURIComponent(item.query)}`}>
                    <Badge
                      className="cursor-pointer border-border bg-muted text-foreground/80"
                      data-testid={`popular-search-${idx}`}
                    >
                      {item.query}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({item.count})
                      </span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
