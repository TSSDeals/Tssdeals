import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Loader2,
  RefreshCw,
  DollarSign,
  Edit3,
  Check,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface PricingReportItem {
  ebayItemId: string;
  title: string;
  myPriceCents: number;
  imageUrl: string | null;
  itemUrl: string;
  condition: string;
  categoryId: string | null;
  categoryName: string | null;
  avgListedPriceCents: number | null;
  medianListedPriceCents: number | null;
  avgSoldPriceCents: number | null;
  medianSoldPriceCents: number | null;
  lowestListedPriceCents: number | null;
  highestListedPriceCents: number | null;
  comparableCount: number;
  soldCount: number;
  suggestedPriceCents: number | null;
  procurementCostCents: number | null;
  estimatedProfitCents: number | null;
  profitMarginPercent: number | null;
  competitiveness: "underpriced" | "competitive" | "slightly_high" | "overpriced" | "no_data";
}

interface PricingReport {
  id: string;
  status: string;
  totalListings: number | null;
  reportData: PricingReportItem[] | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

function formatCents(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const statusColors: Record<string, string> = {
  underpriced: "text-blue-400",
  competitive: "text-emerald-400",
  slightly_high: "text-amber-400",
  overpriced: "text-red-400",
  no_data: "text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  underpriced: "Underpriced",
  competitive: "Competitive",
  slightly_high: "Slightly High",
  overpriced: "Overpriced",
  no_data: "No Data",
};

const statusBgColors: Record<string, string> = {
  underpriced: "bg-blue-500/10 border-blue-500/20",
  competitive: "bg-emerald-500/10 border-emerald-500/20",
  slightly_high: "bg-amber-500/10 border-amber-500/20",
  overpriced: "bg-red-500/10 border-red-500/20",
  no_data: "bg-muted/30 border-muted/20",
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "underpriced": return <TrendingDown className="h-3.5 w-3.5" />;
    case "competitive": return <Check className="h-3.5 w-3.5" />;
    case "slightly_high": return <TrendingUp className="h-3.5 w-3.5" />;
    case "overpriced": return <AlertTriangle className="h-3.5 w-3.5" />;
    default: return <Minus className="h-3.5 w-3.5" />;
  }
}

function CostEditor({ item, onSave }: { item: PricingReportItem; onSave: (costCents: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    item.procurementCostCents ? (item.procurementCostCents / 100).toFixed(2) : ""
  );

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-sm hover:text-primary transition-colors"
        data-testid={`edit-cost-${item.ebayItemId}`}
      >
        {item.procurementCostCents ? formatCents(item.procurementCostCents) : "Add cost"}
        <Edit3 className="h-3 w-3 opacity-50" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground text-xs">$</span>
      <Input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 w-20 text-xs"
        autoFocus
        data-testid={`cost-input-${item.ebayItemId}`}
      />
      <button
        onClick={() => {
          const cents = value ? Math.round(parseFloat(value) * 100) : null;
          onSave(cents);
          setEditing(false);
        }}
        className="text-emerald-400 hover:text-emerald-300"
        data-testid={`save-cost-${item.ebayItemId}`}
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function EbayPricingAnalysis() {
  const { toast } = useToast();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const latestReportQuery = useQuery<PricingReport | null>({
    queryKey: ["/api/admin/ebay-pricing/latest"],
  });

  const reportsListQuery = useQuery<Array<{ id: string; status: string; totalListings: number; createdAt: string; completedAt: string | null }>>({
    queryKey: ["/api/admin/ebay-pricing/reports"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/ebay-pricing/generate-report");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Report generation started", description: "This may take a few minutes. Refresh to see results." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/ebay-pricing/latest"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/ebay-pricing/reports"] });
      }, 5000);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const costMutation = useMutation({
    mutationFn: async (data: { ebayItemId: string; title: string; procurementCostCents: number | null }) => {
      const res = await apiRequest("POST", "/api/admin/ebay-pricing/costs", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ebay-pricing/latest"] });
      toast({ title: "Cost saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error saving cost", description: err.message, variant: "destructive" });
    },
  });

  const report = latestReportQuery.data;
  const items: PricingReportItem[] = (report?.reportData as PricingReportItem[] | null) || [];

  const stats = {
    total: items.length,
    competitive: items.filter(i => i.competitiveness === "competitive").length,
    underpriced: items.filter(i => i.competitiveness === "underpriced").length,
    slightlyHigh: items.filter(i => i.competitiveness === "slightly_high").length,
    overpriced: items.filter(i => i.competitiveness === "overpriced").length,
    noData: items.filter(i => i.competitiveness === "no_data").length,
    withCost: items.filter(i => i.procurementCostCents).length,
  };

  const isGenerating = generateMutation.isPending || report?.status === "pending";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {report && report.status === "complete" && (
            <p className="text-xs text-muted-foreground mt-1">
              Last report: {formatDate(report.createdAt)} · {report.totalListings} listings
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/admin/ebay-pricing/latest"] });
            }}
            variant="outline"
            size="sm"
            data-testid="refresh-pricing-report"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={isGenerating}
            size="sm"
            data-testid="generate-pricing-report"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <BarChart3 className="h-4 w-4 mr-1" />
                Generate Report
              </>
            )}
          </Button>
        </div>
      </div>

      {report?.status === "error" && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          Report failed: {report.errorMessage}
        </div>
      )}

      {report?.status === "pending" && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Report is being generated... This may take a few minutes. Click Refresh to check for updates.
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Listings</div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/10 text-center">
              <div className="text-2xl font-bold text-emerald-400" data-testid="stat-competitive">{stats.competitive}</div>
              <div className="text-xs text-emerald-400/70">Competitive</div>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 text-center">
              <div className="text-2xl font-bold text-blue-400" data-testid="stat-underpriced">{stats.underpriced}</div>
              <div className="text-xs text-blue-400/70">Underpriced</div>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 text-center">
              <div className="text-2xl font-bold text-amber-400" data-testid="stat-slightly-high">{stats.slightlyHigh}</div>
              <div className="text-xs text-amber-400/70">Slightly High</div>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10 text-center">
              <div className="text-2xl font-bold text-red-400" data-testid="stat-overpriced">{stats.overpriced}</div>
              <div className="text-xs text-red-400/70">Overpriced</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <div className="text-2xl font-bold" data-testid="stat-with-cost">{stats.withCost}</div>
              <div className="text-xs text-muted-foreground">With Cost</div>
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item) => {
              const isExpanded = expandedItem === item.ebayItemId;
              return (
                <div
                  key={item.ebayItemId}
                  className={`rounded-lg border ${statusBgColors[item.competitiveness]} overflow-hidden transition-all`}
                  data-testid={`pricing-item-${item.ebayItemId}`}
                >
                  <div
                    className="p-3 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedItem(isExpanded ? null : item.ebayItemId)}
                  >
                    <div className="flex items-start gap-3">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium truncate">{item.title}</h4>
                          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusColors[item.competitiveness]}`}>
                            <StatusIcon status={item.competitiveness} />
                            {statusLabels[item.competitiveness]}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs">
                          <span className="text-muted-foreground">
                            My Price: <strong className="text-foreground">{formatCents(item.myPriceCents)}</strong>
                          </span>
                          <span className="text-muted-foreground">
                            Avg Listed: <strong className="text-foreground">{formatCents(item.avgListedPriceCents)}</strong>
                            {item.comparableCount > 0 && <span className="opacity-50"> ({item.comparableCount})</span>}
                          </span>
                          <span className="text-muted-foreground">
                            Market Avg: <strong className="text-foreground">{formatCents(item.avgSoldPriceCents)}</strong>
                            {item.soldCount > 0 && <span className="opacity-50"> ({item.soldCount})</span>}
                          </span>
                          {item.suggestedPriceCents && (
                            <span className="text-emerald-400">
                              Suggested: <strong>{formatCents(item.suggestedPriceCents)}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 mt-1">
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-white/5 pt-3 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground block">My Price</span>
                          <strong className="text-base">{formatCents(item.myPriceCents)}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Suggested Price</span>
                          <strong className="text-base text-emerald-400">{formatCents(item.suggestedPriceCents)}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Procurement Cost</span>
                          <CostEditor
                            item={item}
                            onSave={(costCents) => {
                              costMutation.mutate({
                                ebayItemId: item.ebayItemId,
                                title: item.title,
                                procurementCostCents: costCents,
                              });
                            }}
                          />
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Est. Profit</span>
                          <strong className={`text-base ${(item.estimatedProfitCents || 0) > 0 ? "text-emerald-400" : (item.estimatedProfitCents || 0) < 0 ? "text-red-400" : ""}`}>
                            {item.estimatedProfitCents !== null ? formatCents(item.estimatedProfitCents) : "—"}
                            {item.profitMarginPercent !== null && (
                              <span className="text-xs font-normal opacity-70 ml-1">({item.profitMarginPercent}%)</span>
                            )}
                          </strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Avg Listed (Active)</span>
                          <span>{formatCents(item.avgListedPriceCents)}</span>
                          {item.comparableCount > 0 && <span className="text-muted-foreground ml-1">({item.comparableCount} listings)</span>}
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Median Listed</span>
                          <span>{formatCents(item.medianListedPriceCents)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Price Range</span>
                          <span>
                            {item.lowestListedPriceCents !== null && item.highestListedPriceCents !== null
                              ? `${formatCents(item.lowestListedPriceCents)} – ${formatCents(item.highestListedPriceCents)}`
                              : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Market Avg (All Sellers)</span>
                          <span>{formatCents(item.avgSoldPriceCents)}</span>
                          {item.soldCount > 0 && <span className="text-muted-foreground ml-1">({item.soldCount} listings)</span>}
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Market Median</span>
                          <span>{formatCents(item.medianSoldPriceCents)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Category</span>
                          <span>{item.categoryName || "—"}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <a
                          href={item.itemUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                          data-testid={`view-listing-${item.ebayItemId}`}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View on eBay
                        </a>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-xs text-muted-foreground">
                          {item.condition}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!latestReportQuery.isLoading && (!report || (report.status === "complete" && items.length === 0)) && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No pricing report yet.</p>
          <p className="mt-1">Click "Generate Report" to analyze your eBay store listings.</p>
        </div>
      )}

      {reportsListQuery.data && reportsListQuery.data.length > 1 && (
        <div className="pt-2">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Report History</h4>
          <div className="space-y-1">
            {reportsListQuery.data.slice(0, 10).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-xs p-2 rounded bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => {
                  queryClient.setQueryData(["/api/admin/ebay-pricing/latest"], null);
                  fetch(`/api/admin/ebay-pricing/reports/${r.id}`, { credentials: "include" })
                    .then(res => res.json())
                    .then(data => queryClient.setQueryData(["/api/admin/ebay-pricing/latest"], data));
                }}
                data-testid={`report-history-${r.id}`}
              >
                <span className="text-muted-foreground">{formatDate(r.createdAt)}</span>
                <span className={r.status === "complete" ? "text-emerald-400" : r.status === "error" ? "text-red-400" : "text-amber-400"}>
                  {r.status} · {r.totalListings} listings
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
