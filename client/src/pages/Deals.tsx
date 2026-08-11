import { useEffect, useMemo, useRef, useState } from "react";
import Seo from "@/components/Seo";
import { AppShell } from "@/components/AppShell";
import { DealCard } from "@/components/DealCard";
import { DealComposer } from "@/components/DealComposer";
import { EmptyState } from "@/components/EmptyState";
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
import { cn, outboundRetailerUrl } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Camera, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Flame, Gift, RefreshCcw, Search, ShoppingBag, Sparkles, SlidersHorizontal, Store, Tag, TicketX, TrendingDown, X, XCircle } from "lucide-react";
import { Link } from "wouter";
import { DealCarousel } from "@/components/DealCarousel";
import { DealsSearchHero } from "@/components/DealsSearchHero";
import { EliteGloveCorner } from "@/components/EliteGloveCorner";
import {
  BASEBALL_BAT_GROUP_IDS,
  CANONICAL_BASEBALL_BAT_ID,
  CANONICAL_BASEBALL_GLOVE_ID,
  SHOPPER_MEMORABILIA_SPORT_ID,
  canonicalEquipmentTypeLabel,
  curateShopperEquipmentTypes,
  curateShopperSports,
  isVirtualShopperEquipmentId,
  normalizeShopperSportId,
  shopperResultEquipmentTypeId,
} from "@shared/equipment-groups";
import {
  BASELINE_SPORTS_NAME,
  BASELINE_SPORTS_URL,
  TWIN_SEAM_SOURCE_ID,
} from "@shared/retailer-programs";
import {
  buildZeroResultRecovery,
  type SearchRecoveryAction,
} from "@shared/search-language";
import {
  SHOPPER_STARTER_SEARCHES,
  addRecentShopperSearch,
  groupShopperSubFilters,
  parseRecentShopperSearches,
} from "@shared/shopper-search-ux";
import { dealsQueryFromSearch, searchWithDealsQuery } from "@/lib/deals-url-state";
import { chooseStarterVisuals } from "@/lib/homepage-affiliate-visuals";
import {
  DEALS_PAGE_SIZE,
  DEALS_PAGE_SIZE_OPTIONS,
  dealsPageNumber,
  mayHaveNextDealsPage,
  nextDealsOffset,
} from "@/lib/deals-pagination";

type SortOption = "newest" | "oldest" | "price-low" | "price-high" | "delivered-low" | "discount-high" | "a-z" | "z-a";

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
  golfHand: "all" | "left" | "right";
  golfFlex: "all" | "ladies" | "senior" | "regular" | "stiff" | "x-stiff";
  golfLoft: string;
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
  golfHand: "all",
  golfFlex: "all",
  golfLoft: "all",
  priceDropOnly: false,
  limitValue: String(DEALS_PAGE_SIZE),
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
const RECENT_SEARCHES_KEY = "tss_recent_searches";

function initialFiltersFromUrl(): FilterState {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  const q = dealsQueryFromSearch(window.location.search);
  return q ? { ...DEFAULT_FILTERS, q, minPercentOff: 0 } : DEFAULT_FILTERS;
}

type StorefrontConfig = {
  sourceId: string;
  ebaySeller?: string;
  title: string;
  description: string;
};

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

export default function DealsPage({ storefront }: { storefront?: StorefrontConfig } = {}) {
  const { toast } = useToast();
  const meta = useMetaConfig();
  const sports = useSports();
  const sources = useSources();
  const prefs = usePreferences();
  const shopperSports = useMemo(
    () => curateShopperSports((sports.data ?? []) as any[]),
    [sports.data],
  );

  const storefrontFilters = useMemo<FilterState | null>(() => storefront ? {
    ...initialFiltersFromUrl(),
    source: storefront.sourceId,
    ebaySeller: storefront.ebaySeller ?? "all",
    minPercentOff: 0,
    limitValue: String(DEALS_PAGE_SIZE),
  } : null, [storefront?.sourceId, storefront?.ebaySeller]);
  const [pending, setPending] = useState<FilterState>(() => storefrontFilters ?? initialFiltersFromUrl());
  const [applied, setApplied] = useState<FilterState>(() => storefrontFilters ?? initialFiltersFromUrl());
  const [pageOffset, setPageOffset] = useState(0);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    parseRecentShopperSearches(safeLocalGet(RECENT_SEARCHES_KEY)),
  );
  const preSearchMinPercentOff = useRef<number | null>(null);
  const resultsRef = useRef<HTMLParagraphElement>(null);
  const [photoSearching, setPhotoSearching] = useState(false);
  const [photoIdentified, setPhotoIdentified] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const syncQueryUrl = (query: string, mode: "push" | "replace" = "push") => {
    const nextSearch = searchWithDealsQuery(window.location.search, query);
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", nextUrl);
  };

  useEffect(() => {
    const handlePopState = () => {
      const q = dealsQueryFromSearch(window.location.search);
      const next = q ? { ...DEFAULT_FILTERS, q, minPercentOff: 0 } : DEFAULT_FILTERS;
      setPending(next);
      setApplied(next);
      setPageOffset(0);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!storefrontFilters) return;
    setPending((current) => ({ ...current, source: storefrontFilters.source, ebaySeller: storefrontFilters.ebaySeller, minPercentOff: current.minPercentOff }));
    setApplied((current) => ({ ...current, source: storefrontFilters.source, ebaySeller: storefrontFilters.ebaySeller, minPercentOff: current.minPercentOff }));
  }, [storefrontFilters]);

  async function handlePhotoSearch(file: File) {
    setPhotoSearching(true);
    setPhotoIdentified(null);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/deals/search-by-photo", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Photo search is temporarily unavailable. Please try again.");
      const data: {
        q: string;
        sport: string;
        brand: string;
        identified: string;
        confidence: "high" | "medium" | "low";
        needsConfirmation: boolean;
      } = await res.json();

      setPhotoIdentified(
        data.identified
          ? `${data.identified}${data.needsConfirmation ? " — check the search details" : ""}`
          : null,
      );

      if (!data.q && !data.sport) {
        toast({ title: "Couldn't identify item", description: data.identified || "Try a clearer photo of the product.", variant: "destructive" });
        return;
      }

      const matchedSport = data.sport
        ? shopperSports.find((s: any) =>
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
  const ebaySellersList = useEbaySellers(advancedFiltersOpen);

  const activeEqTypeId = useMemo(() => {
    if (pending.sportId === "all" || pending.equipmentTypeId === "all") return undefined;
    if (isVirtualShopperEquipmentId(pending.equipmentTypeId)) return undefined;
    return pending.equipmentTypeId;
  }, [pending.sportId, pending.equipmentTypeId]);
  const subFilters = useSubFilters(activeEqTypeId);
  const categoryRefinements = useMemo(
    () => groupShopperSubFilters(pending.equipmentTypeId, (subFilters.data ?? []) as any[]),
    [pending.equipmentTypeId, subFilters.data],
  );

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

  const runSearch = (next: FilterState = pending) => {
    setPending(next);
    setApplied(next);
    setPageOffset(0);
    syncQueryUrl(next.q);
    setAdvancedFiltersOpen(false);
    if (next.q.trim()) {
      setRecentSearches((current) => {
        const updated = addRecentShopperSearch(current, next.q);
        safeLocalSet(RECENT_SEARCHES_KEY, JSON.stringify(updated));
        return updated;
      });
    }
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const isDefaultView = useMemo(() => {
    return (
      !applied.q.trim() &&
      applied.sportId === "all" &&
      applied.equipmentTypeId === "all" &&
      applied.subFilterId === "all" &&
      applied.ebaySeller === "all" &&
      applied.source === "all" &&
      applied.brand === "all" &&
      applied.golfHand === "all" &&
      applied.golfFlex === "all" &&
      applied.golfLoft === "all" &&
      !applied.priceDropOnly &&
      applied.maxPrice === 0 &&
      applied.minPercentOff === 50 &&
      applied.sortBy === "newest"
    );
  }, [applied]);

  const prefsApplied = useRef(false);
  useEffect(() => {
    if (prefsApplied.current || !prefs.data) return;
    prefsApplied.current = true;
    const p = prefs.data as any;
    const updates: Partial<FilterState> = {};
    if (p.condition && p.condition !== "all") updates.condition = p.condition;
    if (p.minPercentOff != null && !storefront) updates.minPercentOff = Number(p.minPercentOff);
    if (p.sportId) updates.sportId = normalizeShopperSportId(p.sportId);
    if (Object.keys(updates).length > 0) {
      setPending((prev) => ({ ...prev, ...updates }));
      setApplied((prev) => ({ ...prev, ...updates }));
    }
    if (p.hiddenSections?.length) setHiddenSections(p.hiddenSections);
  }, [prefs.data, storefront?.sourceId]);

  const groupedEqTypes = useMemo(() => {
    const fetched = (eqTypes.data ?? []) as any[];
    if (pending.sportId === "all") return [];
    return curateShopperEquipmentTypes(fetched, pending.sportId);
  }, [eqTypes.data, pending.sportId]);

  const selectedEqTypeIds = useMemo(() => {
    if (applied.equipmentTypeId === "all") return undefined;
    if (applied.sportId === "baseball" && applied.equipmentTypeId === CANONICAL_BASEBALL_BAT_ID) {
      return BASEBALL_BAT_GROUP_IDS.join(",");
    }
    return undefined;
  }, [applied.equipmentTypeId, applied.sportId]);

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
    enabled: isDefaultView,
  });

  const brandsQuery = useQuery<string[]>({
    queryKey: ["/api/deals/brands", brandsQueryParams],
    queryFn: async () => {
      const res = await fetch(`/api/deals/brands${brandsQueryParams ? `?${brandsQueryParams}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch brands");
      return res.json();
    },
  });

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
      golfHand: applied.sportId === "golf" && applied.golfHand !== "all" ? applied.golfHand : undefined,
      golfFlex: applied.sportId === "golf" && applied.golfFlex !== "all" ? applied.golfFlex : undefined,
      golfLoft: applied.sportId === "golf" && applied.golfLoft !== "all" ? applied.golfLoft : undefined,
      priceDropOnly: applied.priceDropOnly || undefined,
      featured: undefined,
      limit: applied.limitValue === "all" ? "all" as const : Number(applied.limitValue),
      offset: applied.limitValue === "all" ? undefined : pageOffset,
      sortBy: applied.sortBy,
    }),
    [applied, pageOffset, selectedEqTypeIds],
  );

  // Normalize to canonical order so equivalent selections share one query-cache entry.
  const feedSportsCanonical = useMemo(
    () => FEED_SPORT_IDS.filter((id) => feedSports.includes(id)),
    [feedSports],
  );
  const defaultFeed = useDefaultFeed({
    perSport: feedPerSport,
    sportIds: feedSportsCanonical,
    enabled: isDefaultView,
  });
  const deals = useDeals(isDefaultView ? null : queryInput);
  const featuredDeals = useDeals(isDefaultView ? {
    ...queryInput,
    featured: true,
    limit: 12,
  } : null);
  const twinSeamQuery = useDeals(isDefaultView ? {
    source: "twin-seam-sports",
    limit: 24,
  } : null);
  const homepageVisualDeals = useDeals(isDefaultView ? {
    sportId: "baseball",
    minPercentOff: 0,
    limit: 100,
    sortBy: "newest",
  } : null);

  const bonusDealsQuery = useQuery<any[]>({
    queryKey: ["/api/bonus-deals"],
    enabled: isDefaultView,
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

  const homepageVisuals = useMemo(() => {
    const defaultFeedDeals = ((defaultFeed.data ?? []) as any[])
      .flatMap((group) => group.deals ?? []);
    const visualDeals = [
      ...((homepageVisualDeals.data ?? []) as any[]),
      ...defaultFeedDeals,
      ...((twinSeamQuery.data ?? []) as any[]),
    ].filter((deal, index, deals) =>
      !["ebay", "sidelineswap"].includes(deal?.sourceId)
      && deals.findIndex((candidate) => candidate?.id === deal?.id) === index
    );

    const starterVisuals = chooseStarterVisuals(
      visualDeals,
      SHOPPER_STARTER_SEARCHES.map((starter) => starter.query),
    );
    const starterImages = Object.fromEntries(
      Object.entries(starterVisuals).map(([query, visual]) => [query, visual.imageUrl]),
    );

    return { starterImages };
  }, [defaultFeed.data, homepageVisualDeals.data, twinSeamQuery.data]);

  const restDeals = useMemo(() => {
    const all = deals.data ?? [];
    if (!isDefaultView) return all as any[];
    const featuredIds = new Set(featured.map((d: any) => d.id));
    const excludeSourceIds = new Set(["twin-seam-sports", ourStoreId].filter(Boolean));
    return (all as any[]).filter((d: any) =>
      !featuredIds.has(d.id) && !excludeSourceIds.has(d.sourceId)
    );
  }, [deals.data, featured, ourStoreId, isDefaultView]);

  const pageSize = applied.limitValue === "all" ? null : Number(applied.limitValue);
  const pageNumber = pageSize ? dealsPageNumber(pageOffset, pageSize) : 1;
  const hasPreviousPage = pageOffset > 0;
  const hasNextPage = Boolean(pageSize && mayHaveNextDealsPage(restDeals.length, pageSize));

  const movePage = (direction: "previous" | "next") => {
    if (!pageSize) return;
    setPageOffset((current) => nextDealsOffset(current, pageSize, direction));
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const setResultLimit = (limitValue: string) => {
    const next = { ...pending, limitValue };
    setPending(next);
    setApplied(next);
    setPageOffset(0);
  };

  const zeroResultRecovery = useMemo(
    () => buildZeroResultRecovery(applied),
    [applied],
  );

  const applyZeroResultRecovery = (action: SearchRecoveryAction) => {
    setPageOffset(0);
    if (action.kind === "query") {
      setPending((current) => ({ ...current, q: action.query, minPercentOff: 0 }));
      setApplied((current) => ({ ...current, q: action.query, minPercentOff: 0 }));
      syncQueryUrl(action.query);
      return;
    }

    const updates: Partial<FilterState> = {};
    if (action.constraint === "sportId") {
      updates.sportId = "all";
      updates.equipmentTypeId = "all";
      updates.subFilterId = "all";
    } else if (action.constraint === "equipmentTypeId") {
      updates.equipmentTypeId = "all";
      updates.subFilterId = "all";
    } else if (action.constraint === "subFilterId") updates.subFilterId = "all";
    else if (action.constraint === "brand") updates.brand = "all";
    else if (action.constraint === "source") updates.source = "all";
    else if (action.constraint === "condition") updates.condition = "all";
    else if (action.constraint === "minPercentOff") updates.minPercentOff = 0;
    else if (action.constraint === "maxPrice") updates.maxPrice = 0;
    else if (action.constraint === "priceDropOnly") updates.priceDropOnly = false;
    setPending((current) => ({ ...current, ...updates }));
    setApplied((current) => ({ ...current, ...updates }));
  };

  const eqTypeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of (eqTypes.data ?? []) as any[]) {
      m.set(t.id, t.name);
    }
    for (const t of groupedEqTypes as any[]) {
      m.set(t.id, t.name);
    }
    m.set(CANONICAL_BASEBALL_GLOVE_ID, "Baseball Gloves");
    return m;
  }, [eqTypes.data, groupedEqTypes]);

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
    enabled: pageOffset === 0 && !deals.isLoading && !!deals.data && restDeals.length === 0 && !isDefaultView && !!aiSuggestionParams,
    staleTime: 5 * 60 * 1000,
  });

  const groupedDeals = useMemo(() => {
    if (!restDeals.length) return [];
    const groups = new Map<string, { name: string; deals: any[] }>();
    for (const d of restDeals) {
      const selectedVirtualGroupId = applied.equipmentTypeId !== "all"
        && isVirtualShopperEquipmentId(applied.equipmentTypeId)
        ? applied.equipmentTypeId
        : null;
      const key = selectedVirtualGroupId ?? shopperResultEquipmentTypeId(d);
      if (!groups.has(key)) {
        groups.set(key, { name: canonicalEquipmentTypeLabel(key, eqTypeMap.get(key) ?? key), deals: [] });
      }
      groups.get(key)!.deals.push(d);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [restDeals, eqTypeMap, applied.equipmentTypeId]);

  const loading = (isDefaultView ? defaultFeed.isLoading : deals.isLoading) || twinSeamQuery.isLoading || sports.isLoading || sources.isLoading || meta.isLoading;

  const subtitle = meta.data
    ? `Drops at ${meta.data.scheduled.times.join(" · ")} (${meta.data.scheduled.timezone}). Default: 50%+ off, all conditions.`
    : "Filter by sport, equipment, condition, and percent-off — then open the deal instantly.";
  const dealUtilities = (
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
  );

  return (
    <AppShell
      title="Find the right gear, faster"
      subtitle={subtitle}
      hidePageHeader
    >
      <Seo
        title={storefront ? `${storefront.title} Deals — TwinSeam Deals` : "Deals — TwinSeam Deals"}
        description={storefront?.description ?? "Browse sporting goods deals and filter by sport, equipment type, condition, and percent off."}
      />

      {storefront ? (
        <section className="card-elevated animate-float-in p-6 md:p-8" data-testid="source-storefront-header">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-background/70 shadow-sm">
              <Store className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Source storefront</div>
              <h1 className="font-display text-2xl font-bold md:text-3xl">{storefront.title}</h1>
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground md:text-base">{storefront.description}</p>
        </section>
      ) : <DealsSearchHero
        query={pending.q}
        recentSearches={recentSearches}
        photoSearching={photoSearching}
        photoIdentified={photoIdentified}
        photoInputRef={photoInputRef}
        onQueryChange={(value) => {
          if (!value.trim()) setPhotoIdentified(null);
          setPending((current) => {
            const next = { ...current, q: value };
            if (value.trim()) {
              if (preSearchMinPercentOff.current === null) preSearchMinPercentOff.current = current.minPercentOff;
              next.minPercentOff = 0;
            } else if (preSearchMinPercentOff.current !== null) {
              next.minPercentOff = preSearchMinPercentOff.current;
              preSearchMinPercentOff.current = null;
            }
            return next;
          });
        }}
        onSearch={(query) => runSearch({ ...pending, q: query, minPercentOff: query.trim() ? 0 : pending.minPercentOff })}
        onPhotoSearch={handlePhotoSearch}
        onClearPhoto={() => {
          setPhotoIdentified(null);
          setPending((current) => ({ ...current, q: "", sportId: "all", brand: "all", minPercentOff: DEFAULT_FILTERS.minPercentOff }));
          preSearchMinPercentOff.current = null;
        }}
        onCategory={(sportId, equipmentTypeId) => runSearch({
          ...pending,
          q: "",
          sportId,
          equipmentTypeId,
          subFilterId: "all",
          brand: "all",
          minPercentOff: 0,
        })}
        starterImages={homepageVisuals.starterImages}
        sports={shopperSports}
      />}

      {!storefront && <EliteGloveCorner />}

      <div className="hidden justify-end lg:flex" data-testid="deal-utilities">
        {dealUtilities}
      </div>

      {/* Browse by Sport bar */}
      <div className="hidden" aria-hidden="true">
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
          <button
            type="button"
            onClick={() => {
              const updates = {
                sportId: SHOPPER_MEMORABILIA_SPORT_ID,
                equipmentTypeId: "all",
                subFilterId: "all",
                brand: "all",
                minPercentOff: 0,
              };
              setPending((current) => ({ ...current, ...updates }));
              setApplied((current) => ({ ...current, ...updates }));
            }}
            className="rounded-lg border border-border bg-background/60 px-2.5 py-1 text-xs font-medium hover:bg-primary/5 hover:border-primary/30 transition-all"
            data-testid="browse-sport-memorabilia"
          >
            Memorabilia
          </button>
        </div>
      </div>

      {/* Popular Products */}
      {popularProductsData && popularProductsData.length > 0 && (
        <div className="hidden" aria-hidden="true">
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
                <SlidersHorizontal className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-display text-lg font-bold">Narrow the results</div>
                <div className="text-xs text-muted-foreground">High-value choices stay visible; optional controls are tucked away.</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isDefaultView && (
                <button
                  type="button"
                  onClick={() => {
                    const reset = storefrontFilters ?? DEFAULT_FILTERS;
                    setPending(reset);
                    setApplied(reset);
                    setPageOffset(0);
                  }}
                  className="flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
                  data-testid="clear-all-filters"
                >
                  <X className="h-3 w-3" /> Clear all filters
                </button>
              )}
              <button
                type="button"
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-background/60 px-3 text-xs font-semibold"
                onClick={() => setAdvancedFiltersOpen((v) => !v)}
                data-testid="toggle-advanced-filters"
                aria-expanded={advancedFiltersOpen}
                aria-controls="advanced-filters-panel"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {advancedFiltersOpen ? "Hide advanced filters" : "Advanced filters"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_0.8fr_1fr_auto] xl:items-end" data-testid="primary-filters">
            <div className="grid gap-1.5">
              <Label>Sport</Label>
              <Select value={pending.sportId} onValueChange={(value) => setPending((current) => ({ ...current, sportId: value, equipmentTypeId: "all", subFilterId: "all", brand: "all", golfHand: "all", golfFlex: "all", golfLoft: "all" }))}>
                <SelectTrigger className="ring-focus min-h-11 rounded-xl" data-testid="sport-primary">
                  <SelectValue placeholder="All sports" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sports</SelectItem>
                  {shopperSports.map((sport: any) => <SelectItem key={sport.id} value={sport.id}>{sport.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Equipment</Label>
              <Select
                value={pending.equipmentTypeId}
                disabled={pending.sportId === "all"}
                onValueChange={(value) => setPending((current) => ({ ...current, equipmentTypeId: value, subFilterId: "all" }))}
              >
                <SelectTrigger className="ring-focus min-h-11 rounded-xl" data-testid="equipmentType-primary">
                  <SelectValue placeholder="All equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All equipment</SelectItem>
                  {groupedEqTypes.map((type: any) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Condition</Label>
              <Select value={pending.condition} onValueChange={(value) => setPending((current) => ({ ...current, condition: value as FilterState["condition"] }))}>
                <SelectTrigger className="ring-focus min-h-11 rounded-xl" data-testid="condition-primary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="preowned">Preowned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Brand</Label>
              <Select value={pending.brand} onValueChange={(value) => setPending((current) => ({ ...current, brand: value }))}>
                <SelectTrigger className="ring-focus min-h-11 rounded-xl" data-testid="brand-primary">
                  <Tag className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="All brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {(brandsQuery.data ?? []).map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={() => runSearch()}
              disabled={!hasUnapplied}
              className={cn("ring-focus min-h-11 rounded-xl px-5", hasUnapplied && "ring-2 ring-primary/25")}
              data-testid="apply-primary-filters"
            >
              {hasUnapplied ? "Show results" : "Up to date"}
            </Button>
          </div>

          {pending.sportId === "golf" && (
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-3 sm:p-4" data-testid="golf-shopper-filters">
              <div className="mb-3">
                <div className="text-sm font-bold">Golf club details</div>
                <div className="text-xs text-muted-foreground">Choose only what matters. Leave any field at “Any” to keep more matches visible.</div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label>Handedness</Label>
                  <Select value={pending.golfHand} onValueChange={(value) => setPending((current) => ({ ...current, golfHand: value as FilterState["golfHand"] }))}>
                    <SelectTrigger className="ring-focus min-h-11 rounded-xl" data-testid="golf-hand"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any hand</SelectItem>
                      <SelectItem value="right">Right-handed</SelectItem>
                      <SelectItem value="left">Left-handed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Shaft flex</Label>
                  <Select value={pending.golfFlex} onValueChange={(value) => setPending((current) => ({ ...current, golfFlex: value as FilterState["golfFlex"] }))}>
                    <SelectTrigger className="ring-focus min-h-11 rounded-xl" data-testid="golf-flex"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any flex</SelectItem>
                      <SelectItem value="ladies">Ladies</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="stiff">Stiff</SelectItem>
                      <SelectItem value="x-stiff">X-Stiff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Loft</Label>
                  <Select value={pending.golfLoft} onValueChange={(value) => setPending((current) => ({ ...current, golfLoft: value }))}>
                    <SelectTrigger className="ring-focus min-h-11 rounded-xl" data-testid="golf-loft"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any loft</SelectItem>
                      {["7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "12", "13.5", "15", "16.5", "18", "21", "24", "46", "48", "50", "52", "54", "56", "58", "60"].map((loft) => (
                        <SelectItem key={loft} value={loft}>{loft}°</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {categoryRefinements.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-primary/15 bg-primary/[0.035] p-3 sm:p-4" data-testid="category-refinements">
              {categoryRefinements.map((group) => (
                <div key={group.id} className="grid gap-2 sm:grid-cols-[120px_1fr] sm:items-center">
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{group.label}</div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {group.items.map((item) => {
                      const selected = pending.subFilterId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setPending((current) => ({ ...current, subFilterId: selected ? "all" : item.id }))}
                          className={cn(
                            "ring-focus min-h-10 shrink-0 rounded-full border px-3 text-xs font-bold transition-colors",
                            selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/35",
                          )}
                          data-testid={`refinement-${item.id}`}
                        >
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            className={cn("rounded-2xl bg-muted/35 p-3 sm:p-4", advancedFiltersOpen ? "block" : "hidden")}
            id="advanced-filters-panel"
            data-testid="advanced-filters-panel"
          >

          <div className="hidden" aria-hidden="true">
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
                    {shopperSports.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Equipment type</Label>
                <Select
                  value={pending.equipmentTypeId}
                  disabled={pending.sportId === "all"}
                  onValueChange={(v) => { setPending((p) => ({ ...p, equipmentTypeId: v, subFilterId: "all" })); }}
                >
                  <SelectTrigger className="ring-focus rounded-xl" data-testid="equipmentType">
                    <SelectValue placeholder="All equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All equipment</SelectItem>
                    {groupedEqTypes.map((t: any) => (
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
            <div className="hidden" aria-hidden="true">
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
                  <SelectItem value="delivered-low">Total price: Low to High</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                  <SelectItem value="discount-high">Discount: High to Low</SelectItem>
                  <SelectItem value="a-z">Name: A to Z</SelectItem>
                  <SelectItem value="z-a">Name: Z to A</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="hidden" aria-hidden="true">
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

            {!storefront && <div className="grid gap-2">
              <Label>Source</Label>
              <Select value={pending.source} onValueChange={(v) => { setPending((p) => ({ ...p, source: v })); }}>
                <SelectTrigger className="ring-focus rounded-xl" data-testid="source">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const priorityOrder = ["twin-seam-sports", "baseline-sports", "ebay", "dicks-sporting-goods", "golf-galaxy", "name-of-the-game", "baseball-resale"];
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
            </div>}

            <div className="hidden" aria-hidden="true">
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

            {!storefront?.ebaySeller && (ebaySellersList.data ?? []).length > 0 && (
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
                  {DEALS_PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                  {storefront && <SelectItem value="all">Show all</SelectItem>}
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
              onClick={() => setPending(storefrontFilters ?? DEFAULT_FILTERS)}
              className="ring-focus rounded-xl text-muted-foreground"
              data-testid="reset-pending"
            >
              Reset
            </Button>
            <Button
              onClick={() => runSearch()}
              disabled={!hasUnapplied}
              className={cn("ring-focus rounded-xl gap-2", hasUnapplied && "ring-2 ring-primary/40")}
              data-testid="apply-filters"
            >
              {hasUnapplied ? "Apply advanced filters" : "Filters applied"}
            </Button>
          </div>
          </div>
        </div>
      </section>

      <p ref={resultsRef} className="scroll-mt-4 text-center text-xs text-muted-foreground/70" data-testid="text-affiliate-disclosure">
        TSSDeals compares offers and sends you to the retailer to complete your purchase. We do not operate a shopping cart or checkout.
        {" "}We may earn a commission from qualifying purchases at no extra cost to you.
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
                    eliteCornerAction="add"
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
                    eliteCornerAction="add"
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

      {isDefaultView && <section
        className="animate-float-in stagger-3 rounded-2xl border border-border bg-card/60 p-4"
        data-testid="preferred-retailers"
      >
        <div className="mb-3">
          <div className="font-display text-base font-bold">Preferred retailers</div>
          <div className="text-xs text-muted-foreground">
            Preferred placement never overrides the actual price comparison.
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              sourceId: TWIN_SEAM_SOURCE_ID,
              name: "Twin Seam Sports",
              href: "https://www.twinseamsports.com",
              label: "Our store · first preference",
            },
            {
              sourceId: "baseline-sports",
              name: BASELINE_SPORTS_NAME,
              href: outboundRetailerUrl(BASELINE_SPORTS_URL),
              label: "Affiliate partner · second preference",
            },
          ].map((retailer) => (
            <a
              key={retailer.sourceId}
              href={retailer.href}
              target="_blank"
              rel={retailer.sourceId === "baseline-sports" ? "noopener noreferrer sponsored" : "noopener noreferrer"}
              className="ring-focus flex min-h-16 items-center justify-between rounded-xl border border-border bg-background px-4 py-3 hover:border-primary/40 hover:shadow-sm"
              data-testid={`preferred-retailer-${retailer.sourceId}`}
            >
              <div>
                <div className="text-sm font-bold">{retailer.name}</div>
                <div className="text-xs text-muted-foreground">{retailer.label}</div>
              </div>
              <ExternalLink className="h-4 w-4 text-primary" />
            </a>
          ))}
        </div>
      </section>}


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
              {applied.limitValue === "all"
                ? `Showing all ${restDeals.length} results`
                : `Page ${pageNumber} · Showing ${restDeals.length} results`}
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

        {!collapsedSections["all-other"] && storefront && (
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2" data-testid="storefront-result-controls">
            {applied.limitValue === "all" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResultLimit(String(DEALS_PAGE_SIZE))}
                className="ring-focus rounded-xl"
                data-testid="use-pages"
              >
                Use pages
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResultLimit("all")}
                className="ring-focus rounded-xl"
                data-testid="show-all-storefront"
              >
                Show all
              </Button>
            )}
          </div>
        )}

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
              <div className="text-sm text-muted-foreground mb-4">
                {pageOffset > 0
                  ? "You’ve reached the end of these results. Return to the previous page to keep browsing."
                  : "Try a normalized search or remove one constraint. These options rerun the search and never invent inventory."}
              </div>
              {pageOffset > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => movePage("previous")}
                  className="ring-focus mb-4 rounded-xl gap-1"
                  data-testid="empty-previous-page"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous page
                </Button>
              )}
              {pageOffset === 0 && zeroResultRecovery.length > 0 && (
                <div className="mb-4 flex flex-wrap justify-center gap-2" data-testid="zero-result-recovery">
                  {zeroResultRecovery.map((action) => (
                    <Button
                      key={action.kind === "query" ? `query-${action.query}` : `constraint-${action.constraint}`}
                      variant="outline"
                      size="sm"
                      onClick={() => applyZeroResultRecovery(action)}
                      className="ring-focus rounded-xl"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const reset = storefrontFilters ?? DEFAULT_FILTERS;
                  setPending(reset);
                  setApplied(reset);
                  setPageOffset(0);
                }}
                className="ring-focus rounded-xl"
                data-testid="reset"
              >
                Reset filters
              </Button>
            </div>
            {pageOffset === 0 && aiSuggestionsQuery.isLoading ? (
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
            ) : pageOffset === 0 && aiSuggestionsQuery.data?.suggestions?.length ? (
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
                      eliteCornerAction="add"
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
                        eliteCornerAction="add"
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
            {pageSize && (hasPreviousPage || hasNextPage) && (
              <nav
                className="flex flex-wrap items-center justify-center gap-3 border-t border-border pt-5"
                aria-label="Deal result pages"
                data-testid="deals-pagination"
              >
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => movePage("previous")}
                  disabled={!hasPreviousPage || deals.isFetching}
                  className="ring-focus rounded-xl gap-1"
                  data-testid="previous-page"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="min-w-20 text-center text-sm font-semibold text-muted-foreground">
                  Page {pageNumber}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => movePage("next")}
                  disabled={!hasNextPage || deals.isFetching}
                  className="ring-focus rounded-xl gap-1"
                  data-testid="next-page"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </nav>
            )}
          </div>
        )}
      </section>
      )}

      {isDefaultView && popularProductsData && popularProductsData.length > 0 && (
        <section className="card-elevated p-4 sm:p-5" data-testid="popular-products-bar">
          <div className="mb-3 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-accent" />
            <div>
              <h2 className="text-base font-bold">More gear to explore</h2>
              <p className="text-xs text-muted-foreground">Curated starter links from TwinSeam—not live popularity tracking.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {popularProductsData.slice(0, 12).map((product: any) => (
              <Link
                key={product.slug}
                href={`/deals/${product.slug}`}
                className="ring-focus min-h-10 rounded-full border border-border bg-background px-3 py-2 text-xs font-bold transition-colors hover:border-accent/35 hover:bg-accent/5"
                data-testid={`browse-product-${product.slug}`}
              >
                {product.name}
              </Link>
            ))}
          </div>
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
                  href={outboundRetailerUrl(deal.url)}
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
