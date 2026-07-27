import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Calculator, Database, FileSpreadsheet, Loader2, Search, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const money = (value: unknown) => {
  const cents = Number(value);
  if (!Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
};

async function jsonFetch(url: string) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? "Request failed");
  return response.json();
}

const LEDGER_SORT_OPTIONS = [
  ["date", "Activity date"],
  ["itemNumber", "Item number"],
  ["description", "Description"],
  ["status", "Status"],
  ["supplier", "Seller / supplier"],
  ["category", "Category"],
  ["brand", "Brand"],
  ["model", "Model"],
  ["sku", "eBay SKU"],
  ["quantity", "Quantity"],
  ["purchaseDate", "Purchase date"],
  ["saleDate", "Sale date"],
  ["purchaseCost", "Purchase cost"],
  ["deliveredCost", "Delivered cost"],
  ["finalCog", "Final COG"],
  ["salePrice", "Sale price"],
  ["revenue", "Revenue"],
  ["ebayBreakEven", "eBay break even"],
  ["inPersonMinimum", "In-person minimum"],
  ["netProfit", "Net profit"],
] as const;

export default function AdminOperations() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const isAdmin = (user as any)?.isAdmin === true;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"wholesale" | "ledger">("wholesale");
  const [query, setQuery] = useState("");
  const [markup, setMarkup] = useState(25);
  const [ledgerStatus, setLedgerStatus] = useState("");
  const [ledgerSort, setLedgerSort] = useState("date");
  const [ledgerDirection, setLedgerDirection] = useState<"asc" | "desc">("desc");
  const [uploading, setUploading] = useState<"wholesale" | "ledger" | null>(null);

  const summary = useQuery({
    queryKey: ["/api/admin/operations/summary"],
    queryFn: () => jsonFetch("/api/admin/operations/summary"),
    enabled: isAuthenticated && isAdmin,
  });
  const wholesale = useQuery({
    queryKey: ["/api/admin/operations/wholesale", query, markup],
    queryFn: () => jsonFetch(`/api/admin/operations/wholesale?q=${encodeURIComponent(query)}&markup=${markup}`),
    enabled: isAuthenticated && isAdmin && tab === "wholesale",
  });
  const ledger = useQuery({
    queryKey: ["/api/admin/operations/ledger", query, ledgerStatus, ledgerSort, ledgerDirection],
    queryFn: () => {
      const params = new URLSearchParams({
        q: query,
        status: ledgerStatus,
        sort: ledgerSort,
        direction: ledgerDirection,
      });
      return jsonFetch(`/api/admin/operations/ledger?${params.toString()}`);
    },
    enabled: isAuthenticated && isAdmin && tab === "ledger",
  });
  const ledgerStatuses = useQuery({
    queryKey: ["/api/admin/operations/ledger-statuses"],
    queryFn: () => jsonFetch("/api/admin/operations/ledger-statuses"),
    enabled: isAuthenticated && isAdmin && tab === "ledger",
  });

  const rows = useMemo(() => tab === "wholesale" ? (wholesale.data ?? []) : (ledger.data ?? []), [tab, wholesale.data, ledger.data]);

  const uploadFiles = async (kind: "wholesale" | "ledger", files: FileList | null) => {
    if (!files?.length) return;
    setUploading(kind);
    try {
      const form = new FormData();
      if (kind === "wholesale") Array.from(files).forEach((file) => form.append("files", file));
      else form.append("file", files[0]);
      const response = await fetch(`/api/admin/operations/import-${kind}`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? "Import failed");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/operations/summary"] }),
        queryClient.invalidateQueries({ queryKey: [`/api/admin/operations/${kind}`] }),
        ...(kind === "ledger"
          ? [queryClient.invalidateQueries({ queryKey: ["/api/admin/operations/ledger-statuses"] })]
          : []),
      ]);
      toast({
        title: kind === "wholesale" ? "Wholesale pricing imported" : "Ledger imported",
        description: `${Number(result?.totalRows ?? result?.rows ?? 0).toLocaleString()} records are now available.`,
      });
    } catch (error: any) {
      toast({ title: "Import failed", description: error?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  if (authLoading) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }
  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="mx-auto grid min-h-screen max-w-lg place-items-center p-6 text-center">
        <div>
          <Database className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Private operations access</h1>
          <p className="mt-2 text-muted-foreground">This workspace is restricted to the Twin Seam Sports administrator account.</p>
          <Link href="/"><Button className="mt-5">Return home</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title="Twin Seam Operations"
      subtitle="Private wholesale pricing, inventory, purchases, and sales."
      rightSlot={<Link href="/app/admin"><Button variant="outline" size="sm"><ArrowLeft className="mr-1.5 h-4 w-4" />Admin</Button></Link>}
    >
      <div className="space-y-5" data-testid="admin-operations">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard label="Wholesale products" value={Number(summary.data?.wholesale_products ?? 0).toLocaleString()} />
          <SummaryCard label="Catalog matched" value={Number(summary.data?.catalog_matched_products ?? 0).toLocaleString()} />
          <SummaryCard label="Needs catalog name" value={Number(summary.data?.needs_catalog_products ?? 0).toLocaleString()} />
          <SummaryCard label="Ledger entries" value={Number(summary.data?.ledger_entries ?? 0).toLocaleString()} />
          <SummaryCard label="Recorded profit" value={money(summary.data?.ledger_profit_cents ?? 0)} />
        </div>

        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex rounded-xl bg-muted p-1">
              <Button variant={tab === "wholesale" ? "default" : "ghost"} size="sm" onClick={() => { setTab("wholesale"); setQuery(""); }}>
                <Calculator className="mr-1.5 h-4 w-4" />Wholesale pricing
              </Button>
              <Button variant={tab === "ledger" ? "default" : "ghost"} size="sm" onClick={() => { setTab("ledger"); setQuery(""); }}>
                <FileSpreadsheet className="mr-1.5 h-4 w-4" />Business ledger
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tab === "wholesale" ? (
                <Label className="cursor-pointer">
                  <Input className="hidden" type="file" accept=".xlsx,.xls" multiple onChange={(event) => uploadFiles("wholesale", event.target.files)} />
                  <span className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted">
                    {uploading === "wholesale" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                    Import price lists
                  </span>
                </Label>
              ) : (
                <Label className="cursor-pointer">
                  <Input className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => uploadFiles("ledger", event.target.files)} />
                  <span className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted">
                    {uploading === "ledger" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                    Replace ledger
                  </span>
                </Label>
              )}
            </div>
          </div>

          <div className={`mt-4 grid gap-3 ${tab === "wholesale" ? "sm:grid-cols-[1fr_180px]" : "sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_220px_210px_150px]"}`}>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === "wholesale" ? "Search model, SKU, UPC, size, color…" : "Search inventory, supplier, SKU, status…"}
                data-testid="operations-search"
              />
            </div>
            {tab === "wholesale" && (
              <div>
                <Label htmlFor="operations-markup" className="sr-only">Additional markup percent</Label>
                <div className="relative">
                  <Input id="operations-markup" type="number" min={0} max={500} value={markup} onChange={(event) => setMarkup(Number(event.target.value) || 0)} className="pr-9" />
                  <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">% markup</span>
                </div>
              </div>
            )}
            {tab === "ledger" && (
              <>
                <select
                  aria-label="Filter ledger by status"
                  value={ledgerStatus}
                  onChange={(event) => setLedgerStatus(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All statuses</option>
                  {(ledgerStatuses.data ?? []).map((option: any) => (
                    <option key={option.status} value={option.status}>
                      {option.status} ({Number(option.count).toLocaleString()})
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Sort ledger by"
                  value={ledgerSort}
                  onChange={(event) => setLedgerSort(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {LEDGER_SORT_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select
                  aria-label="Ledger sort direction"
                  value={ledgerDirection}
                  onChange={(event) => setLedgerDirection(event.target.value as "asc" | "desc")}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="desc">Highest / newest first</option>
                  <option value="asc">Lowest / oldest first</option>
                </select>
              </>
            )}
          </div>
          {tab === "wholesale" && (
            <p className="mt-2 text-xs text-muted-foreground">Target price applies the 10% EID fee first, then your selected markup. Tax and shipping are not yet included.</p>
          )}
        </section>

        <section className="space-y-3">
          {(wholesale.isFetching || ledger.isFetching) && <p className="text-sm text-muted-foreground">Updating results…</p>}
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
              {summary.isLoading ? "Loading…" : tab === "wholesale" ? "Import the EID Excel price lists to begin." : "Import the ledger workbook to begin."}
            </div>
          ) : rows.map((row: any) => tab === "wholesale"
            ? <WholesaleRow key={row.id} row={row} />
            : <LedgerRow key={row.id} row={row} />)}
        </section>
      </div>
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold sm:text-2xl">{value}</p></div>;
}

function WholesaleRow({ row }: { row: any }) {
  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {(row.retail_brand || row.manufacturer) && <span>{row.retail_brand || row.manufacturer}</span>}
          {(row.retail_category || row.category) && <><span>·</span><span>{row.retail_category || row.category}</span></>}
          {row.sku && <><span>·</span><span>SKU {row.sku}</span></>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{row.retail_name || row.name}</h2>
          {row.identity_status === "catalog_matched" ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800">Catalog matched</span>
          ) : row.identity_status === "needs_catalog" ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Needs catalog name</span>
          ) : null}
        </div>
        {row.retail_name && row.retail_name !== row.name && (
          <p className="mt-1 text-xs text-muted-foreground">Supplier: {row.name}</p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">{[row.size, row.hand, row.color].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-right sm:min-w-[315px]">
        <Price label="Wholesale" value={row.wholesale_cents} />
        <Price label="+ 10% fee" value={row.feeAdjustedCostCents} />
        <Price label="Target" value={row.targetPriceCents} emphasize />
      </div>
    </article>
  );
}

function LedgerRow({ row }: { row: any }) {
  return (
    <article className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{[row.item_number && `#${row.item_number}`, row.status, row.supplier].filter(Boolean).join(" · ")}</p>
        <h2 className="mt-1 font-semibold">{row.description}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{[row.brand, row.model, row.sku].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-right sm:min-w-[520px] sm:grid-cols-5">
        <Price label="Final COG" value={row.final_cog_cents} />
        <Price label="eBay break even" value={row.ebay_break_even_cents} />
        <Price label="In-person minimum" value={row.in_person_minimum_cents} />
        <Price label="Revenue" value={row.revenue_cents ?? row.sale_price_cents} />
        <Price label="Net profit" value={row.profit_cents} emphasize />
      </div>
    </article>
  );
}

function Price({ label, value, emphasize = false }: { label: string; value: unknown; emphasize?: boolean }) {
  return <div className={emphasize ? "rounded-xl bg-primary/10 p-2" : "p-2"}><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={emphasize ? "font-bold text-primary" : "font-semibold"}>{money(value)}</p></div>;
}
