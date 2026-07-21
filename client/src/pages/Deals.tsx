import { useEffect, useMemo, useRef, useState } from "react";
import Seo from "@/components/Seo";
import { AppShell } from "@/components/AppShell";
import { DealCard } from "@/components/DealCard";
import { DealComposer } from "@/components/DealComposer";
import { EmptyState } from "@/components/EmptyState";
import { StatPill } from "@/components/StatPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeals, useDefaultFeed } from "@/hooks/use-deals";
import { usePreferences } from "@/hooks/use-preferences";
import { useMetaConfig } from "@/hooks/use-meta";
import { useEquipmentTypes, useSubFilters, useEbaySellers, useSources, useSports } from "@/hooks/use-taxonomy";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpDown, Camera, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ExternalLink, Flame, Gift, RefreshCcw, Search, ShoppingBag, Sparkles, SlidersHorizontal, Store, Tag, TicketX, TrendingDown, X, XCircle } from "lucide-react";
import { Link } from "wouter";
import { RetailerBanner } from "@/components/RetailerBanner";
import { BrandStoreStrip } from "@/components/BrandStoreStrip";
import { DealCarousel } from "@/components/DealCarousel";
import { BASEBALL_BAT_GROUP_IDS, CANONICAL_BASEBALL_BAT_ID, CANONICAL_BASEBALL_GLOVE_ID, canonicalEquipmentTypeLabel, canonicalResultEquipmentTypeId, curateShopperEquipmentTypes } from "@shared/equipment-groups";

type SortOption = "newest" | "oldest" | "price-low" | "price-high" | "discount-high" | "a-z" | "z-a";

type FilterState = {
  q: string;
  sportId: string;
  equipmentTypeId: string;
  subFilterId: string;
  ebaySeller: string;
  condition: "all" | "new" | "preowned";
  minPercentOff: number;
  maxPrice: number;
  source: string;
  brand: string;
  priceDropOnly: boolean;
  limitValue: string;
  sortBy: SortOption;
};

const DEFAULT_FILTERS: FilterState = {
  q: "",
  sportId: "all",
  equipmentTypeId: "all",
  subFilterId: "all",
  ebaySeller: "all",
  condition: "all",
  minPercentOff: 50,
  maxPrice: 0,
  source: "all",
  brand: "all",
  priceDropOnly: false,
  limitValue: "60",
  sortBy: "newest",
};

// Mirrors the curated sports in storage.getDefaultFeed() (server/storage.ts DEFAULT_SPORTS).
const DEFAULT_FEED_SPORTS: { id: string; name: string }[] = [
  { id: "baseball", name: "Baseball" },
  { id: "fastpitch-softball", name: "Fastpitch Softball" },
  { id: "slowpitch-softball", name: "Slowpitch Softball" },
  { id: "basketball", name: "Basketball" },
  { id: "football", name: "Football" },
  { id: "soccer", name: "Soccer" },
];
const FEED_SPORT_IDS = DEFAULT_FEED_SPORTS.map((s) => s.id);
const FEED_COUNT_OPTIONS = [10, 20, 50, 100];

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export default function DealsPage() {
  const { toast } = useToast();
  const meta = useMetaConfig();
  const sports = useSports();
  const sources = useSources();
  const prefs = usePreferences();

  const [pending, setPending] = useState<FilterState>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<FilterState>(DEFAULT_FILTERS);
  const preSearchMinPercentOff = useRef<number | null>(null);
  const [photoSearching, setPhotoSearching] = useState(false);
  const [photoIdentified, setPhotoIdentified] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoSearch(file: File) {
    setPhotoSearching(true);
    setPhotoIdentified(null);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/deals/search-by-photo", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data: { q: string; sport: string; brand: string; identified: string } = await res.json();

      setPhotoIdentified(data.identified || null);

      if (!data.q && !data.sport) {
        toast({ title: "Couldn't identify item", description: data.identified || "Try a clearer photo of the product.", variant: "destructive" });
        return;
      }

      const matchedSport = data.sport
        ? (sports.data ?? []).find((s: any) =>
            s.id.toLowerCase().includes(data.sport.toLowerCase()) ||
            s.name.toLowerCase().includes(data.sport.toLowerCase())
          )
        : null;

      const updates: Partial<FilterState> = { q: data.q || "" };
      if (matchedSport) updates.sportId = matchedSport.id;
      if (data.brand && data.brand !== "all") updates.brand = data.brand;

      if (data.q) {
        preSearchMinPercentOff.current = pending.minPercentOff;
        updates.minPercentOff = 0;
      }

      setPending((p) => ({ ...p, ...updates }));
      setApplied((p) => ({ ...p, ...updates }));
    } catch (err: any) {
      toast({ title: "Photo search failed", description: err.message, variant: "destructive" });
    } finally {
      setPhotoSearching(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  const eqTypes = useEquipmentTypes(pending.sportId === "all" ? undefined : pending.sportId);
  const ebaySellersList = useEbaySellers();

  const activeEqTypeId = useMemo(() => {
    if (pending.sportId === "all" || pending.equipmentTypeId === "all") return undefined;
    return pending.equipmentTypeId;
  }, [pending.sportId, pending.equipmentTypeId]);
  const subFilters = useSubFilters(activeEqTypeId);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    featured: true,
    "twin-seam": true,
    "all-other": true,
  });
  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const [hiddenSections, setHiddenSections] = useState<string[]>([]);

  // Default-feed controls: how many deals per category + which categories to show (persisted).
  const [feedPerSport, setFeedPerSport] = useState<number>(() => {
    const v = Number(safeLocalGet("tss_feed_count"));
    return FEED_COUNT_OPTIONS.includes(v) ? v : 10;
  });
  const [feedSports, setFeedSports] = useState<string[]>(() => {
    try {
      const raw = safeLocalGet("tss_feed_sports");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.filter((id: any) => FEED_SPORT_IDS.includes(id));
      }
    } catch {}
    return [...FEED_SPORT_IDS];
  });
  useEffect(() => {
    safeLocalSet("tss_feed_count", String(feedPerSport));
  }, [feedPerSport]);
  useEffect(() => {
    safeLocalSet("tss_feed_sports", JSON.stringify(feedSports));
  }, [feedSports]);
  const toggleFeedSport = (id: string) =>
    setFeedSports((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const hasUnapplied = JSON.stringify(pending) !== JSON.stringify(applied);

  const prefsApplied = useRef(false);
  useEffect(() => {
    if (prefsApplied.current || !prefs.data) return;
    prefsApplied.current = true;
    const p = prefs.data as any;
    const updates: Partial<FilterState> = {};
    if (p.condition && p.condition !== "all") updates.condition = p.condition;
    if (p.minPercentOff != null) updates.minPercentOff = Number(p.minPercentOff);
    if (p.sportId) updates.sportId = p.sportId;
    if (Object.keys(updates).length > 0) {
      setPending((prev) => ({ ...prev, ...updates }));
      setApplied((prev) => ({ ...prev, ...updates }));
    }
    if (p.hiddenSections?.length) setHiddenSections(p.hiddenSections);
  }, [prefs.data]);

  const groupedEqTypes = useMemo(() => {
    const fetched = (eqTypes.data ?? []) as any[];
    const raw = pending.sportId === "all"
      ? [
          ...fetched.filter((type) => type.sportId !== "baseball"),
          ...curateShopperEquipmentTypes(fetched.filter((type) => type.sportId === "baseball"), "baseball"),
        ]
      : fetched;
    if (pending.sportId !== "all") return curateShopperEquipmentTypes(raw, pending.sportId);
    const groups = new Map<string, { name: string; ids: string[] }>();
    for (const t of raw) {
      const name = String(t.name);
      if (!groups.has(name)) {
        groups.set(name, { name, ids: [] });
      }
      groups.get(name)!.ids.push(...((t as any).equivalentIds ?? [String(t.id)]));
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [eqTypes.data, pending.sportId]);

  const selectedEqTypeIds = useMemo(() => {
    if (applied.equipmentTypeId === "all") return undefined;
    if (applied.sportId === "baseball" && applied.equipmentTypeId === CANONICAL_BASEBALL_BAT_ID) {
      return BASEBALL_BAT_GROUP_IDS.join(",");
    }
    if (applied.sportId !== "all") return undefined;
    const group = groupedEqTypes.find((g: any) => g.name === applied.equipmentTypeId);
    if (group && (group as any).ids) return (group as any).ids.join(",");
    return undefined;
  }, [applied.equipmentTypeId, applied.sportId, groupedEqTypes]);

  const brandsQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (pending.sportId !== "all") params.set("sportId", pending.sportId);
    if (pending.equipmentTypeId !== "all" && pending.sportId !== "all") params.set("equipmentTypeId", pending.equipmentTypeId);
    if (pending.source !== "all") params.set("source", pending.source);
    if (pending.condition !== "all") params.set("condition", pending.condition);
    if (pending.minPercentOff > 0) params.set("minPercentOff", String(pending.minPercentOff));
    return params.toString();
  }, [pending.sportId, pending.equipmentTypeId, pending.source, pending.condition, pending.minPercentOff]);

  const { data: popularProductsData } = useQuery<any[]>({
    queryKey: ["/api/popular-products"],
  });

  const brandsQuery = useQuery<string[]>({
    queryKey: ["/api/deals/brands", brandsQueryParams],
    queryFn: async () => {
      const res = await fetch(`/api/deals/brands${brandsQueryParams ? `?${brandsQueryParams}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch brands");
      return res.json();
    },
  });

  const isDefaultView = useMemo(() => {
    return (
      !applied.q.trim() &&
      applied.sportId === "all" &&
      applied.equipmentTypeId === "all" &&
      applied.subFilterId === "all" &&
      applied.ebaySeller === "all" &&
      applied.source === "all" &&
      applied.brand === "all" &&
      !applied.priceDropOnly &&
      applied.maxPrice === 0 &&
      applied.minPercentOff === 50 &&
      applied.sortBy === "newest"
    );
  }, [applied]);

  const queryInput = useMemo(
    () => ({
      q: applied.q.trim() ? applied.q.trim() : undefined,
      sportId: applied.sportId === "all" ? undefined : applied.sportId,
      equipmentTypeId: applied.equipmentTypeId === "all" || selectedEqTypeIds ? undefined : (applied.sportId !== "all" ? applied.equipmentTypeId : undefined),
      equipmentTypeIds: selectedEqTypeIds,
      subFilterId: applied.subFilterId === "all" ? undefined : applied.subFilterId,
      ebaySeller: applied.ebaySeller === "all" ? undefined : applied.ebaySeller,
      condition: applied.condition,
      minPercentOff: applied.minPercentOff,
      maxPrice: applied.maxPrice > 0 ? applied.maxPrice : undefined,
      source: applied.source === "all" ? undefined : applied.source,
      brand: applied.brand === "all" ? undefined : applied.brand,
      priceDropOnly: applied.priceDropOnly || undefined,
      featured: undefined,
      limit: applied.limitValue === "all" ? "all" as const : Number(applied.limitValue),
      sortBy: applied.sortBy,
    }),
    [applied, selectedEqTypeIds],
  );

  // Normalize to canonical order so equivalent selections share one query-cache entry.
  const feedSportsCanonical = useMemo(
    () => FEED_SPORT_IDS.filter((id) => feedSports.includes(id)),
    [feedSports],
  );
  const defaultFeed = useDefaultFeed({ perSport: feedPerSport, sportIds: feedSportsCanonical });
  const deals = useDeals(isDefaultView ? null : queryInput);
  const featuredDeals = useDeals({
    ...queryInput,
    featured: true,
    limit: 12,
  });
  const twinSeamQuery = useDeals({
    ...(isDefaultView ? {} : queryInput),
    source: "twin-seam-sports",
    limit: 24,
  });

  const bonusDealsQuery = useQuery<any[]>({
    queryKey: ["/api/bonus-deals"],
  });

  const sourceById = useMemo(() => {
    const m = new Map<string, any>();
    (sources.data ?? []).forEach((s: any) => m.set(s.id, s));
    return m;
  }, [sources.data]);

  const ourStoreId = meta.data?.featuredRules?.ourStoreSourceId;

  const featured = useMemo(() => {
    return (featuredDeals.data ?? []) as any[];
  }, [featuredDeals.data]);

  const twinSeamDeals = useMemo(() => {
    const tsRaw = (twinSeamQuery.data ?? []) as any[];
    const featuredIds = new Set(featured.map((d: any) => d.id));
    return tsRaw.filter((d: any) => !featuredIds.has(d.id));
  }, [twinSeamQuery.data, featured]);

  const restDeals = useMemo(() => {
    const all = deals.data ?? [];
    const featuredIds = new Set(featured.map((d: any) => d.id));
    const excludeSourceIds = new Set(["twin-seam-sports", ourStoreId].filter(Boolean));
    return (all as any[]).filter((d: any) =>
      !featuredIds.has(d.id) && !excludeSourceIds.has(d.sourceId)
    );
  }, [deals.data, featured, ourStoreId]);

  const eqTypeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of (eqTypes.data ?? []) as any[]) {
      m.set(t.id, t.name);
    }
    m.set(CANONICAL_BASEBALL_GLOVE_ID, "Baseball Gloves");
    return m;
  }, [eqTypes.data]);

  const aiSuggestionParams = useMemo(() => {
    const sport = applied.sportId !== "all" ? applied.sportId : "";
    const eqName = applied.equipmentTypeId !== "all"
      ? (applied.sportId !== "all" ? (eqTypeMap.get(applied.equipmentTypeId) ?? applied.equipmentTypeId) : applied.equipmentTypeId)
      : "";
    const q = applied.q.trim();
    const p = new URLSearchParams();
    if (sport) p.set("sport", sport);
    if (eqName) p.set("equipmentType", eqName);
    if (q) p.set("q", q);
    return p.toString();
  }, [applied.sportId, applied.equipmentTypeId, applied.q, eqTypeMap]);

  const aiSuggestionsQuery = useQuery<{ suggestions: any[]; keywords: string[] }>({
    queryKey: ["/api/deals/ai-suggestions", aiSuggestionParams],
    queryFn: async () => {
      const res = await fetch(`/api/deals/ai-suggestions?${aiSuggestionParams}`);
      if (!res.ok) throw new Error("Failed to fetch AI suggestions");
      return res.json();
    },
    enabled: !deals.isLoading && !!deals.data && restDeals.length === 0 && !isDefaultView && !!aiSuggestionParams,
    staleTime: 5 * 60 * 1000,
  });

  const groupedDeals = useMemo(() => {
    if (!restDeals.length) return [];
    const groups = new Map<string, { name: string; deals: any[] }>();
    for (const d of restDeals) {
      const key = canonicalResultEquipmentTypeId(d.sportId, d.equipmentTypeId);
      if (!groups.has(key)) {
        groups.set(key, { name: canonicalEquipmentTypeLabel(key, eqTypeMap.get(key) ?? key), deals: [] });
      }
      groups.get(key)!.deals.push(d);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [restDeals, eqTypeMap]);

  const loading = (isDefaultView ? defaultFeed.isLoading : deals.isLoading) || twinSeamQuery.isLoading || sports.isLoading || sources.isLoading || meta.isLoading;

  const subtitle = meta.data
    ? `Drops at ${meta.data.scheduled.times.join(" · ")} (${meta.data.scheduled.timezone}). Default: 50%+ off, all conditions.`
    : "Filter by sport, equipment, condition, and percent-off — then open the deal instantly.";

  return (
    <AppShell
      title="Deals feed"
      subtitle={subtitle}
      rightSlot={
        <div className="flex flex-wrap items-center gap-2">
          <DealComposer
            sources={sources.data as any}
            defaultSourceId={ourStoreId}
            data-testid="deal-create"
          />
          <Button
            variant="secondary"
            onClick={() => {
              featuredDeals.refetch();
              twinSeamQuery.refetch();
              deals.refetch();
              defaultFeed.refetch();
            }}
            className="ring-focus rounded-xl"
            data-testid="refresh"
          >
            <RefreshCcw className={cn("mr-2 h-4 w-4", (deals.isFetching || featuredDeals.isFetching || twinSeamQuery.isFetching || defaultFeed.isFetching) && "animate-spin")} />
            Refresh
          </Button>
        </div>
      }
    >
      <Seo title="Deals — TwinSeam Deals" description="Browse sporting goods deals and filter by sport, equipment type, condition, and percent off." />

      {/* Retailer Banner Carousel */}
      <RetailerBanner />

      {/* Brand & Store Scrolling Strip */}
      <BrandStoreStrip />

      {/* Browse by Sport bar */}
      <div className="card-elevated animate-float-in p-3 md:p-4" data-testid="browse-by-sport-bar">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Browse by Sport</span>
          </div>
          <Link href="/deals">
            <Button variant="ghost" size="sm" className="text-xs h-7 rounded-lg" data-testid="link-browse-all-deals">
              All Sports & Brands
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { name: "Baseball", slug: "baseball" },
            { name: "Basketball", slug: "basketball" },
            { name: "Football", slug: "football" },
            { name: "Golf", slug: "golf" },
            { name: "Soccer", slug: "soccer" },
            { name: "Tennis", slug: "tennis" },
            { name: "Fishing", slug: "fishing" },
            { name: "Hockey", slug: "hockey" },
            { name: "Softball", slug: "fastpitch-softball" },
            { name: "Lacrosse", slug: "lacrosse" },
          ].map((sport) => (
            <Link
              key={sport.slug}
              href={`/deals/${sport.slug}`}
              className="rounded-lg border border-border bg-background/60 px-2.5 py-1 text-xs font-medium hover:bg-primary/5 hover:border-primary/30 transition-all"
              data-testid={`browse-sport-${sport.slug}`}
            >
              {sport.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Popular Products */}
      {popularProductsData && popularProductsData.length > 0 && (
        <div className="card-elevated animate-float-in p-3 md:p-4" data-testid="popular-products-bar">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">Popular Products</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {popularProductsData.map((product: any) => (
              <Link
                key={product.slug}
                href={`/deals/${product.slug}`}
                className="rounded-lg border border-border bg-background/60 px-2.5 py-1 text-xs font-medium hover:bg-accent/5 hover:border-accent/30 transition-all"
                data-testid={`browse-product-${product.slug}`}
              >
                {product.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <section className="card-elevated animate-float-in p-5 md:p-6" data-testid="filters">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background/60 shadow-sm">
                <ArrowDownWideNarrow className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-display text-lg font-bold">Filters</div>
                <div className="text-xs text-muted-foreground">Adjust then click Apply to update results.</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isDefaultView && (
                <button
                  type="button"
                  onClick={() => { setPending(DEFAULT_FILTERS); setApplied(DEFAULT_FILTERS); }}
                  className="flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
                  data-testid="clear-all-filters"
                >
                  <X className="h-3 w-3" /> Clear all filters
                </button>
              )}
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-xl border border-border bg-background/60 px-3 py-1.5 text-xs font-semibold md:hidden"
                onClick={() => setMobileFiltersOpen((v) => !v)}
                data-testid="toggle-mobile-filters"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {mobileFiltersOpen ? "Hide filters" : "Show filters"}
              </button>
              <StatPill label="Min off" value={`${applied.minPercentOff}%`} tone="primary" data-testid="pill-minoff" />
              {applied.maxPrice > 0 && <StatPill label="Max price" value={`$${applied.maxPrice}`} tone="primary" data-testid="pill-maxprice" />}
              <StatPill label="Condition" value={applied.condition} tone="neutral" data-testid="pill-condition" />
            </div>
          </div>
          <div className={cn(mobileFiltersOpen ? "block" : "hidden md:block")}>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-2">
              <Label htmlFor="q">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="q"
                  value={pending.q}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val.trim()) setPhotoIdentified(null);
                    setPending((p) => {
                      const next = { ...p, q: val };
                      if (val.trim()) {
                        if (preSearchMinPercentOff.current === null) {
                          preSearchMinPercentOff.current = p.minPercentOff;
                        }
                        next.minPercentOff = 0;
                      } else if (preSearchMinPercentOff.current !== null) {
                        next.minPercentOff = preSearchMinPercentOff.current;
                        preSearchMinPercentOff.current = null;
                      }
                      return next;
                    });
                  }}
                  placeholder="Gloves, bats, cleats…"
                  className="ring-focus rounded-xl pl-9 pr-10"
                  data-testid="search"
                />
                <button
                  type="button"
                  title="Search by photo"
                  disabled={photoSearching}
                  onClick={() => photoInputRef.current?.click()}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  data-testid="button-photo-search"
                >
                  {photoSearching ? (
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhotoSearch(file);
                  }}
                  data-testid="input-photo-file"
                />
              </div>
              {photoSearching && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
                  <Sparkles className="h-3 w-3" />
                  Analyzing photo…
                </p>
              )}
              {photoIdentified && !photoSearching && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-400/20">
                    <Sparkles className="h-3 w-3" />
                    {photoIdentified}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoIdentified(null);
                      setPending((p) => ({ ...p, q: "", sportId: "all", brand: "all", minPercentOff: DEFAULT_FILTERS.minPercentOff }));
                      setApplied((p) => ({ ...p, q: "", sportId: "all", brand: "all", minPercentOff: DEFAULT_FILTERS.minPercentOff }));
                      preSearchMinPercentOff.current = null;
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-clear-photo-search"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Sport</Label>
                <Select value={pending.sportId} onValueChange={(v) => { setPending((p) => ({ ...p, sportId: v, equipmentTypeId: "all", subFilterId: "all", brand: "all" })); }}>
                  <SelectTrigger className="ring-focus rounded-xl" data-testid="sport">
                    <SelectValue placeholder="All sports" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sports</SelectItem>
                    {(sports.data ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Equipment type</Label>
                <Select value={pending.equipmentTypeId} onValueChange={(v) => { setPending((p) => ({ ...p, equipmentTypeId: v, subFilterId: "all" })); }}>
                  <SelectTrigger className="ring-focus rounded-xl" data-testid="equipmentType">
                    <SelectValue placeholder="All equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All equipment</SelectItem>
                    {pending.sportId === "all"
                      ? groupedEqTypes.map((g: any) => (
                          <SelectItem key={g.name} value={g.name} data-testid={`eqtype-${g.name}`}>
                            {g.name}
                          </SelectItem>
                        ))
                      : groupedEqTypes.map((t: any) => (
                          <SelectItem key={t.id} value={t.id} data-testid={`eqtype-${t.id}`}>
                            {t.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {activeEqTypeId && (subFilters.data ?? []).length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2">
                <Label>Sub-filter</Label>
                <Select value={pending.subFilterId} onValueChange={(v) => { setPending((p) => ({ ...p, subFilterId: v })); }}>
                  <SelectTrigger className="ring-focus rounded-xl" data-testid="subFilter">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {(subFilters.data ?? []).map((sf: any) => (
                      <SelectItem key={sf.id} value={sf.id} data-testid={`subfilter-${sf.id}`}>
                        {sf.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <div className="grid gap-2">
              <Label>Sort by</Label>
              <Select value={pending.sortBy} onValueChange={(v) => { setPending((p) => ({ ...p, sortBy: v as SortOption })); }}>
                <SelectTrigger className="ring-focus rounded-xl" data-testid="sort">
                  <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Newest" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="price-low">Price: Low to High</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                  <SelectItem value="discount-high">Discount: High to Low</SelectItem>
                  <SelectItem value="a-z">Name: A to Z</SelectItem>
                  <SelectItem value="z-a">Name: Z to A</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Condition</Label>
              <Select value={pending.condition} onValueChange={(v) => { setPending((p) => ({ ...p, condition: v as any })); }}>
                <SelectTrigger className="ring-focus rounded-xl" data-testid="condition">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="preowned">Preowned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Source</Label>
              <Select value={pending.source} onValueChange={(v) => { setPending((p) => ({ ...p, source: v })); }}>
                <SelectTrigger className="ring-focus rounded-xl" data-testid="source">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const priorityOrder = ["twin-seam-sports", "ebay", "dicks-sporting-goods", "golf-galaxy", "name-of-the-game", "baseball-resale"];
                    const all = sources.data ?? [];
                    const priority = priorityOrder
                      .map((id) => all.find((s: any) => s.id === id))
                      .filter(Boolean) as any[];
                    const rest = all
                      .filter((s: any) => !priorityOrder.includes(s.id))
                      .sort((a: any, b: any) => a.name.localeCompare(b.name));
                    const ordered = [...priority, { id: "__divider__", name: "" }, ...rest];
                    return ordered.map((s: any) => {
                      if (s.id === "__divider__") {
                        return <SelectItem key="all" value="all">All sources</SelectItem>;
                      }
                      return (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}{s.isOurStore ? " (Our store)" : ""}
                        </SelectItem>
                      );
                    });
                  })()}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Brand</Label>
              <Select value={pending.brand} onValueChange={(v) => { setPending((p) => ({ ...p, brand: v })); }}>
                <SelectTrigger className="ring-focus rounded-xl" data-testid="brand">
                  <Tag className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="All brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {(brandsQuery.data ?? []).map((b) => (
                    <SelectItem key={b} value={b} data-testid={`brand-${b}`}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(ebaySellersList.data ?? []).length > 0 && (
              <div className="grid gap-2">
                <Label>eBay Seller</Label>
                <Select value={pending.ebaySeller} onValueChange={(v) => { setPending((p) => ({ ...p, ebaySeller: v })); }}>
                  <SelectTrigger className="ring-focus rounded-xl" data-testid="ebaySeller">
                    <SelectValue placeholder="All sellers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sellers</SelectItem>
                    {(ebaySellersList.data ?? []).map((seller: any) => (
                      <SelectItem key={seller.id} value={seller.username} data-testid={`ebay-seller-${seller.username}`}>
                        {seller.username}{seller.notes ? ` (${seller.notes})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Min % off</Label>
              <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{pending.minPercentOff}%</div>
                  <div className="text-xs text-muted-foreground">0–100</div>
                </div>
                <Slider
                  value={[pending.minPercentOff]}
                  onValueChange={(v) => { setPending((p) => ({ ...p, minPercentOff: v[0] ?? 50 })); }}
                  min={0}
                  max={100}
                  step={1}
                  className="mt-2"
                  data-testid="minPercentOff"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Max price</Label>
              <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{pending.maxPrice === 0 ? "No limit" : `$${pending.maxPrice}`}</div>
                  <div className="text-xs text-muted-foreground">$0–$1,000</div>
                </div>
                <Slider
                  value={[pending.maxPrice]}
                  onValueChange={(v) => { setPending((p) => ({ ...p, maxPrice: v[0] ?? 0 })); }}
                  min={0}
                  max={1000}
                  step={10}
                  className="mt-2"
                  data-testid="maxPrice"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Results limit</Label>
              <Select value={pending.limitValue} onValueChange={(v) => { setPending((p) => ({ ...p, limitValue: v })); }}>
                <SelectTrigger className="ring-focus rounded-xl" data-testid="limit">
                  <SelectValue placeholder="60" />
                </SelectTrigger>
                <SelectContent>
                  {[30, 60, 90, 120, 200].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Price Drops</Label>
              <Button
                variant={pending.priceDropOnly ? "default" : "outline"}
                onClick={() => { setPending((p) => ({ ...p, priceDropOnly: !p.priceDropOnly })); }}
                className="ring-focus rounded-xl justify-start gap-2"
                data-testid="filter-price-drop"
              >
                {pending.priceDropOnly
                  ? <><CheckCircle2 className="h-4 w-4 shrink-0" /><span>Price Drops Only — ON</span></>
                  : <><TrendingDown className="h-4 w-4 shrink-0" /><span>Price Drops Only — OFF</span></>
                }
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPending(DEFAULT_FILTERS)}
              className="ring-focus rounded-xl text-muted-foreground"
              data-testid="reset-pending"
            >
              Reset
            </Button>
            <Button
              onClick={() => setApplied(pending)}
              disabled={!hasUnapplied}
              className={cn("ring-focus rounded-xl gap-2", hasUnapplied && "ring-2 ring-primary/40")}
              data-testid="apply-filters"
            >
              {hasUnapplied ? "Apply Filters" : "Filters Applied"}
            </Button>
          </div>
          </div>
        </div>
      </section>

      <p className="text-xs text-muted-foreground/70 text-center" data-testid="text-affiliate-disclosure">
        As an affiliate, TSSDeals may earn a commission on purchases made through links on this site at no extra cost to you.
      </p>

      {/* Featured - only shown when admin has curated deals */}
      {featured.length > 0 && (
        <section className="animate-float-in stagger-2" data-testid="featured">
          <button
            type="button"
            onClick={() => toggleSection("featured")}
            className="mb-3 flex w-full items-center justify-between gap-2 text-left"
            data-testid="toggle-featured"
          >
            <div className="flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent/70 shadow-lg shadow-accent/20">
                <Flame className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Featured</div>
                <div className="text-xs text-muted-foreground">
                  {featured.length} hand-picked deals from across the web
                </div>
              </div>
            </div>
            {collapsedSections["featured"] ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronUp className="h-5 w-5 text-muted-foreground" />}
          </button>

          {!collapsedSections["featured"] && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {featured.map((d: any, idx: number) => (
                <div key={d.id} className={cn("animate-float-in", idx % 5 === 0 ? "stagger-1" : idx % 5 === 1 ? "stagger-2" : idx % 5 === 2 ? "stagger-3" : idx % 5 === 3 ? "stagger-4" : "stagger-5")}>
                  <DealCard
                    deal={d}
                    featured
                    ourStore={ourStoreId ? d.sourceId === ourStoreId : Boolean(sourceById.get(d.sourceId)?.isOurStore)}
                    sourceName={sourceById.get(d.sourceId)?.name}
                    data-testid={`featured-deal-${idx}`}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Twin Seam Sports */}
      {twinSeamDeals.length > 0 && (
        <section className="animate-float-in stagger-3" data-testid="twin-seam-section">
          <button
            type="button"
            onClick={() => toggleSection("twin-seam")}
            className="mb-3 flex w-full items-center justify-between gap-2 text-left"
            data-testid="toggle-twin-seam"
          >
            <div className="flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
                <Store className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Twin Seam Sports</div>
                <div className="text-xs text-muted-foreground">
                  Showing {twinSeamDeals.length} deals from our store
                </div>
              </div>
            </div>
            {collapsedSections["twin-seam"] ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronUp className="h-5 w-5 text-muted-foreground" />}
          </button>

          {!collapsedSections["twin-seam"] && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {twinSeamDeals.map((d: any, idx: number) => (
                <div key={d.id} className={cn("animate-float-in", idx % 5 === 0 ? "stagger-1" : idx % 5 === 1 ? "stagger-2" : idx % 5 === 2 ? "stagger-3" : idx % 5 === 3 ? "stagger-4" : "stagger-5")}>
                  <DealCard
                    deal={d}
                    featured={false}
                    ourStore={true}
                    sourceName={sourceById.get(d.sourceId)?.name ?? "Twin Seam Sports"}
                    data-testid={`ts-deal-${idx}`}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}


      {isDefaultView ? (
        <section className="animate-float-in stagger-4 space-y-6" data-testid="default-feed">
          <div className="rounded-2xl border border-border bg-card/50 p-3 sm:p-4" data-testid="default-feed-controls">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-semibold text-muted-foreground">Categories</span>
                {DEFAULT_FEED_SPORTS.map((s) => {
                  const active = feedSports.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleFeedSport(s.id)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                      data-testid={`chip-category-${s.id}`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 lg:shrink-0">
                <span className="text-xs font-semibold text-muted-foreground">Show</span>
                <Select value={String(feedPerSport)} onValueChange={(v) => setFeedPerSport(Number(v))}>
                  <SelectTrigger className="h-8 w-[104px] rounded-xl text-xs" data-testid="select-feed-count">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEED_COUNT_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>Top {n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">per category</span>
              </div>
            </div>
          </div>

          {feedSports.length === 0 ? (
            <EmptyState
              icon={SlidersHorizontal}
              title="Choose a category"
              description="Pick at least one category above to see today's top deals."
            />
          ) : defaultFeed.isError ? (
            <EmptyState
              icon={TicketX}
              title="Couldn't load deals"
              description={(defaultFeed.error as any)?.message ?? "Unknown error"}
              action={
                <Button onClick={() => defaultFeed.refetch()} className="ring-focus rounded-xl" data-testid="retry">
                  Try again
                </Button>
              }
            />
          ) : !loading && (defaultFeed.data ?? []).length === 0 ? (
            <EmptyState
              icon={TicketX}
              title="No deals available"
              description="Check back soon — deals sync throughout the day."
            />
          ) : (
            (defaultFeed.data ?? []).map((group) => (
              <div key={group.sportId} data-testid={`sport-group-${group.sportId}`}>
                <button
                  type="button"
                  onClick={() => toggleSection(`sport-${group.sportId}`)}
                  className="mb-3 flex w-full items-center justify-between gap-2 text-left"
                  data-testid={`toggle-sport-${group.sportId}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background/60 shadow-sm">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-display text-xl font-bold">{group.sportName}</div>
                      <div className="text-xs text-muted-foreground">
                        Top {group.deals.length} deals by discount
                      </div>
                    </div>
                  </div>
                  {collapsedSections[`sport-${group.sportId}`] ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronUp className="h-5 w-5 text-muted-foreground" />}
                </button>
                {!collapsedSections[`sport-${group.sportId}`] && (
                  <DealCarousel
                    deals={group.deals}
                    sportId={group.sportId}
                    sourceById={sourceById}
                    ourStoreId={ourStoreId}
                  />
                )}
              </div>
            ))
          )}
        </section>
      ) : (
      <section className="animate-float-in stagger-4" data-testid="feed">
        <button
          type="button"
          onClick={() => toggleSection("all-other")}
          className="mb-3 flex w-full items-center justify-between gap-2 text-left"
          data-testid="toggle-all-other"
        >
          <div>
            <div className="font-display text-xl font-bold">All Other Deals</div>
            <div className="text-xs text-muted-foreground">
              Showing {restDeals.length} results
              {applied.sortBy !== "newest" && ` · Sorted by ${
                applied.sortBy === "oldest" ? "oldest first" :
                applied.sortBy === "price-low" ? "price (low to high)" :
                applied.sortBy === "price-high" ? "price (high to low)" :
                applied.sortBy === "discount-high" ? "discount (high to low)" :
                applied.sortBy === "a-z" ? "name (A–Z)" : "name (Z–A)"
              }`}
            </div>
          </div>
          {collapsedSections["all-other"] ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronUp className="h-5 w-5 text-muted-foreground" />}
        </button>

        {collapsedSections["all-other"] ? null : deals.isError ? (
          <EmptyState
            icon={TicketX}
            title="Couldn’t load deals"
            description={(deals.error as any)?.message ?? "Unknown error"}
            action={
              <Button onClick={() => deals.refetch()} className="ring-focus rounded-xl" data-testid="retry">
                Try again
              </Button>
            }
          />
        ) : !loading && restDeals.length === 0 ? (
          <div className="space-y-5" data-testid="empty-with-ai">
            <div className="rounded-2xl border border-dashed border-muted-foreground/25 bg-muted/20 px-6 py-8 text-center">
              <TicketX className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <div className="font-semibold text-base mb-1">No exact matches for these filters</div>
              <div className="text-sm text-muted-foreground mb-4">Try loosening your filters, or see AI-suggested deals below.</div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setPending(DEFAULT_FILTERS); setApplied(DEFAULT_FILTERS); }}
                className="ring-focus rounded-xl"
                data-testid="reset"
              >
                Reset filters
              </Button>
            </div>
            {aiSuggestionsQuery.isLoading ? (
              <div className="rounded-2xl border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                  <span className="text-sm font-semibold">AI is finding related deals…</span>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-32 rounded-xl bg-muted/40 animate-pulse" />
                  ))}
                </div>
              </div>
            ) : aiSuggestionsQuery.data?.suggestions?.length ? (
              <div className="rounded-2xl border bg-card p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">AI-Suggested Deals</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Based on your filters, our AI found these related deals you might like.
                </p>
                {aiSuggestionsQuery.data.keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {aiSuggestionsQuery.data.keywords.map((kw) => (
                      <span key={kw} className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {aiSuggestionsQuery.data.suggestions.map((d: any, idx: number) => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      featured={false}
                      ourStore={ourStoreId ? d.sourceId === ourStoreId : Boolean(sourceById.get(d.sourceId)?.isOurStore)}
                      sourceName={sourceById.get(d.sourceId)?.name}
                      data-testid={`ai-suggestion-${idx}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedDeals.map((group) => (
              <div key={group.name} data-testid={`group-${group.name}`}>
                <div className="mb-3 flex items-center gap-2">
                  <div className="font-display text-base font-semibold">{group.name}</div>
                  <span className="text-xs text-muted-foreground">({group.deals.length})</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {group.deals.map((d: any, idx: number) => (
                    <div key={d.id} className="animate-float-in">
                      <DealCard
                        deal={d}
                        featured={false}
                        ourStore={ourStoreId ? d.sourceId === ourStoreId : Boolean(sourceById.get(d.sourceId)?.isOurStore)}
                        sourceName={sourceById.get(d.sourceId)?.name}
                        data-testid={`deal-${group.name}-${idx}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {(bonusDealsQuery.data ?? []).length > 0 && (
        <section className="mt-8" data-testid="bonus-deals-section">
          <button
            onClick={() => setCollapsedSections((prev) => ({ ...prev, "bonus-deals": !prev["bonus-deals"] }))}
            className="mb-3 flex w-full items-center justify-between gap-2 text-left"
            data-testid="toggle-bonus-deals"
          >
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-pink-500" />
              <div>
                <div className="font-display text-xl font-bold">Bonus Deals</div>
                <div className="text-xs text-muted-foreground">
                  Non-sporting goods deals we think you'll love
                </div>
              </div>
            </div>
            {collapsedSections["bonus-deals"] ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronUp className="h-5 w-5 text-muted-foreground" />}
          </button>

          {!collapsedSections["bonus-deals"] && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(bonusDealsQuery.data ?? []).map((deal: any) => (
                <a
                  key={deal.id}
                  href={deal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group card-elevated animate-float-in overflow-visible rounded-xl p-4 hover-elevate"
                  data-testid={`bonus-deal-card-${deal.id}`}
                >
                  {deal.imageUrl && (
                    <div className="mb-3 aspect-square w-full overflow-hidden rounded-lg bg-muted">
                      <img
                        src={deal.imageUrl}
                        alt={deal.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {deal.brand && (
                      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{deal.brand}</div>
                    )}
                    <div className="text-sm font-semibold leading-snug line-clamp-2">{deal.title}</div>
                    {deal.description && (
                      <div className="text-xs text-muted-foreground line-clamp-2">{deal.description}</div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        ${(deal.priceCents / 100).toFixed(2)}
                      </span>
                      {deal.originalPriceCents && (
                        <span className="text-sm text-muted-foreground line-through">
                          ${(deal.originalPriceCents / 100).toFixed(2)}
                        </span>
                      )}
                      {deal.originalPriceCents && deal.priceCents < deal.originalPriceCents && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {Math.round((1 - deal.priceCents / deal.originalPriceCents) * 100)}% off
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                      <ExternalLink className="h-3 w-3" />
                      View Deal
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
