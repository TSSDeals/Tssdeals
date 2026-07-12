import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Seo from "@/components/Seo";
import { AppShell } from "@/components/AppShell";
import { DealCard } from "@/components/DealCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeals } from "@/hooks/use-deals";
import { useSports } from "@/hooks/use-taxonomy";
import { cn } from "@/lib/utils";
import { ArrowUpDown, Loader2, RefreshCcw, Search, Store } from "lucide-react";

type SortOption = "newest" | "oldest" | "price-low" | "price-high" | "discount-high" | "a-z" | "z-a";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function FanaticsPage() {
  const [sportId, setSportId] = useState<string>("all");
  const [searchQ, setSearchQ] = useState("");
  const debouncedSearch = useDebounce(searchQ, 400);
  const [sortBy, setSortBy] = useState<SortOption>("discount-high");
  const sports = useSports();

  const queryInput: any = {};
  if (sportId && sportId !== "all") queryInput.sportId = sportId;
  if (debouncedSearch.trim()) queryInput.q = debouncedSearch.trim();

  const dealsQuery = useDeals({
    ...queryInput,
    source: "fanatics",
    currency: "USD",
    limit: 200,
  });

  const sortedDeals = useMemo(() => {
    const list = [...((dealsQuery.data ?? []) as any[])];
    switch (sortBy) {
      case "newest":
        list.sort((a, b) => new Date(b.foundAt).getTime() - new Date(a.foundAt).getTime());
        break;
      case "oldest":
        list.sort((a, b) => new Date(a.foundAt).getTime() - new Date(b.foundAt).getTime());
        break;
      case "price-low":
        list.sort((a, b) => Number(a.currentPrice) - Number(b.currentPrice));
        break;
      case "price-high":
        list.sort((a, b) => Number(b.currentPrice) - Number(a.currentPrice));
        break;
      case "discount-high":
        list.sort((a, b) => Number(b.percentOff ?? 0) - Number(a.percentOff ?? 0));
        break;
      case "a-z":
        list.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
        break;
      case "z-a":
        list.sort((a, b) => (b.title ?? "").localeCompare(a.title ?? ""));
        break;
    }
    return list;
  }, [dealsQuery.data, sortBy]);

  const loading = dealsQuery.isLoading || sports.isLoading;

  return (
    <AppShell
      title="MLB Shop & Fanatics"
      subtitle="Licensed jerseys, gear & fan merchandise from Fanatics and MLB Shop"
      rightSlot={
        <Button
          variant="secondary"
          onClick={() => dealsQuery.refetch()}
          className="ring-focus rounded-xl"
          data-testid="fanatics-refresh"
        >
          <RefreshCcw className={cn("mr-2 h-4 w-4", dealsQuery.isFetching && "animate-spin")} />
          Refresh
        </Button>
      }
    >
      <Seo title="Fanatics & MLB Shop — TwinSeam Deals" description="Browse licensed sports gear, jerseys, and fan merchandise from Fanatics and MLB Shop at great prices." />

      <section className="card-elevated animate-float-in p-5 md:p-6" data-testid="fanatics-filters">
        <div className="flex items-center gap-2 mb-4">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 to-blue-500 shadow-lg shadow-blue-600/20">
            <Store className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-display text-lg font-bold">Browse Fanatics</div>
            <div className="text-xs text-muted-foreground">Filter by sport or search for specific gear</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="fanatics-search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="fanatics-search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search jerseys, gear..."
                className="pl-9 ring-focus rounded-xl text-sm"
                data-testid="fanatics-search-input"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Sport</Label>
            <Select value={sportId} onValueChange={setSportId}>
              <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="fanatics-sport-select">
                <SelectValue placeholder="All sports" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sports</SelectItem>
                {((sports.data ?? []) as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Sort by</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="fanatics-sort-select">
                <ArrowUpDown className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discount-high">Biggest Discount</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="price-low">Price: Low → High</SelectItem>
                <SelectItem value="price-high">Price: High → Low</SelectItem>
                <SelectItem value="a-z">A → Z</SelectItem>
                <SelectItem value="z-a">Z → A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-16" data-testid="fanatics-loading">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : dealsQuery.isError ? (
        <EmptyState
          icon={Store}
          title="Failed to load deals"
          description="Something went wrong loading Fanatics deals. Try refreshing."
          data-testid="fanatics-error"
        />
      ) : sortedDeals.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No Fanatics deals found"
          description={searchQ || sportId !== "all" ? "Try adjusting your search or sport filter." : "Fanatics deals will appear here after syncing."}
          data-testid="fanatics-empty"
        />
      ) : (
        <section className="animate-float-in stagger-2" data-testid="fanatics-deals-grid">
          <div className="mb-3 text-sm text-muted-foreground">{sortedDeals.length} deals found</div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {sortedDeals.map((d: any, idx: number) => (
              <div
                key={d.id}
                className={cn(
                  "animate-float-in",
                  idx % 5 === 0 ? "stagger-1" : idx % 5 === 1 ? "stagger-2" : idx % 5 === 2 ? "stagger-3" : idx % 5 === 3 ? "stagger-4" : "stagger-5"
                )}
              >
                <DealCard
                  deal={d}
                  featured={false}
                  ourStore={false}
                  sourceName="Fanatics"
                  data-testid={`fanatics-deal-${idx}`}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
