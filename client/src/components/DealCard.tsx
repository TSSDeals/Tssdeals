import { useMemo, useState } from "react";
import { cn, applyEbayReferral } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Pencil, Trash2, ShieldCheck, Store, Zap, TrendingDown, BarChart3, Tag, Copy, Check, EyeOff, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDeleteDeal, useUpdateDeal } from "@/hooks/use-deals";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMagicLink } from "./MagicLinkDialog";
import { PriceHistoryDialog } from "./PriceHistoryDialog";
import { SourceLogo } from "./SourceLogo";

function formatMoney(cents?: number | null, currency?: string | null) {
  if (cents === null || cents === undefined) return "—";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value.toFixed(0)}`;
  }
}

function formatPercent(p: any) {
  const n = typeof p === "string" ? Number(p) : Number(p);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

function PromoCodeBadge({ code, description }: { code: string; description?: string | null }) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-green-500/10 border border-green-500/20 px-2 py-1 cursor-pointer hover:bg-green-500/15 transition-colors"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title={description || `Use code ${code} at checkout`}
      data-testid={`promo-badge-${code}`}
    >
      <Tag className="h-3 w-3 text-green-500" />
      <span className="text-xs font-medium text-green-600 dark:text-green-400">Code:</span>
      <code className="text-xs font-bold font-mono text-green-600 dark:text-green-400">{code}</code>
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-green-500/50" />
      )}
    </div>
  );
}

export function DealCard({
  deal,
  sourceName,
  featured,
  ourStore,
  "data-testid": dataTestId,
}: {
  deal: any;
  sourceName?: string;
  featured?: boolean;
  ourStore?: boolean;
  "data-testid"?: string;
}) {
  const { toast } = useToast();
  const del = useDeleteDeal();
  const upd = useUpdateDeal();
  const { isAuthenticated, user } = useAuth();
  const isAdmin = (user as any)?.isAdmin === true;
  const { openDealPrompt } = useMagicLink();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  const hideMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/deals/${deal.id}/hide`),
    onSuccess: () => {
      setHidden(true);
      queryClient.invalidateQueries({ queryKey: ["/api/deals"], refetchType: "none" });
      toast({ title: "Deal hidden", description: "This deal won't show up again." });
    },
  });

  const handleShare = async () => {
    const dealUrl = applyEbayReferral(deal?.url);
    const price = derived.price;
    const discount = derived.percent;
    const title = deal?.title ?? "Great deal";
    const shareText = `${title} — ${price}${discount ? ` (${discount} off)` : ""}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: shareText, url: dealUrl });
      } catch {
        // user cancelled — do nothing
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${dealUrl}`);
        toast({ title: "Copied!", description: "Deal link copied to clipboard." });
      } catch {
        toast({ title: "Share this deal", description: dealUrl });
      }
    }
  };

  const derived = useMemo(() => {
    const percent = formatPercent(deal?.percentOff);
    const price = formatMoney(deal?.priceCents, deal?.currency);
    const msrp = formatMoney(deal?.msrpCents, deal?.currency);
    const hasMsrp = deal?.msrpCents !== null && deal?.msrpCents !== undefined;
    const msrpVerified = Boolean(deal?.msrpVerified);
    const msrpSource = deal?.msrpSource ?? "retailer";

    const hasMfrMsrp = deal?.manufacturerMsrpCents != null && deal.manufacturerMsrpCents > 0;
    const mfrMsrp = hasMfrMsrp ? formatMoney(deal!.manufacturerMsrpCents, deal?.currency) : null;
    let mfrPercentOff: string | null = null;
    if (hasMfrMsrp && deal?.priceCents) {
      const pct = ((deal.manufacturerMsrpCents! - deal.priceCents) / deal.manufacturerMsrpCents!) * 100;
      if (pct > 0) mfrPercentOff = formatPercent(pct.toFixed(3));
    }
    const showDualPricing = hasMfrMsrp && hasMsrp && deal?.manufacturerMsrpCents !== deal?.msrpCents;

    return { percent, price, msrp, hasMsrp, msrpVerified, msrpSource, hasMfrMsrp, mfrMsrp, mfrPercentOff, showDualPricing };
  }, [deal]);

  const [form, setForm] = useState(() => ({
    title: String(deal?.title ?? ""),
    brand: deal?.brand ?? "",
    url: String(deal?.url ?? ""),
    imageUrl: deal?.imageUrl ?? "",
    isBuyItNow: Boolean(deal?.isBuyItNow ?? true),
    priceCents: deal?.priceCents ?? 0,
    msrpCents: deal?.msrpCents ?? undefined,
  }));

  const onSave = async () => {
    try {
      await upd.mutateAsync({
        id: String(deal.id),
        updates: {
          title: form.title,
          brand: form.brand || null,
          url: form.url,
          imageUrl: form.imageUrl || null,
          isBuyItNow: form.isBuyItNow,
          priceCents: Number(form.priceCents),
          msrpCents: form.msrpCents === undefined || form.msrpCents === null || form.msrpCents === ("" as any)
            ? null
            : Number(form.msrpCents),
        },
      });
      toast({ title: "Saved", description: "Deal updated." });
      setEditOpen(false);
    } catch (e: any) {
      toast({ title: "Couldn’t save", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  const onDelete = async () => {
    try {
      await del.mutateAsync(String(deal.id));
      toast({ title: "Deleted", description: "Deal removed." });
      setConfirmOpen(false);
    } catch (e: any) {
      toast({ title: "Couldn’t delete", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  };

  if (hidden) return null;

  return (
    <div
      data-testid={dataTestId}
      className={cn(
        "group card-elevated relative overflow-hidden transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/10 hover:border-border",
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(800px_240px_at_15%_0%,hsl(var(--primary)/0.10),transparent_55%),radial-gradient(700px_220px_at_90%_0%,hsl(var(--accent)/0.09),transparent_60%)]" />

      <div className="relative flex gap-4 p-4 sm:p-5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted shadow-sm sm:h-28 sm:w-28">
          {deal?.imageUrl ? (
            <img
              src={deal.imageUrl}
              alt={deal?.title ?? "Deal"}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              data-testid="deal-image"
              loading="lazy"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-xs font-semibold text-muted-foreground">
              No image
            </div>
          )}

          {ourStore ? (
            <div className="absolute left-2 top-2 rounded-full bg-gradient-to-r from-primary to-primary/75 px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-md shadow-primary/25">
              Our store
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className="line-clamp-2 font-display text-lg font-bold leading-snug"
                  data-testid="deal-title"
                  title={deal?.title}
                >
                  {deal?.title}
                </h3>
                {featured ? (
                  <Badge className="border-accent/25 bg-accent/10 text-accent" data-testid="deal-featured">
                    Featured
                  </Badge>
                ) : null}
                {deal?.autoIncluded ? (
                  <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400" data-testid="deal-auto-included">
                    <Zap className="mr-0.5 h-3 w-3" />
                    Auto Pick
                  </Badge>
                ) : null}
                {deal?.hasPriceDrop ? (
                  <Badge className="border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400" data-testid="deal-price-drop">
                    <TrendingDown className="mr-0.5 h-3 w-3" />
                    {deal?.priceDropPercent ? `${Number(deal.priceDropPercent).toFixed(0)}% Price Drop` : "Price Drop"}
                  </Badge>
                ) : null}
                {deal?.isLow365d ? (
                  <Badge className="border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" data-testid="deal-low-365d">
                    1yr Low
                  </Badge>
                ) : deal?.isLow180d ? (
                  <Badge className="border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" data-testid="deal-low-180d">
                    6mo Low
                  </Badge>
                ) : deal?.isLow90d ? (
                  <Badge className="border-teal-500/25 bg-teal-500/10 text-teal-600 dark:text-teal-400" data-testid="deal-low-90d">
                    90d Low
                  </Badge>
                ) : deal?.isLow60d ? (
                  <Badge className="border-teal-500/25 bg-teal-500/10 text-teal-600 dark:text-teal-400" data-testid="deal-low-60d">
                    60d Low
                  </Badge>
                ) : deal?.isLow30d ? (
                  <Badge className="border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400" data-testid="deal-low-30d">
                    30d Low
                  </Badge>
                ) : null}
              </div>

              {deal?.promoCode && (
                <PromoCodeBadge code={deal.promoCode} description={deal.promoDescription} />
              )}

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1.5" data-testid="deal-source">
                  <SourceLogo sourceId={deal?.sourceId ?? ""} size={14} />
                  <span>{sourceName ?? deal?.sourceId ?? "Unknown"}</span>
                </span>
                <span className="opacity-50">·</span>
                <span data-testid="deal-condition" className="capitalize">
                  {(deal as any)?.conditionDetail || deal?.condition}
                </span>
                {deal?.brand ? (
                  <>
                    <span className="opacity-50">·</span>
                    <span data-testid="deal-brand">{deal.brand}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setHistoryOpen(true)}
                className="ring-focus rounded-xl shadow-sm hover:shadow-md transition-all"
                data-testid="deal-price-history"
                title="Price History & Alerts"
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleShare}
                className="rounded-xl text-muted-foreground opacity-60 hover:opacity-100 hover:text-foreground transition-all"
                data-testid="deal-share"
                title="Share this deal"
              >
                <Share2 className="h-4 w-4" />
              </Button>
              {isAuthenticated && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => hideMutation.mutate()}
                  disabled={hideMutation.isPending}
                  className="rounded-xl text-muted-foreground opacity-60 hover:opacity-100 hover:text-foreground transition-all"
                  data-testid="deal-hide"
                  title="Hide this deal"
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setEditOpen(true)}
                    className="ring-focus rounded-xl shadow-sm hover:shadow-md transition-all"
                    data-testid="deal-edit"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => setConfirmOpen(true)}
                    className="ring-focus rounded-xl shadow-sm hover:shadow-md transition-all"
                    data-testid="deal-delete"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <div className="text-xl font-extrabold tracking-tight" data-testid="deal-price">
                  {derived.price}
                </div>
                {derived.hasMfrMsrp ? (
                  <div className="flex items-baseline gap-1">
                    <div className="text-sm font-semibold text-muted-foreground line-through" data-testid="deal-mfr-msrp">
                      {derived.mfrMsrp}
                    </div>
                    {derived.msrpVerified ? (
                      <span
                        className="inline-flex items-center text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                        title="MSRP verified against manufacturer's website"
                        data-testid="deal-msrp-verified"
                      >
                        <ShieldCheck className="mr-0.5 h-3 w-3" />
                        MFR
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center text-[10px] font-medium text-amber-600 dark:text-amber-400"
                        title="Manufacturer MSRP (estimated)"
                        data-testid="deal-msrp-estimated"
                      >
                        MFR est.
                      </span>
                    )}
                  </div>
                ) : derived.hasMsrp ? (
                  <div className="flex items-baseline gap-1">
                    <div className="text-sm font-semibold text-muted-foreground line-through" data-testid="deal-msrp">
                      {derived.msrp}
                    </div>
                    <span
                      className="inline-flex items-center text-[10px] font-medium text-muted-foreground/60"
                      title="MSRP from retailer listing"
                      data-testid="deal-msrp-retailer"
                    >
                      <Store className="mr-0.5 h-3 w-3" />
                      Retail
                    </span>
                  </div>
                ) : null}
              </div>
              {derived.showDualPricing && derived.hasMsrp ? (
                <div className="flex items-baseline gap-1 text-[11px] text-muted-foreground" data-testid="deal-retail-msrp-line">
                  <Store className="h-3 w-3 shrink-0" />
                  <span className="line-through">{derived.msrp}</span>
                  <span>retail</span>
                  {derived.percent !== "—" ? (
                    <span className="font-semibold">({derived.percent} off)</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {derived.hasMfrMsrp && derived.mfrPercentOff ? (
                <Badge
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-extrabold tracking-wide",
                    "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  )}
                  data-testid="deal-mfr-percentoff"
                >
                  {derived.mfrPercentOff} off MFR
                </Badge>
              ) : derived.percent !== "—" ? (
                <Badge
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-extrabold tracking-wide",
                    "border-primary/20 bg-primary/10 text-primary",
                  )}
                  data-testid="deal-percentoff"
                >
                  {derived.percent} off
                </Badge>
              ) : null}

              {deal?.isBuyItNow ? (
                <Badge className="border-border bg-muted text-foreground/80" data-testid="deal-buynow">
                  Buy It Now
                </Badge>
              ) : (
                <Badge className="border-border bg-muted text-foreground/80" data-testid="deal-nonbuynow">
                  Auction / Other
                </Badge>
              )}
            </div>

            <div className="ml-auto">
              <Button
                onClick={() => {
                  fetch(`/api/deals/${deal?.id}/click`, { method: 'POST' }).catch(() => {});
                  try { sessionStorage.setItem('tssdeals_last_click', JSON.stringify({ dealId: deal?.id, clickedAt: new Date().toISOString() })); } catch {}
                  const dealUrl = applyEbayReferral(deal?.url);
                  if (!isAuthenticated) {
                    openDealPrompt(dealUrl, deal?.id);
                  } else {
                    window.open(dealUrl, "_blank", "noopener,noreferrer");
                  }
                }}
                className={cn(
                  "ring-focus rounded-xl px-4",
                  "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
                  "shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5",
                  "active:translate-y-0 active:shadow-md transition-all duration-200 ease-out",
                )}
                data-testid="deal-view"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View deal
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display">Edit deal</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="ring-focus rounded-xl"
                data-testid="edit-title"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={form.brand ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))}
                  className="ring-focus rounded-xl"
                  data-testid="edit-brand"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="image">Image URL</Label>
                <Input
                  id="image"
                  value={form.imageUrl ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                  className="ring-focus rounded-xl"
                  data-testid="edit-image"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="url">Deal URL</Label>
              <Input
                id="url"
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                className="ring-focus rounded-xl"
                data-testid="edit-url"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="price">Price (cents)</Label>
                <Input
                  id="price"
                  type="number"
                  value={String(form.priceCents ?? 0)}
                  onChange={(e) => setForm((p) => ({ ...p, priceCents: Number(e.target.value) }))}
                  className="ring-focus rounded-xl"
                  data-testid="edit-price"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="msrp">MSRP (cents)</Label>
                <Input
                  id="msrp"
                  type="number"
                  value={form.msrpCents === undefined || form.msrpCents === null ? "" : String(form.msrpCents)}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      msrpCents: e.target.value === "" ? undefined : Number(e.target.value),
                    }))
                  }
                  className="ring-focus rounded-xl"
                  data-testid="edit-msrp"
                />
              </div>

              <div className="flex items-end justify-between rounded-2xl border border-border bg-muted/40 px-4 py-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold">Buy It Now</div>
                  <div className="text-xs text-muted-foreground">Ebay-style instant checkout</div>
                </div>
                <Switch
                  checked={form.isBuyItNow}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, isBuyItNow: Boolean(v) }))}
                  data-testid="edit-buynow"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => setEditOpen(false)}
                className="ring-focus rounded-xl"
                data-testid="edit-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={onSave}
                disabled={upd.isPending}
                className={cn(
                  "ring-focus rounded-xl",
                  "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
                  "shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5",
                  "active:translate-y-0 active:shadow-md transition-all duration-200 ease-out",
                )}
                data-testid="edit-save"
              >
                {upd.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Delete deal?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This will remove the deal from the feed. You can’t undo this action.
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              className="ring-focus rounded-xl"
              data-testid="delete-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={del.isPending}
              className="ring-focus rounded-xl"
              data-testid="delete-confirm"
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PriceHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} deal={deal} />
    </div>
  );
}
