import { useMemo, useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCreateDeal } from "@/hooks/use-deals";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

const formSchema = z.object({
  sourceId: z.string().min(1, "Source is required"),
  title: z.string().min(3, "Title is required"),
  url: z.string().url("Must be a valid URL"),
  condition: z.enum(["new", "preowned"]),
  currency: z.string().min(3).default("USD"),
  priceCents: z.coerce.number().int().min(1, "Price is required"),
  msrpCents: z.coerce.number().int().optional().nullable(),
  percentOff: z.coerce.number().min(0).max(100),
  isBuyItNow: z.coerce.boolean().default(true),
  brand: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  sportId: z.string().optional().nullable(),
  equipmentTypeId: z.string().optional().nullable(),
  raw: z.any().optional(),
});

export function DealComposer({
  sources,
  defaultSourceId,
  "data-testid": dataTestId,
}: {
  sources: Array<{ id: string; name: string; isOurStore?: boolean }> | undefined;
  defaultSourceId?: string;
  "data-testid"?: string;
}) {
  const { toast } = useToast();
  const create = useCreateDeal();
  const [open, setOpen] = useState(false);

  const our = useMemo(() => sources?.find((s) => (s as any).isOurStore) ?? null, [sources]);

  const [form, setForm] = useState(() => ({
    sourceId: defaultSourceId || our?.id || sources?.[0]?.id || "",
    title: "",
    brand: "",
    url: "",
    imageUrl: "",
    condition: "new" as "new" | "preowned",
    currency: "USD",
    priceCents: 0,
    msrpCents: "" as string | number | null,
    percentOff: 50,
    isBuyItNow: true,
    raw: "",
  }));

  const onCreate = async () => {
    try {
      const parsed = formSchema.parse({
        ...form,
        brand: form.brand ? form.brand : null,
        imageUrl: form.imageUrl ? form.imageUrl : null,
        msrpCents: form.msrpCents === "" || form.msrpCents === null ? null : form.msrpCents,
        raw: form.raw ? safeJsonParse(form.raw) : undefined,
      });

      await create.mutateAsync(parsed);
      toast({ title: "Deal created", description: "Added to the feed." });
      setOpen(false);
      setForm((p) => ({ ...p, title: "", brand: "", url: "", imageUrl: "", priceCents: 0, msrpCents: "", raw: "" }));
    } catch (e: any) {
      const message = e?.issues?.[0]?.message || e?.message || "Unknown error";
      toast({ title: "Couldn’t create", description: message, variant: "destructive" });
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className={cn(
          "ring-focus rounded-xl",
          "bg-gradient-to-r from-accent to-accent/80 text-accent-foreground",
          "shadow-lg shadow-accent/20 hover:shadow-xl hover:shadow-accent/25 hover:-translate-y-0.5",
          "active:translate-y-0 active:shadow-md transition-all duration-200 ease-out",
        )}
        data-testid={dataTestId ?? "deal-create-open"}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add deal
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Add a deal</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Source ID</Label>
                <Input
                  value={form.sourceId}
                  onChange={(e) => setForm((p) => ({ ...p, sourceId: e.target.value }))}
                  placeholder="e.g. twinseam"
                  className="ring-focus rounded-xl"
                  data-testid="create-sourceId"
                />
                <div className="text-xs text-muted-foreground">
                  Tip: set to <span className="font-semibold">{our?.id ?? "our store source id"}</span> to feature.
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Condition</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={form.condition === "new" ? "default" : "secondary"}
                    onClick={() => setForm((p) => ({ ...p, condition: "new" }))}
                    className="ring-focus flex-1 rounded-xl"
                    data-testid="create-condition-new"
                  >
                    New
                  </Button>
                  <Button
                    type="button"
                    variant={form.condition === "preowned" ? "default" : "secondary"}
                    onClick={() => setForm((p) => ({ ...p, condition: "preowned" }))}
                    className="ring-focus flex-1 rounded-xl"
                    data-testid="create-condition-preowned"
                  >
                    Preowned
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Marucci CATX2 BBCOR 33/30"
                className="ring-focus rounded-xl"
                data-testid="create-title"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Brand</Label>
                <Input
                  value={form.brand}
                  onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))}
                  placeholder="Rawlings"
                  className="ring-focus rounded-xl"
                  data-testid="create-brand"
                />
              </div>
              <div className="grid gap-2">
                <Label>Image URL</Label>
                <Input
                  value={form.imageUrl}
                  onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
                  placeholder="https://..."
                  className="ring-focus rounded-xl"
                  data-testid="create-imageUrl"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Deal URL</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://..."
                className="ring-focus rounded-xl"
                data-testid="create-url"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Price (cents)</Label>
                <Input
                  type="number"
                  value={String(form.priceCents)}
                  onChange={(e) => setForm((p) => ({ ...p, priceCents: Number(e.target.value) }))}
                  className="ring-focus rounded-xl"
                  data-testid="create-priceCents"
                />
              </div>
              <div className="grid gap-2">
                <Label>MSRP (cents)</Label>
                <Input
                  type="number"
                  value={form.msrpCents === null ? "" : String(form.msrpCents ?? "")}
                  onChange={(e) => setForm((p) => ({ ...p, msrpCents: e.target.value === "" ? "" : Number(e.target.value) }))}
                  className="ring-focus rounded-xl"
                  data-testid="create-msrpCents"
                />
              </div>
              <div className="grid gap-2">
                <Label>Percent off</Label>
                <Input
                  type="number"
                  value={String(form.percentOff)}
                  onChange={(e) => setForm((p) => ({ ...p, percentOff: Number(e.target.value) }))}
                  className="ring-focus rounded-xl"
                  data-testid="create-percentOff"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Buy It Now</div>
                <div className="text-xs text-muted-foreground">Instant purchase flow</div>
              </div>
              <Switch
                checked={form.isBuyItNow}
                onCheckedChange={(v) => setForm((p) => ({ ...p, isBuyItNow: Boolean(v) }))}
                data-testid="create-isBuyItNow"
              />
            </div>

            <div className="grid gap-2">
              <Label>Raw (optional JSON)</Label>
              <Textarea
                value={form.raw}
                onChange={(e) => setForm((p) => ({ ...p, raw: e.target.value }))}
                placeholder='{"note":"imported manually"}'
                className="ring-focus min-h-[92px] rounded-xl"
                data-testid="create-raw"
              />
              <div className="text-xs text-muted-foreground">
                Saved as JSONB; leave empty if not needed.
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => setOpen(false)}
                className="ring-focus rounded-xl"
                data-testid="create-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={onCreate}
                disabled={create.isPending}
                className={cn(
                  "ring-focus rounded-xl",
                  "bg-gradient-to-r from-accent to-accent/80 text-accent-foreground",
                  "shadow-lg shadow-accent/20 hover:shadow-xl hover:shadow-accent/25 hover:-translate-y-0.5",
                  "active:translate-y-0 active:shadow-md transition-all duration-200 ease-out",
                )}
                data-testid="create-submit"
              >
                {create.isPending ? "Creating…" : "Create deal"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return { rawText: raw };
  }
}
