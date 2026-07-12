import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSources, useSports, useEquipmentTypes, useSubFilters } from "@/hooks/use-taxonomy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BarChart3, Download, Pencil, Search } from "lucide-react";

type Filters = {
  sportId: string;
  sourceId: string;
  equipmentTypeId: string;
  condition: string;
  freshDays: string;
  search: string;
  untaggedOnly: boolean;
  inactiveOnly: boolean;
};

const ALL = "__all__";

const initialFilters: Filters = {
  sportId: ALL,
  sourceId: ALL,
  equipmentTypeId: ALL,
  condition: ALL,
  freshDays: "7",
  search: "",
  untaggedOnly: false,
  inactiveOnly: false,
};

function buildQueryParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.sportId !== ALL) p.set("sportId", f.sportId);
  if (f.sourceId !== ALL) p.set("sourceId", f.sourceId);
  if (f.equipmentTypeId !== ALL) p.set("equipmentTypeId", f.equipmentTypeId);
  if (f.condition !== ALL) p.set("condition", f.condition);
  if (f.freshDays) p.set("freshDays", f.freshDays);
  if (f.search) p.set("search", f.search);
  if (f.untaggedOnly) p.set("untaggedOnly", "1");
  if (f.inactiveOnly) p.set("inactiveOnly", "1");
  return p;
}

interface DealRow {
  id: string;
  title: string;
  brand: string | null;
  source_id: string;
  sport_id: string | null;
  equipment_type_id: string | null;
  sub_filter_id: string | null;
  sub_filter_ids?: string[] | null;
  sub_filter_names?: string[] | null;
  drop_weight: number | null;
  size_number: string | null;
  condition: string;
  price_cents: number;
  msrp_cents: number | null;
  percent_off: string | null;
  is_featured: boolean;
  last_seen_at: string;
  url: string;
}

export function DataReportingPanel() {
  const { toast } = useToast();
  const sources = useSources();
  const sports = useSports();

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [draftSearch, setDraftSearch] = useState("");
  const [editing, setEditing] = useState<DealRow | null>(null);

  const eqTypes = useEquipmentTypes(filters.sportId !== ALL ? filters.sportId : undefined);

  const params = buildQueryParams(filters);
  const paramStr = params.toString();

  const stats = useQuery<any>({
    queryKey: ["/api/admin/stats", paramStr],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/stats?${paramStr}`);
      return r.json();
    },
  });

  const list = useQuery<{ total: number; rows: DealRow[] }>({
    queryKey: ["/api/admin/deals/list", paramStr],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/deals/list?${paramStr}&limit=100`);
      return r.json();
    },
  });

  const onResetFilters = () => {
    setFilters(initialFilters);
    setDraftSearch("");
  };

  const onApplySearch = () => setFilters((f) => ({ ...f, search: draftSearch }));

  const onDownloadCsv = async () => {
    try {
      const r = await apiRequest("GET", `/api/admin/deals/export?${paramStr}&maxRows=10000`);
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tssdeals-export-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "Export started", description: "CSV downloaded with current filters." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? "Error", variant: "destructive" });
    }
  };

  const totals = stats.data?.totals ?? {};
  const total = Number(totals.total ?? 0);
  const active = Number(totals.active ?? 0);
  const missingSub = Number(totals.missing_sub_filter ?? 0);
  const missingEquip = Number(totals.missing_equipment ?? 0);
  const missingSport = Number(totals.missing_sport ?? 0);
  const withDrop = Number(totals.with_drop ?? 0);
  const withSize = Number(totals.with_size ?? 0);
  const featured = Number(totals.featured ?? 0);
  const priceDrops = Number(totals.price_drops ?? 0);
  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "—");

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-600/20">
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="font-display text-xl font-bold">Data Reporting &amp; Edit</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Filter the catalog, see counts and gaps in classification, edit any deal, or download the filtered set as CSV.
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onDownloadCsv} data-testid="button-download-csv">
          <Download className="h-4 w-4 mr-1.5" /> Download CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <div className="grid gap-1">
          <Label className="text-xs">Sport</Label>
          <Select value={filters.sportId} onValueChange={(v) => setFilters((f) => ({ ...f, sportId: v, equipmentTypeId: ALL }))}>
            <SelectTrigger className="rounded-xl text-sm" data-testid="report-sport"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sports</SelectItem>
              {(sports.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Equipment</Label>
          <Select value={filters.equipmentTypeId} onValueChange={(v) => setFilters((f) => ({ ...f, equipmentTypeId: v }))} disabled={filters.sportId === ALL}>
            <SelectTrigger className="rounded-xl text-sm" data-testid="report-equipment"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All equipment</SelectItem>
              {(eqTypes.data ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Source</Label>
          <Select value={filters.sourceId} onValueChange={(v) => setFilters((f) => ({ ...f, sourceId: v }))}>
            <SelectTrigger className="rounded-xl text-sm" data-testid="report-source"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sources</SelectItem>
              {(sources.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Condition</Label>
          <Select value={filters.condition} onValueChange={(v) => setFilters((f) => ({ ...f, condition: v }))}>
            <SelectTrigger className="rounded-xl text-sm" data-testid="report-condition"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any condition</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="preowned">Pre-owned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Fresh days</Label>
          <Input
            type="number"
            min={1}
            max={90}
            value={filters.freshDays}
            onChange={(e) => setFilters((f) => ({ ...f, freshDays: e.target.value }))}
            className="rounded-xl text-sm"
            data-testid="report-fresh-days"
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Search</Label>
          <div className="flex gap-1">
            <Input
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              placeholder="title or brand"
              onKeyDown={(e) => e.key === "Enter" && onApplySearch()}
              className="rounded-xl text-sm"
              data-testid="report-search"
            />
            <Button size="icon" variant="outline" onClick={onApplySearch} data-testid="report-search-go">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.untaggedOnly}
            onChange={(e) => setFilters((f) => ({ ...f, untaggedOnly: e.target.checked }))}
            data-testid="report-untagged-only"
          />
          Untagged only (no sub-filter)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.inactiveOnly}
            onChange={(e) => setFilters((f) => ({ ...f, inactiveOnly: e.target.checked }))}
            data-testid="report-inactive-only"
          />
          Inactive only (older than fresh-days)
        </label>
        <Button size="sm" variant="ghost" onClick={onResetFilters} data-testid="report-reset">Reset filters</Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatTile label="Total" value={total.toLocaleString()} />
        <StatTile label="Active" value={`${active.toLocaleString()} (${pct(active)})`} tone="emerald" />
        <StatTile label="Missing sub-filter" value={`${missingSub.toLocaleString()} (${pct(missingSub)})`} tone={missingSub > 0 ? "amber" : undefined} />
        <StatTile label="Missing equipment" value={`${missingEquip.toLocaleString()} (${pct(missingEquip)})`} tone={missingEquip > 0 ? "amber" : undefined} />
        <StatTile label="Missing sport" value={`${missingSport.toLocaleString()} (${pct(missingSport)})`} tone={missingSport > 0 ? "amber" : undefined} />
        <StatTile label="With drop weight" value={`${withDrop.toLocaleString()} (${pct(withDrop)})`} />
        <StatTile label="With size" value={`${withSize.toLocaleString()} (${pct(withSize)})`} />
        <StatTile label="Featured" value={featured.toLocaleString()} />
        <StatTile label="Price drops" value={priceDrops.toLocaleString()} />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BreakdownTable title="By sport" rows={stats.data?.bySport ?? []} extraKey="untagged" extraLabel="Untagged" />
        <BreakdownTable title="By equipment" rows={stats.data?.byEquipment ?? []} extraKey="untagged" extraLabel="Untagged" />
        <BreakdownTable title="By source" rows={stats.data?.bySource ?? []} extraKey="active" extraLabel="Active" />
      </div>

      {/* Deal list */}
      <div className="rounded-xl border border-border bg-background/60">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="text-sm font-semibold">
            Deals matching filters
            {list.data && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                showing {list.data.rows.length} of {list.data.total.toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Sport</th>
                <th className="px-3 py-2">Equip</th>
                <th className="px-3 py-2">Sub</th>
                <th className="px-3 py-2">Drop</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {list.data?.rows.map((d) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 max-w-[280px]">
                    <a href={d.url} target="_blank" rel="noopener" className="font-medium hover:underline line-clamp-1">{d.title}</a>
                    {d.brand && <div className="text-[10px] text-muted-foreground">{d.brand}</div>}
                  </td>
                  <td className="px-3 py-2">{d.sport_id ?? "—"}</td>
                  <td className="px-3 py-2">{d.equipment_type_id ?? "—"}</td>
                  <td className="px-3 py-2">
                    {d.sub_filter_names && d.sub_filter_names.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {d.sub_filter_names.map((name, i) => (
                          <span key={i} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px]">{name}</span>
                        ))}
                      </div>
                    ) : d.sub_filter_id ? (
                      <span className="text-[10px]">{d.sub_filter_id}</span>
                    ) : (
                      <span className="text-amber-600">∅</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{d.drop_weight ?? "—"}</td>
                  <td className="px-3 py-2">{d.size_number ?? "—"}</td>
                  <td className="px-3 py-2">${(d.price_cents / 100).toFixed(2)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(d.last_seen_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(d)} data-testid={`button-edit-deal-${d.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!list.isLoading && list.data?.rows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">No deals match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditDealDialog
          deal={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["/api/admin/deals/list"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
          }}
        />
      )}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "amber"
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-border bg-background/60";
  return (
    <div className={`rounded-xl border ${toneClass} p-3`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-base font-bold">{value}</div>
    </div>
  );
}

function BreakdownTable({ title, rows, extraKey, extraLabel }: { title: string; rows: any[]; extraKey: string; extraLabel: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/60">
      <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5">Label</th>
              <th className="px-3 py-1.5 text-right">Total</th>
              <th className="px-3 py-1.5 text-right">{extraLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-1.5 truncate max-w-[180px]">{r.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{Number(r.n ?? 0).toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{Number(r[extraKey] ?? 0).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="px-3 py-2 text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditDealDialog({ deal, open, onClose, onSaved }: { deal: DealRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const sports = useSports();
  const [sportId, setSportId] = useState(deal.sport_id ?? "");
  const [equipmentTypeId, setEquipmentTypeId] = useState(deal.equipment_type_id ?? "");
  // Multi-select: edit the full set of sub-filter tags. Seed from sub_filter_ids
  // when present (modern multi-tag deals), otherwise from the legacy single column.
  const [subFilterIds, setSubFilterIds] = useState<string[]>(
    deal.sub_filter_ids && deal.sub_filter_ids.length > 0
      ? deal.sub_filter_ids
      : deal.sub_filter_id
        ? [deal.sub_filter_id]
        : [],
  );
  const [brand, setBrand] = useState(deal.brand ?? "");
  const [dropWeight, setDropWeight] = useState<string>(deal.drop_weight !== null && deal.drop_weight !== undefined ? String(deal.drop_weight) : "");
  const [sizeNumber, setSizeNumber] = useState<string>(deal.size_number ?? "");
  const [condition, setCondition] = useState<string>(deal.condition);
  const [isFeatured, setIsFeatured] = useState<boolean>(deal.is_featured);
  const [saving, setSaving] = useState(false);

  const eqTypes = useEquipmentTypes(sportId || undefined);
  const subFilters = useSubFilters(equipmentTypeId || undefined);

  const onSave = async () => {
    setSaving(true);
    try {
      // Preserve the existing primary tag (legacy sub_filter_id) at index 0
      // when it's still selected — otherwise simply re-opening + saving the
      // dialog would silently change the "primary" depending on which chip
      // happened to be clicked first.
      const orderedIds = (() => {
        const set = new Set(subFilterIds);
        const primary = deal.sub_filter_id;
        if (primary && set.has(primary)) {
          return [primary, ...subFilterIds.filter((x) => x !== primary)];
        }
        return [...subFilterIds];
      })();
      const body: any = {
        sportId: sportId || null,
        equipmentTypeId: equipmentTypeId || null,
        // Always send the full multi-tag set; the server keeps the legacy
        // sub_filter_id column in sync with subFilterIds[0].
        subFilterIds: orderedIds,
        brand: brand.trim() || null,
        dropWeight: dropWeight === "" ? null : parseInt(dropWeight, 10),
        sizeNumber: sizeNumber.trim() === "" ? null : sizeNumber.trim().slice(0, 20),
        condition,
        isFeatured,
      };
      await apiRequest("PATCH", `/api/admin/deals/${deal.id}`, body);
      toast({ title: "Deal updated", description: "Classification saved." });
      onSaved();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="edit-deal-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Edit deal classification</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground line-clamp-2">{deal.title}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Sport</Label>
              <Select
                value={sportId || "__none__"}
                onValueChange={(v) => { setSportId(v === "__none__" ? "" : v); setEquipmentTypeId(""); setSubFilterIds([]); }}
              >
                <SelectTrigger className="rounded-xl text-sm" data-testid="edit-sport"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(none — clear)</SelectItem>
                  {(sports.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Equipment</Label>
              <Select
                value={equipmentTypeId || "__none__"}
                onValueChange={(v) => { setEquipmentTypeId(v === "__none__" ? "" : v); setSubFilterIds([]); }}
                disabled={!sportId}
              >
                <SelectTrigger className="rounded-xl text-sm" data-testid="edit-equipment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(none — clear)</SelectItem>
                  {(eqTypes.data ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1 col-span-2">
              <Label className="text-xs">
                Sub-filters
                <span className="ml-2 text-muted-foreground font-normal">
                  ({subFilterIds.length} selected — click to toggle)
                </span>
              </Label>
              {!equipmentTypeId ? (
                <div className="text-xs text-muted-foreground italic rounded-xl border px-3 py-2">
                  Pick an equipment type to choose sub-filters.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 rounded-xl border px-2 py-2 max-h-32 overflow-y-auto" data-testid="edit-subfilters">
                  {(subFilters.data ?? []).length === 0 && (
                    <span className="text-xs text-muted-foreground italic">No sub-filters defined for this equipment type.</span>
                  )}
                  {(subFilters.data ?? []).map((sf: any) => {
                    const active = subFilterIds.includes(sf.id);
                    return (
                      <button
                        type="button"
                        key={sf.id}
                        onClick={() =>
                          setSubFilterIds((prev) =>
                            active ? prev.filter((x) => x !== sf.id) : [...prev, sf.id],
                          )
                        }
                        className={
                          "rounded-full border px-2.5 py-0.5 text-xs transition " +
                          (active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted")
                        }
                        data-testid={`chip-subfilter-${sf.id}`}
                      >
                        {sf.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger className="rounded-xl text-sm" data-testid="edit-condition"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="preowned">Pre-owned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Brand</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="rounded-xl text-sm" data-testid="edit-brand" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Drop weight</Label>
              <Input type="number" min={0} max={20} value={dropWeight} onChange={(e) => setDropWeight(e.target.value)} placeholder="e.g. 10" className="rounded-xl text-sm" data-testid="edit-drop" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Size</Label>
              <Input
                type="text"
                maxLength={20}
                value={sizeNumber}
                onChange={(e) => setSizeNumber(e.target.value)}
                placeholder='e.g. 11.5, 5, 12"'
                className="rounded-xl text-sm"
                data-testid="edit-size"
              />
            </div>
            <label className="flex items-center gap-2 text-sm self-end">
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} data-testid="edit-featured" />
              Featured
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={onSave} disabled={saving} data-testid="edit-save">{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
