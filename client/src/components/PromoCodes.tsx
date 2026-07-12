import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Copy,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Tag,
  Percent,
  DollarSign,
  Truck,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";

interface PromoCode {
  id: string;
  source: string;
  advertiserId: string | null;
  advertiserName: string;
  code: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  discountType: string | null;
  discountValue: string | null;
  minimumPurchase: string | null;
  trackingUrl: string | null;
  categories: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PromoStats {
  total: number;
  active: number;
  expired: number;
  disabled: number;
  bySource: Record<string, number>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function DiscountBadge({ type, value }: { type: string | null; value: string | null }) {
  if (!type || type === "other") return <span className="text-xs text-muted-foreground">Promo</span>;
  if (type === "percent") return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-400">
      <Percent className="h-3 w-3" />{value}% off
    </span>
  );
  if (type === "fixed") return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-400">
      <DollarSign className="h-3 w-3" />${value} off
    </span>
  );
  if (type === "freeShipping") return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-400">
      <Truck className="h-3 w-3" />Free Shipping
    </span>
  );
  return <span className="text-xs text-muted-foreground">{type}</span>;
}

const sourceColors: Record<string, string> = {
  cj: "bg-blue-500/20 text-blue-400",
  impact: "bg-purple-500/20 text-purple-400",
  "impact-fanatics": "bg-orange-500/20 text-orange-400",
  rakuten: "bg-red-500/20 text-red-400",
  manual: "bg-zinc-500/20 text-zinc-400",
};

function SourceBadge({ source }: { source: string }) {
  const label = source === "impact-fanatics" ? "Fanatics" : source.charAt(0).toUpperCase() + source.slice(1);
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${sourceColors[source] || "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
      data-testid={`copy-code-${text}`}
    >
      <code className="font-mono text-sm font-bold bg-muted/50 px-1.5 py-0.5 rounded">{text}</code>
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 opacity-50" />}
    </button>
  );
}

export default function PromoCodes() {
  const { toast } = useToast();
  const [filterSource, setFilterSource] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCode, setNewCode] = useState({ advertiserName: "", code: "", description: "", discountType: "percent", discountValue: "" });

  const codesQuery = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes", filterSource, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterSource !== "all") params.set("source", filterSource);
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await fetch(`/api/admin/promo-codes?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch promo codes");
      return res.json();
    },
  });

  const statsQuery = useQuery<PromoStats>({
    queryKey: ["/api/admin/promo-codes/stats"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/promo-codes/sync");
      return res.json();
    },
    onSuccess: (data) => {
      const total = data.cj + data.impact + data.fanatics + data.rakuten;
      toast({ title: "Promo sync complete", description: `${total} codes synced, ${data.matched} sources matched` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof newCode) => {
      const res = await apiRequest("POST", "/api/admin/promo-codes", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Promo code added" });
      setShowAddDialog(false);
      setNewCode({ advertiserName: "", code: "", description: "", discountType: "percent", discountValue: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/promo-codes/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes/stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/promo-codes/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Promo code deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes/stats"] });
    },
  });

  const stats = statsQuery.data;
  const codes = codesQuery.data || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-8 w-28 text-xs" data-testid="filter-promo-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="cj">CJ</SelectItem>
              <SelectItem value="impact">Impact</SelectItem>
              <SelectItem value="impact-fanatics">Fanatics</SelectItem>
              <SelectItem value="rakuten">Rakuten</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-24 text-xs" data-testid="filter-promo-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)} data-testid="add-promo-code">
            <Plus className="h-4 w-4 mr-1" />Add Code
          </Button>
          <Button
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="sync-promo-codes"
          >
            {syncMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Syncing...</>
            ) : (
              <><RefreshCw className="h-4 w-4 mr-1" />Sync All</>
            )}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <div className="text-2xl font-bold" data-testid="promo-stat-total">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/10 text-center">
            <div className="text-2xl font-bold text-emerald-400" data-testid="promo-stat-active">{stats.active}</div>
            <div className="text-xs text-emerald-400/70">Active</div>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 text-center">
            <div className="text-2xl font-bold text-amber-400">{stats.expired}</div>
            <div className="text-xs text-amber-400/70">Expired</div>
          </div>
          <div className="p-3 rounded-lg bg-red-500/10 text-center">
            <div className="text-2xl font-bold text-red-400">{stats.disabled}</div>
            <div className="text-xs text-red-400/70">Disabled</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <div className="text-lg font-bold" data-testid="promo-stat-sources">
              {Object.entries(stats.bySource).map(([src, cnt]) => (
                <span key={src} className="text-xs mr-1"><SourceBadge source={src} /> {cnt}</span>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">By Source</div>
          </div>
        </div>
      )}

      {codesQuery.isLoading && (
        <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
      )}

      {codes.length === 0 && !codesQuery.isLoading && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Tag className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No promo codes found.</p>
          <p className="mt-1">Click "Sync All" to pull codes from affiliate networks, or "Add Code" to enter one manually.</p>
        </div>
      )}

      {codes.length > 0 && (
        <div className="space-y-2">
          {codes.map((promo) => (
            <div
              key={promo.id}
              className={`rounded-lg border p-3 transition-all ${
                promo.status === "active" ? "bg-emerald-500/5 border-emerald-500/15" :
                promo.status === "expired" ? "bg-muted/20 border-muted/30 opacity-60" :
                "bg-red-500/5 border-red-500/15 opacity-60"
              }`}
              data-testid={`promo-item-${promo.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SourceBadge source={promo.source} />
                    <span className="text-sm font-medium">{promo.advertiserName}</span>
                    <DiscountBadge type={promo.discountType} value={promo.discountValue} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <CopyButton text={promo.code} />
                    {promo.description && (
                      <span className="text-xs text-muted-foreground truncate max-w-[300px]">{promo.description}</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    {promo.startDate && <span>Starts: {formatDate(promo.startDate)}</span>}
                    {promo.endDate && <span>Expires: {formatDate(promo.endDate)}</span>}
                    {promo.trackingUrl && (
                      <a href={promo.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                        <ExternalLink className="h-3 w-3" />Link
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleMutation.mutate({
                      id: promo.id,
                      status: promo.status === "active" ? "disabled" : "active",
                    })}
                    className={`p-1 rounded hover:bg-muted/50 transition-colors ${promo.status === "active" ? "text-emerald-400" : "text-muted-foreground"}`}
                    title={promo.status === "active" ? "Disable" : "Enable"}
                    data-testid={`toggle-promo-${promo.id}`}
                  >
                    {promo.status === "active" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => { if (confirm("Delete this promo code?")) deleteMutation.mutate(promo.id); }}
                    className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                    data-testid={`delete-promo-${promo.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Promo Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Retailer / Advertiser Name</label>
              <Input
                value={newCode.advertiserName}
                onChange={(e) => setNewCode(c => ({ ...c, advertiserName: e.target.value }))}
                placeholder="e.g. Dick's Sporting Goods"
                data-testid="input-promo-advertiser"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Promo Code</label>
              <Input
                value={newCode.code}
                onChange={(e) => setNewCode(c => ({ ...c, code: e.target.value }))}
                placeholder="e.g. SAVE20"
                data-testid="input-promo-code"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Input
                value={newCode.description}
                onChange={(e) => setNewCode(c => ({ ...c, description: e.target.value }))}
                placeholder="e.g. 20% off sitewide"
                data-testid="input-promo-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Discount Type</label>
                <Select value={newCode.discountType} onValueChange={(v) => setNewCode(c => ({ ...c, discountType: v }))}>
                  <SelectTrigger data-testid="select-promo-discount-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent Off</SelectItem>
                    <SelectItem value="fixed">Dollar Off</SelectItem>
                    <SelectItem value="freeShipping">Free Shipping</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Discount Value</label>
                <Input
                  value={newCode.discountValue}
                  onChange={(e) => setNewCode(c => ({ ...c, discountValue: e.target.value }))}
                  placeholder="e.g. 20"
                  data-testid="input-promo-discount-value"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate(newCode)}
              disabled={!newCode.advertiserName || !newCode.code || addMutation.isPending}
              data-testid="submit-promo-code"
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Add Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
