import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Save } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type WindowDays = 5 | 10 | 30 | 90 | 365 | 1095;

function dollarsToCents(value: string) {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function emptyForm() {
  return {
    averageSoldPrice: "",
    minimumSoldPrice: "",
    maximumSoldPrice: "",
    averageShipping: "",
    freeShippingPercent: "",
    sellThroughPercent: "",
    totalSold: "",
    totalSellers: "",
    notes: "",
    sourceUrl: "",
  };
}

export function researchPeriodFromUrl(sourceUrl: string, windowDays: WindowDays) {
  const fallbackEnd = new Date();
  const fallbackStart = new Date(fallbackEnd);
  fallbackStart.setUTCDate(fallbackStart.getUTCDate() - windowDays);
  try {
    const url = new URL(sourceUrl);
    const startMs = Number(url.searchParams.get("startDate"));
    const endMs = Number(url.searchParams.get("endDate"));
    if (Number.isFinite(startMs) && startMs > 0 && Number.isFinite(endMs) && endMs > 0) {
      const timeZone = url.searchParams.get("tz") || "America/New_York";
      const dateInZone = (value: number) => {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date(value));
        const part = (type: string) => parts.find((item) => item.type === type)?.value;
        return `${part("year")}-${part("month")}-${part("day")}`;
      };
      return {
        periodStart: dateInZone(startMs),
        periodEnd: dateInZone(endMs),
      };
    }
  } catch {}
  return {
    periodStart: fallbackStart.toISOString().slice(0, 10),
    periodEnd: fallbackEnd.toISOString().slice(0, 10),
  };
}

export default function ProductResearchPanel() {
  const { toast } = useToast();
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [targetKey, setTargetKey] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const query = useQuery<any>({
    queryKey: ["/api/admin/product-research/workspace", windowDays],
    queryFn: async () => {
      const response = await fetch(`/api/admin/product-research/workspace?days=${windowDays}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not load Product Research workspace");
      return response.json();
    },
  });
  const targets = useMemo(() => [
    ...(query.data?.ledgerModels ?? []).map((item: any) => ({
      ...item,
      observationType: "ledger_model",
    })),
    ...(query.data?.categories ?? []).map((item: any) => ({ ...item, observationType: "category" })),
    ...(query.data?.identities ?? []).map((item: any) => ({
      ...item,
      observationType: "product_identity",
      productIdentityId: item.id,
    })),
  ], [query.data]);
  const target = targets.find((item: any) => item.researchKey === targetKey);

  useEffect(() => {
    if (!targetKey && targets.length) setTargetKey(targets[0].researchKey);
  }, [targetKey, targets]);

  const setField = (field: keyof ReturnType<typeof emptyForm>, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (!target || !form.sourceUrl) {
      toast({
        title: "Source page required",
        description: "Open the eBay research page, then paste its URL before saving.",
        variant: "destructive",
      });
      return;
    }
    const period = researchPeriodFromUrl(form.sourceUrl, windowDays);
    setSaving(true);
    try {
      await apiRequest("POST", "/api/admin/product-research/observations", {
        observationType: target.observationType,
        productIdentityId: target.productIdentityId ?? null,
        researchKey: target.researchKey,
        label: target.label,
        marketplace: "EBAY_US",
        queryText: target.queryText,
        categoryId: target.categoryId ?? null,
        categoryLabel: target.categoryLabel ?? null,
        windowDays,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        averageSoldPriceCents: dollarsToCents(form.averageSoldPrice),
        minimumSoldPriceCents: dollarsToCents(form.minimumSoldPrice),
        maximumSoldPriceCents: dollarsToCents(form.maximumSoldPrice),
        averageShippingCents: dollarsToCents(form.averageShipping),
        freeShippingPercent: form.freeShippingPercent ? Number(form.freeShippingPercent) : null,
        sellThroughPercent: windowDays <= 90 && form.sellThroughPercent
          ? Number(form.sellThroughPercent) : null,
        totalSold: form.totalSold ? Number(form.totalSold) : null,
        totalSellers: form.totalSellers ? Number(form.totalSellers) : null,
        notes: form.notes || null,
        sourceUrl: form.sourceUrl,
      });
      setForm(emptyForm());
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: ["/api/admin/demand-brain/summary"] }),
      ]);
      toast({
        title: "Product Research observation saved",
        description: "The aggregate result is now available to the Demand Brain.",
      });
    } catch (error: any) {
      toast({
        title: "Observation was not saved",
        description: error?.message ?? "Check the values and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">eBay Product Research</div>
          <div className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Record aggregate sold-market figures from your authenticated eBay research page. Individual listings, buyers, and sellers are never copied.
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {([5, 10, 30, 90, 365, 1095] as const).map((days) => (
            <Button
              key={days}
              size="sm"
              variant={windowDays === days ? "default" : "outline"}
              onClick={() => {
                setWindowDays(days);
                setTargetKey("");
                setForm(emptyForm());
              }}
            >
              {days === 365 ? "1 year" : days === 1095 ? "3 years" : `${days}d`}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          {(query.data?.ledgerProgress?.total ?? 0) > 0 && (
            <div
              className="grid grid-cols-3 gap-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-center dark:border-blue-900 dark:bg-blue-950/30"
              data-testid="ledger-research-progress"
            >
              <div>
                <div className="text-lg font-bold">{query.data.ledgerProgress.total}</div>
                <div className="text-[10px] text-muted-foreground">90-day models</div>
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{query.data.ledgerProgress.researched}</div>
                <div className="text-[10px] text-muted-foreground">Researched</div>
              </div>
              <div>
                <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{query.data.ledgerProgress.remaining}</div>
                <div className="text-[10px] text-muted-foreground">Remaining</div>
              </div>
            </div>
          )}
          <div>
            <Label>Research category or model</Label>
            <Select value={targetKey} onValueChange={setTargetKey}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose research target" /></SelectTrigger>
              <SelectContent>
                {(query.data?.ledgerModels ?? []).length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Recently sold by Twin Seam (90 days)</div>
                    {(query.data?.ledgerModels ?? []).map((item: any) => (
                      <SelectItem key={item.researchKey} value={item.researchKey}>
                        {item.lastObserved ? "✓ " : ""}{item.label} · {item.sold_count} sold
                      </SelectItem>
                    ))}
                  </>
                )}
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Priority categories</div>
                {(query.data?.categories ?? []).map((item: any) => (
                  <SelectItem key={item.researchKey} value={item.researchKey}>{item.label}</SelectItem>
                ))}
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Approved product models</div>
                {(query.data?.identities ?? []).map((item: any) => (
                  <SelectItem key={item.researchKey} value={item.researchKey}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {target?.observationType === "ledger_model" && (
            <div className="rounded-xl border border-border bg-background/70 p-3 text-xs" data-testid="selected-ledger-model">
              <div className="font-semibold">{target.label}</div>
              <div className="mt-1 text-muted-foreground">
                Sold {Number(target.sold_count ?? 0).toLocaleString()} time{Number(target.sold_count ?? 0) === 1 ? "" : "s"} in your ledger
                {target.last_sold ? ` · last sold ${String(target.last_sold).slice(0, 10)}` : ""}
              </div>
              <div className={target.lastObserved ? "mt-1 text-emerald-700 dark:text-emerald-400" : "mt-1 text-amber-700 dark:text-amber-400"}>
                {target.lastObserved
                  ? `${windowDays}-day research recorded through ${String(target.lastObserved).slice(0, 10)}`
                  : `${windowDays}-day research still needed`}
              </div>
            </div>
          )}
          {target?.researchUrl && (
            <Button asChild variant="outline" className="w-full">
              <a href={target.researchUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Open prefilled eBay research
              </a>
            </Button>
          )}
          <div>
            <Label>eBay source page URL</Label>
            <Input
              className="mt-1"
              value={form.sourceUrl}
              onChange={(event) => setField("sourceUrl", event.target.value)}
              placeholder="Paste the Product Research page URL"
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              className="mt-1"
              value={form.notes}
              onChange={(event) => setField("notes", event.target.value)}
              placeholder="Optional context or exclusions"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Average sold $", "averageSoldPrice"],
              ["Lowest sold $", "minimumSoldPrice"],
              ["Highest sold $", "maximumSoldPrice"],
              ["Average shipping $", "averageShipping"],
            ].map(([label, field]) => (
              <div key={field}>
                <Label>{label}</Label>
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  value={form[field as keyof typeof form]}
                  onChange={(event) => setField(field as keyof typeof form, event.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Free shipping %", "freeShippingPercent"],
              ["Sell-through %", "sellThroughPercent"],
              ["Items sold", "totalSold"],
              ["Total sellers", "totalSellers"],
            ].map(([label, field]) => (
              <div key={field}>
                <Label>{label}</Label>
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  disabled={field === "sellThroughPercent" && windowDays > 90}
                  value={form[field as keyof typeof form]}
                  onChange={(event) => setField(field as keyof typeof form, event.target.value)}
                  placeholder={field === "sellThroughPercent" && windowDays > 90 ? "Unavailable" : ""}
                />
              </div>
            ))}
          </div>
          <Button className="w-full md:w-auto" disabled={saving || !target} onClick={save}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save aggregate observation"}
          </Button>
        </div>
      </div>

      {(query.data?.observations ?? []).length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-background/70">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Recent research</th><th className="p-2">Period end</th><th className="p-2 text-right">Average sold</th><th className="p-2 text-right">Sold</th></tr>
            </thead>
            <tbody>
              {(query.data.observations ?? []).slice(0, 8).map((item: any) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="p-2 font-medium">{item.label}</td>
                  <td className="p-2">{String(item.period_end).slice(0, 10)}</td>
                  <td className="p-2 text-right">{item.average_sold_price_cents == null ? "—" : `$${(Number(item.average_sold_price_cents) / 100).toFixed(2)}`}</td>
                  <td className="p-2 text-right">{item.total_sold == null ? "—" : Number(item.total_sold).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
