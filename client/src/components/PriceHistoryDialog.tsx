import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, BellOff, Trash2, TrendingDown, Loader2, MessageSquare, Phone } from "lucide-react";

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface PriceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: any;
}

export function PriceHistoryDialog({ open, onOpenChange, deal }: PriceHistoryDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const userId = auth.user?.id;

  const [alertMode, setAlertMode] = useState<"price" | "percent">("price");
  const [alertScope, setAlertScope] = useState<"this_listing" | "all_sellers">("all_sellers");
  const [targetPrice, setTargetPrice] = useState("");
  const [targetPercent, setTargetPercent] = useState("");
  const [timeRange, setTimeRange] = useState<string>("all");
  const [lastDealId, setLastDealId] = useState<string | null>(null);
  const [smsOptInPhone, setSmsOptInPhone] = useState("");
  const [wantsSms, setWantsSms] = useState(false);

  if (deal?.id && deal.id !== lastDealId) {
    setLastDealId(deal.id);
    setTimeRange("all");
  }

  const prefsQuery = useQuery<{ smsEnabled: boolean; phoneNumber: string | null }>({
    queryKey: ["/api/preferences/sms-status"],
    queryFn: async () => {
      const res = await fetch("/api/preferences", { credentials: "include" });
      if (!res.ok) return { smsEnabled: false, phoneNumber: null };
      const data = await res.json();
      return { smsEnabled: !!data.smsEnabled, phoneNumber: data.phoneNumber || null };
    },
    enabled: !!userId,
  });

  const smsAlreadyEnabled = prefsQuery.data?.smsEnabled ?? false;

  const enableSmsMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const res = await apiRequest("POST", "/api/sms/enable-inline", { phoneNumber });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/sms-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
    },
  });

  const historyQuery = useQuery<any[]>({
    queryKey: ["/api/deals", deal?.id, "price-history"],
    queryFn: async () => {
      const res = await fetch(`/api/deals/${deal?.id}/price-history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch price history");
      return res.json();
    },
    enabled: open && !!deal?.id,
  });

  const alertsQuery = useQuery<any[]>({
    queryKey: ["/api/deals", deal?.id, "alerts"],
    queryFn: async () => {
      const res = await fetch(`/api/deals/${deal?.id}/alerts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!deal?.id && !!userId,
  });

  const createAlert = useMutation({
    mutationFn: async (body: { targetPriceCents?: number; targetPercentOff?: number; scope?: string }) => {
      const res = await apiRequest("POST", `/api/deals/${deal?.id}/alerts`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", deal?.id, "alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert created", description: "You'll be notified when the price drops to your target." });
      setTargetPrice("");
      setTargetPercent("");
    },
    onError: (e: any) => {
      toast({ title: "Failed", description: e?.message ?? "Could not create alert", variant: "destructive" });
    },
  });

  const deleteAlert = useMutation({
    mutationFn: async (alertId: string) => {
      await apiRequest("DELETE", `/api/alerts/${alertId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", deal?.id, "alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert removed" });
    },
  });

  const timeRangeOptions = [
    { value: "7d", label: "7D" },
    { value: "30d", label: "30D" },
    { value: "90d", label: "90D" },
    { value: "6mo", label: "6M" },
    { value: "1yr", label: "1Y" },
    { value: "all", label: "All" },
  ];

  const getTimeRangeCutoff = (range: string): Date | null => {
    const now = new Date();
    switch (range) {
      case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case "90d": return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case "6mo": return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      case "1yr": return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      default: return null;
    }
  };

  const chartData = useMemo(() => {
    if (!historyQuery.data?.length) return [];
    const cutoff = getTimeRangeCutoff(timeRange);
    const filtered = cutoff
      ? historyQuery.data.filter((p) => new Date(p.recordedAt).getTime() >= cutoff.getTime())
      : historyQuery.data;
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );
    const deduped: typeof sorted = [];
    let lastPrice: number | null = null;
    for (const point of sorted) {
      if (point.priceCents !== lastPrice) {
        deduped.push(point);
        lastPrice = point.priceCents;
      } else if (deduped.length === 0) {
        deduped.push(point);
        lastPrice = point.priceCents;
      }
    }
    if (deduped.length > 0 && sorted.length > 0) {
      const lastSorted = sorted[sorted.length - 1];
      const lastDeduped = deduped[deduped.length - 1];
      if (lastSorted.recordedAt !== lastDeduped.recordedAt) {
        deduped.push(lastSorted);
      }
    }
    return deduped.map((p) => ({
      date: formatDate(p.recordedAt),
      dateTime: formatDateTime(p.recordedAt),
      price: p.priceCents / 100,
      priceCents: p.priceCents,
    }));
  }, [historyQuery.data, timeRange]);

  const priceStats = useMemo(() => {
    if (!chartData.length) return null;
    const prices = chartData.map((d) => d.priceCents);
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      current: deal?.priceCents ?? prices[prices.length - 1],
    };
  }, [chartData, deal]);

  const handleCreateAlert = async () => {
    if (wantsSms && !smsAlreadyEnabled) {
      const digits = smsOptInPhone.replace(/\D/g, "");
      if (digits.length < 10) {
        toast({ title: "Please enter a valid phone number", variant: "destructive" });
        return;
      }
      try {
        await enableSmsMutation.mutateAsync(smsOptInPhone);
        toast({ title: "SMS notifications enabled", description: "You'll receive alerts via text message." });
        setWantsSms(false);
        setSmsOptInPhone("");
      } catch {
        toast({ title: "Failed to enable SMS", variant: "destructive" });
        return;
      }
    }
    if (alertMode === "price") {
      const cents = Math.round(parseFloat(targetPrice) * 100);
      if (isNaN(cents) || cents <= 0) {
        toast({ title: "Invalid price", variant: "destructive" });
        return;
      }
      createAlert.mutate({ targetPriceCents: cents, scope: alertScope });
    } else {
      const pct = parseFloat(targetPercent);
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        toast({ title: "Invalid percentage", variant: "destructive" });
        return;
      }
      createAlert.mutate({ targetPercentOff: pct, scope: alertScope });
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-md">
        <div className="font-semibold">{formatMoney(d.priceCents)}</div>
        <div className="text-xs text-muted-foreground">{d.dateTime}</div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display line-clamp-2">{deal?.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {priceStats && (
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Current</div>
                <div className="text-xl font-extrabold">{formatMoney(priceStats.current)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Lowest Tracked</div>
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(priceStats.min)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Highest Tracked</div>
                <div className="text-lg font-bold text-muted-foreground">{formatMoney(priceStats.max)}</div>
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-semibold">Price History</div>
              <div className="flex items-center gap-1" data-testid="price-history-range-selector">
                {timeRangeOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={timeRange === opt.value ? "default" : "ghost"}
                    onClick={() => setTimeRange(opt.value)}
                    data-testid={`price-range-${opt.value}`}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            {historyQuery.isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border">
                <div className="text-center text-sm text-muted-foreground">
                  <TrendingDown className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No price data yet. Check back after more syncs.
                </div>
              </div>
            ) : (
              <div className="h-56 w-full" data-testid="price-history-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      tickFormatter={(v) => `$${v}`}
                      tickLine={false}
                      domain={["dataMin - 5", "dataMax + 5"]}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    {deal?.msrpCents && (
                      <ReferenceLine
                        y={deal.msrpCents / 100}
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="6 3"
                        label={{ value: "MSRP", position: "right", fontSize: 10 }}
                      />
                    )}
                    <Line
                      type="stepAfter"
                      dataKey="price"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "hsl(var(--primary))" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <Separator />

          {userId ? (
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Bell className="h-4 w-4" />
                Price Alerts
              </div>

              {(alertsQuery.data?.length ?? 0) > 0 && (
                <div className="mb-4 space-y-2">
                  {alertsQuery.data!.map((alert: any) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                      data-testid={`alert-item-${alert.id}`}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {alert.active ? (
                          <Bell className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {alert.targetPriceCents != null && (
                          <span>
                            Notify when price drops to{" "}
                            <span className="font-semibold">{formatMoney(alert.targetPriceCents)}</span>
                          </span>
                        )}
                        {alert.targetPercentOff != null && (
                          <span>
                            Notify when discount reaches{" "}
                            <span className="font-semibold">{Number(alert.targetPercentOff).toFixed(0)}% off</span>
                          </span>
                        )}
                        <Badge variant="outline" className="text-xs" data-testid={`alert-scope-badge-${alert.id}`}>
                          {alert.scope === "all_sellers" ? "All Sellers" : "This Listing"}
                        </Badge>
                        {!alert.active && (
                          <Badge className="border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            Triggered
                          </Badge>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteAlert.mutate(alert.id)}
                        disabled={deleteAlert.isPending}
                        data-testid={`alert-delete-${alert.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    variant={alertMode === "price" ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setAlertMode("price")}
                    className="toggle-elevate"
                    data-testid="alert-mode-price"
                  >
                    Target Price
                  </Button>
                  <Button
                    variant={alertMode === "percent" ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setAlertMode("percent")}
                    className="toggle-elevate"
                    data-testid="alert-mode-percent"
                  >
                    Target % Off
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Apply to:</Label>
                  <Button
                    variant={alertScope === "all_sellers" ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setAlertScope("all_sellers")}
                    className="toggle-elevate"
                    data-testid="alert-scope-all"
                  >
                    All Sellers
                  </Button>
                  <Button
                    variant={alertScope === "this_listing" ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setAlertScope("this_listing")}
                    className="toggle-elevate"
                    data-testid="alert-scope-listing"
                  >
                    This Listing Only
                  </Button>
                </div>

                {!smsAlreadyEnabled && userId && (
                  <div className="rounded-lg border border-dashed border-border px-3 py-2.5 space-y-2" data-testid="sms-optin-inline">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="sms-optin"
                        checked={wantsSms}
                        onCheckedChange={(checked) => setWantsSms(!!checked)}
                        data-testid="checkbox-sms-optin"
                      />
                      <label htmlFor="sms-optin" className="text-xs cursor-pointer flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        Also notify me via SMS text message
                      </label>
                    </div>
                    {wantsSms && (
                      <div className="flex items-center gap-2 pl-6">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <Input
                          type="tel"
                          placeholder="(555) 123-4567"
                          value={smsOptInPhone}
                          onChange={(e) => setSmsOptInPhone(e.target.value)}
                          className="ring-focus rounded-xl h-8 text-sm max-w-[200px]"
                          data-testid="input-sms-phone"
                        />
                        <span className="text-[10px] text-muted-foreground leading-tight">
                          Msg & data rates may apply. Reply STOP to opt out. <a href="/privacy" target="_blank" className="underline">Privacy</a> & <a href="/terms" target="_blank" className="underline">Terms</a>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  {alertMode === "price" ? (
                    <div className="grid flex-1 gap-1.5">
                      <Label htmlFor="target-price" className="text-xs">
                        Notify me when price drops to ($)
                      </Label>
                      <Input
                        id="target-price"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={deal?.priceCents ? `Current: $${(deal.priceCents / 100).toFixed(2)}` : "e.g. 49.99"}
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value)}
                        className="ring-focus rounded-xl"
                        data-testid="input-target-price"
                      />
                    </div>
                  ) : (
                    <div className="grid flex-1 gap-1.5">
                      <Label htmlFor="target-percent" className="text-xs">
                        Notify me when discount reaches (%)
                      </Label>
                      <Input
                        id="target-percent"
                        type="number"
                        step="1"
                        min="1"
                        max="100"
                        placeholder={deal?.percentOff ? `Current: ${Number(deal.percentOff).toFixed(0)}%` : "e.g. 60"}
                        value={targetPercent}
                        onChange={(e) => setTargetPercent(e.target.value)}
                        className="ring-focus rounded-xl"
                        data-testid="input-target-percent"
                      />
                    </div>
                  )}
                  <Button
                    onClick={handleCreateAlert}
                    disabled={createAlert.isPending}
                    className={cn(
                      "ring-focus rounded-xl",
                      "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
                      "shadow-lg shadow-primary/20",
                    )}
                    data-testid="button-create-alert"
                  >
                    {createAlert.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="mr-2 h-4 w-4" />
                    )}
                    Set Alert
                  </Button>
                  <div className="text-xs text-muted-foreground" data-testid="alert-notification-hint">
                    {smsAlreadyEnabled
                      ? "Alerts notify via push and SMS."
                      : "Alerts notify via push and SMS (if enabled in Preferences)."}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              <Bell className="h-4 w-4" />
              Sign in to set price alerts for this deal.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
