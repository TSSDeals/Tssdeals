import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw,
  Upload,
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  Search,
  Info,
  Layers,
} from "lucide-react";

interface EbayItem {
  sku: string;
  ebayItemId?: string;
  title: string;
  description?: string;
  imageUrls: string[];
  condition: string;
  quantity: number;
  priceCents?: number;
  categoryName?: string;
  aspects?: Record<string, string[]>;
}

interface SyncRecord {
  id: string;
  ebaySku: string;
  ebayTitle?: string;
  ebayPriceCents?: number;
  ebayQuantity?: number;
  ebayCondition?: string;
  ebayImages?: string[];
  sidelineswapListingId?: string;
  sidelineswapStatus?: string;
  sidelineswapCategory?: string;
  errorMessage?: string;
  lastSyncedAt?: string;
  updatedAt: string;
}

interface SSAddress {
  id: string;
  firstName: string;
  lastName: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
}

interface SSCategory {
  id: string;
  name: string;
}

function statusBadge(status?: string) {
  if (!status || status === "NOT_SYNCED") {
    return <Badge variant="outline" className="text-muted-foreground">Not Synced</Badge>;
  }
  if (status === "PENDING") {
    return <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-400/30"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  }
  if (status === "ACTIVE") {
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
  }
  if (status === "ERROR") {
    return <Badge className="bg-red-500/15 text-red-700 dark:text-red-300 border-red-400/30"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function formatPrice(cents?: number) {
  if (!cents) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function SidelineSwapSync() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState<EbayItem | null>(null);

  const [ssCategory, setSsCategory] = useState("");
  const [ssBrand, setSsBrand] = useState("");
  const [ssModel, setSsModel] = useState("");
  const [ssAddressId, setSsAddressId] = useState("");
  const [ssDescription, setSsDescription] = useState("");
  const [acceptsOffers, setAcceptsOffers] = useState(true);

  const { data: statusData } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/admin/sidelineswap-sync/status"],
  });

  const { data: inventoryData, isLoading: inventoryLoading, refetch: refetchInventory } = useQuery<{ items: EbayItem[]; total: number }>({
    queryKey: ["/api/ebay/inventory"],
    retry: false,
  });

  const { data: syncsData, isLoading: syncsLoading } = useQuery<SyncRecord[]>({
    queryKey: ["/api/admin/sidelineswap-sync"],
  });

  const { data: addressesData } = useQuery<{ configured: boolean; addresses: SSAddress[] }>({
    queryKey: ["/api/admin/sidelineswap-sync/addresses"],
  });

  const { data: categoriesData } = useQuery<{ configured: boolean; categories: SSCategory[] }>({
    queryKey: ["/api/admin/sidelineswap-sync/categories"],
  });

  const syncMap = useMemo(() => {
    const map: Record<string, SyncRecord> = {};
    for (const s of syncsData || []) map[s.ebaySku] = s;
    return map;
  }, [syncsData]);

  const items = inventoryData?.items || [];
  const filtered = items.filter((i) =>
    !search || i.title.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase())
  );

  const pushMutation = useMutation({
    mutationFn: async (payload: any) => apiRequest("POST", "/api/admin/sidelineswap-sync", payload),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sidelineswap-sync"] });
      setPushDialogOpen(false);
      setPendingItem(null);
      if (data.skipped) {
        toast({ title: "Queued for sync", description: data.message });
      } else {
        toast({ title: "Pushed to SidelineSwap", description: `Status: ${data.result?.status || "PENDING"}` });
      }
    },
    onError: (err: any) => {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    },
  });

  const batchMutation = useMutation({
    mutationFn: async (payload: any) => apiRequest("POST", "/api/admin/sidelineswap-sync/batch", payload),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sidelineswap-sync"] });
      setBatchDialogOpen(false);
      setSelectedSkus(new Set());
      if (data.skipped) {
        toast({ title: "Queued for sync", description: data.message });
      } else {
        toast({ title: "Batch pushed", description: `${selectedSkus.size} items sent to SidelineSwap` });
      }
    },
    onError: (err: any) => {
      toast({ title: "Batch push failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/sidelineswap-sync/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sidelineswap-sync"] });
      toast({ title: "Sync record removed" });
    },
  });

  function openPushDialog(item: EbayItem) {
    setPendingItem(item);
    setSsBrand(item.aspects?.["Brand"]?.[0] || "");
    setSsModel(item.aspects?.["Model"]?.[0] || "");
    setSsDescription(item.description || "");
    setSsCategory(syncMap[item.sku]?.sidelineswapCategory || "");
    setPushDialogOpen(true);
  }

  function submitPush() {
    if (!pendingItem) return;
    pushMutation.mutate({
      ebaySku: pendingItem.sku,
      ebayItemId: pendingItem.ebayItemId,
      ebayTitle: pendingItem.title,
      ebayPriceCents: pendingItem.priceCents,
      ebayQuantity: pendingItem.quantity,
      ebayCondition: pendingItem.condition,
      ebayImages: pendingItem.imageUrls,
      ebayCategory: pendingItem.categoryName,
      ssCategory,
      ssBrand,
      ssModel,
      ssAddressId,
      ssDescription,
      acceptsOffers,
    });
  }

  function submitBatch() {
    const selectedItems = items.filter((i) => selectedSkus.has(i.sku));
    batchMutation.mutate({
      ssAddressId,
      items: selectedItems.map((i) => ({
        ebaySku: i.sku,
        ebayTitle: i.title,
        ebayItemId: i.ebayItemId,
        ebayPriceCents: i.priceCents,
        ebayQuantity: i.quantity,
        ebayCondition: i.condition,
        ebayImages: i.imageUrls,
        ebayCategory: i.categoryName,
        ssCategory: syncMap[i.sku]?.sidelineswapCategory || ssCategory || "Other",
        ssBrand: i.aspects?.["Brand"]?.[0] || "Unknown",
        ssModel: i.aspects?.["Model"]?.[0] || undefined,
      })),
    });
  }

  function toggleSelect(sku: string) {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedSkus.size === filtered.length) {
      setSelectedSkus(new Set());
    } else {
      setSelectedSkus(new Set(filtered.map((i) => i.sku)));
    }
  }

  const isConfigured = statusData?.configured ?? false;
  const addresses = addressesData?.addresses || [];
  const categories = categoriesData?.categories || [];

  return (
    <div className="space-y-5">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">SidelineSwap API:</span>
          {isConfigured ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30">
              <CheckCircle className="h-3 w-3 mr-1" /> Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <Info className="h-3 w-3 mr-1" /> Awaiting API Keys
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">eBay inventory:</span>
          {inventoryLoading ? (
            <span className="text-muted-foreground text-xs">Loading...</span>
          ) : (
            <span className="font-medium">{items.length} items</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Synced:</span>
          <span className="font-medium">{(syncsData || []).filter((s) => s.sidelineswapStatus === "ACTIVE" || s.sidelineswapStatus === "PENDING").length}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchInventory()}
          className="ml-auto"
          data-testid="button-refresh-inventory"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh eBay
        </Button>
      </div>

      {!isConfigured && (
        <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/5 p-4 text-sm text-yellow-800 dark:text-yellow-200">
          <strong>SidelineSwap API keys not yet configured.</strong> Items pushed will be queued locally and synced once you add <code className="text-xs bg-yellow-500/10 px-1 rounded">SIDELINESWAP_API_KEY</code> and <code className="text-xs bg-yellow-500/10 px-1 rounded">SIDELINESWAP_CLIENT_ID</code> environment variables.
        </div>
      )}

      {/* Bulk actions */}
      {selectedSkus.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3">
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{selectedSkus.size} items selected</span>
          <Button
            size="sm"
            className="ml-auto bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setBatchDialogOpen(true)}
            data-testid="button-batch-push"
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" />
            Batch Push to SidelineSwap
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedSkus(new Set())}>Clear</Button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by title or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-inventory-search"
        />
      </div>

      {/* Inventory table */}
      {inventoryLoading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading eBay inventory...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No eBay inventory found. Make sure your eBay account is connected and you have active listings.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm" data-testid="table-inventory">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2.5 text-left w-8">
                  <Checkbox
                    checked={selectedSkus.size > 0 && selectedSkus.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-12">Img</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Title / SKU</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Condition</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">Qty</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Price</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">SS Status</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((item) => {
                const sync = syncMap[item.sku];
                return (
                  <tr key={item.sku} className="hover:bg-muted/20 transition-colors" data-testid={`row-inventory-${item.sku}`}>
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={selectedSkus.has(item.sku)}
                        onCheckedChange={() => toggleSelect(item.sku)}
                        data-testid={`checkbox-item-${item.sku}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      {item.imageUrls[0] ? (
                        <img src={item.imageUrls[0]} alt={item.title} className="h-10 w-10 object-cover rounded-md border border-border" />
                      ) : (
                        <div className="h-10 w-10 rounded-md border border-border bg-muted/30 flex items-center justify-center text-muted-foreground text-xs">No img</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-xs">
                      <div className="font-medium truncate" title={item.title}>{item.title}</div>
                      <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground text-xs">{item.condition || "—"}</td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground">{item.quantity}</td>
                    <td className="px-3 py-2.5 font-medium">{formatPrice(item.priceCents)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        {statusBadge(sync?.sidelineswapStatus)}
                        {sync?.sidelineswapCategory && (
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={sync.sidelineswapCategory}>{sync.sidelineswapCategory}</span>
                        )}
                        {sync?.errorMessage && (
                          <span className="text-xs text-red-500 truncate max-w-[120px]" title={sync.errorMessage}>Error</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {sync?.sidelineswapListingId && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <a href={`https://sidelineswap.com`} target="_blank" rel="noopener noreferrer" data-testid={`link-ss-listing-${item.sku}`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={sync ? "outline" : "default"}
                          className={sync ? "" : "bg-emerald-600 hover:bg-emerald-700"}
                          onClick={() => openPushDialog(item)}
                          data-testid={`button-push-${item.sku}`}
                        >
                          <Upload className="h-3.5 w-3.5 mr-1" />
                          {sync ? "Re-sync" : "Push"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No items match your search.</div>
          )}
        </div>
      )}

      {/* Previously synced (not in current eBay inventory) */}
      {(syncsData || []).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sync History</h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Title / SKU</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground hidden sm:table-cell">SS Category</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Last Synced</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(syncsData || []).map((s) => (
                  <tr key={s.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-sync-${s.id}`}>
                    <td className="px-3 py-2.5">
                      <div className="font-medium truncate max-w-xs">{s.ebayTitle || s.ebaySku}</div>
                      <div className="text-xs font-mono text-muted-foreground">{s.ebaySku}</div>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground text-xs truncate max-w-[160px]">{s.sidelineswapCategory || "—"}</td>
                    <td className="px-3 py-2.5">{statusBadge(s.sidelineswapStatus)}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground text-xs">
                      {s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-red-500"
                        onClick={() => deleteMutation.mutate(s.id)}
                        data-testid={`button-delete-sync-${s.id}`}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Push single dialog */}
      <Dialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-push-listing">
          <DialogHeader>
            <DialogTitle>Push to SidelineSwap</DialogTitle>
          </DialogHeader>
          {pendingItem && (
            <div className="space-y-4 py-1">
              <div className="flex gap-3 items-start">
                {pendingItem.imageUrls[0] && (
                  <img src={pendingItem.imageUrls[0]} alt={pendingItem.title} className="h-16 w-16 rounded-lg object-cover border border-border flex-shrink-0" />
                )}
                <div>
                  <p className="font-medium text-sm leading-snug">{pendingItem.title}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{pendingItem.sku}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{pendingItem.condition} · Qty: {pendingItem.quantity} · {formatPrice(pendingItem.priceCents)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="ss-category">SidelineSwap Category *</Label>
                  {categories.length > 0 ? (
                    <Select value={ssCategory} onValueChange={setSsCategory}>
                      <SelectTrigger id="ss-category" data-testid="select-ss-category">
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="ss-category"
                      value={ssCategory}
                      onChange={(e) => setSsCategory(e.target.value)}
                      placeholder="e.g. Baseball > Gloves > First Base Mitts"
                      data-testid="input-ss-category"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ss-brand">Brand *</Label>
                  <Input
                    id="ss-brand"
                    value={ssBrand}
                    onChange={(e) => setSsBrand(e.target.value)}
                    placeholder="e.g. Rawlings"
                    data-testid="input-ss-brand"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ss-model">Model</Label>
                  <Input
                    id="ss-model"
                    value={ssModel}
                    onChange={(e) => setSsModel(e.target.value)}
                    placeholder="Optional"
                    data-testid="input-ss-model"
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="ss-address">Ship From Address *</Label>
                  {addresses.length > 0 ? (
                    <Select value={ssAddressId} onValueChange={setSsAddressId}>
                      <SelectTrigger id="ss-address" data-testid="select-ss-address">
                        <SelectValue placeholder="Select address..." />
                      </SelectTrigger>
                      <SelectContent>
                        {addresses.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.firstName} {a.lastName} — {a.city}, {a.state} {a.zip}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="ss-address"
                      value={ssAddressId}
                      onChange={(e) => setSsAddressId(e.target.value)}
                      placeholder="Address UUID from SidelineSwap"
                      data-testid="input-ss-address"
                    />
                  )}
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="ss-description">Description (optional override)</Label>
                  <Textarea
                    id="ss-description"
                    value={ssDescription}
                    onChange={(e) => setSsDescription(e.target.value)}
                    rows={3}
                    placeholder="Leave blank to use eBay description"
                    data-testid="textarea-ss-description"
                  />
                </div>

                <div className="col-span-2 flex items-center gap-2">
                  <Checkbox
                    id="accepts-offers"
                    checked={acceptsOffers}
                    onCheckedChange={(v) => setAcceptsOffers(!!v)}
                    data-testid="checkbox-accepts-offers"
                  />
                  <Label htmlFor="accepts-offers" className="font-normal cursor-pointer">Accept offers on this listing</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushDialogOpen(false)} data-testid="button-cancel-push">Cancel</Button>
            <Button
              onClick={submitPush}
              disabled={pushMutation.isPending || !ssCategory || !ssBrand || !ssAddressId}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-confirm-push"
            >
              {pushMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
              {isConfigured ? "Push to SidelineSwap" : "Queue for Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-batch-push">
          <DialogHeader>
            <DialogTitle>Batch Push {selectedSkus.size} Items</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              All selected items will be pushed using their saved category (or the fallback below). Make sure each item has been individually configured first, or provide a default category.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="batch-address">Ship From Address *</Label>
              {addresses.length > 0 ? (
                <Select value={ssAddressId} onValueChange={setSsAddressId}>
                  <SelectTrigger id="batch-address" data-testid="select-batch-address">
                    <SelectValue placeholder="Select address..." />
                  </SelectTrigger>
                  <SelectContent>
                    {addresses.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.firstName} {a.lastName} — {a.city}, {a.state} {a.zip}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="batch-address"
                  value={ssAddressId}
                  onChange={(e) => setSsAddressId(e.target.value)}
                  placeholder="Address UUID from SidelineSwap"
                  data-testid="input-batch-address"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="batch-category">Default Category (fallback)</Label>
              <Input
                id="batch-category"
                value={ssCategory}
                onChange={(e) => setSsCategory(e.target.value)}
                placeholder="e.g. Sporting Goods > Other"
                data-testid="input-batch-category"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)} data-testid="button-cancel-batch">Cancel</Button>
            <Button
              onClick={submitBatch}
              disabled={batchMutation.isPending || !ssAddressId}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-confirm-batch"
            >
              {batchMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <Layers className="h-4 w-4 mr-1.5" />}
              {isConfigured ? `Push ${selectedSkus.size} Items` : `Queue ${selectedSkus.size} Items`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
