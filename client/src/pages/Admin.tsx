import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import Seo from "@/components/Seo";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { redirectToLogin } from "@/lib/auth-utils";
import { cn, applyEbayReferral } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRunAggregator } from "@/hooks/use-admin";
import { useMetaConfig } from "@/hooks/use-meta";
import { useSources, useSports, useEquipmentTypes, useSubFilters, useEbaySellers } from "@/hooks/use-taxonomy";
import { EmptyState } from "@/components/EmptyState";
import EbayListingAssistant from "@/components/EbayListingAssistant";
import EbayPricingAnalysis from "@/components/EbayPricingAnalysis";
import SidelineSwapSync from "@/components/SidelineSwapSync";
import PromoCodes from "@/components/PromoCodes";
import { DataReportingPanel } from "@/components/DataReportingPanel";
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Ban, BarChart3, Calendar, Check, ChevronDown, ChevronUp, Download, ExternalLink, Eye, EyeOff, FileText, Filter, Gift, Globe, GripVertical, Link2, Link2Off, Loader2, MousePointerClick, Package, Pencil, PlayCircle, Plus, RefreshCw, Search, Shield, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Store, Terminal, TicketX, Trash2, TrendingDown, TrendingUp, Users, X, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ClassificationReviewItem } from "@shared/schema";

const ADMIN_SECTION_ORDER_KEY = "tss_admin_section_order";
const ADMIN_SECTION_COLLAPSED_KEY = "tss_admin_section_collapsed";
const ADMIN_SECTIONS: { id: string; label: string }[] = [
  { id: "system-controls", label: "System Controls" },
  { id: "aggregator", label: "Aggregator Controls" },
  { id: "shopify", label: "Shopify Sync" },
  { id: "fanatics", label: "Fanatics Sync" },
  { id: "playitagain", label: "Play It Again Sports Sync" },
  { id: "impact", label: "Impact / Wilson Family Sync" },
  { id: "rakuten", label: "Rakuten Sync" },
  { id: "ebay-listing", label: "eBay Listing Assistant" },
  { id: "ebay-pricing", label: "eBay Pricing Analysis" },
  { id: "sidelineswap-push", label: "SidelineSwap Push" },
  { id: "promo-codes", label: "Promo Codes & Coupons" },
  { id: "sms-blast", label: "SMS Deal Blast" },
  { id: "featured-deals", label: "Featured Deals" },
  { id: "ai-classification", label: "AI Classification" },
  { id: "msrp", label: "MSRP Verification" },
  { id: "deal-validation", label: "Deal Validation" },
  { id: "popular-products", label: "Popular Products" },
  { id: "bonus-deals", label: "Bonus Deals" },
  { id: "sidelineswap-market", label: "SidelineSwap Marketplace" },
  { id: "cj-sync", label: "CJ Sync" },
  { id: "ebay-sync", label: "eBay Sync" },
  { id: "ebay-reports", label: "eBay Reports" },
  { id: "ebay-sellers", label: "eBay Sellers" },
  { id: "sub-filters", label: "Equipment Sub-Filters" },
  { id: "data-reporting", label: "Data Reporting & Edit" },
  { id: "affiliate-reporting", label: "Affiliate Reporting" },
  { id: "analytics", label: "Analytics" },
];

export default function AdminPage() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const run = useRunAggregator();
  const meta = useMetaConfig();
  const sources = useSources();
  const sports = useSports();

  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [isAddingSource, setIsAddingSource] = useState(false);

  const [cjSportId, setCjSportId] = useState<string>("");
  const [cjKeywords, setCjKeywords] = useState("");
  const [cjMaxResults, setCjMaxResults] = useState<string>("50");
  const [cjSyncing, setCjSyncing] = useState(false);
  const [cjLog, setCjLog] = useState<string[]>([]);
  const [cjStats, setCjStats] = useState<{ created: number; updated: number; errors: number } | null>(null);

  const [syncCompleteDialog, setSyncCompleteDialog] = useState<{ open: boolean; title: string; details: string[] } | null>(null);

  const [ebaySportId, setEbaySportId] = useState<string>("");
  const [ebayKeywords, setEbayKeywords] = useState("");
  const [ebayCondition, setEbayCondition] = useState<string>("all");
  const [ebaySellerFilter, setEbaySellerFilter] = useState<string>("");
  const [ebayMaxResults, setEbayMaxResults] = useState<string>("50");
  const [ebaySyncing, setEbaySyncing] = useState(false);
  const [ebayLog, setEbayLog] = useState<string[]>([]);
  const [ebayStats, setEbayStats] = useState<{ created: number; updated: number; skipped: number; errors: number } | null>(null);
  const [ebayDealItemsSyncing, setEbayDealItemsSyncing] = useState(false);
  const [msrpBatchVerifying, setMsrpBatchVerifying] = useState(false);
  const [msrpBatchSportId, setMsrpBatchSportId] = useState("all");
  const [msrpBatchBrand, setMsrpBatchBrand] = useState("");
  const [msrpBatchLimit, setMsrpBatchLimit] = useState("25");
  const [msrpLog, setMsrpLog] = useState<string[]>([]);
  const [aiClassifyRunning, setAiClassifyRunning] = useState(false);
  const [aiClassifySportId, setAiClassifySportId] = useState("all");
  const [aiClassifyLimit, setAiClassifyLimit] = useState("150");
  const [aiClassifyMode, setAiClassifyMode] = useState<"unclassified" | "baseball-rescue">("unclassified");
  const [aiClassifyLog, setAiClassifyLog] = useState<string[]>([]);
  const [remediateRunning, setRemediateRunning] = useState(false);
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<string | null>(null);

  const [validating, setValidating] = useState(false);
  const [validationMaxPerSource, setValidationMaxPerSource] = useState("500");
  const [validationResult, setValidationResult] = useState<{ ebayChecked: number; ebayRemoved: number; ssChecked: number; ssRemoved: number; durationMs: number } | null>(null);

  const [shopifySportId, setShopifySportId] = useState<string>("");
  const [shopifySyncing, setShopifySyncing] = useState(false);
  const [shopifyLog, setShopifyLog] = useState<string[]>([]);
  const [shopifyStats, setShopifyStats] = useState<{ created: number; updated: number; skipped: number; total: number } | null>(null);

  const [fanaticsSyncing, setFanaticsSyncing] = useState(false);
  const [fanaticsStats, setFanaticsStats] = useState<{ created: number; updated: number; errors: number } | null>(null);

  const [impactSyncing, setImpactSyncing] = useState(false);
  const [impactStats, setImpactStats] = useState<{ created: number; updated: number; errors: number } | null>(null);
  const [playItAgainSyncing, setPlayItAgainSyncing] = useState(false);
  const [playItAgainStats, setPlayItAgainStats] = useState<{ created: number; updated: number; errors: number } | null>(null);
  const [rakutenSyncing, setRakutenSyncing] = useState(false);
  const [rakutenStats, setRakutenStats] = useState<{ created: number; updated: number; errors: number } | null>(null);

  const [slsSportId, setSlsSportId] = useState<string>("");
  const [slsMinPrice, setSlsMinPrice] = useState<string>("150");
  const [slsCondition, setSlsCondition] = useState<string>("all");
  const [slsSyncing, setSlsSyncing] = useState(false);
  const [slsLog, setSlsLog] = useState<string[]>([]);
  const [slsStats, setSlsStats] = useState<{ created: number; updated: number; total: number } | null>(null);

  const [featUrl, setFeatUrl] = useState("");
  const [featTitle, setFeatTitle] = useState("");
  const [featBrand, setFeatBrand] = useState("");
  const [featPrice, setFeatPrice] = useState("");
  const [featMsrp, setFeatMsrp] = useState("");
  const [featImageUrl, setFeatImageUrl] = useState("");
  const [featSportId, setFeatSportId] = useState<string>("");
  const [featCondition, setFeatCondition] = useState<string>("new");
  const [featSubmitting, setFeatSubmitting] = useState(false);
  const [detectedSource, setDetectedSource] = useState<string>("");

  const [bonusUrl, setBonusUrl] = useState("");
  const [bonusTitle, setBonusTitle] = useState("");
  const [bonusBrand, setBonusBrand] = useState("");
  const [bonusPrice, setBonusPrice] = useState("");
  const [bonusOriginalPrice, setBonusOriginalPrice] = useState("");
  const [bonusImageUrl, setBonusImageUrl] = useState("");
  const [bonusDescription, setBonusDescription] = useState("");
  const [bonusSubmitting, setBonusSubmitting] = useState(false);

  const [ppName, setPpName] = useState("");
  const [ppSlug, setPpSlug] = useState("");
  const [ppSport, setPpSport] = useState("");
  const [ppOrder, setPpOrder] = useState("0");
  const [ppSubmitting, setPpSubmitting] = useState(false);

  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(ADMIN_SECTION_ORDER_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const allIds = ADMIN_SECTIONS.map(s => s.id);
        const filtered = parsed.filter(id => allIds.includes(id));
        const missing = allIds.filter(id => !filtered.includes(id));
        return [...filtered, ...missing];
      }
    } catch {}
    return ADMIN_SECTIONS.map(s => s.id);
  });
  const [arrangeOpen, setArrangeOpen] = useState(false);

  const sectionStyle = (id: string): CSSProperties => ({
    order: sectionOrder.includes(id) ? sectionOrder.indexOf(id) : sectionOrder.length,
    maxHeight: collapsedSections.includes(id) ? "90px" : "9000px",
    overflow: "hidden",
    transition: "max-height 0.35s ease-out",
  });

  const moveSectionUp = (id: string) => {
    setSectionOrder(prev => {
      const idx = prev.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      try { localStorage.setItem(ADMIN_SECTION_ORDER_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const moveSectionDown = (id: string) => {
    setSectionOrder(prev => {
      const idx = prev.indexOf(id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      try { localStorage.setItem(ADMIN_SECTION_ORDER_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [collapsedSections, setCollapsedSections] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(ADMIN_SECTION_COLLAPSED_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try { localStorage.setItem(ADMIN_SECTION_COLLAPSED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const isAdmin = (user as any)?.isAdmin === true;

  const featuredDealsQuery = useQuery<any[]>({
    queryKey: ["/api/admin/featured-deals"],
    enabled: isAuthenticated && isAdmin,
  });

  const bonusDealsQuery = useQuery<any[]>({
    queryKey: ["/api/admin/bonus-deals"],
    enabled: isAuthenticated && isAdmin,
  });

  const popularProductsQuery = useQuery<any[]>({
    queryKey: ["/api/admin/popular-products"],
    enabled: isAuthenticated && isAdmin,
  });

  const onDetectSource = async (url: string) => {
    setFeatUrl(url);
    if (!url.trim()) { setDetectedSource(""); return; }
    try {
      const parsed = new URL(url.trim());
      if (!parsed.hostname.includes(".")) { setDetectedSource(""); return; }
      const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
      const knownDomains: Record<string, string> = {
        "amazon.com": "Amazon", "twinseamsports.com": "Twin Seam Sports", "ebay.com": "eBay",
        "dickssportinggoods.com": "DICK'S Sporting Goods", "baseballmonkey.com": "Baseball Monkey",
        "justballgloves.com": "JustBallGloves", "justbats.com": "JustBats",
        "walmart.com": "Walmart", "target.com": "Target", "nike.com": "Nike",
        "rawlings.com": "Rawlings", "wilson.com": "Wilson", "sidelineswap.com": "SidelineSwap",
        "fanatics.com": "Fanatics", "academy.com": "Academy Sports",
      };
      for (const [domain, name] of Object.entries(knownDomains)) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          setDetectedSource(name);
          return;
        }
      }
      setDetectedSource(hostname);
    } catch {
      setDetectedSource("");
    }
  };

  const onAddFeaturedDeal = async () => {
    if (!featUrl.trim() || !featTitle.trim() || !featPrice.trim()) return;
    setFeatSubmitting(true);
    try {
      const priceCents = Math.round(parseFloat(featPrice) * 100);
      const msrpCents = featMsrp ? Math.round(parseFloat(featMsrp) * 100) : undefined;
      if (isNaN(priceCents) || priceCents <= 0) throw new Error("Invalid price");

      const body: any = {
        url: featUrl.trim(),
        title: featTitle.trim(),
        priceCents,
        condition: featCondition,
      };
      if (featBrand.trim()) body.brand = featBrand.trim();
      if (msrpCents && msrpCents > 0) body.msrpCents = msrpCents;
      if (featImageUrl.trim()) body.imageUrl = featImageUrl.trim();
      if (featSportId && featSportId !== "all") body.sportId = featSportId;

      const res = await apiRequest("POST", "/api/admin/featured-deals", body);
      const data = await res.json();
      toast({
        title: "Featured deal added",
        description: `Deal from ${data.detectedSource || "retailer"} saved. Amazon links get your partner tag automatically.`,
      });
      setFeatUrl("");
      setFeatTitle("");
      setFeatBrand("");
      setFeatPrice("");
      setFeatMsrp("");
      setFeatImageUrl("");
      setFeatSportId("");
      setFeatCondition("new");
      setDetectedSource("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/featured-deals"] });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to add deal", variant: "destructive" });
    } finally {
      setFeatSubmitting(false);
    }
  };

  const onDeleteFeaturedDeal = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/admin/featured-deals/${id}`);
      toast({ title: "Removed", description: "Featured deal deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/featured-deals"] });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to delete", variant: "destructive" });
    }
  };

  const onAddBonusDeal = async () => {
    setBonusSubmitting(true);
    try {
      const priceCents = Math.round(parseFloat(bonusPrice) * 100);
      const originalPriceCents = bonusOriginalPrice ? Math.round(parseFloat(bonusOriginalPrice) * 100) : undefined;
      await apiRequest("POST", "/api/admin/bonus-deals", {
        title: bonusTitle.trim(),
        url: bonusUrl.trim(),
        brand: bonusBrand.trim() || undefined,
        priceCents,
        originalPriceCents,
        imageUrl: bonusImageUrl.trim() || undefined,
        description: bonusDescription.trim() || undefined,
      });
      toast({ title: "Added", description: "Bonus deal created successfully." });
      setBonusUrl(""); setBonusTitle(""); setBonusBrand(""); setBonusPrice("");
      setBonusOriginalPrice(""); setBonusImageUrl(""); setBonusDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bonus-deals"] });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to add bonus deal", variant: "destructive" });
    } finally {
      setBonusSubmitting(false);
    }
  };

  const onToggleBonusDeal = async (id: string, isActive: boolean) => {
    try {
      await apiRequest("PATCH", `/api/admin/bonus-deals/${id}`, { isActive: !isActive });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bonus-deals"] });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to update", variant: "destructive" });
    }
  };

  const onDeleteBonusDeal = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/admin/bonus-deals/${id}`);
      toast({ title: "Removed", description: "Bonus deal deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bonus-deals"] });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to delete", variant: "destructive" });
    }
  };

  const [reportStartDate, setReportStartDate] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [disconnecting, setDisconnecting] = useState(false);

  const ebayOauthStatus = useQuery<{
    connected: boolean;
    state: "connected" | "not_connected" | "reauthorization_required" | "error";
    message: string | null;
    reconnectRequired: boolean;
    ebayUsername: string | null;
    expiresAt: string | null;
    updatedAt: string | null;
  }>({
    queryKey: ["/api/ebay/oauth/status"],
    enabled: isAuthenticated,
  });

  const onDisconnectEbay = async () => {
    setDisconnecting(true);
    try {
      await apiRequest("POST", "/api/ebay/oauth/disconnect");
      toast({ title: "Disconnected", description: "eBay account has been disconnected." });
      queryClient.invalidateQueries({ queryKey: ["/api/ebay/oauth/status"] });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to disconnect", variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  const downloadReport = (type: "sales" | "purchases") => {
    const params = new URLSearchParams();
    if (reportStartDate) params.set("startDate", reportStartDate);
    if (reportEndDate) params.set("endDate", reportEndDate);
    const url = `/api/ebay/reports/${type}.csv${params.toString() ? `?${params.toString()}` : ""}`;
    window.open(url, "_blank");
  };

  const [esNewUsername, setEsNewUsername] = useState("");
  const [esNewNotes, setEsNewNotes] = useState("");
  const [esAdding, setEsAdding] = useState(false);
  const [esSellerSyncing, setEsSellerSyncing] = useState(false);
  const [esVerifying, setEsVerifying] = useState<string | null>(null);
  const [esEditingId, setEsEditingId] = useState<string | null>(null);
  const [esEditUsername, setEsEditUsername] = useState("");
  const ebaySellersQuery = useEbaySellers();
  const [esDealCounts, setEsDealCounts] = useState<Record<string, number>>({});

  const refreshDealCounts = () => {
    fetch("/api/admin/ebay-sellers/deal-counts", { credentials: "include" })
      .then(r => r.ok ? r.json() : {})
      .then(setEsDealCounts)
      .catch(() => {});
  };

  useEffect(() => {
    if (user?.isAdmin) refreshDealCounts();
  }, [user?.isAdmin]);

  const onAddEbaySeller = async () => {
    if (!esNewUsername.trim()) return;
    setEsAdding(true);
    try {
      await apiRequest("POST", "/api/ebay-sellers", { username: esNewUsername.trim(), notes: esNewNotes.trim() || undefined });
      toast({ title: "Seller added", description: `"${esNewUsername.trim()}" saved.` });
      setEsNewUsername("");
      setEsNewNotes("");
      ebaySellersQuery.refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to add seller", variant: "destructive" });
    } finally {
      setEsAdding(false);
    }
  };

  const onVerifyEbaySeller = async (username: string) => {
    setEsVerifying(username);
    try {
      const res = await apiRequest("POST", "/api/admin/ebay-sellers/verify", { username });
      const data = await res.json();
      if (data.valid) {
        toast({ title: "Valid seller", description: `"${username}" found ${data.itemCount} items on eBay.` });
      } else {
        toast({ title: "No items found", description: `"${username}" returned 0 results. This might not be a valid eBay username.`, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Verification failed", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setEsVerifying(null);
    }
  };

  const onUpdateEbaySeller = async (id: string) => {
    if (!esEditUsername.trim()) return;
    try {
      await apiRequest("PATCH", `/api/admin/ebay-sellers/${id}`, { username: esEditUsername.trim() });
      toast({ title: "Seller updated", description: `Username changed to "${esEditUsername.trim()}".` });
      setEsEditingId(null);
      setEsEditUsername("");
      ebaySellersQuery.refetch();
      refreshDealCounts();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to update", variant: "destructive" });
    }
  };

  const onSyncEbaySellers = async () => {
    setEsSellerSyncing(true);
    try {
      const res = await apiRequest("POST", "/api/ebay/seller-sync");
      const data = await res.json();
      toast({ title: "Seller Sync Complete", description: data.message || `${data.created} created, ${data.updated} updated` });
    } catch (e: any) {
      toast({ title: "Seller sync failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setEsSellerSyncing(false);
    }
  };

  const onDeleteEbaySeller = async (id: string, username: string) => {
    try {
      await apiRequest("DELETE", `/api/ebay-sellers/${id}`);
      toast({ title: "Seller removed", description: `"${username}" deleted.` });
      ebaySellersQuery.refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to delete seller", variant: "destructive" });
    }
  };

  const [sfSportId, setSfSportId] = useState<string>("");
  const [sfEqTypeId, setSfEqTypeId] = useState<string>("");
  const [sfNewName, setSfNewName] = useState("");
  const [sfAdding, setSfAdding] = useState(false);
  const sfEqTypes = useEquipmentTypes(sfSportId && sfSportId !== "all" ? sfSportId : undefined);
  const sfSubFilters = useSubFilters(sfEqTypeId && sfEqTypeId !== "all" ? sfEqTypeId : undefined);

  const [reclassifyRunning, setReclassifyRunning] = useState(false);
  const onReclassifyAll = async () => {
    if (!confirm("Re-run the smart classifier across every deal? This re-applies all material/drop-weight/size rules to the entire catalog.")) return;
    setReclassifyRunning(true);
    try {
      const res: any = await apiRequest("POST", "/api/admin/reclassify-all-deals");
      const data = await res.json();
      toast({
        title: "Reclassification complete",
        description: `${data.updated} deals updated of ${data.total} scanned. ${data.dropTagged ?? 0} got drop-weight tags, ${data.sizeTagged ?? 0} got size tags.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    } catch (e: any) {
      toast({ title: "Reclassify failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setReclassifyRunning(false);
    }
  };

  const onAddSubFilter = async () => {
    if (!sfNewName.trim() || !sfEqTypeId || sfEqTypeId === "all") return;
    setSfAdding(true);
    try {
      await apiRequest("POST", "/api/sub-filters", { name: sfNewName.trim(), equipmentTypeId: sfEqTypeId });
      toast({ title: "Sub-filter added", description: `"${sfNewName.trim()}" created.` });
      setSfNewName("");
      sfSubFilters.refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to add", variant: "destructive" });
    } finally {
      setSfAdding(false);
    }
  };

  const onDeleteSubFilter = async (id: string, name: string) => {
    try {
      await apiRequest("DELETE", `/api/sub-filters/${id}`);
      toast({ title: "Sub-filter removed", description: `"${name}" deleted.` });
      sfSubFilters.refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed to delete", variant: "destructive" });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ebay_connected") === "true") {
      toast({ title: "eBay Connected", description: "Your eBay account has been linked successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/ebay/oauth/status"] });
      window.history.replaceState({}, "", window.location.pathname);
    }
    const ebayError = params.get("ebay_error");
    if (ebayError) {
      toast({ title: "eBay Connection Failed", description: decodeURIComponent(ebayError), variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const cjStatus = useQuery<{ configured: boolean; hasToken: boolean; hasCompanyId: boolean; apiReachable: boolean; apiError: string | null }>({
    queryKey: ["/api/cj/status"],
  });

  const ebayStatus = useQuery<{ configured: boolean; hasClientId: boolean; hasClientSecret: boolean }>({
    queryKey: ["/api/ebay/status"],
  });

  const onCjSync = async () => {
    setCjSyncing(true);
    setCjLog([]);
    setCjStats(null);
    try {
      const body: any = {};
      if (cjMaxResults !== "all") body.maxResults = parseInt(cjMaxResults);
      if (cjSportId && cjSportId !== "all") body.sportId = cjSportId;
      if (cjKeywords.trim()) body.keywords = cjKeywords.trim();

      const res = await apiRequest("POST", "/api/cj/sync", body);
      const data = await res.json();
      setCjLog(data.log ?? []);
      setCjStats({ created: data.created ?? 0, updated: data.updated ?? 0, errors: data.errors ?? 0 });
      setSyncCompleteDialog({
        open: true,
        title: "CJ Affiliate Sync Complete",
        details: [
          `${data.created ?? 0} new deals created`,
          `${data.updated ?? 0} deals updated`,
          `${data.errors ?? 0} errors`,
        ],
      });
    } catch (e: any) {
      toast({ title: "Sync failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setCjSyncing(false);
    }
  };

  const onShopifySync = async () => {
    setShopifySyncing(true);
    setShopifyLog([]);
    setShopifyStats(null);
    try {
      const body: any = {};
      if (shopifySportId && shopifySportId !== "all") body.sportId = shopifySportId;

      const res = await apiRequest("POST", "/api/shopify/sync", body);
      const data = await res.json();
      setShopifyLog(data.log ?? []);
      setShopifyStats({ created: data.created ?? 0, updated: data.updated ?? 0, skipped: data.skipped ?? 0, total: data.total ?? 0 });
      setSyncCompleteDialog({
        open: true,
        title: "Shopify Store Sync Complete",
        details: [
          `${data.total ?? 0} products scanned`,
          `${data.created ?? 0} new deals created`,
          `${data.updated ?? 0} deals updated`,
          `${data.skipped ?? 0} skipped`,
        ],
      });
    } catch (e: any) {
      toast({ title: "Store sync failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setShopifySyncing(false);
    }
  };

  const onFanaticsSync = async () => {
    setFanaticsSyncing(true);
    setFanaticsStats(null);
    try {
      const res = await apiRequest("POST", "/api/fanatics/sync");
      const data = await res.json();
      setFanaticsStats({ created: data.created ?? 0, updated: data.updated ?? 0, errors: data.errors ?? 0 });
      setSyncCompleteDialog({
        open: true,
        title: "Fanatics Sync Complete",
        details: [
          `${data.created ?? 0} new deals created`,
          `${data.updated ?? 0} deals updated`,
          `${data.errors ?? 0} errors`,
        ],
      });
    } catch (e: any) {
      toast({ title: "Fanatics sync failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setFanaticsSyncing(false);
    }
  };

  const onImpactSync = async () => {
    setImpactSyncing(true);
    setImpactStats(null);
    try {
      const res = await apiRequest("POST", "/api/admin/sync/impact");
      const data = await res.json();
      setImpactStats({ created: data.created ?? 0, updated: data.updated ?? 0, errors: data.errors ?? 0 });
      toast({
        title: "Impact Sync Complete",
        description: data.message,
      });
    } catch (e: any) {
      toast({ title: "Impact sync failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setImpactSyncing(false);
    }
  };

  const onPlayItAgainSync = async () => {
    setPlayItAgainSyncing(true);
    setPlayItAgainStats(null);
    try {
      const res = await apiRequest("POST", "/api/admin/sync/playitagain");
      const data = await res.json();
      setPlayItAgainStats({ created: data.created ?? 0, updated: data.updated ?? 0, errors: data.errors ?? 0 });
      toast({
        title: "Play It Again Sync Complete",
        description: data.message,
      });
    } catch (e: any) {
      toast({ title: "Play It Again sync failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setPlayItAgainSyncing(false);
    }
  };

  const onRakutenSync = async () => {
    setRakutenSyncing(true);
    setRakutenStats(null);
    try {
      const res = await apiRequest("POST", "/api/rakuten/sync");
      const data = await res.json();
      setRakutenStats({ created: data.created ?? 0, updated: data.updated ?? 0, errors: data.errors ?? 0 });
      setSyncCompleteDialog({
        open: true,
        title: "Rakuten Sync Complete",
        details: [
          `${data.created ?? 0} new deals created`,
          `${data.updated ?? 0} deals updated`,
          `${data.errors ?? 0} errors`,
        ],
      });
    } catch (e: any) {
      toast({ title: "Rakuten sync failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setRakutenSyncing(false);
    }
  };

  const onSlsSync = async () => {
    setSlsSyncing(true);
    setSlsLog([]);
    setSlsStats(null);
    try {
      const body: any = { maxPages: 3, condition: slsCondition };
      if (slsSportId && slsSportId !== "all") body.sportId = slsSportId;
      if (slsMinPrice) body.minPrice = parseFloat(slsMinPrice) || 0;

      const res = await apiRequest("POST", "/api/sidelineswap/sync", body);
      const data = await res.json();
      setSlsLog(data.log ?? []);
      setSlsStats({ created: data.created ?? 0, updated: data.updated ?? 0, total: data.total ?? 0 });
      setSyncCompleteDialog({
        open: true,
        title: "SidelineSwap Sync Complete",
        details: [
          `${data.total ?? 0} items found`,
          `${data.created ?? 0} new deals created`,
          `${data.updated ?? 0} deals updated`,
        ],
      });
    } catch (e: any) {
      toast({ title: "SidelineSwap sync failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSlsSyncing(false);
    }
  };

  const onEbaySync = async () => {
    setEbaySyncing(true);
    setEbayLog([]);
    setEbayStats(null);
    try {
      const body: any = {};
      if (ebayMaxResults !== "all") body.maxResults = parseInt(ebayMaxResults);
      if (ebaySportId && ebaySportId !== "all") body.sportId = ebaySportId;
      if (ebayKeywords.trim()) body.keywords = ebayKeywords.trim();
      if (ebayCondition !== "all") body.condition = ebayCondition;
      if (ebaySellerFilter && ebaySellerFilter !== "all") body.sellerUsername = ebaySellerFilter;

      const res = await apiRequest("POST", "/api/ebay/sync", body);
      const data = await res.json();
      setEbayLog(data.log ?? []);
      setEbayStats({ created: data.created ?? 0, updated: data.updated ?? 0, skipped: data.skipped ?? 0, errors: data.errors ?? 0 });
      setSyncCompleteDialog({
        open: true,
        title: "eBay Sync Complete",
        details: [
          `${data.created ?? 0} new deals created`,
          `${data.updated ?? 0} deals updated`,
          `${data.skipped ?? 0} skipped`,
          `${data.errors ?? 0} errors`,
        ],
      });
    } catch (e: any) {
      toast({ title: "eBay sync failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setEbaySyncing(false);
    }
  };

  const handleEbayDealItemsSync = async () => {
    setEbayDealItemsSyncing(true);
    try {
      const res = await apiRequest("POST", "/api/ebay/deal-items-sync");
      const data = await res.json();
      setEbayLog(data.log ?? []);
      setEbayStats({ created: data.created ?? 0, updated: data.updated ?? 0, skipped: 0, errors: data.errors ?? 0 });
      setSyncCompleteDialog({
        open: true,
        title: "eBay Deal Items Sync Complete",
        details: [
          `${data.created ?? 0} new deals created`,
          `${data.updated ?? 0} deals updated`,
          `${data.errors ?? 0} errors`,
          "Note: This uses the eBay Deal Item API (requires buy.deal scope approval)",
        ],
      });
    } catch (e: any) {
      toast({ title: "eBay Deal Items sync failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setEbayDealItemsSyncing(false);
    }
  };

  const msrpStatsQuery = useQuery<{
    totalDeals: number;
    verifiedCount: number;
    hasMfrMsrp: number;
    pendingVerification: number;
    totalLookups: number;
    successfulLookups: number;
  }>({
    queryKey: ["/api/admin/msrp/stats"],
    enabled: !!isAdmin,
  });

  const handleMsrpBatchVerify = async () => {
    setMsrpBatchVerifying(true);
    setMsrpLog([]);
    try {
      const body: any = { limit: parseInt(msrpBatchLimit) || 25 };
      if (msrpBatchSportId !== "all") body.sportId = msrpBatchSportId;
      if (msrpBatchBrand.trim()) body.brand = msrpBatchBrand.trim();
      const res = await apiRequest("POST", "/api/admin/msrp/batch-verify", body);
      const data = await res.json();
      setMsrpLog(data.log ?? []);
      setSyncCompleteDialog({
        open: true,
        title: "MSRP Verification Complete",
        details: [
          `${data.verified ?? 0} deals verified`,
          `${data.skipped ?? 0} skipped (MSRP not found)`,
          `${data.failed ?? 0} errors`,
        ],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/msrp/stats"] });
    } catch (e: any) {
      toast({ title: "MSRP verification failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setMsrpBatchVerifying(false);
    }
  };

  const aiClassifyStatsQuery = useQuery<{
    candidatePile: number;
    pending: number;
    aiClassified: number;
    cachedSignatures: number;
    pendingReview: number;
    baseballRescuePile: number;
  }>({
    queryKey: ["/api/admin/ai-classification/stats"],
    enabled: !!isAdmin,
  });

  const aiReviewQueueQuery = useQuery<ClassificationReviewItem[]>({
    queryKey: ["/api/admin/ai-classification/review"],
    enabled: !!isAdmin,
  });

  // Polls the background classification job so a long pass reports live progress
  // instead of blocking the request past the gateway timeout.
  const aiRunStatusQuery = useQuery<{
    status: "idle" | "running" | "done" | "error";
    mode: "unclassified" | "baseball-rescue" | null;
    total: number;
    processed: number;
    applied: number;
    queued: number;
    notSporting: number;
    skipped: number;
    failed: number;
    aiTotal: number;
    aiDone: number;
    message: string;
    error: string | null;
    log: string[];
    isRunning: boolean;
  }>({
    queryKey: ["/api/admin/ai-classification/run-status"],
    enabled: !!isAdmin,
    refetchInterval: (query) =>
      query.state.data?.status === "running" || query.state.data?.isRunning ? 1500 : false,
  });

  const prevRunStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const s = aiRunStatusQuery.data;
    if (!s) return;
    const prev = prevRunStatusRef.current;
    prevRunStatusRef.current = s.status;
    if (s.status === "running" || s.isRunning) {
      if (!aiClassifyRunning) setAiClassifyRunning(true);
      return;
    }
    // Finalize only on a real running -> finished transition (avoids firing the
    // dialog on first load when the last run's result is still in memory).
    if ((s.status === "done" || s.status === "error") && prev === "running") {
      setAiClassifyRunning(false);
      if (s.log?.length) setAiClassifyLog(s.log);
      if (s.status === "error") {
        toast({
          title: "AI classification failed",
          description: s.error ?? "Unknown error",
          variant: "destructive",
        });
      } else {
        setSyncCompleteDialog({
          open: true,
          title: "AI Classification Complete",
          details: [
            `${s.processed} deals processed`,
            `${s.applied} reclassified`,
            `${s.queued} queued for review`,
            `${s.notSporting} flagged non-sporting`,
            `${s.skipped} low-confidence/skipped`,
            `${s.failed} errors`,
          ],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-classification/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-classification/review"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiRunStatusQuery.data]);

  const handleAiClassifyRun = async () => {
    setAiClassifyRunning(true);
    setAiClassifyLog([]);
    try {
      const body: any = { limit: aiClassifyLimit === "all" ? 0 : parseInt(aiClassifyLimit) || 150, mode: aiClassifyMode };
      if (aiClassifyMode === "unclassified" && aiClassifySportId !== "all") body.sportId = aiClassifySportId;
      const res = await apiRequest("POST", "/api/admin/ai-classification/run", body);
      const data = await res.json();
      if (data.started === false) {
        if (data.reason === "already_running") {
          // A pass is already in flight — keep the running UI and let polling finalize it.
          toast({ title: "Already running", description: data.message ?? "A classification pass is already in progress." });
          prevRunStatusRef.current = "running";
          aiRunStatusQuery.refetch();
        } else {
          // Misconfiguration (e.g. missing key) — nothing started, so release the button.
          setAiClassifyRunning(false);
          toast({ title: "Couldn't start", description: data.message ?? "Unable to start classification.", variant: "destructive" });
        }
        return;
      }
      toast({ title: "Started in background", description: "Progress shows below — you can keep working or navigate away." });
      // Mark the expected running state so the next poll's completion fires the finalizer.
      prevRunStatusRef.current = "running";
      aiRunStatusQuery.refetch();
    } catch (e: any) {
      setAiClassifyRunning(false);
      toast({ title: "Failed to start", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  const processStatusQuery = useQuery<{
    sync: { running: boolean; startedAt: string | null };
    aiClassification: { running: boolean; status: string; message: string };
    anyRunning: boolean;
    lastStopAt: string | null;
  }>({
    queryKey: ["/api/admin/processes/status"],
    enabled: !!isAdmin,
    refetchInterval: (query) => (query.state.data?.anyRunning ? 2000 : 8000),
  });

  const [stopPending, setStopPending] = useState(false);

  const handleStopAllProcesses = async () => {
    setStopPending(true);
    try {
      const res = await apiRequest("POST", "/api/admin/processes/stop", {});
      const data = await res.json();
      const stopped: string[] = [];
      if (data.wasRunning?.sync) stopped.push("deal sync");
      if (data.wasRunning?.aiClassification) stopped.push("AI classification");
      toast({
        title: "Stop signal sent",
        description: stopped.length
          ? `Halting ${stopped.join(" and ")} (and any manual sync) at the next safe checkpoint. Scheduled jobs resume on their normal timers.`
          : "Any in-progress sync or AI classification will halt at its next checkpoint. Scheduled jobs are unaffected.",
      });
      processStatusQuery.refetch();
      aiRunStatusQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sync/status"] });
    } catch (e: any) {
      toast({ title: "Couldn't stop processes", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setStopPending(false);
    }
  };

  const handleRemediateMislabeled = async (confirm: boolean) => {
    setRemediateRunning(true);
    try {
      const res = await apiRequest("POST", "/api/admin/ai-classification/remediate-mislabeled", { confirm });
      const data = await res.json();
      setSyncCompleteDialog({
        open: true,
        title: confirm ? "Remediation Applied" : "Remediation Dry Run",
        details: [
          `${data.affected ?? 0} mislabeled deals matched`,
          `${data.cacheRowsRemoved ?? 0} cache rows ${confirm ? "removed" : "would be removed"}`,
          confirm ? `${data.dealsReset ?? 0} deals reset for re-classify` : "No changes made (dry run)",
          confirm ? "Now run a Baseball mis-tag rescue pass to re-route them." : "Re-run with Apply to commit.",
        ],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-classification/stats"] });
    } catch (e: any) {
      toast({ title: "Remediation failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setRemediateRunning(false);
    }
  };

  const handleAiReviewAction = async (id: string, action: "approve" | "reject") => {
    try {
      const res = await apiRequest("POST", `/api/admin/ai-classification/review/${id}/${action}`, {});
      const data = await res.json();
      if (data.success === false) {
        toast({ title: "Action failed", description: data.message ?? "Unknown error", variant: "destructive" });
        return;
      }
      toast({ title: action === "approve" ? "Approved" : "Rejected", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-classification/review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-classification/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-types"] });
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  const toggleReviewSelected = (id: string) => {
    setSelectedReviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Approve a batch of review items sequentially. Sequential (not parallel) so two
  // items that suggest the same new category can't race-create duplicate categories.
  const handleBulkApprove = async (ids: string[]) => {
    if (ids.length === 0 || bulkApproving) return;
    setBulkApproving(true);
    let approved = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        const res = await apiRequest("POST", `/api/admin/ai-classification/review/${id}/approve`, {});
        const data = await res.json();
        if (data.success === false) {
          failed++;
          if (errors.length < 3) errors.push(data.message ?? "failed");
        } else {
          approved++;
        }
      } catch (e: any) {
        failed++;
        if (errors.length < 3) errors.push(e?.message ?? "error");
      }
    }
    setBulkApproving(false);
    setSelectedReviewIds(new Set());
    toast({
      title: `Approved ${approved}${failed ? ` · ${failed} failed` : ""}`,
      description: failed ? errors.join("; ") : undefined,
      variant: failed && !approved ? "destructive" : undefined,
    });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-classification/review"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-classification/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sports"] });
    queryClient.invalidateQueries({ queryKey: ["/api/equipment-types"] });
  };

  const handleRecalculateDiscounts = async () => {
    setRecalculating(true);
    setRecalcResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/recalculate-discounts", {});
      const data = await res.json();
      setRecalcResult(data.message ?? `Done`);
      toast({ title: "Discount Recalculation Complete", description: data.message });
    } catch (e: any) {
      toast({ title: "Recalculation failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  };

  const handleValidateDeals = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/validate-deals", { maxPerSource: parseInt(validationMaxPerSource) || 500 });
      const data = await res.json();
      setValidationResult(data);
      toast({
        title: "Deal Validation Complete",
        description: `eBay: ${data.ebayRemoved}/${data.ebayChecked} removed. SidelineSwap: ${data.ssRemoved}/${data.ssChecked} removed.`,
      });
    } catch (e: any) {
      toast({ title: "Validation failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToLogin((opts) => toast(opts as any));
    }
  }, [authLoading, isAuthenticated, toast]);

  if (!authLoading && isAuthenticated && !isAdmin) {
    return (
      <AppShell title="Access Denied">
        <Seo title="Access Denied | TwinSeam Deals" noindex />
        <EmptyState
          icon={Shield}
          title="Admin Access Only"
          description="This page is restricted to administrators."
        />
      </AppShell>
    );
  }

  const onAddSource = async () => {
    if (!newSourceName || !newSourceUrl) return;
    setIsAddingSource(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSourceName, baseUrl: newSourceUrl }),
      });
      if (!res.ok) throw new Error("Failed to add source");
      toast({ title: "Source added", description: `${newSourceName} has been saved.` });
      setNewSourceName("");
      setNewSourceUrl("");
      sources.refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsAddingSource(false);
    }
  };

  const [dryRun, setDryRun] = useState(true);

  const syncStatus = useQuery<{
    running: boolean;
    startedAt: string | null;
    ebayPublicSnapshot: {
      state: "never_run" | "running" | "success" | "failed";
      lastAttemptCompletedAt: string | null;
      lastSuccessfulAt: string | null;
      lastSuccessfulItemCount: number | null;
      lastAttemptItemCount: number | null;
      message: string | null;
      preserveLastKnownGood: boolean;
    };
  }>({
    queryKey: ["/api/admin/sync/status"],
    refetchInterval: 3000,
  });
  const syncRunning = syncStatus.data?.running ?? false;
  const ebaySnapshot = syncStatus.data?.ebayPublicSnapshot;

  const schedule = useMemo(() => meta.data?.scheduled?.times?.join(" · ") ?? "—", [meta.data]);

  const onRun = async () => {
    try {
      const data = await run.mutateAsync(dryRun);
      if (data?.ok === false && data?.message) {
        toast({ title: "Sync skipped", description: data.message, variant: "destructive" });
        return;
      }
      const breakdown = data?.breakdown ?? {};
      const details = [
        `${data?.totalCreated ?? 0} new deals created`,
        `${data?.totalUpdated ?? 0} deals updated`,
        `${data?.totalErrors ?? 0} errors`,
        `Completed in ${data?.elapsedSeconds ?? "?"}s`,
        "",
        ...Object.entries(breakdown).map(
          ([name, r]: [string, any]) => `${name}: ${r.created} new, ${r.updated} updated`
        ),
      ];
      setSyncCompleteDialog({
        open: true,
        title: "Aggregator Sync Complete",
        details,
      });
    } catch (e: any) {
      toast({ title: "Run failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  return (
    <AppShell
      title="Admin"
      subtitle="Run the aggregator on demand and manage tracked websites."
      rightSlot={
        <div className="flex items-center gap-2">
          <a href="/app/admin/taxonomy-review">
            <Button
              variant="outline"
              size="sm"
              className="ring-focus rounded-xl"
              data-testid="admin-taxonomy-review"
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              Taxonomy Review
            </Button>
          </a>
          <a href="/admin/invoices">
            <Button
              variant="outline"
              size="sm"
              className="ring-focus rounded-xl"
              data-testid="admin-invoices"
            >
              <FileText className="mr-1.5 h-4 w-4" />
              Invoices
            </Button>
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArrangeOpen(true)}
            className="ring-focus rounded-xl"
            data-testid="admin-arrange"
          >
            <GripVertical className="mr-1.5 h-4 w-4" />
            Arrange
          </Button>
          <Button
            onClick={onRun}
            disabled={run.isPending || syncRunning}
            className={cn(
              "ring-focus rounded-xl",
              "bg-gradient-to-r from-accent to-accent/80 text-accent-foreground",
              "shadow-lg shadow-accent/20 hover:shadow-xl hover:shadow-accent/25 hover:-translate-y-0.5",
              "active:translate-y-0 active:shadow-md transition-all duration-200 ease-out",
            )}
            data-testid="admin-run"
          >
            {(run.isPending || syncRunning) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
            {run.isPending ? "Running…" : syncRunning ? "Sync in progress…" : "Run now"}
          </Button>
        </div>
      }
    >
      <Seo title="Admin — TwinSeam Deals" description="Run the deal aggregator and manage sources." noindex />

      {meta.isError ? (
        <EmptyState
          icon={TicketX}
          title="Couldn’t load config"
          description={(meta.error as any)?.message ?? "Unknown error"}
          action={
            <Button onClick={() => meta.refetch()} className="ring-focus rounded-xl" data-testid="admin-retry">
              Retry
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <section id="section-system-controls" style={sectionStyle("system-controls")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="system-controls-panel">
            <CollapseButton id="system-controls" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-rose-600 to-orange-500 shadow-lg shadow-rose-600/20">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">System Controls</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Stop any sync or AI classification that's running right now. Work halts at the next safe checkpoint — already-saved deals are kept. Scheduled jobs are untouched and resume on their normal timers.
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2" data-testid="system-controls-status">
                {processStatusQuery.data?.sync.running ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400" data-testid="status-sync-running">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Deal sync running
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground" data-testid="status-sync-idle">
                    Deal sync idle
                  </span>
                )}
                {processStatusQuery.data?.aiClassification.running ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-700 dark:text-violet-400" data-testid="status-ai-running">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> AI classification running
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground" data-testid="status-ai-idle">
                    AI classification idle
                  </span>
                )}
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="rounded-xl"
                    disabled={stopPending}
                    data-testid="button-stop-all-processes"
                  >
                    {stopPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Stopping…</>
                    ) : (
                      <><Ban className="mr-2 h-4 w-4" /> Stop all running processes</>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent data-testid="dialog-stop-all-processes">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Stop all running processes?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This signals the currently-running deal sync and AI classification to halt at their next safe checkpoint. Deals already saved are kept. Scheduled jobs are not paused and will run again on their normal timers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-stop">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleStopAllProcesses}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-stop"
                    >
                      Stop now
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {processStatusQuery.data?.lastStopAt && (
              <div className="mt-3 text-xs text-muted-foreground" data-testid="text-last-stop">
                Last stop signal: {new Date(processStatusQuery.data.lastStopAt).toLocaleString()}
              </div>
            )}
          </section>

          <section id="section-aggregator" style={sectionStyle("aggregator")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="admin-panel">
            <CollapseButton id="aggregator" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
                <Terminal className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Aggregator controls</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Scheduled runs: <span className="font-semibold text-foreground">{schedule}</span> ({meta.data?.scheduled?.timezone ?? "America/New_York"})
                </div>
              </div>
            </div>

            <div
              className={cn(
                "mt-5 rounded-2xl border px-4 py-3 text-sm",
                ebaySnapshot?.state === "failed"
                  ? "border-amber-500/40 bg-amber-500/10"
                  : ebaySnapshot?.state === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-border bg-background/60",
              )}
              data-testid="ebay-public-snapshot-status"
            >
              <div className="flex items-center gap-2 font-semibold">
                {ebaySnapshot?.state === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : ebaySnapshot?.state === "failed" ? (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                ) : (
                  <Check className="h-4 w-4 text-emerald-600" />
                )}
                Public eBay feed: {ebaySnapshot?.state === "success"
                  ? "last snapshot succeeded"
                  : ebaySnapshot?.state === "failed"
                    ? "latest attempt failed"
                    : ebaySnapshot?.state === "running"
                      ? "retrieval in progress"
                      : "no recorded snapshot yet"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {ebaySnapshot?.message ?? "Run the aggregator once after deployment to establish the first protected snapshot."}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <span>
                  Last successful snapshot:{" "}
                  <strong>
                    {ebaySnapshot?.lastSuccessfulAt
                      ? `${new Date(ebaySnapshot.lastSuccessfulAt).toLocaleString()} (${ebaySnapshot.lastSuccessfulItemCount ?? 0} items)`
                      : "none recorded"}
                  </strong>
                </span>
                {ebaySnapshot?.lastAttemptCompletedAt && (
                  <span>
                    Latest attempt:{" "}
                    <strong>
                      {new Date(ebaySnapshot.lastAttemptCompletedAt).toLocaleString()}
                      {ebaySnapshot.lastAttemptItemCount != null ? ` (${ebaySnapshot.lastAttemptItemCount} candidates)` : ""}
                    </strong>
                  </span>
                )}
              </div>
              {ebaySnapshot?.preserveLastKnownGood && (
                <div className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                  Customer search is using the last known-good eBay snapshot; this failed attempt did not replace or deactivate it.
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background/60 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="h-4 w-4 text-primary" />
                  <div className="text-sm font-bold">Add website to check</div>
                </div>
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="source-name" className="text-xs">Website Name</Label>
                    <Input
                      id="source-name"
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                      placeholder="e.g. My Gear Shop"
                      className="ring-focus rounded-xl h-9 text-sm"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="source-url" className="text-xs">Base URL</Label>
                    <Input
                      id="source-url"
                      value={newSourceUrl}
                      onChange={(e) => setNewSourceUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="ring-focus rounded-xl h-9 text-sm"
                    />
                  </div>
                  <Button
                    onClick={onAddSource}
                    disabled={isAddingSource || !newSourceName || !newSourceUrl}
                    className="w-full ring-focus rounded-xl bg-primary text-primary-foreground"
                  >
                    {isAddingSource ? "Saving..." : "Save Website"}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background/60 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold">Dry run</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      When enabled, aggregator won't write to DB.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">dryRun</Label>
                    <Switch
                      checked={dryRun}
                      onCheckedChange={(v) => setDryRun(Boolean(v))}
                      data-testid="admin-dryrun"
                    />
                  </div>
                </div>

                {syncRunning && !run.isPending && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-xs text-accent-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    <span>A sync is already running — please wait for it to finish.</span>
                  </div>
                )}
                <Button
                  onClick={onRun}
                  disabled={run.isPending || syncRunning}
                  className={cn(
                    "mt-4 w-full ring-focus rounded-xl",
                    "bg-gradient-to-r from-accent to-accent/80 text-accent-foreground",
                    "shadow-lg shadow-accent/20 hover:shadow-xl hover:shadow-accent/25 hover:-translate-y-0.5",
                    "active:translate-y-0 active:shadow-md transition-all duration-200 ease-out",
                  )}
                  data-testid="admin-run-secondary"
                >
                  {(run.isPending || syncRunning) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                  {run.isPending ? "Running…" : syncRunning ? "Sync in progress…" : "Run aggregator"}
                </Button>
              </div>
            </div>
          </section>

          <section id="section-shopify" style={sectionStyle("shopify")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="shopify-sync-panel">
            <CollapseButton id="shopify" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/20">
                <Store className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Twin Seam Sports</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Sync products from your Shopify store at twinseamsports.com
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="shopify-sport" className="text-xs">Sport filter (optional)</Label>
                  <Select value={shopifySportId} onValueChange={setShopifySportId}>
                    <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="shopify-sport-select">
                      <SelectValue placeholder="All sports" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sports</SelectItem>
                      {(sports.data ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={onShopifySync}
                    disabled={shopifySyncing}
                    className="w-full ring-focus rounded-xl"
                    data-testid="shopify-sync-button"
                  >
                    {shopifySyncing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing store...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Sync Our Store
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {shopifyStats && (
                <div className="rounded-xl border border-border bg-background/60 p-4" data-testid="shopify-sync-results">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-sm">
                      <span className="font-semibold text-foreground">{shopifyStats.total}</span>{" "}
                      <span className="text-muted-foreground">products scanned</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{shopifyStats.created}</span>{" "}
                      <span className="text-muted-foreground">new deals</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{shopifyStats.updated}</span>{" "}
                      <span className="text-muted-foreground">updated</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-muted-foreground">{shopifyStats.skipped}</span>{" "}
                      <span className="text-muted-foreground">skipped (non-sporting)</span>
                    </div>
                  </div>
                </div>
              )}

              {shopifyLog.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/50 p-3 max-h-48 overflow-y-auto" data-testid="shopify-sync-log">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Sync Log</div>
                  {shopifyLog.map((line, i) => (
                    <div key={i} className={cn(
                      "text-xs font-mono py-0.5",
                      line.includes("ERROR") ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                    )}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section id="section-fanatics" style={sectionStyle("fanatics")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="fanatics-sync-panel">
            <CollapseButton id="fanatics" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 to-blue-500 shadow-lg shadow-blue-600/20">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Fanatics</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Sync sporting goods deals from Fanatics via Impact affiliate network.
                </div>
              </div>
            </div>

            <div className="mt-5">
              <Button
                onClick={onFanaticsSync}
                disabled={fanaticsSyncing}
                className="w-full ring-focus rounded-xl"
                data-testid="fanatics-sync-button"
              >
                {fanaticsSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing Fanatics...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Fanatics
                  </>
                )}
              </Button>

              {fanaticsStats && (
                <div className="mt-4 rounded-xl border border-border bg-background/60 p-4" data-testid="fanatics-sync-results">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-sm">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fanaticsStats.created}</span>{" "}
                      <span className="text-muted-foreground">new deals</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{fanaticsStats.updated}</span>{" "}
                      <span className="text-muted-foreground">updated</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-red-600 dark:text-red-400">{fanaticsStats.errors}</span>{" "}
                      <span className="text-muted-foreground">errors</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section id="section-playitagain" style={sectionStyle("playitagain")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="playitagain-sync-panel">
            <CollapseButton id="playitagain" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-500 shadow-lg shadow-emerald-600/20">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Play It Again Sports</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Scrape used baseball &amp; softball gear (bats, gloves, catcher's gear, helmets, bags, balls, batting gloves, training) from their national catalog. Most items list at their resale price.
                </div>
              </div>
            </div>

            <div className="mt-5">
              <Button
                onClick={onPlayItAgainSync}
                disabled={playItAgainSyncing}
                className="w-full ring-focus rounded-xl"
                data-testid="playitagain-sync-button"
              >
                {playItAgainSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing Play It Again...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Play It Again Sports
                  </>
                )}
              </Button>

              {playItAgainStats && (
                <div className="mt-4 rounded-xl border border-border bg-background/60 p-4" data-testid="playitagain-sync-results">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-sm">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{playItAgainStats.created}</span>{" "}
                      <span className="text-muted-foreground">new deals</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{playItAgainStats.updated}</span>{" "}
                      <span className="text-muted-foreground">updated</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-red-600 dark:text-red-400">{playItAgainStats.errors}</span>{" "}
                      <span className="text-muted-foreground">errors</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section id="section-impact" style={sectionStyle("impact")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="impact-sync-panel">
            <CollapseButton id="impact" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-purple-700 to-purple-500 shadow-lg shadow-purple-600/20">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Impact / Wilson Family</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Sync all Impact affiliate catalogs: Wilson, DeMarini, Louisville Slugger, EvoShield, ATEC, Luxilon, and others.
                </div>
              </div>
            </div>

            <div className="mt-5">
              <Button
                onClick={onImpactSync}
                disabled={impactSyncing}
                className="w-full ring-focus rounded-xl"
                data-testid="impact-sync-button"
              >
                {impactSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing Impact...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Impact / Wilson
                  </>
                )}
              </Button>

              {impactStats && (
                <div className="mt-4 rounded-xl border border-border bg-background/60 p-4" data-testid="impact-sync-results">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-sm">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{impactStats.created}</span>{" "}
                      <span className="text-muted-foreground">new deals</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{impactStats.updated}</span>{" "}
                      <span className="text-muted-foreground">updated</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-red-600 dark:text-red-400">{impactStats.errors}</span>{" "}
                      <span className="text-muted-foreground">errors</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section id="section-rakuten" style={sectionStyle("rakuten")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="rakuten-sync-panel">
            <CollapseButton id="rakuten" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-orange-600 to-orange-400 shadow-lg shadow-orange-600/20">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">Rakuten / Hoka</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Sync Hoka products via Rakuten Advertising
                </p>
              </div>
            </div>

            <div className="mt-5">
              <Button
                onClick={onRakutenSync}
                disabled={rakutenSyncing}
                className="w-full ring-focus rounded-xl"
                data-testid="rakuten-sync-button"
              >
                {rakutenSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing Rakuten...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Rakuten / Hoka
                  </>
                )}
              </Button>

              {rakutenStats && (
                <div className="mt-4 rounded-xl border border-border bg-background/60 p-4" data-testid="rakuten-sync-results">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-sm">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{rakutenStats.created}</span>{" "}
                      <span className="text-muted-foreground">new deals</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{rakutenStats.updated}</span>{" "}
                      <span className="text-muted-foreground">updated</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-red-600 dark:text-red-400">{rakutenStats.errors}</span>{" "}
                      <span className="text-muted-foreground">errors</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section id="section-ebay-listing" style={sectionStyle("ebay-listing")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="ebay-listing-assistant-panel">
            <CollapseButton id="ebay-listing" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 shadow-lg shadow-indigo-600/20">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">eBay Listing Assistant</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Upload photos + description → AI generates an optimized eBay listing
                </p>
              </div>
            </div>
            <div className="mt-5">
              <EbayListingAssistant />
            </div>
          </section>

          <section id="section-ebay-pricing" style={sectionStyle("ebay-pricing")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="ebay-pricing-analysis-panel">
            <CollapseButton id="ebay-pricing" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-600 to-teal-500 shadow-lg shadow-cyan-600/20">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">eBay Pricing Analysis</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Compare your store prices with eBay market data to maximize profit
                </p>
              </div>
            </div>
            <div className="mt-5">
              <EbayPricingAnalysis />
            </div>
          </section>

          <section id="section-sidelineswap-push" style={sectionStyle("sidelineswap-push")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="sidelineswap-sync-panel">
            <CollapseButton id="sidelineswap-push" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 shadow-lg shadow-orange-500/20">
                <RefreshCw className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">SidelineSwap Sync</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Pull your eBay inventory and push listings directly to SidelineSwap
                </p>
              </div>
            </div>
            <div className="mt-5">
              <SidelineSwapSync />
            </div>
          </section>

          <section id="section-promo-codes" style={sectionStyle("promo-codes")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="promo-codes-panel">
            <CollapseButton id="promo-codes" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-green-600 to-emerald-500 shadow-lg shadow-green-600/20">
                <Gift className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">Promo Codes & Coupons</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Promotional codes from affiliate networks — auto-applied to matching deals
                </p>
              </div>
            </div>
            <div className="mt-5">
              <PromoCodes />
            </div>
          </section>

          <section id="section-featured-deals" style={sectionStyle("featured-deals")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="featured-deals-panel">
            <CollapseButton id="featured-deals" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-600 to-amber-500 shadow-lg shadow-amber-600/20">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Featured Deals</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Paste any product URL to feature it. Source is auto-detected. Amazon links get your partner tag automatically.
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Product URL *</Label>
                  <div className="relative">
                    <Input
                      value={featUrl}
                      onChange={(e) => onDetectSource(e.target.value)}
                      placeholder="https://www.amazon.com/dp/... or any retailer URL"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="feat-url-input"
                    />
                    {detectedSource && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <Globe className="h-3 w-3" />
                        {detectedSource}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Product Title *</Label>
                    <Input
                      value={featTitle}
                      onChange={(e) => setFeatTitle(e.target.value)}
                      placeholder="e.g. Rawlings Heart of the Hide 11.75&quot; Glove"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="feat-title-input"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Brand</Label>
                    <Input
                      value={featBrand}
                      onChange={(e) => setFeatBrand(e.target.value)}
                      placeholder="e.g. Rawlings"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="feat-brand-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Sale Price ($) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={featPrice}
                      onChange={(e) => setFeatPrice(e.target.value)}
                      placeholder="149.99"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="feat-price-input"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">MSRP ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={featMsrp}
                      onChange={(e) => setFeatMsrp(e.target.value)}
                      placeholder="299.99"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="feat-msrp-input"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Sport</Label>
                    <Select value={featSportId} onValueChange={setFeatSportId}>
                      <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="feat-sport-select">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any</SelectItem>
                        {(sports.data ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Condition</Label>
                    <Select value={featCondition} onValueChange={setFeatCondition}>
                      <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="feat-condition-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="preowned">Pre-owned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Image URL (optional)</Label>
                  <Input
                    value={featImageUrl}
                    onChange={(e) => setFeatImageUrl(e.target.value)}
                    placeholder="https://example.com/product-image.jpg"
                    className="ring-focus rounded-xl text-sm"
                    data-testid="feat-image-input"
                  />
                </div>
                <Button
                  onClick={onAddFeaturedDeal}
                  disabled={featSubmitting || !featUrl.trim() || !featTitle.trim() || !featPrice.trim()}
                  className="w-full sm:w-auto ring-focus rounded-xl"
                  data-testid="feat-submit-button"
                >
                  {featSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Featured Deal
                    </>
                  )}
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-background/60 p-4" data-testid="feat-deals-list">
                <div className="text-xs font-semibold text-muted-foreground mb-3">
                  Featured Deals ({(featuredDealsQuery.data ?? []).length})
                </div>
                {featuredDealsQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground">Loading...</div>
                ) : (featuredDealsQuery.data ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">No featured deals yet. Paste a product URL from any retailer above.</div>
                ) : (
                  <div className="space-y-2">
                    {(featuredDealsQuery.data ?? []).map((deal: any) => (
                      <div
                        key={deal.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2"
                        data-testid={`feat-deal-${deal.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{deal.title}</div>
                          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-0.5">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{deal.sourceId}</span>
                            {deal.brand && <span>{deal.brand}</span>}
                            <span className="font-semibold text-foreground">${(deal.priceCents / 100).toFixed(2)}</span>
                            {deal.msrpCents && (
                              <span className="line-through">${(deal.msrpCents / 100).toFixed(2)}</span>
                            )}
                            {deal.percentOff && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                {parseFloat(deal.percentOff).toFixed(0)}% off
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => window.open(applyEbayReferral(deal.url), "_blank")}
                            data-testid={`feat-open-${deal.id}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onDeleteFeaturedDeal(deal.id)}
                            data-testid={`feat-delete-${deal.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section id="section-msrp" style={sectionStyle("msrp")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="msrp-verification-panel">
            <CollapseButton id="msrp" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-600/20">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">MSRP Verification</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  AI-powered manufacturer MSRP lookup. Verifies deals against official manufacturer pricing.
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {msrpStatsQuery.data ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="msrp-stats">
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{msrpStatsQuery.data.verifiedCount}</div>
                    <div className="text-xs text-muted-foreground">Verified</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{msrpStatsQuery.data.pendingVerification}</div>
                    <div className="text-xs text-muted-foreground">Pending</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{msrpStatsQuery.data.totalLookups}</div>
                    <div className="text-xs text-muted-foreground">AI Lookups</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-2xl font-bold text-muted-foreground">{msrpStatsQuery.data.totalDeals}</div>
                    <div className="text-xs text-muted-foreground">Total Deals</div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Sport Filter</label>
                  <Select value={msrpBatchSportId} onValueChange={setMsrpBatchSportId}>
                    <SelectTrigger className="rounded-xl" data-testid="msrp-sport-filter">
                      <SelectValue placeholder="All Sports" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sports</SelectItem>
                      {(sports.data ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Brand Filter</label>
                  <Input
                    placeholder="e.g., Rawlings"
                    value={msrpBatchBrand}
                    onChange={(e) => setMsrpBatchBrand(e.target.value)}
                    className="rounded-xl"
                    data-testid="msrp-brand-filter"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Max Deals</label>
                  <Select value={msrpBatchLimit} onValueChange={setMsrpBatchLimit}>
                    <SelectTrigger className="rounded-xl" data-testid="msrp-limit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleMsrpBatchVerify}
                disabled={msrpBatchVerifying}
                className="w-full ring-focus rounded-xl"
                data-testid="msrp-verify-button"
              >
                {msrpBatchVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying MSRPs...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Verify Manufacturer MSRPs (AI)
                  </>
                )}
              </Button>

              {msrpLog.length > 0 ? (
                <div className="rounded-xl border border-border bg-muted/50 p-3 max-h-48 overflow-y-auto" data-testid="msrp-log">
                  {msrpLog.map((entry, i) => (
                    <div key={i} className="text-xs font-mono text-muted-foreground py-0.5">
                      {entry}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-2 rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-semibold mb-1">Recalculate All Discounts</div>
                <div className="text-xs text-muted-foreground mb-3">
                  Recomputes <code className="text-xs">percent_off</code> for every deal using this priority: AI-verified MSRP → retailer MSRP → original price → 90-day price history high. New items without a reference get no badge; used items default to 0%.
                </div>
                <Button
                  onClick={handleRecalculateDiscounts}
                  disabled={recalculating}
                  variant="outline"
                  className="w-full rounded-xl"
                  data-testid="recalculate-discounts-button"
                >
                  {recalculating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Recalculating...
                    </>
                  ) : (
                    <>
                      <TrendingDown className="mr-2 h-4 w-4" />
                      Recalculate Discounts (All Deals)
                    </>
                  )}
                </Button>
                {recalcResult && (
                  <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium" data-testid="recalc-result">{recalcResult}</div>
                )}
              </div>
            </div>
          </section>

          <section id="section-ai-classification" style={sectionStyle("ai-classification")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="ai-classification-panel">
            <CollapseButton id="ai-classification" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 shadow-lg shadow-violet-600/20">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">AI Classification</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Rescues mis-bucketed deals (default-baseball / "-other") into the existing taxonomy. Runs automatically once daily at 12:15pm ET; trigger a manual pass below. Taxonomy gaps are queued for review — categories are never auto-created.
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {aiClassifyStatsQuery.data ? (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3" data-testid="ai-classification-stats">
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{aiClassifyStatsQuery.data.pending.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Pending</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{aiClassifyStatsQuery.data.baseballRescuePile.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">BB Rescue Pile</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-2xl font-bold text-muted-foreground">{aiClassifyStatsQuery.data.candidatePile.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Candidate Pile</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">{aiClassifyStatsQuery.data.aiClassified.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">AI Classified</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{aiClassifyStatsQuery.data.cachedSignatures.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Cached</div>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-center">
                    <div className="text-2xl font-bold text-fuchsia-600 dark:text-fuchsia-400">{aiClassifyStatsQuery.data.pendingReview.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Pending Review</div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Mode</label>
                  <Select value={aiClassifyMode} onValueChange={(v) => setAiClassifyMode(v as "unclassified" | "baseball-rescue")}>
                    <SelectTrigger className="rounded-xl" data-testid="ai-classification-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unclassified">Unclassified piles</SelectItem>
                      <SelectItem value="baseball-rescue">Baseball mis-tag rescue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Sport Filter</label>
                  <Select value={aiClassifySportId} onValueChange={setAiClassifySportId} disabled={aiClassifyMode === "baseball-rescue"}>
                    <SelectTrigger className="rounded-xl" data-testid="ai-classification-sport-filter">
                      <SelectValue placeholder="All Sports" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sports</SelectItem>
                      {(sports.data ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Max Deals</label>
                  <Select value={aiClassifyLimit} onValueChange={setAiClassifyLimit}>
                    <SelectTrigger className="rounded-xl" data-testid="ai-classification-limit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="150">150</SelectItem>
                      <SelectItem value="300">300</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                      <SelectItem value="1000">1000</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleAiClassifyRun}
                disabled={aiClassifyRunning}
                className="w-full ring-focus rounded-xl"
                data-testid="ai-classification-run-button"
              >
                {aiClassifyRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Classifying deals...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Run AI pass now
                  </>
                )}
              </Button>

              {aiClassifyRunning && aiRunStatusQuery.data?.status === "running" ? (
                (() => {
                  const s = aiRunStatusQuery.data;
                  const inAiPhase = s.aiTotal > 0 && s.aiDone < s.aiTotal;
                  const phase = inAiPhase
                    ? `Querying AI: batch ${s.aiDone}/${s.aiTotal}`
                    : s.total > 0
                      ? `Applying results: ${s.processed}/${s.total} deals`
                      : "Preparing…";
                  const pct = inAiPhase
                    ? Math.round((s.aiDone / s.aiTotal) * 100)
                    : s.total > 0
                      ? Math.round((s.processed / s.total) * 100)
                      : 0;
                  return (
                    <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs" data-testid="ai-classification-progress">
                      <div className="flex items-center justify-between font-medium">
                        <span data-testid="ai-classification-progress-phase">{phase}</span>
                        <span className="text-muted-foreground">{s.mode === "baseball-rescue" ? "Baseball rescue" : "Unclassified"}</span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-2 text-muted-foreground">
                        {s.applied} applied · {s.queued} queued · {s.notSporting} non-sporting · {s.skipped} skipped · {s.failed} failed
                      </div>
                      <div className="mt-1 text-muted-foreground">Running in the background — safe to navigate away.</div>
                    </div>
                  );
                })()
              ) : null}

              {aiClassifyLog.length > 0 ? (
                <div className="rounded-xl border border-border bg-muted/50 p-3 max-h-48 overflow-y-auto" data-testid="ai-classification-log">
                  {aiClassifyLog.map((entry, i) => (
                    <div key={i} className="text-xs font-mono text-muted-foreground py-0.5">
                      {entry}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-2 rounded-xl border border-border bg-muted/30 p-4" data-testid="remediate-mislabeled-panel">
                <div className="text-sm font-semibold">Re-check pre-fix wrong-sport backlog</div>
                <div className="text-xs text-muted-foreground mt-1">
                  One-time cleanup: finds baseball-tagged deals (with a concrete category) whose
                  title clearly signals a different sport but were already AI-stamped before the
                  taxonomy-gap fix. Clearing them lets a Baseball mis-tag rescue pass re-route them
                  to the review queue. Applying re-incurs OpenAI cost on the next pass.
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  <Button
                    variant="outline"
                    onClick={() => handleRemediateMislabeled(false)}
                    disabled={remediateRunning}
                    className="rounded-xl"
                    data-testid="remediate-mislabeled-dryrun-button"
                  >
                    {remediateRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Preview (dry run)
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleRemediateMislabeled(true)}
                    disabled={remediateRunning}
                    className="rounded-xl"
                    data-testid="remediate-mislabeled-apply-button"
                  >
                    {remediateRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Apply remediation
                  </Button>
                </div>
              </div>

              <div className="mt-2 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold">Taxonomy Gap Review Queue</div>
                    <div className="text-xs text-muted-foreground">Approve to create the suggested sport/category and reclassify the deal. Reject to discard.</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => aiReviewQueueQuery.refetch()}
                    data-testid="ai-review-refresh"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {(aiReviewQueueQuery.data ?? []).length > 0 && (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground" data-testid="ai-review-select-all-label">
                      <Checkbox
                        checked={(aiReviewQueueQuery.data ?? []).every((i) => selectedReviewIds.has(i.id))}
                        onCheckedChange={(checked) => {
                          const ids = (aiReviewQueueQuery.data ?? []).map((i) => i.id);
                          setSelectedReviewIds(checked ? new Set(ids) : new Set());
                        }}
                        data-testid="ai-review-select-all"
                      />
                      Select all ({(aiReviewQueueQuery.data ?? []).filter((i) => selectedReviewIds.has(i.id)).length} selected)
                    </label>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        disabled={bulkApproving || (aiReviewQueueQuery.data ?? []).filter((i) => selectedReviewIds.has(i.id)).length === 0}
                        onClick={() => handleBulkApprove((aiReviewQueueQuery.data ?? []).filter((i) => selectedReviewIds.has(i.id)).map((i) => i.id))}
                        data-testid="ai-review-approve-selected"
                      >
                        {bulkApproving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                        Approve selected
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-xl"
                        disabled={bulkApproving}
                        onClick={() => handleBulkApprove((aiReviewQueueQuery.data ?? []).map((i) => i.id))}
                        data-testid="ai-review-approve-all"
                      >
                        {bulkApproving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                        Approve all
                      </Button>
                    </div>
                  </div>
                )}
                {aiReviewQueueQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                ) : (aiReviewQueueQuery.data ?? []).length === 0 ? (
                  <div className="text-sm text-muted-foreground" data-testid="ai-review-empty">No pending taxonomy gaps. 🎉</div>
                ) : (
                  <div className="space-y-2" data-testid="ai-review-list">
                    {(aiReviewQueueQuery.data ?? []).map((item) => (
                      <div key={item.id} className="rounded-xl border border-border bg-background/60 p-3" data-testid={`ai-review-item-${item.id}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            <Checkbox
                              className="mt-0.5 shrink-0"
                              checked={selectedReviewIds.has(item.id)}
                              onCheckedChange={() => toggleReviewSelected(item.id)}
                              data-testid={`ai-review-select-${item.id}`}
                            />
                            <div className="min-w-0">
                            <div className="text-sm font-medium truncate" title={item.title}>{item.title}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                              {item.brand ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">{item.brand}</span> : null}
                              <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-violet-600 dark:text-violet-400">
                                Sport: {item.suggestedSportName ?? item.suggestedSportId ?? "—"}
                              </span>
                              <span className="rounded-md bg-fuchsia-500/10 px-1.5 py-0.5 text-fuchsia-600 dark:text-fuchsia-400">
                                Equip: {item.suggestedEquipmentName ?? "—"}
                              </span>
                              {item.confidence ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">{item.confidence}</span> : null}
                            </div>
                            {item.reasoning ? <div className="mt-1 text-xs text-muted-foreground">{item.reasoning}</div> : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <Button
                              size="sm"
                              className="rounded-xl"
                              onClick={() => handleAiReviewAction(item.id, "approve")}
                              data-testid={`ai-review-approve-${item.id}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => handleAiReviewAction(item.id, "reject")}
                              data-testid={`ai-review-reject-${item.id}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section id="section-deal-validation" style={sectionStyle("deal-validation")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="deal-validation-panel">
            <CollapseButton id="deal-validation" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-red-600 to-rose-500 shadow-lg shadow-red-600/20">
                <Link2Off className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Deal Validation</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Check eBay and SidelineSwap deals for dead or ended listings and remove them automatically. Runs automatically 4×/day.
                </div>
              </div>
            </div>

            {!collapsedSections.includes("deal-validation") && (
              <div className="mt-5 space-y-4">
                <div className="flex items-end gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Max per source</Label>
                    <input
                      type="number"
                      min={50}
                      max={2000}
                      step={50}
                      value={validationMaxPerSource}
                      onChange={(e) => setValidationMaxPerSource(e.target.value)}
                      className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm ring-focus"
                      data-testid="validation-max-input"
                    />
                  </div>
                  <Button
                    onClick={handleValidateDeals}
                    disabled={validating}
                    className="rounded-xl"
                    data-testid="button-validate-deals"
                  >
                    {validating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <Link2Off className="mr-2 h-4 w-4" />
                        Check Dead Links
                      </>
                    )}
                  </Button>
                </div>

                {validationResult && (
                  <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-2" data-testid="validation-result">
                    <div className="text-sm font-semibold">Results ({(validationResult.durationMs / 1000).toFixed(1)}s)</div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-border bg-background p-3">
                        <div className="text-muted-foreground text-xs mb-1">eBay</div>
                        <div className="font-mono font-bold text-red-500">{validationResult.ebayRemoved} removed</div>
                        <div className="text-xs text-muted-foreground">{validationResult.ebayChecked} checked</div>
                      </div>
                      <div className="rounded-lg border border-border bg-background p-3">
                        <div className="text-muted-foreground text-xs mb-1">SidelineSwap</div>
                        <div className="font-mono font-bold text-red-500">{validationResult.ssRemoved} removed</div>
                        <div className="text-xs text-muted-foreground">{validationResult.ssChecked} checked</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section id="section-popular-products" style={sectionStyle("popular-products")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="popular-products-panel">
            <CollapseButton id="popular-products" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-orange-600 to-orange-500 shadow-lg shadow-orange-600/20">
                <ShoppingBag className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Popular Products</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Admin-curated products shown on the landing page, deals feed, and category hub. Trending products from user clicks automatically fill remaining slots.
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Product Name *</Label>
                  <Input
                    value={ppName}
                    onChange={(e) => {
                      setPpName(e.target.value);
                      setPpSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                    }}
                    placeholder="e.g. Wilson A2000"
                    className="ring-focus rounded-xl text-sm"
                    data-testid="pp-name-input"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Slug (auto-generated)</Label>
                  <Input
                    value={ppSlug}
                    onChange={(e) => setPpSlug(e.target.value)}
                    placeholder="e.g. wilson-a2000"
                    className="ring-focus rounded-xl text-sm"
                    data-testid="pp-slug-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Sport *</Label>
                  <Input
                    value={ppSport}
                    onChange={(e) => setPpSport(e.target.value)}
                    placeholder="e.g. Baseball"
                    className="ring-focus rounded-xl text-sm"
                    data-testid="pp-sport-input"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Sort Order</Label>
                  <Input
                    type="number"
                    value={ppOrder}
                    onChange={(e) => setPpOrder(e.target.value)}
                    placeholder="0"
                    className="ring-focus rounded-xl text-sm"
                    data-testid="pp-order-input"
                  />
                </div>
              </div>
              <Button
                onClick={async () => {
                  if (!ppName.trim() || !ppSlug.trim() || !ppSport.trim()) {
                    toast({ title: "Missing fields", description: "Name, slug, and sport are required.", variant: "destructive" });
                    return;
                  }
                  setPpSubmitting(true);
                  try {
                    await apiRequest("POST", "/api/admin/popular-products", {
                      name: ppName.trim(),
                      slug: ppSlug.trim(),
                      sport: ppSport.trim(),
                      sortOrder: parseInt(ppOrder) || 0,
                      isActive: true,
                    });
                    toast({ title: "Added", description: `${ppName.trim()} added to popular products.` });
                    setPpName(""); setPpSlug(""); setPpSport(""); setPpOrder("0");
                    queryClient.invalidateQueries({ queryKey: ["/api/admin/popular-products"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/popular-products"] });
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setPpSubmitting(false);
                  }
                }}
                disabled={ppSubmitting || !ppName.trim() || !ppSport.trim()}
                className="ring-focus rounded-xl"
                data-testid="pp-add-button"
              >
                {ppSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add Product
              </Button>

              {(popularProductsQuery.data ?? []).length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-semibold mb-2">
                    Curated Products ({(popularProductsQuery.data ?? []).length})
                  </div>
                  <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                    {(popularProductsQuery.data ?? []).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-card" data-testid={`pp-row-${p.id}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{p.name}</span>
                            {!p.isActive && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Hidden</span>}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{p.sport} · /deals/{p.slug} · Order: {p.sortOrder}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={async () => {
                              try {
                                await apiRequest("PATCH", `/api/admin/popular-products/${p.id}`, { isActive: !p.isActive });
                                queryClient.invalidateQueries({ queryKey: ["/api/admin/popular-products"] });
                                queryClient.invalidateQueries({ queryKey: ["/api/popular-products"] });
                                toast({ title: p.isActive ? "Hidden" : "Shown", description: `${p.name} ${p.isActive ? "hidden from" : "shown on"} popular products.` });
                              } catch (err: any) {
                                toast({ title: "Error", description: err.message || "Failed to update product", variant: "destructive" });
                              }
                            }}
                            data-testid={`pp-toggle-${p.id}`}
                          >
                            {p.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={async () => {
                              try {
                                await apiRequest("DELETE", `/api/admin/popular-products/${p.id}`);
                                queryClient.invalidateQueries({ queryKey: ["/api/admin/popular-products"] });
                                queryClient.invalidateQueries({ queryKey: ["/api/popular-products"] });
                                toast({ title: "Deleted", description: `${p.name} removed.` });
                              } catch (err: any) {
                                toast({ title: "Error", description: err.message || "Failed to delete product", variant: "destructive" });
                              }
                            }}
                            data-testid={`pp-delete-${p.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section id="section-bonus-deals" style={sectionStyle("bonus-deals")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="bonus-deals-panel">
            <CollapseButton id="bonus-deals" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-pink-600 to-pink-500 shadow-lg shadow-pink-600/20">
                <Gift className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">Bonus Deals</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Non-sporting goods deals. These appear in a separate section on the deals page.
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Product URL *</Label>
                  <Input
                    value={bonusUrl}
                    onChange={(e) => setBonusUrl(e.target.value)}
                    placeholder="https://www.amazon.com/dp/... or any URL"
                    className="ring-focus rounded-xl text-sm"
                    data-testid="bonus-url-input"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Product Title *</Label>
                    <Input
                      value={bonusTitle}
                      onChange={(e) => setBonusTitle(e.target.value)}
                      placeholder="e.g. Sony WH-1000XM5 Headphones"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="bonus-title-input"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Brand</Label>
                    <Input
                      value={bonusBrand}
                      onChange={(e) => setBonusBrand(e.target.value)}
                      placeholder="e.g. Sony"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="bonus-brand-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Sale Price ($) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={bonusPrice}
                      onChange={(e) => setBonusPrice(e.target.value)}
                      placeholder="249.99"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="bonus-price-input"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Original Price ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={bonusOriginalPrice}
                      onChange={(e) => setBonusOriginalPrice(e.target.value)}
                      placeholder="349.99"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="bonus-original-price-input"
                    />
                  </div>
                  <div className="grid gap-1.5 col-span-2 sm:col-span-1">
                    <Label className="text-xs">Image URL</Label>
                    <Input
                      value={bonusImageUrl}
                      onChange={(e) => setBonusImageUrl(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="bonus-image-input"
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Description (optional)</Label>
                  <Input
                    value={bonusDescription}
                    onChange={(e) => setBonusDescription(e.target.value)}
                    placeholder="Brief description of the deal"
                    className="ring-focus rounded-xl text-sm"
                    data-testid="bonus-description-input"
                  />
                </div>
                <Button
                  onClick={onAddBonusDeal}
                  disabled={bonusSubmitting || !bonusUrl.trim() || !bonusTitle.trim() || !bonusPrice.trim()}
                  className="w-full sm:w-auto ring-focus rounded-xl"
                  data-testid="bonus-submit-button"
                >
                  {bonusSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Bonus Deal
                    </>
                  )}
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-background/60 p-4" data-testid="bonus-deals-list">
                <div className="text-xs font-semibold text-muted-foreground mb-3">
                  Bonus Deals ({(bonusDealsQuery.data ?? []).length})
                </div>
                {bonusDealsQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground">Loading...</div>
                ) : (bonusDealsQuery.data ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">No bonus deals yet. Add non-sporting goods deals above.</div>
                ) : (
                  <div className="space-y-2">
                    {(bonusDealsQuery.data ?? []).map((deal: any) => (
                      <div
                        key={deal.id}
                        className={`flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 ${deal.isActive ? 'bg-muted/50' : 'bg-muted/20 opacity-60'}`}
                        data-testid={`bonus-deal-${deal.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{deal.title}</div>
                          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-0.5">
                            {deal.brand && <span>{deal.brand}</span>}
                            <span className="font-semibold text-foreground">${(deal.priceCents / 100).toFixed(2)}</span>
                            {deal.originalPriceCents && (
                              <span className="line-through">${(deal.originalPriceCents / 100).toFixed(2)}</span>
                            )}
                            {!deal.isActive && (
                              <span className="text-amber-600 dark:text-amber-400 text-[10px] font-medium">HIDDEN</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onToggleBonusDeal(deal.id, deal.isActive)}
                            title={deal.isActive ? "Hide deal" : "Show deal"}
                            data-testid={`bonus-toggle-${deal.id}`}
                          >
                            {deal.isActive ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => window.open(deal.url, "_blank")}
                            data-testid={`bonus-open-${deal.id}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onDeleteBonusDeal(deal.id)}
                            data-testid={`bonus-delete-${deal.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section id="section-sidelineswap-market" style={sectionStyle("sidelineswap-market")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="sidelineswap-sync-panel">
            <CollapseButton id="sidelineswap-market" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-orange-600 to-orange-500 shadow-lg shadow-orange-600/20">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">SidelineSwap</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Sync used and new sporting goods listings from SidelineSwap marketplace
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="sls-sport" className="text-xs">Sport filter</Label>
                  <Select value={slsSportId} onValueChange={setSlsSportId}>
                    <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="sls-sport-select">
                      <SelectValue placeholder="All sports" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sports</SelectItem>
                      {["baseball", "fastpitch-softball", "slowpitch-softball", "golf", "lacrosse", "hockey", "football", "soccer"].map((s) => (
                        <SelectItem key={s} value={s}>{s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sls-min-price" className="text-xs">Min price ($)</Label>
                  <Input
                    id="sls-min-price"
                    type="number"
                    value={slsMinPrice}
                    onChange={(e) => setSlsMinPrice(e.target.value)}
                    className="ring-focus rounded-xl text-sm"
                    data-testid="sls-min-price-input"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sls-condition" className="text-xs">Condition</Label>
                  <Select value={slsCondition} onValueChange={setSlsCondition}>
                    <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="sls-condition-select">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="new">New only</SelectItem>
                      <SelectItem value="preowned">Pre-owned only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={onSlsSync}
                    disabled={slsSyncing}
                    className="w-full ring-focus rounded-xl"
                    data-testid="sls-sync-button"
                  >
                    {slsSyncing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Sync SidelineSwap
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {slsStats && (
                <div className="rounded-xl border border-border bg-background/60 p-4" data-testid="sls-sync-results">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-sm">
                      <span className="font-semibold text-foreground">{slsStats.total}</span>{" "}
                      <span className="text-muted-foreground">items found</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{slsStats.created}</span>{" "}
                      <span className="text-muted-foreground">new deals</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{slsStats.updated}</span>{" "}
                      <span className="text-muted-foreground">updated</span>
                    </div>
                  </div>
                </div>
              )}

              {slsLog.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/50 p-3 max-h-48 overflow-y-auto" data-testid="sls-sync-log">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">Sync Log</div>
                  {slsLog.map((line, i) => (
                    <div key={i} className={cn(
                      "text-xs font-mono py-0.5",
                      line.includes("Error") ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                    )}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section id="section-cj-sync" style={sectionStyle("cj-sync")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="cj-sync-panel">
            <CollapseButton id="cj-sync" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-600/20">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">CJ Affiliate Live Deals</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Pull live product listings from CJ Affiliate network retailers.
                </div>
              </div>
            </div>

            {cjStatus.data && !cjStatus.data.configured ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    API credentials needed
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Set <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">CJ_API_TOKEN</code> and{" "}
                  <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">CJ_COMPANY_ID</code> in
                  your Secrets to enable live deal syncing from CJ Affiliate.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Get your Personal Access Token at{" "}
                  <a href="https://developers.cj.com/account/personal-access-tokens" target="_blank" rel="noopener noreferrer" className="underline">developers.cj.com</a>.
                  Your CJ_COMPANY_ID is the CID shown in the CJ platform URL.
                </p>
              </div>
            ) : cjStatus.data && cjStatus.data.configured && !cjStatus.data.apiReachable ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                      API connection issue
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Credentials are set but the CJ Product Feed API is not responding.
                    {cjStatus.data.apiError && (
                      <span className="block mt-1 text-xs">{cjStatus.data.apiError}</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ensure your account has Product Feed API access at{" "}
                    <a href="https://developers.cj.com/" target="_blank" rel="noopener noreferrer" className="underline">developers.cj.com</a>.
                    You may need to contact <span className="font-mono">dx@cj.com</span> to enable this feature.
                  </p>
                </div>
                <div className="mt-5 space-y-4">{/* Still show the sync UI for retrying */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="cj-sport" className="text-xs">Sport (optional)</Label>
                      <Select value={cjSportId} onValueChange={setCjSportId}>
                        <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="cj-sport-select">
                          <SelectValue placeholder="All sports" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All sports</SelectItem>
                          {(sports.data ?? []).map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="cj-keywords" className="text-xs">Custom keywords (optional)</Label>
                      <Input
                        id="cj-keywords"
                        value={cjKeywords}
                        onChange={(e) => setCjKeywords(e.target.value)}
                        placeholder="e.g. Wilson A2000 glove"
                        className="ring-focus rounded-xl text-sm"
                        data-testid="cj-keywords-input"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="cj-max-results-retry" className="text-xs">Max results</Label>
                      <Select value={cjMaxResults} onValueChange={setCjMaxResults}>
                        <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="cj-max-results-select">
                          <SelectValue placeholder="50" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="200">200</SelectItem>
                          <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    onClick={onCjSync}
                    disabled={cjSyncing}
                    className="w-full ring-focus rounded-xl"
                    data-testid="cj-sync-button"
                  >
                    {cjSyncing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing live deals...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry CJ Sync
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="cj-sport" className="text-xs">Sport (optional)</Label>
                    <Select value={cjSportId} onValueChange={setCjSportId}>
                      <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="cj-sport-select">
                        <SelectValue placeholder="All sports" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sports</SelectItem>
                        {(sports.data ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cj-keywords" className="text-xs">Custom keywords (optional)</Label>
                    <Input
                      id="cj-keywords"
                      value={cjKeywords}
                      onChange={(e) => setCjKeywords(e.target.value)}
                      placeholder="e.g. Wilson A2000 glove"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="cj-keywords-input"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cj-max-results" className="text-xs">Max results</Label>
                    <Select value={cjMaxResults} onValueChange={setCjMaxResults}>
                      <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="cj-max-results-select">
                        <SelectValue placeholder="50" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={onCjSync}
                  disabled={cjSyncing}
                  className="w-full ring-focus rounded-xl"
                  data-testid="cj-sync-button"
                >
                  {cjSyncing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing live deals...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync CJ Affiliate Deals
                    </>
                  )}
                </Button>

                {cjStats && (
                  <div className="rounded-xl border border-border bg-background/60 p-4" data-testid="cj-sync-results">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-sm">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{cjStats.created}</span>{" "}
                        <span className="text-muted-foreground">new deals</span>
                      </div>
                      <div className="text-sm">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">{cjStats.updated}</span>{" "}
                        <span className="text-muted-foreground">updated</span>
                      </div>
                      {cjStats.errors > 0 && (
                        <div className="text-sm">
                          <span className="font-semibold text-red-600 dark:text-red-400">{cjStats.errors}</span>{" "}
                          <span className="text-muted-foreground">errors</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {cjLog.length > 0 && (
                  <div className="rounded-xl border border-border bg-muted/50 p-3 max-h-48 overflow-y-auto" data-testid="cj-sync-log">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Sync Log</div>
                    {cjLog.map((line, i) => (
                      <div key={i} className={cn(
                        "text-xs font-mono py-0.5",
                        line.includes("ERROR") ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                      )}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section id="section-ebay-sync" style={sectionStyle("ebay-sync")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="ebay-sync-panel">
            <CollapseButton id="ebay-sync" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-lg shadow-blue-600/20">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">eBay Live Deals</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Search eBay for sporting goods deals with real-time pricing.
                </div>
              </div>
            </div>

            {ebayStatus.data && !ebayStatus.data.configured ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    API credentials needed
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Set <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">EBAY_CLIENT_ID</code> and{" "}
                  <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">EBAY_CLIENT_SECRET</code> in
                  your Secrets to enable live deal syncing from eBay.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="grid gap-1.5">
                    <Label htmlFor="ebay-sport" className="text-xs">Sport (optional)</Label>
                    <Select value={ebaySportId} onValueChange={setEbaySportId}>
                      <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="ebay-sport-select">
                        <SelectValue placeholder="All sports" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sports</SelectItem>
                        {(sports.data ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ebay-keywords" className="text-xs">Custom keywords (optional)</Label>
                    <Input
                      id="ebay-keywords"
                      value={ebayKeywords}
                      onChange={(e) => setEbayKeywords(e.target.value)}
                      placeholder="e.g. Rawlings Heart of the Hide"
                      className="ring-focus rounded-xl text-sm"
                      data-testid="ebay-keywords-input"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ebay-condition" className="text-xs">Condition</Label>
                    <Select value={ebayCondition} onValueChange={setEbayCondition}>
                      <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="ebay-condition-select">
                        <SelectValue placeholder="All conditions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All conditions</SelectItem>
                        <SelectItem value="new">New only</SelectItem>
                        <SelectItem value="preowned">Pre-owned only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ebay-seller" className="text-xs">Seller (optional)</Label>
                    <Select value={ebaySellerFilter} onValueChange={setEbaySellerFilter}>
                      <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="ebay-seller-select">
                        <SelectValue placeholder="All sellers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sellers</SelectItem>
                        {(ebaySellersQuery.data ?? []).map((seller: any) => (
                          <SelectItem key={seller.id} value={seller.username}>{seller.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ebay-max-results" className="text-xs">Max results</Label>
                    <Select value={ebayMaxResults} onValueChange={setEbayMaxResults}>
                      <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="ebay-max-results-select">
                        <SelectValue placeholder="50" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={onEbaySync}
                  disabled={ebaySyncing}
                  className="w-full ring-focus rounded-xl"
                  data-testid="ebay-sync-button"
                >
                  {ebaySyncing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching eBay...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync eBay Deals
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleEbayDealItemsSync}
                  disabled={ebayDealItemsSyncing}
                  variant="outline"
                  className="w-full ring-focus rounded-xl"
                  data-testid="ebay-deal-items-sync-button"
                >
                  {ebayDealItemsSyncing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing Deal Items...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync eBay Deal Items (buy.deal API)
                    </>
                  )}
                </Button>

                {ebayStats && (
                  <div className="rounded-xl border border-border bg-background/60 p-4" data-testid="ebay-sync-results">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="text-sm">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{ebayStats.created}</span>{" "}
                        <span className="text-muted-foreground">new deals</span>
                      </div>
                      <div className="text-sm">
                        <span className="font-semibold text-blue-600 dark:text-blue-400">{ebayStats.updated}</span>{" "}
                        <span className="text-muted-foreground">updated</span>
                      </div>
                      <div className="text-sm">
                        <span className="font-semibold text-muted-foreground">{ebayStats.skipped}</span>{" "}
                        <span className="text-muted-foreground">skipped (no discount)</span>
                      </div>
                      {ebayStats.errors > 0 && (
                        <div className="text-sm">
                          <span className="font-semibold text-red-600 dark:text-red-400">{ebayStats.errors}</span>{" "}
                          <span className="text-muted-foreground">errors</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {ebayLog.length > 0 && (
                  <div className="rounded-xl border border-border bg-muted/50 p-3 max-h-48 overflow-y-auto" data-testid="ebay-sync-log">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Sync Log</div>
                    {ebayLog.map((line, i) => (
                      <div key={i} className={cn(
                        "text-xs font-mono py-0.5",
                        line.includes("ERROR") ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                      )}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <div id="section-sms-blast" style={sectionStyle("sms-blast")} className="relative">
            <CollapseButton id="sms-blast" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <SmsDealBlastSection />
          </div>

          <div id="section-analytics" style={sectionStyle("analytics")} className="relative">
            <CollapseButton id="analytics" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <AnalyticsSection />
          </div>

          <div id="section-affiliate-reporting" style={sectionStyle("affiliate-reporting")} className="relative">
            <CollapseButton id="affiliate-reporting" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <AffiliateReportingSection />
          </div>

          <section id="section-ebay-reports" style={sectionStyle("ebay-reports")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="ebay-reports-panel">
            <CollapseButton id="ebay-reports" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 shadow-lg shadow-indigo-600/20">
                <Download className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">eBay Reports</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Connect your eBay account to download sales and purchase reports as CSV files.
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {ebayOauthStatus.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking connection...
                </div>
              ) : ebayOauthStatus.data?.connected ? (
                <>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-3 py-2">
                      <Link2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-300">
                        eBay account connected
                        {ebayOauthStatus.data?.ebayUsername && (
                          <span className="ml-1 text-green-600 dark:text-green-400">
                            ({ebayOauthStatus.data.ebayUsername})
                          </span>
                        )}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onDisconnectEbay}
                      disabled={disconnecting}
                      className="ring-focus rounded-xl"
                      data-testid="ebay-disconnect"
                    >
                      <Link2Off className="mr-2 h-4 w-4" />
                      {disconnecting ? "Disconnecting..." : "Disconnect"}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Start Date (optional)</Label>
                      <Input
                        type="date"
                        value={reportStartDate}
                        onChange={(e) => setReportStartDate(e.target.value)}
                        className="ring-focus rounded-xl text-sm"
                        data-testid="report-start-date"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">End Date (optional)</Label>
                      <Input
                        type="date"
                        value={reportEndDate}
                        onChange={(e) => setReportEndDate(e.target.value)}
                        className="ring-focus rounded-xl text-sm"
                        data-testid="report-end-date"
                      />
                    </div>
                    <div className="flex items-end gap-2 flex-wrap">
                      <Button
                        onClick={() => downloadReport("sales")}
                        className="ring-focus rounded-xl flex-1"
                        data-testid="download-sales"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Sales CSV
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => downloadReport("purchases")}
                        className="ring-focus rounded-xl flex-1"
                        data-testid="download-purchases"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Purchases CSV
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Leave dates empty to download all available data. If a date filter is rejected by eBay, all orders will be returned instead. Purchases require the <code className="px-1 py-0.5 rounded bg-muted text-xs">buy.order.readonly</code> scope enabled on your eBay developer app.
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  {ebayOauthStatus.data?.message && (
                    <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200" data-testid="ebay-oauth-error">
                      {ebayOauthStatus.data.message}
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground">
                    Connect your eBay seller account to pull sales and purchase reports. You'll be redirected to eBay to authorize access.
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>
                      <strong>Setup required:</strong> In your eBay developer account at <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="underline">developer.ebay.com</a>:
                    </div>
                    <div>
                      1. Set your RuName's "Accept URL" to:
                      <code className="ml-1 px-1.5 py-0.5 rounded bg-muted text-xs break-all">
                        {window.location.origin}/api/ebay/oauth/callback
                      </code>
                    </div>
                    <div>
                      2. Add an <code className="px-1 py-0.5 rounded bg-muted text-xs">EBAY_REDIRECT_URI</code> secret set to your RuName value (not a URL — it's the name shown in the eBay developer portal).
                    </div>
                    <div>
                      3. Ensure these OAuth scopes are enabled on your app: <code className="px-1 py-0.5 rounded bg-muted text-xs">sell.fulfillment.readonly</code>, <code className="px-1 py-0.5 rounded bg-muted text-xs">sell.inventory</code>, <code className="px-1 py-0.5 rounded bg-muted text-xs">sell.inventory.readonly</code>, <code className="px-1 py-0.5 rounded bg-muted text-xs">buy.order.readonly</code> (for purchases)
                    </div>
                  </div>
                  <Button
                    onClick={() => { window.location.href = "/api/ebay/oauth/start"; }}
                    className="ring-focus rounded-xl"
                    data-testid="ebay-connect"
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    Connect eBay Account
                  </Button>
                </div>
              )}
            </div>
          </section>

          <section id="section-ebay-sellers" style={sectionStyle("ebay-sellers")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="ebay-sellers-panel">
            <CollapseButton id="ebay-sellers" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-lg shadow-blue-600/20">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-display text-xl font-bold">eBay Saved Sellers</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Manage eBay seller usernames. Their listings are automatically synced across all sport categories.
                </div>
              </div>
              <div className="ml-auto flex-shrink-0">
                <Button
                  onClick={onSyncEbaySellers}
                  disabled={esSellerSyncing || (ebaySellersQuery.data ?? []).length === 0}
                  variant="outline"
                  className="ring-focus rounded-xl"
                  data-testid="es-sync-button"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${esSellerSyncing ? "animate-spin" : ""}`} />
                  {esSellerSyncing ? "Syncing..." : "Sync Sellers"}
                </Button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">eBay Username</Label>
                  <Input
                    value={esNewUsername}
                    onChange={(e) => setEsNewUsername(e.target.value)}
                    placeholder="e.g. baseballdeals123"
                    className="ring-focus rounded-xl text-sm"
                    onKeyDown={(e) => e.key === "Enter" && onAddEbaySeller()}
                    data-testid="es-username-input"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input
                    value={esNewNotes}
                    onChange={(e) => setEsNewNotes(e.target.value)}
                    placeholder="e.g. Great glove seller"
                    className="ring-focus rounded-xl text-sm"
                    onKeyDown={(e) => e.key === "Enter" && onAddEbaySeller()}
                    data-testid="es-notes-input"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={onAddEbaySeller}
                    disabled={esAdding || !esNewUsername.trim()}
                    className="w-full ring-focus rounded-xl"
                    data-testid="es-add-button"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {esAdding ? "Adding..." : "Add Seller"}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background/60 p-4" data-testid="es-list">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Saved Sellers ({(ebaySellersQuery.data ?? []).length})
                    {Object.keys(esDealCounts).length > 0 && (
                      <span className="ml-2 text-emerald-600">
                        — {Object.values(esDealCounts).filter(c => c > 0).length} with deals, {Object.values(esDealCounts).filter(c => c === 0).length} with 0 deals
                      </span>
                    )}
                  </div>
                </div>
                {ebaySellersQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground">Loading...</div>
                ) : (ebaySellersQuery.data ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">No sellers saved yet. Add an eBay username above.</div>
                ) : (
                  <div className="space-y-1.5">
                    {(ebaySellersQuery.data ?? [])
                      .slice()
                      .sort((a: any, b: any) => (esDealCounts[a.username] ?? 0) - (esDealCounts[b.username] ?? 0))
                      .map((seller: any) => {
                        const dealCount = esDealCounts[seller.username] ?? -1;
                        const isEditing = esEditingId === seller.id;
                        return (
                          <div
                            key={seller.id}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${dealCount === 0 ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30" : "border-border bg-muted/50"}`}
                            data-testid={`es-item-${seller.id}`}
                          >
                            {isEditing ? (
                              <div className="flex items-center gap-2 flex-1">
                                <Input
                                  value={esEditUsername}
                                  onChange={(e) => setEsEditUsername(e.target.value)}
                                  className="h-7 text-sm rounded-lg w-48"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") onUpdateEbaySeller(seller.id);
                                    if (e.key === "Escape") { setEsEditingId(null); setEsEditUsername(""); }
                                  }}
                                  autoFocus
                                  data-testid={`es-edit-input-${seller.id}`}
                                />
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onUpdateEbaySeller(seller.id)} data-testid={`es-edit-save-${seller.id}`}>
                                  <Check className="h-3 w-3 text-emerald-600" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEsEditingId(null); setEsEditUsername(""); }} data-testid={`es-edit-cancel-${seller.id}`}>
                                  <X className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1 min-w-0">
                                  <a
                                    href={`https://www.ebay.com/usr/${seller.username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-primary hover:underline"
                                    data-testid={`es-link-${seller.id}`}
                                  >{seller.username}</a>
                                  {seller.notes && (
                                    <span className="text-xs text-muted-foreground ml-1.5">({seller.notes})</span>
                                  )}
                                  {dealCount >= 0 && (
                                    <span className={`text-xs ml-2 px-1.5 py-0.5 rounded ${dealCount > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
                                      {dealCount} deal{dealCount !== 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => onVerifyEbaySeller(seller.username)}
                                  disabled={esVerifying === seller.username}
                                  title="Verify on eBay"
                                  data-testid={`es-verify-${seller.id}`}
                                >
                                  {esVerifying === seller.username ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Search className="h-3 w-3 text-muted-foreground" />
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => { setEsEditingId(seller.id); setEsEditUsername(seller.username); }}
                                  title="Edit username"
                                  data-testid={`es-edit-${seller.id}`}
                                >
                                  <Pencil className="h-3 w-3 text-muted-foreground" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => onDeleteEbaySeller(seller.id, seller.username)}
                                  data-testid={`es-delete-${seller.id}`}
                                >
                                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section id="section-sub-filters" style={sectionStyle("sub-filters")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="sub-filters-panel">
            <CollapseButton id="sub-filters" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 shadow-lg shadow-violet-600/20">
                <Filter className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-display text-xl font-bold">Equipment Sub-Filters</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Create sub-categories within equipment types for more precise filtering.
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={onReclassifyAll}
                disabled={reclassifyRunning}
                data-testid="button-reclassify-all-deals"
                className="ml-auto shrink-0"
              >
                {reclassifyRunning ? "Reclassifying…" : "Reclassify all deals"}
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Sport</Label>
                  <Select value={sfSportId} onValueChange={(v) => { setSfSportId(v); setSfEqTypeId(""); }}>
                    <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="sf-sport-select">
                      <SelectValue placeholder="Select sport" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sports</SelectItem>
                      {(sports.data ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Equipment Type</Label>
                  <Select value={sfEqTypeId} onValueChange={setSfEqTypeId} disabled={!sfSportId || sfSportId === "all"}>
                    <SelectTrigger className="ring-focus rounded-xl text-sm" data-testid="sf-eqtype-select">
                      <SelectValue placeholder="Select equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Select equipment type</SelectItem>
                      {(sfEqTypes.data ?? []).map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">New Sub-Filter Name</Label>
                  <div className="flex gap-2">
                    <Input
                      value={sfNewName}
                      onChange={(e) => setSfNewName(e.target.value)}
                      placeholder="e.g. Infield"
                      className="ring-focus rounded-xl text-sm"
                      disabled={!sfEqTypeId || sfEqTypeId === "all"}
                      onKeyDown={(e) => e.key === "Enter" && onAddSubFilter()}
                      data-testid="sf-name-input"
                    />
                    <Button
                      size="icon"
                      onClick={onAddSubFilter}
                      disabled={sfAdding || !sfNewName.trim() || !sfEqTypeId || sfEqTypeId === "all"}
                      data-testid="sf-add-button"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {sfEqTypeId && sfEqTypeId !== "all" && (
                <div className="rounded-xl border border-border bg-background/60 p-4" data-testid="sf-list">
                  <div className="text-xs font-semibold text-muted-foreground mb-3">
                    Sub-filters for {(sfEqTypes.data ?? []).find((t: any) => t.id === sfEqTypeId)?.name ?? sfEqTypeId}
                  </div>
                  {sfSubFilters.isLoading ? (
                    <div className="text-xs text-muted-foreground">Loading...</div>
                  ) : (sfSubFilters.data ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">No sub-filters yet. Add one above.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(sfSubFilters.data ?? []).map((sf: any) => (
                        <div
                          key={sf.id}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5"
                          data-testid={`sf-item-${sf.id}`}
                        >
                          <span className="text-sm">{sf.name}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5"
                            onClick={() => onDeleteSubFilter(sf.id, sf.name)}
                            data-testid={`sf-delete-${sf.id}`}
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section id="section-data-reporting" style={sectionStyle("data-reporting")} className="card-elevated animate-float-in p-5 md:p-6 relative" data-testid="data-reporting-panel">
            <CollapseButton id="data-reporting" collapsed={collapsedSections} onToggle={toggleSection} onArrange={() => setArrangeOpen(true)} />
            <DataReportingPanel />
          </section>

          <section className="card-elevated p-5 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <Globe className="h-5 w-5 text-primary" />
              <div className="font-display text-xl font-bold">Tracked Websites</div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(sources.data ?? []).map((s: any) => (
                <div key={s.id} className="rounded-xl border border-border bg-background/60 p-3 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="text-sm font-bold truncate">{s.name}</div>
                    <a
                      href={s.baseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline truncate block"
                      data-testid={`source-url-${s.id}`}
                    >{s.baseUrl}</a>
                  </div>
                  {s.isOurStore && (
                    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary border border-primary/20 w-fit">
                      Our Store
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      <Dialog open={arrangeOpen} onOpenChange={setArrangeOpen}>
        <DialogContent className="max-w-sm" data-testid="arrange-sections-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <GripVertical className="h-5 w-5 text-primary" />
              Arrange Sections
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-2 max-h-96 overflow-y-auto">
            {sectionOrder.map((id, idx) => {
              const section = ADMIN_SECTIONS.find(s => s.id === id);
              if (!section) return null;
              return (
                <div key={id} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className={cn("flex-1 truncate", collapsedSections.includes(id) && "text-muted-foreground line-through")}>{section.label}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => toggleSection(id)}
                    title={collapsedSections.includes(id) ? "Show section" : "Minimize section"}
                    data-testid={`section-toggle-${id}`}
                  >
                    {collapsedSections.includes(id)
                      ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={idx === 0}
                    onClick={() => moveSectionUp(id)}
                    data-testid={`section-up-${id}`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={idx === sectionOrder.length - 1}
                    onClick={() => moveSectionDown(id)}
                    data-testid={`section-down-${id}`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const defaultOrder = ADMIN_SECTIONS.map(s => s.id);
                setSectionOrder(defaultOrder);
                try { localStorage.setItem(ADMIN_SECTION_ORDER_KEY, JSON.stringify(defaultOrder)); } catch {}
              }}
              data-testid="arrange-reset"
            >
              Reset
            </Button>
            <Button size="sm" onClick={() => setArrangeOpen(false)} data-testid="arrange-done">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={syncCompleteDialog?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setSyncCompleteDialog(null);
        }}
      >
        <DialogContent className="max-w-sm" data-testid="sync-complete-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Sparkles className="h-5 w-5 text-primary" />
              {syncCompleteDialog?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {(syncCompleteDialog?.details ?? []).map((line, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                {line}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setSyncCompleteDialog(null)}
              className="w-full"
              data-testid="sync-complete-dismiss"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function CollapseButton({ id, collapsed, onToggle, onArrange }: { id: string; collapsed: string[]; onToggle: (id: string) => void; onArrange: () => void }) {
  const isCollapsed = collapsed.includes(id);
  return (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
      <button
        onClick={onArrange}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        title="Arrange sections"
        data-testid={`arrange-btn-${id}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Move</span>
      </button>
      <button
        onClick={() => onToggle(id)}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        title={isCollapsed ? "Expand section" : "Minimize section"}
        data-testid={`collapse-btn-${id}`}
      >
        {isCollapsed ? (
          <>
            <ChevronDown className="h-3.5 w-3.5" />
            <span>Expand</span>
          </>
        ) : (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            <span>Minimize</span>
          </>
        )}
      </button>
    </div>
  );
}

function AffiliateReportingSection() {
  const [days, setDays] = useState(30);

  const { data, isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/admin/affiliate-reporting", days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/affiliate-reporting?days=${days}`);
      if (!res.ok) throw new Error("Failed to load affiliate reports");
      return res.json();
    },
  });

  const statusColor = (status: string) => {
    if (status === "ok") return "text-green-600 dark:text-green-400";
    if (status === "not_configured") return "text-muted-foreground";
    return "text-red-500";
  };

  const statusBadge = (status: string) => {
    if (status === "ok") return <span className="text-xs font-medium text-green-600 dark:text-green-400">Active</span>;
    if (status === "not_configured") return <span className="text-xs text-muted-foreground">Not configured</span>;
    return <span className="text-xs text-red-500">Error</span>;
  };

  const fmt = (n: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(n);

  return (
    <section className="card-elevated animate-float-in p-5 md:p-6" data-testid="affiliate-reporting-panel">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 shadow-lg shadow-violet-600/20">
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Affiliate Reporting</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Commission summaries across all affiliate networks.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="text-sm border rounded-lg px-2 py-1 bg-background"
                value={days}
                onChange={e => setDays(Number(e.target.value))}
                data-testid="affiliate-days-select"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="rounded-xl"
                data-testid="affiliate-refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No data available.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {data.map((report: any) => (
                <div
                  key={report.network}
                  className="rounded-xl border p-4 space-y-2"
                  data-testid={`affiliate-network-${report.network}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold capitalize">{report.network}</span>
                    {statusBadge(report.status)}
                  </div>
                  {report.status === "ok" ? (
                    <>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">Total Commission</span>
                        <span className="font-mono font-medium">{fmt(report.summary.totalCommission, report.summary.currency)}</span>
                        <span className="text-muted-foreground">Approved</span>
                        <span className="font-mono">{fmt(report.summary.approvedCommission, report.summary.currency)}</span>
                        <span className="text-muted-foreground">Pending</span>
                        <span className="font-mono">{fmt(report.summary.pendingCommission, report.summary.currency)}</span>
                        <span className="text-muted-foreground">Sales</span>
                        <span className="font-mono">{fmt(report.summary.totalSales, report.summary.currency)}</span>
                        <span className="text-muted-foreground">Transactions</span>
                        <span className="font-mono">{report.summary.transactionCount}</span>
                      </div>
                      {report.transactions.length > 0 && (
                        <details className="text-xs mt-1">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            {report.transactions.length} recent transaction{report.transactions.length !== 1 ? "s" : ""}
                          </summary>
                          <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
                            {report.transactions.slice(0, 10).map((tx: any, i: number) => (
                              <div key={i} className="flex items-center justify-between gap-2 py-0.5 border-t">
                                <span className="truncate text-muted-foreground">{tx.advertiserName ?? tx.type ?? "—"}</span>
                                <span className="font-mono shrink-0">{fmt(tx.commissionAmount, tx.currency)}</span>
                                <span className={cn("shrink-0 capitalize", statusColor(tx.status))}>{tx.status}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{report.error ?? "Network not configured."}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface SmsCampaign {
  id: string;
  slug: string;
  retailerUrl: string;
  title: string | null;
  writeup: string | null;
  smsText: string;
  images: string[];
  sentAt: string | null;
  recipientCount: number | null;
  createdAt: string;
}

function SmsDealBlastSection() {
  const { toast } = useToast();
  const [retailerUrl, setRetailerUrl] = useState("");
  const [title, setTitle] = useState("");
  const [writeup, setWriteup] = useState("");
  const [smsText, setSmsText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: campaigns, isLoading } = useQuery<SmsCampaign[]>({
    queryKey: ["/api/admin/sms-campaigns"],
  });

  const toggleImage = (img: string) => {
    setImages((prev) => (prev.includes(img) ? prev.filter((i) => i !== img) : [...prev, img]));
  };

  const resetForm = () => {
    setRetailerUrl("");
    setTitle("");
    setWriteup("");
    setSmsText("");
    setImages([]);
  };

  const handleFetchPreview = async () => {
    if (!retailerUrl.trim()) return;
    setFetching(true);
    try {
      const res = await apiRequest("POST", "/api/admin/sms-campaigns/fetch-preview", { url: retailerUrl.trim() });
      const data = await res.json();
      if (data.title && !title) setTitle(data.title);
      if (data.writeup) setWriteup(data.writeup);
      const imgs: string[] = Array.isArray(data.images) ? data.images : [];
      setImages(imgs.slice(0, 3));
      if (imgs.length === 0) {
        toast({ title: "No images found", description: "You can still create the campaign and add details manually." });
      }
    } catch (err: any) {
      toast({ title: "Couldn't read that link", description: "Enter the details manually instead.", variant: "destructive" });
    } finally {
      setFetching(false);
    }
  };

  const handleCreate = async () => {
    if (!retailerUrl.trim() || !smsText.trim()) {
      toast({ title: "Missing info", description: "Retailer link and SMS text are required.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await apiRequest("POST", "/api/admin/sms-campaigns", {
        retailerUrl: retailerUrl.trim(),
        title: title.trim() || undefined,
        writeup: writeup.trim() || undefined,
        smsText: smsText.trim(),
        images,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/sms-campaigns"] });
      toast({ title: "Campaign created", description: "Short link and landing page are ready." });
      resetForm();
    } catch (err: any) {
      toast({ title: "Failed to create", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async (c: SmsCampaign) => {
    if (!confirm(`Push this SMS to all marketing subscribers? This cannot be undone.`)) return;
    setSendingId(c.id);
    try {
      const res = await apiRequest("POST", `/api/admin/sms-campaigns/${c.id}/send`, {});
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/sms-campaigns"] });
      toast({ title: "Blast sent", description: `${data.sent} sent, ${data.failed} failed of ${data.recipients} recipients.` });
    } catch (err: any) {
      toast({ title: "Send failed", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this campaign and its landing page?")) return;
    try {
      await apiRequest("DELETE", `/api/admin/sms-campaigns/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/sms-campaigns"] });
      toast({ title: "Deleted" });
    } catch (err: any) {
      toast({ title: "Failed to delete", description: err?.message || "Try again.", variant: "destructive" });
    }
  };

  const landingOrigin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section className="card-elevated animate-float-in p-5 md:p-6" data-testid="sms-blast-panel">
      <div className="flex items-start gap-3 mb-5">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-rose-600 to-rose-500 shadow-lg shadow-rose-600/20">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="font-display text-xl font-bold">SMS Deal Blast</div>
          <p className="text-sm text-muted-foreground">
            Paste a retailer link, build a landing page, and text it to all marketing subscribers.
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border p-4">
        <div>
          <Label htmlFor="blast-url">Retailer link</Label>
          <div className="flex gap-2 mt-1">
            <Input
              id="blast-url"
              placeholder="https://retailer.com/product/..."
              value={retailerUrl}
              onChange={(e) => setRetailerUrl(e.target.value)}
              data-testid="input-blast-url"
            />
            <Button
              variant="outline"
              onClick={handleFetchPreview}
              disabled={fetching || !retailerUrl.trim()}
              data-testid="button-fetch-preview"
            >
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Auto-fill</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Auto-fill pulls product images and drafts a write-up with AI.</p>
        </div>

        {images.length > 0 && (
          <div>
            <Label>Images (tap to include)</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {images.map((img) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => toggleImage(img)}
                  className={cn(
                    "h-20 w-20 rounded-md border overflow-hidden relative",
                    images.includes(img) ? "ring-2 ring-primary" : "opacity-50"
                  )}
                  data-testid={`button-toggle-image`}
                >
                  <img src={img} alt="preview" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="blast-title">Title (optional)</Label>
          <Input
            id="blast-title"
            placeholder="50% off Rawlings Heart of the Hide"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1"
            data-testid="input-blast-title"
          />
        </div>

        <div>
          <Label htmlFor="blast-writeup">Landing page write-up</Label>
          <Textarea
            id="blast-writeup"
            placeholder="Short description shown on the landing page..."
            value={writeup}
            onChange={(e) => setWriteup(e.target.value)}
            rows={4}
            className="mt-1"
            data-testid="input-blast-writeup"
          />
        </div>

        <div>
          <Label htmlFor="blast-sms">SMS text</Label>
          <Textarea
            id="blast-sms"
            placeholder="🔥 New deal: 50% off Rawlings gloves!"
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            rows={3}
            className="mt-1"
            data-testid="input-blast-sms"
          />
          <p className="text-xs text-muted-foreground mt-1">
            The short link and "Reply STOP to opt out" are appended automatically.
          </p>
        </div>

        <Button onClick={handleCreate} disabled={creating} data-testid="button-create-campaign">
          {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          Create campaign
        </Button>
      </div>

      <div className="mt-6">
        <div className="font-semibold mb-2">Campaigns</div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !campaigns || campaigns.length === 0 ? (
          <EmptyState icon={Zap} title="No campaigns yet" description="Create your first SMS deal blast above." />
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
                data-testid={`row-campaign-${c.id}`}
              >
                {c.images?.[0] && (
                  <img src={c.images[0]} alt="" className="h-12 w-12 rounded object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate" data-testid={`text-campaign-title-${c.id}`}>
                    {c.title || c.smsText}
                  </div>
                  <a
                    href={`${landingOrigin}/d/${c.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                    data-testid={`link-campaign-${c.id}`}
                  >
                    /d/{c.slug}
                  </a>
                  <div className="text-xs text-muted-foreground">
                    {c.sentAt
                      ? `Sent to ${c.recipientCount ?? 0} on ${new Date(c.sentAt).toLocaleDateString()}`
                      : "Not sent yet"}
                  </div>
                </div>
                {!c.sentAt && (
                  <Button
                    size="sm"
                    onClick={() => handleSend(c)}
                    disabled={sendingId === c.id}
                    data-testid={`button-send-${c.id}`}
                  >
                    {sendingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">Push SMS</span>
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(c.id)}
                  data-testid={`button-delete-campaign-${c.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AnalyticsSection() {
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "conversions">("overview");
  const [clicksReportType, setClicksReportType] = useState("all");

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["/api/admin/analytics/summary", days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/summary?days=${days}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
  });

  const { data: usersList, isLoading: usersLoading } = useQuery({
    queryKey: ["/api/admin/analytics/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics/users");
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    enabled: activeTab === "users",
  });

  const { data: convData, isLoading: convLoading } = useQuery({
    queryKey: ["/api/admin/analytics/conversions", days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics/conversions?days=${days}`);
      if (!res.ok) throw new Error("Failed to load conversions");
      return res.json();
    },
    enabled: activeTab === "conversions",
  });

  const downloadClicksCsv = () => {
    window.open(`/api/admin/analytics/clicks-csv?days=${days}&groupBy=${clicksReportType}`, "_blank");
  };

  const downloadUsersCsv = () => {
    window.open("/api/admin/analytics/users-csv", "_blank");
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0m";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <section className="card-elevated animate-float-in p-5 md:p-6" data-testid="analytics-panel">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-600/20">
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="font-display text-xl font-bold">Analytics</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Track clicks, users, visits, and engagement
          </div>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[120px]" data-testid="analytics-period-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="14">14 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
            <SelectItem value="365">1 year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1 mt-4 border-b border-border">
        <button
          onClick={() => setActiveTab("overview")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === "overview" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-muted-foreground hover:text-foreground")}
          data-testid="tab-overview"
        >
          Overview & Clicks
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === "users" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-muted-foreground hover:text-foreground")}
          data-testid="tab-users"
        >
          Users
        </button>
        <button
          onClick={() => setActiveTab("conversions")}
          className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === "conversions" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-transparent text-muted-foreground hover:text-foreground")}
          data-testid="tab-conversions"
        >
          Conversions
        </button>
      </div>

      {activeTab === "overview" && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : analytics ? (
            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={<MousePointerClick className="h-4 w-4" />} label="Total Clicks" value={Number(analytics.clicks.total_clicks).toLocaleString()} color="blue" />
                <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Unique Deals" value={Number(analytics.clicks.unique_deals).toLocaleString()} color="purple" />
                <StatCard icon={<Users className="h-4 w-4" />} label="Total Users" value={Number(analytics.users.total_users).toLocaleString()} color="emerald" />
                <StatCard icon={<Users className="h-4 w-4" />} label="New Users" value={Number(analytics.users.new_users).toLocaleString()} subtitle={`last ${days}d`} color="amber" />
              </div>

              {analytics.visits && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard icon={<Eye className="h-4 w-4" />} label="Total Visits" value={Number(analytics.visits.total_visits).toLocaleString()} color="blue" />
                  <StatCard icon={<Users className="h-4 w-4" />} label="Unique Visitors" value={Number(analytics.visits.unique_visitors).toLocaleString()} color="purple" />
                  <StatCard icon={<Calendar className="h-4 w-4" />} label="Avg Duration" value={formatDuration(Math.round(Number(analytics.visits.avg_duration)))} color="emerald" />
                  <StatCard icon={<Globe className="h-4 w-4" />} label="Avg Pages/Visit" value={Number(analytics.visits.avg_pages).toFixed(1)} color="amber" />
                </div>
              )}

              {analytics.dailyClicks?.length > 0 && (
                <div>
                  <div className="text-sm font-semibold mb-2">Daily Clicks</div>
                  <div className="bg-muted/30 rounded-lg px-2 pt-2 pb-1">
                    <div className="flex items-end gap-[2px] h-28">
                      {(() => {
                        const maxClicks = Math.max(...analytics.dailyClicks.map((d: any) => Number(d.clicks)), 1);
                        return analytics.dailyClicks.map((d: any, i: number) => {
                          const clicks = Number(d.clicks);
                          const heightPct = Math.max((clicks / maxClicks) * 100, 4);
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-[4px]" title={`${d.day}: ${clicks} clicks`}>
                              <span className="text-[8px] leading-none text-emerald-700 dark:text-emerald-400 mb-[2px] font-medium">{clicks > 0 ? clicks : ""}</span>
                              <div className="w-full bg-emerald-500 rounded-sm hover:bg-emerald-400 transition-colors" style={{ height: `${heightPct}%` }} />
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <div className="flex items-start gap-[2px] mt-1">
                      {(() => {
                        const total = analytics.dailyClicks.length;
                        const labelEvery = total <= 14 ? 1 : total <= 21 ? 2 : 3;
                        return analytics.dailyClicks.map((d: any, i: number) => {
                          const showDate = i % labelEvery === 0 || i === total - 1;
                          const dateLabel = new Date(d.day + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
                          return (
                            <div key={i} className="flex-1 flex justify-center min-w-[4px]">
                              {showDate && <span className="text-[8px] leading-none text-muted-foreground">{dateLabel}</span>}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-3 gap-4">
                {analytics.topSources?.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold mb-2">Top Sources</div>
                    <div className="space-y-1.5">
                      {analytics.topSources.slice(0, 10).map((s: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/30">
                          <span className="truncate">{s.source_id}</span>
                          <span className="font-mono text-xs text-muted-foreground ml-2">{Number(s.click_count).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analytics.topSports?.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold mb-2">Top Sports</div>
                    <div className="space-y-1.5">
                      {analytics.topSports.slice(0, 10).map((s: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/30">
                          <span className="truncate">{s.sport_id}</span>
                          <span className="font-mono text-xs text-muted-foreground ml-2">{Number(s.click_count).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analytics.topDeals?.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold mb-2">Top Deals</div>
                    <div className="space-y-1.5">
                      {analytics.topDeals.slice(0, 10).map((d: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/30">
                          <span className="truncate max-w-[180px]" title={d.title}>{d.title}</span>
                          <span className="font-mono text-xs text-muted-foreground ml-2">{Number(d.click_count).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                <span className="text-sm font-medium mr-1">Clicks CSV:</span>
                <Select value={clicksReportType} onValueChange={setClicksReportType}>
                  <SelectTrigger className="w-[140px] h-8" data-testid="clicks-report-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clicks</SelectItem>
                    <SelectItem value="source">By Source</SelectItem>
                    <SelectItem value="sport">By Sport</SelectItem>
                    <SelectItem value="deal">By Deal</SelectItem>
                    <SelectItem value="daily">By Day</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={downloadClicksCsv} data-testid="download-clicks-csv">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-muted-foreground">No analytics data available yet.</div>
          )}
        </>
      )}

      {activeTab === "users" && (
        <div className="mt-4 space-y-4">
          {usersLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : usersList?.length > 0 ? (
            <>
              <div className="text-sm text-muted-foreground">{usersList.length} registered users</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="users-table">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 px-2 font-medium">User</th>
                      <th className="py-2 px-2 font-medium">Email</th>
                      <th className="py-2 px-2 font-medium text-center">Visits</th>
                      <th className="py-2 px-2 font-medium text-center">Time on Site</th>
                      <th className="py-2 px-2 font-medium text-center">Pages</th>
                      <th className="py-2 px-2 font-medium text-center">Clicks</th>
                      <th className="py-2 px-2 font-medium">Sport</th>
                      <th className="py-2 px-2 font-medium">Notifications</th>
                      <th className="py-2 px-2 font-medium">Joined</th>
                      <th className="py-2 px-2 font-medium">Last Visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((u: any) => {
                      const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
                      return (
                        <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30" data-testid={`user-row-${u.id}`}>
                          <td className="py-2 px-2">{name || u.id.slice(0, 8)}</td>
                          <td className="py-2 px-2 text-muted-foreground">{u.email || "—"}</td>
                          <td className="py-2 px-2 text-center font-mono">{Number(u.total_visits).toLocaleString()}</td>
                          <td className="py-2 px-2 text-center font-mono">{formatDuration(Number(u.total_duration_seconds))}</td>
                          <td className="py-2 px-2 text-center font-mono">{Number(u.total_pages_viewed).toLocaleString()}</td>
                          <td className="py-2 px-2 text-center font-mono">{Number(u.total_clicks).toLocaleString()}</td>
                          <td className="py-2 px-2">{u.preferred_sport || "—"}</td>
                          <td className="py-2 px-2">
                            <div className="flex gap-1">
                              {u.push_enabled && <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">Push</span>}
                              {u.sms_enabled && <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded">SMS</span>}
                              {!u.push_enabled && !u.sms_enabled && <span className="text-xs text-muted-foreground">None</span>}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">{u.last_visit ? new Date(u.last_visit).toLocaleDateString() : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" onClick={downloadUsersCsv} data-testid="download-users-csv">
                <Download className="mr-2 h-4 w-4" />
                Download Users CSV
              </Button>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No users found.</div>
          )}
        </div>
      )}

      {activeTab === "conversions" && (
        <div className="mt-4 space-y-6">
          {convLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Estimated Conversions", value: Number(convData?.returnStats?.likely_conversions ?? 0).toLocaleString() },
                  { label: "Return Visits", value: Number(convData?.returnStats?.total_returns ?? 0).toLocaleString() },
                  { label: "Unique Deals w/ Returns", value: Number(convData?.returnStats?.unique_deals ?? 0).toLocaleString() },
                  { label: "Avg Return Time", value: convData?.returnStats?.avg_minutes_away ? `${Math.round(Number(convData.returnStats.avg_minutes_away))} min` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-border bg-card p-4">
                    <div className="text-2xl font-bold">{value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{label}</div>
                  </div>
                ))}
              </div>

              {/* Affiliate network stats */}
              {convData?.affiliateStats?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Affiliate Network Revenue</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="py-2 px-2 font-medium">Network</th>
                          <th className="py-2 px-2 font-medium text-right">Conversions</th>
                          <th className="py-2 px-2 font-medium text-right">Total Sales</th>
                          <th className="py-2 px-2 font-medium text-right">Total Commission</th>
                          <th className="py-2 px-2 font-medium text-right">Avg Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {convData.affiliateStats.map((row: any) => (
                          <tr key={row.network} className="border-b border-border/50">
                            <td className="py-2 px-2 font-medium capitalize">{row.network}</td>
                            <td className="py-2 px-2 text-right font-mono">{Number(row.total_conversions).toLocaleString()}</td>
                            <td className="py-2 px-2 text-right font-mono">{row.total_sale_cents ? `$${(Number(row.total_sale_cents) / 100).toFixed(2)}` : "—"}</td>
                            <td className="py-2 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{row.total_commission_cents ? `$${(Number(row.total_commission_cents) / 100).toFixed(2)}` : "—"}</td>
                            <td className="py-2 px-2 text-right font-mono">{row.avg_commission_cents ? `$${(Number(row.avg_commission_cents) / 100).toFixed(2)}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Daily funnel */}
              {convData?.dailyFunnel?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Daily Click → Return Funnel</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="py-2 px-2 font-medium">Date</th>
                          <th className="py-2 px-2 font-medium text-right">Clicks</th>
                          <th className="py-2 px-2 font-medium text-right">Returns</th>
                          <th className="py-2 px-2 font-medium text-right">Est. Conversions</th>
                          <th className="py-2 px-2 font-medium text-right">Conv. Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...convData.dailyFunnel].reverse().slice(0, 14).map((row: any) => {
                          const convRate = row.clicks > 0 ? ((row.likely_conversions / row.clicks) * 100).toFixed(1) : "0.0";
                          return (
                            <tr key={row.day} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="py-2 px-2">{new Date(row.day).toLocaleDateString()}</td>
                              <td className="py-2 px-2 text-right font-mono">{Number(row.clicks).toLocaleString()}</td>
                              <td className="py-2 px-2 text-right font-mono">{Number(row.returns).toLocaleString()}</td>
                              <td className="py-2 px-2 text-right font-mono">{Number(row.likely_conversions).toLocaleString()}</td>
                              <td className="py-2 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{convRate}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top converting deals */}
              {convData?.topConvertingDeals?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Top Converting Deals</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="py-2 px-2 font-medium">Deal</th>
                          <th className="py-2 px-2 font-medium text-right">Returns</th>
                          <th className="py-2 px-2 font-medium text-right">Est. Conversions</th>
                          <th className="py-2 px-2 font-medium text-right">Conv. Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {convData.topConvertingDeals.map((row: any) => (
                          <tr key={row.deal_id} className="border-b border-border/50 hover:bg-muted/30" data-testid={`conversion-deal-${row.deal_id}`}>
                            <td className="py-2 px-2 max-w-xs truncate">{row.title}</td>
                            <td className="py-2 px-2 text-right font-mono">{Number(row.total_returns).toLocaleString()}</td>
                            <td className="py-2 px-2 text-right font-mono">{Number(row.likely_conversions).toLocaleString()}</td>
                            <td className="py-2 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{row.conversion_rate_pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent affiliate conversions */}
              {convData?.recentConversions?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Recent Affiliate Postbacks</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="py-2 px-2 font-medium">Time</th>
                          <th className="py-2 px-2 font-medium">Network</th>
                          <th className="py-2 px-2 font-medium">Order ID</th>
                          <th className="py-2 px-2 font-medium">Advertiser</th>
                          <th className="py-2 px-2 font-medium text-right">Sale</th>
                          <th className="py-2 px-2 font-medium text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {convData.recentConversions.map((row: any) => (
                          <tr key={row.id} className="border-b border-border/50" data-testid={`affiliate-conv-${row.id}`}>
                            <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(row.converted_at).toLocaleString()}</td>
                            <td className="py-2 px-2 capitalize">{row.network}</td>
                            <td className="py-2 px-2 font-mono text-xs">{row.order_id || "—"}</td>
                            <td className="py-2 px-2 text-xs">{row.advertiser_name || "—"}</td>
                            <td className="py-2 px-2 text-right font-mono">{row.sale_cents ? `$${(Number(row.sale_cents) / 100).toFixed(2)}` : "—"}</td>
                            <td className="py-2 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{row.commission_cents ? `$${(Number(row.commission_cents) / 100).toFixed(2)}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!convData?.returnStats?.total_returns && !convData?.recentConversions?.length && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No conversion data yet. Return visits and affiliate postbacks will appear here as they come in.
                  <div className="mt-4 p-4 bg-muted/30 rounded-lg text-left max-w-lg mx-auto">
                    <div className="font-medium text-foreground mb-2 text-xs">Affiliate Postback URLs to configure:</div>
                    {[
                      { name: "CJ Affiliate", path: "/api/affiliate/postback/cj" },
                      { name: "Impact.com", path: "/api/affiliate/postback/impact" },
                      { name: "Rakuten", path: "/api/affiliate/postback/rakuten" },
                      { name: "eBay Partner Network", path: "/api/affiliate/postback/ebay" },
                    ].map(({ name, path }) => (
                      <div key={name} className="text-xs mb-1">
                        <span className="font-medium">{name}:</span>{" "}
                        <code className="bg-muted px-1 rounded">{window.location.origin}{path}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function StatCard({ icon, label, value, subtitle, color }: { icon: React.ReactNode; label: string; value: string; subtitle?: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-600/5 text-blue-600 dark:text-blue-400",
    purple: "from-purple-500/10 to-purple-600/5 text-purple-600 dark:text-purple-400",
    emerald: "from-emerald-500/10 to-emerald-600/5 text-emerald-600 dark:text-emerald-400",
    amber: "from-amber-500/10 to-amber-600/5 text-amber-600 dark:text-amber-400",
  };
  return (
    <div className={cn("rounded-xl bg-gradient-to-br p-3", colorMap[color] || colorMap.blue)} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {subtitle && <div className="text-xs opacity-60">{subtitle}</div>}
    </div>
  );
}
