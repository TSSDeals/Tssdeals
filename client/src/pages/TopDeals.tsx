import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { AppShell } from "@/components/AppShell";
import { DealCard } from "@/components/DealCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useSources } from "@/hooks/use-taxonomy";
import { cn } from "@/lib/utils";
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

function CategoryDetail({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { data, isLoading } = useCategoryDeals(slug);
  const sources = useSources();

  const sourceById = useMemo(() => {
    const m = new Map<string, any>();
    const list = (sources.data ?? []) as any[];
    list.forEach((s: any) => m.set(s.id, s));
    return m;
  }, [sources.data]);

  const category = data?.category;
  const deals = data?.deals ?? [];

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
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="card-elevated flex flex-col items-center gap-3 p-10 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <div className="font-display text-lg font-bold">No deals found</div>
            <div className="text-sm text-muted-foreground">
              Check back soon — deals refresh 4 times daily.
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
                data-testid={`deal-card-${idx}`}
              />
            );
          })}
        </div>
      )}

      <div className="text-center text-xs text-muted-foreground">
        Showing top {deals.length} deals · Updated every sync run
      </div>
    </div>
  );
}

export default function TopDealsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [matchRoute, params] = useRoute("/app/top-deals/:slug");

  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    matchRoute ? (params as any)?.slug : null
  );

  useEffect(() => {
    if (matchRoute && (params as any)?.slug) {
      setSelectedSlug((params as any).slug);
    }
  }, [matchRoute, params]);

  const categories = useCategories();
  const popularSearches = usePopularSearches();

  const predefined = useMemo(
    () => (categories.data ?? []).filter((c: any) => c.isPredefined),
    [categories.data]
  );
  const dynamic = useMemo(
    () => (categories.data ?? []).filter((c: any) => c.isDynamic),
    [categories.data]
  );

  const handleSelectCategory = (slug: string) => {
    setSelectedSlug(slug);
    setLocation(`/app/top-deals/${slug}`);
  };

  const handleBack = () => {
    setSelectedSlug(null);
    setLocation("/app/top-deals");
  };

  return (
    <AppShell
      title="Top Deals"
      subtitle="Curated lists of the best deals updated throughout the day"
    >
      {selectedSlug ? (
        <CategoryDetail slug={selectedSlug} onBack={handleBack} />
      ) : (
        <div className="space-y-8">
          <section data-testid="curated-categories">
            <div className="mb-4 flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
                <Flame className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold">Curated Categories</h2>
                <p className="text-xs text-muted-foreground">
                  Always-on top 20 deal lists across key equipment categories
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
                {predefined.map((cat: any) => (
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
