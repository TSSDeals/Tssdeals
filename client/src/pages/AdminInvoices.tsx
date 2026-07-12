import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Download, FileText, Pencil, ArrowLeft, FileSpreadsheet } from "lucide-react";

interface LineItem {
  item: string;
  description: string;
  qty: number;
  unitPrice: number;
}
interface InvoiceTotals {
  itemsTotal: number; discount: number; shipping: number;
  subtotal: number; taxRate: number; tax: number; grandTotal: number;
}
interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  billToName: string;
  billToStreet: string | null;
  billToCity: string | null;
  billToState: string | null;
  billToZip: string | null;
  billToCountry: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentMethod: string | null;
  paid: boolean;
  lineItems: LineItem[];
  discount: string;
  shipping: string;
  taxRate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  totals: InvoiceTotals;
}

const ADMIN_EMAIL = "justin@twinseamsports.com";

export default function AdminInvoices() {
  const { user, isLoading: authLoading } = useAuth() as any;
  const email = (user?.email || user?.claims?.email || "").toLowerCase();
  const isAdmin = email === ADMIN_EMAIL;
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["/api/admin/invoices"],
    enabled: isAdmin,
  });

  if (authLoading) {
    return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Admin access required</h1>
        <p className="text-muted-foreground mb-4">Sign in as {ADMIN_EMAIL} to access invoices.</p>
        <Link href="/"><Button>Go home</Button></Link>
      </div>
    );
  }

  if (creating || editing) {
    return (
      <InvoiceForm
        existing={editing}
        onCancel={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); }}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <Link href="/app/admin" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1" data-testid="link-back-admin">
            <ArrowLeft className="w-3 h-3" /> Back to TSS Deals Admin
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight mt-1">Invoices</h1>
          <p className="text-muted-foreground text-sm">Generate, download, and track invoices.</p>
        </div>
        <Button onClick={() => setCreating(true)} size="lg" data-testid="button-new-invoice">
          <Plus className="w-4 h-4 mr-1" /> New invoice
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : !list.data?.invoices.length ? (
            <div className="p-12 text-center">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <div className="font-semibold">No invoices yet</div>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first invoice to get started.</p>
              <Button onClick={() => setCreating(true)} data-testid="button-first-invoice">
                <Plus className="w-4 h-4 mr-1" /> New invoice
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Bill To</TableHead>
                  <TableHead>Grand Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.invoices.map(inv => (
                  <TableRow key={inv.id} data-testid={`row-invoice-${inv.invoiceNumber}`}>
                    <TableCell className="font-mono">#{inv.invoiceNumber}</TableCell>
                    <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                    <TableCell>{inv.billToName}</TableCell>
                    <TableCell className="font-semibold">${inv.totals.grandTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      {inv.paid
                        ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>
                        : <Badge variant="outline">Unpaid</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <a href={`/api/admin/invoices/${inv.id}/pdf`}>
                          <Button variant="ghost" size="sm" data-testid={`button-pdf-${inv.invoiceNumber}`}>
                            <Download className="w-3 h-3 mr-1" /> PDF
                          </Button>
                        </a>
                        <a href={`/api/admin/invoices/${inv.id}/xlsx`}>
                          <Button variant="ghost" size="sm" data-testid={`button-xlsx-${inv.invoiceNumber}`}>
                            <FileSpreadsheet className="w-3 h-3 mr-1" /> XLSX
                          </Button>
                        </a>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(inv)} data-testid={`button-edit-${inv.invoiceNumber}`}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function emptyLine(): LineItem {
  return { item: "", description: "", qty: 1, unitPrice: 0 };
}

function InvoiceForm({
  existing, onCancel, onSaved,
}: {
  existing: Invoice | null; onCancel: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [billToName, setBillToName] = useState(existing?.billToName ?? "");
  const [billToStreet, setBillToStreet] = useState(existing?.billToStreet ?? "");
  const [billToCity, setBillToCity] = useState(existing?.billToCity ?? "");
  const [billToState, setBillToState] = useState(existing?.billToState ?? "");
  const [billToZip, setBillToZip] = useState(existing?.billToZip ?? "");
  const [billToCountry, setBillToCountry] = useState(existing?.billToCountry ?? "");
  const [contactEmail, setContactEmail] = useState(existing?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(existing?.contactPhone ?? "");
  const [paymentMethod, setPaymentMethod] = useState(existing?.paymentMethod ?? "");
  const [paid, setPaid] = useState(existing?.paid ?? false);
  const [invoiceDate, setInvoiceDate] = useState(
    existing ? new Date(existing.invoiceDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [lineItems, setLineItems] = useState<LineItem[]>(
    existing?.lineItems?.length ? existing.lineItems : [emptyLine()]
  );
  const [discount, setDiscount] = useState(existing ? String(existing.discount) : "0");
  const [shipping, setShipping] = useState(existing ? String(existing.shipping) : "0");
  const [taxRate, setTaxRate] = useState(existing ? String(existing.taxRate) : "9.075");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const totals = useMemo(() => {
    const itemsTotal = lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0), 0);
    const d = Number(discount) || 0;
    const sh = Number(shipping) || 0;
    const tr = Number(taxRate) || 0;
    const subtotal = Math.max(0, itemsTotal - d + sh);
    const tax = subtotal * (tr / 100);
    return { itemsTotal, discount: d, shipping: sh, subtotal, taxRate: tr, tax, grandTotal: subtotal + tax };
  }, [lineItems, discount, shipping, taxRate]);

  const nextNumber = useQuery<{ invoiceNumber: string }>({
    queryKey: ["/api/admin/invoices-next-number"],
    enabled: !existing,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        invoiceDate: new Date(invoiceDate).toISOString(),
        billToName, billToStreet, billToCity, billToState, billToZip, billToCountry,
        contactEmail, contactPhone, paymentMethod, paid,
        // Drop default-blank rows. Note: `qty` defaults to 1 on a fresh row,
        // so we can't use it as a "has content" signal — require either text
        // or a non-zero unit price.
        lineItems: lineItems.filter(li =>
          (li.item && li.item.trim()) ||
          (li.description && li.description.trim()) ||
          (Number(li.unitPrice) || 0) !== 0
        ),
        discount, shipping, taxRate, notes,
      };
      if (existing) {
        return apiRequest("PATCH", `/api/admin/invoices/${existing.id}`, payload);
      }
      return apiRequest("POST", "/api/admin/invoices", payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
      toast({ title: existing ? "Invoice updated" : "Invoice created" });
      onSaved();
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e?.message ?? "Try again", variant: "destructive" });
    },
  });

  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/admin/invoices/${existing!.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
      toast({ title: "Invoice deleted" });
      onSaved();
    },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1" data-testid="link-back-list">
          <ArrowLeft className="w-3 h-3" /> Back to invoices
        </button>
        <div className="text-xs text-muted-foreground">
          {existing ? <>Invoice <span className="font-mono">#{existing.invoiceNumber}</span></> :
            nextNumber.data ? <>Next: <span className="font-mono">#{nextNumber.data.invoiceNumber}</span></> : null}
        </div>
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight mb-6">{existing ? "Edit invoice" : "New invoice"}</h1>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Bill To</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Name *"><Input value={billToName} onChange={e => setBillToName(e.target.value)} data-testid="input-billToName" /></Field>
            <Field label="Street"><Input value={billToStreet} onChange={e => setBillToStreet(e.target.value)} data-testid="input-billToStreet" /></Field>
            <div className="grid grid-cols-[1fr_100px_120px] gap-2">
              <Field label="City"><Input value={billToCity} onChange={e => setBillToCity(e.target.value)} data-testid="input-billToCity" /></Field>
              <Field label="State"><Input value={billToState} onChange={e => setBillToState(e.target.value)} data-testid="input-billToState" /></Field>
              <Field label="Zip"><Input value={billToZip} onChange={e => setBillToZip(e.target.value)} data-testid="input-billToZip" /></Field>
            </div>
            <Field label="Country"><Input value={billToCountry} onChange={e => setBillToCountry(e.target.value)} data-testid="input-billToCountry" /></Field>
            <Field label="Contact Email"><Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} data-testid="input-contactEmail" /></Field>
            <Field label="Contact Phone"><Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} data-testid="input-contactPhone" /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Invoice details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Invoice date"><Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} data-testid="input-invoiceDate" /></Field>
            <Field label="Payment method"><Input placeholder="Cash, Check, Venmo, etc." value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} data-testid="input-paymentMethod" /></Field>
            <label className="flex items-center gap-2 pt-2">
              <Checkbox checked={paid} onCheckedChange={v => setPaid(!!v)} data-testid="checkbox-paid" />
              <span className="text-sm">Mark as Paid</span>
            </label>
            <Field label="Tax rate (%)"><Input type="number" step="0.001" value={taxRate} onChange={e => setTaxRate(e.target.value)} data-testid="input-taxRate" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Discount ($)"><Input type="number" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} data-testid="input-discount" /></Field>
              <Field label="Shipping ($)"><Input type="number" step="0.01" value={shipping} onChange={e => setShipping(e.target.value)} data-testid="input-shipping" /></Field>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Line items</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setLineItems(items => [...items, emptyLine()])} data-testid="button-add-line">
            <Plus className="w-4 h-4 mr-1" /> Add line
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[1.2fr_2fr_70px_110px_110px_36px] gap-2 px-1 text-xs font-semibold text-muted-foreground">
              <div>Item</div><div>Description</div><div className="text-right">Qty</div>
              <div className="text-right">Unit Price</div><div className="text-right">Total</div><div></div>
            </div>
            {lineItems.map((li, idx) => {
              const total = (Number(li.qty) || 0) * (Number(li.unitPrice) || 0);
              return (
                <div key={idx} className="grid md:grid-cols-[1.2fr_2fr_70px_110px_110px_36px] gap-2 items-center">
                  <Input placeholder="Item" value={li.item} onChange={e => setLineItems(items => items.map((x, i) => i === idx ? { ...x, item: e.target.value } : x))} data-testid={`input-item-${idx}`} />
                  <Input placeholder="Description" value={li.description} onChange={e => setLineItems(items => items.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} data-testid={`input-desc-${idx}`} />
                  <Input type="number" step="1" value={li.qty} onChange={e => setLineItems(items => items.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) || 0 } : x))} className="text-right" data-testid={`input-qty-${idx}`} />
                  <Input type="number" step="0.01" value={li.unitPrice} onChange={e => setLineItems(items => items.map((x, i) => i === idx ? { ...x, unitPrice: Number(e.target.value) || 0 } : x))} className="text-right" data-testid={`input-price-${idx}`} />
                  <div className="text-right font-mono text-sm pr-2">${total.toFixed(2)}</div>
                  <Button variant="ghost" size="icon" onClick={() => setLineItems(items => items.length === 1 ? [emptyLine()] : items.filter((_, i) => i !== idx))} data-testid={`button-remove-${idx}`}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes shown at the bottom of the invoice." data-testid="input-notes" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5 text-sm">
              <Row label="Item(s) Total" value={totals.itemsTotal} />
              <Row label="Discount" value={totals.discount} />
              <Row label="Shipping" value={totals.shipping} />
              <Row label="Subtotal" value={totals.subtotal} />
              <Row label={`Tax (${totals.taxRate}%)`} value={totals.tax} />
              <div className="border-t mt-2 pt-2">
                <Row label="Grand Total" value={totals.grandTotal} bold />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 justify-end">
        {existing && (
          <Button variant="outline" onClick={() => { if (confirm(`Delete invoice #${existing.invoiceNumber}?`)) del.mutate(); }} disabled={del.isPending} data-testid="button-delete">
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
        )}
        <Button variant="outline" onClick={onCancel} data-testid="button-cancel">Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !billToName.trim()} data-testid="button-save">
          {save.isPending ? "Saving…" : existing ? "Save changes" : "Create invoice"}
        </Button>
      </div>
      {existing && (
        <div className="mt-3 text-right text-xs text-muted-foreground">
          Download:{" "}
          <a href={`/api/admin/invoices/${existing.id}/pdf`} className="underline" data-testid="link-download-pdf">PDF</a>
          {" · "}
          <a href={`/api/admin/invoices/${existing.id}/xlsx`} className="underline" data-testid="link-download-xlsx">Excel</a>
          {" — save changes first so the download reflects your latest edits."}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "text-base font-bold" : ""}`}>
      <span>{label}</span>
      <span className="font-mono">${value.toFixed(2)}</span>
    </div>
  );
}
