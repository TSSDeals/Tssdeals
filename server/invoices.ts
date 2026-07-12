// Invoice generator: schema bootstrap, CRUD, plus PDF and XLSX exports.
//
// Invoice numbers follow the format `TSSStats{N}` (e.g. "TSSStats1007"). The
// next number is computed from the max existing numeric suffix, falling back
// to 1007 if none exist — that's the starting point the user requested.
//
// PDFs are built with pdfkit at request time (no caching) and stream straight
// to the response. Spreadsheets are built with the existing `xlsx` package
// (already used by the team-stats Excel features).
import type { Express } from "express";
import { db } from "./db";
import { invoices, insertInvoiceSchema, type Invoice, type InvoiceLineItem } from "@shared/schema";
import { desc, eq, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";

const ADMIN_EMAIL = "justin@twinseamsports.com";

const COMPANY = {
  name: "Twin Seam Sports",
  tagline: "Every Game Covered",
  address: "1926 Belvedere Ct.",
  cityState: "Maryville, TN 37803",
  phone: "865-468-8946",
  email: "justin@twinseamsports.com",
  sites: ["www.twinseamsports.com", "www.tssdeals.com", "www.tsteamstats.com"],
};

const INVOICE_PREFIX = "TSSStats";
const INVOICE_START = 1007;

export async function ensureInvoicesSchema(): Promise<void> {
  await db.execute(dsql`
    CREATE TABLE IF NOT EXISTS invoices (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number text NOT NULL UNIQUE,
      invoice_date timestamptz NOT NULL DEFAULT now(),
      bill_to_name text NOT NULL,
      bill_to_street text,
      bill_to_city text,
      bill_to_state text,
      bill_to_zip text,
      bill_to_country text,
      contact_email text,
      contact_phone text,
      payment_method text,
      paid boolean NOT NULL DEFAULT false,
      line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
      discount numeric(12,2) NOT NULL DEFAULT 0,
      shipping numeric(12,2) NOT NULL DEFAULT 0,
      tax_rate numeric(6,4) NOT NULL DEFAULT 9.075,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function nextInvoiceNumber(): Promise<string> {
  // Read the max numeric suffix off existing invoice_numbers that match our
  // prefix and walk it forward. Done as a single SQL pass so concurrent
  // requests are unlikely to collide; the unique index on invoice_number is
  // the real safety net if they do.
  const result = await db.execute<{ max_n: string | null }>(dsql`
    SELECT MAX(CAST(SUBSTRING(invoice_number FROM ${INVOICE_PREFIX.length + 1}) AS INTEGER)) AS max_n
    FROM invoices
    WHERE invoice_number ~ ${"^" + INVOICE_PREFIX + "\\d+$"}
  `);
  const raw = (result as any).rows?.[0]?.max_n ?? (Array.isArray(result) ? result[0]?.max_n : null);
  const max = raw ? parseInt(String(raw), 10) : 0;
  const next = Math.max(max + 1, INVOICE_START);
  return `${INVOICE_PREFIX}${next}`;
}

function isAdmin(req: any, res: any, next: any) {
  const email = (req.session?.magicLink?.email
    || req.user?.claims?.email
    || req.user?.email
    || "").toLowerCase();
  if (email !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

// ---- Totals math (shared by PDF, XLSX, and JSON responses) ----
export interface InvoiceTotals {
  itemsTotal: number;
  discount: number;
  shipping: number;
  subtotal: number;
  taxRate: number;
  tax: number;
  grandTotal: number;
}
export function computeTotals(inv: Invoice): InvoiceTotals {
  const items = (inv.lineItems as InvoiceLineItem[]) ?? [];
  const itemsTotal = items.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0), 0);
  const discount = Number(inv.discount) || 0;
  const shipping = Number(inv.shipping) || 0;
  const taxRate = Number(inv.taxRate) || 0;
  const subtotal = Math.max(0, itemsTotal - discount + shipping);
  const tax = subtotal * (taxRate / 100);
  const grandTotal = subtotal + tax;
  return { itemsTotal, discount, shipping, subtotal, taxRate, tax, grandTotal };
}

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: Date | string) => {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getMonth() + 1}/${x.getDate()}/${x.getFullYear()}`;
};

// ---- PDF generator ----
function findLogoPath(): string | null {
  // Look in common attached_assets locations for the TSS logo.
  const candidates = [
    "attached_assets/TSS_Logo_1779117500363.png",
  ];
  for (const c of candidates) {
    const abs = path.resolve(process.cwd(), c);
    if (fs.existsSync(abs)) return abs;
  }
  // Last resort: glob the directory for any TSS_Logo file.
  try {
    const dir = path.resolve(process.cwd(), "attached_assets");
    if (fs.existsSync(dir)) {
      const found = fs.readdirSync(dir).find(f => /^TSS_Logo.*\.(png|jpe?g)$/i.test(f));
      if (found) return path.join(dir, found);
    }
  } catch { /* ignore */ }
  return null;
}

function renderPdf(inv: Invoice, totals: InvoiceTotals): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header: company info (left) + logo (right)
    const leftX = 50;
    let y = 50;
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#111").text(COMPANY.name, leftX, y);
    y += 20;
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#444").text(COMPANY.tagline, leftX, y);
    y += 18;
    doc.font("Helvetica").fontSize(9).fillColor("#222");
    doc.text(COMPANY.address, leftX, y); y += 12;
    doc.text(COMPANY.cityState, leftX, y); y += 12;
    doc.text(`Phone: ${COMPANY.phone}`, leftX, y); y += 12;
    doc.text(`Email: ${COMPANY.email}`, leftX, y); y += 12;
    for (const s of COMPANY.sites) { doc.text("  " + s, leftX, y); y += 12; }

    const logo = findLogoPath();
    if (logo) {
      try { doc.image(logo, 420, 50, { fit: [140, 110], align: "right" }); } catch { /* skip */ }
    } else {
      doc.font("Helvetica-Bold").fontSize(28).fillColor("#111").text("TS", 470, 60);
      doc.fontSize(12).text("TWIN SEAM SPORTS", 410, 100);
    }

    y = Math.max(y, 180);

    // Invoice meta
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111");
    doc.text("Invoice Number:", leftX, y);
    doc.text("Date:", leftX, y + 18);
    doc.font("Helvetica").fillColor("#000");
    doc.text(`#${inv.invoiceNumber}`, leftX + 100, y);
    doc.text(fmtDate(inv.invoiceDate), leftX + 100, y + 18);
    y += 50;

    // Bill To block
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111").text("Bill To:", leftX, y);
    y += 16;
    doc.font("Helvetica").fontSize(10).fillColor("#000");
    const billRows: [string, string | null][] = [
      ["Name:", inv.billToName],
      ["Street:", inv.billToStreet],
      ["City / State / Zip / Country:", [inv.billToCity, inv.billToState, inv.billToZip, inv.billToCountry].filter(Boolean).join(", ") || null],
      ["Contact Email:", inv.contactEmail],
      ["Contact Phone #:", inv.contactPhone],
    ];
    for (const [label, value] of billRows) {
      doc.font("Helvetica-Bold").fillColor("#444").text(label, leftX, y);
      doc.font("Helvetica").fillColor("#000").text(value ?? "", leftX + 170, y);
      y += 14;
    }
    y += 6;
    doc.font("Helvetica-Bold").fillColor("#444").text("Payment Method:", leftX, y);
    doc.font("Helvetica").fillColor("#000").text(inv.paymentMethod ?? "", leftX + 170, y);
    y += 14;
    doc.font("Helvetica-Bold").fillColor("#444").text("Invoice Paid?:", leftX, y);
    doc.font("Helvetica").fillColor(inv.paid ? "#0a7" : "#a00").text(inv.paid ? "PAID" : "UNPAID", leftX + 170, y);
    y += 24;

    // Line items table — paginates safely by measuring each row's height up
    // front and emitting a new page (with redrawn column headers) before any
    // row that would clip the bottom margin.
    const cols = { item: 50, desc: 180, qty: 360, price: 410, total: 490 };
    const PAGE_BOTTOM = 720;
    const drawTableHeader = () => {
      doc.moveTo(50, y).lineTo(560, y).strokeColor("#999").stroke();
      y += 6;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111");
      doc.text("Item", cols.item, y);
      doc.text("Description", cols.desc, y);
      doc.text("Qty", cols.qty, y, { width: 40, align: "right" });
      doc.text("Unit Price", cols.price, y, { width: 70, align: "right" });
      doc.text("Total", cols.total, y, { width: 70, align: "right" });
      y += 16;
      doc.moveTo(50, y).lineTo(560, y).strokeColor("#ccc").stroke();
      y += 6;
      doc.font("Helvetica").fontSize(10).fillColor("#000");
    };
    drawTableHeader();
    const items = (inv.lineItems as InvoiceLineItem[]) ?? [];
    for (const li of items) {
      const lineTotal = (Number(li.qty) || 0) * (Number(li.unitPrice) || 0);
      const rowHeight = Math.max(
        doc.heightOfString(li.item || "", { width: 120 }),
        doc.heightOfString(li.description || "", { width: 170 }),
        14,
      );
      if (y + rowHeight + 4 > PAGE_BOTTOM) {
        doc.addPage();
        y = 50;
        drawTableHeader();
      }
      doc.text(li.item || "", cols.item, y, { width: 120 });
      doc.text(li.description || "", cols.desc, y, { width: 170 });
      doc.text(String(li.qty ?? ""), cols.qty, y, { width: 40, align: "right" });
      doc.text(fmt(Number(li.unitPrice) || 0), cols.price, y, { width: 70, align: "right" });
      doc.text(fmt(lineTotal), cols.total, y, { width: 70, align: "right" });
      y += rowHeight + 4;
    }
    // Reserve space for the totals block (6 rows * ~16px = ~100px); break to a
    // new page if it would clip.
    if (y + 110 > PAGE_BOTTOM) { doc.addPage(); y = 50; }
    y += 10;
    doc.moveTo(50, y).lineTo(560, y).strokeColor("#999").stroke();
    y += 14;

    // Totals box bottom-right
    const labelX = 380, valueX = 490;
    const totalRows: [string, string, boolean][] = [
      ["Item(s) Total:", fmt(totals.itemsTotal), false],
      ["Discount:", fmt(totals.discount), false],
      ["Shipping:", fmt(totals.shipping), false],
      ["Subtotal:", fmt(totals.subtotal), false],
      [`Tax (${totals.taxRate}%):`, fmt(totals.tax), false],
      ["Grand Total:", fmt(totals.grandTotal), true],
    ];
    for (const [label, value, bold] of totalRows) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10).fillColor("#111");
      doc.text(label, labelX, y, { width: 100, align: "right" });
      doc.text(value, valueX, y, { width: 70, align: "right" });
      y += bold ? 18 : 14;
    }

    if (inv.notes) {
      y += 20;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#444").text("Notes:", leftX, y);
      y += 14;
      doc.font("Helvetica").fontSize(10).fillColor("#000").text(inv.notes, leftX, y, { width: 510 });
    }

    doc.end();
  });
}

// ---- XLSX generator ----
function renderXlsx(inv: Invoice, totals: InvoiceTotals): Buffer {
  const rows: (string | number)[][] = [];
  // Header block (mirrors the template layout, minus the logo image)
  rows.push([COMPANY.name]);
  rows.push([COMPANY.tagline]);
  rows.push([]);
  rows.push([COMPANY.address]);
  rows.push([COMPANY.cityState]);
  rows.push([`Phone: ${COMPANY.phone}`]);
  rows.push([`Email: ${COMPANY.email}`]);
  for (const s of COMPANY.sites) rows.push([`  ${s}`]);
  rows.push([]);
  rows.push(["Invoice Number:", `#${inv.invoiceNumber}`]);
  rows.push(["Date:", fmtDate(inv.invoiceDate)]);
  rows.push([]);
  rows.push(["Bill To:"]);
  rows.push(["Name:", inv.billToName]);
  rows.push(["Address:"]);
  rows.push(["  Street", inv.billToStreet ?? ""]);
  rows.push(["  City / State / Zip / Country", [inv.billToCity, inv.billToState, inv.billToZip, inv.billToCountry].filter(Boolean).join(", ")]);
  rows.push(["Contact Email:", inv.contactEmail ?? ""]);
  rows.push(["Contact Phone #:", inv.contactPhone ?? ""]);
  rows.push([]);
  rows.push(["Payment Method:", inv.paymentMethod ?? ""]);
  rows.push(["Invoice Paid?:", inv.paid ? "PAID" : "UNPAID"]);
  rows.push([]);
  rows.push(["Item", "Description", "Qty", "Unit Price", "Total"]);
  const items = (inv.lineItems as InvoiceLineItem[]) ?? [];
  for (const li of items) {
    const lineTotal = (Number(li.qty) || 0) * (Number(li.unitPrice) || 0);
    rows.push([li.item || "", li.description || "", Number(li.qty) || 0, Number(li.unitPrice) || 0, lineTotal]);
  }
  rows.push([]);
  rows.push(["", "", "", "Item(s) Total:", totals.itemsTotal]);
  rows.push(["", "", "", "Discount:", totals.discount]);
  rows.push(["", "", "", "Shipping:", totals.shipping]);
  rows.push(["", "", "", "Subtotal:", totals.subtotal]);
  rows.push(["", "", "", `Tax (${totals.taxRate}%):`, totals.tax]);
  rows.push(["", "", "", "Grand Total:", totals.grandTotal]);
  if (inv.notes) {
    rows.push([]);
    rows.push(["Notes:", inv.notes]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 22 }, { wch: 32 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invoice");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export function registerInvoiceRoutes(app: Express): void {
  void ensureInvoicesSchema().catch((e) => console.error("[invoices] schema bootstrap failed:", e));

  // List
  app.get("/api/admin/invoices", isAdmin, async (_req, res) => {
    const rows = await db.select().from(invoices).orderBy(desc(invoices.createdAt));
    const enriched = rows.map((inv) => ({ ...inv, totals: computeTotals(inv) }));
    res.json({ invoices: enriched });
  });

  // Read one
  app.get("/api/admin/invoices/:id", isAdmin, async (req, res) => {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, req.params.id)).limit(1);
    if (!inv) return res.status(404).json({ message: "Not found" });
    res.json({ ...inv, totals: computeTotals(inv) });
  });

  // Create. We retry on a unique_violation against `invoice_number` so that
  // two concurrent admin saves can't both claim the same TSSStats### number
  // (compute-then-insert is not atomic on its own).
  app.post("/api/admin/invoices", isAdmin, async (req, res) => {
    const parsed = insertInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid invoice" });
    }
    let lastErr: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = await nextInvoiceNumber();
      try {
        const [inv] = await db.insert(invoices).values({
          ...parsed.data,
          invoiceNumber: number,
        } as any).returning();
        return res.json({ ...inv, totals: computeTotals(inv) });
      } catch (err: any) {
        // 23505 = unique_violation in Postgres. Anything else is fatal.
        if (err?.code === "23505" || /duplicate key|unique/i.test(String(err?.message ?? ""))) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    console.error("[invoices] create failed after retries:", lastErr);
    return res.status(409).json({ message: "Could not allocate invoice number; please try again." });
  });

  // Update
  const patchSchema = insertInvoiceSchema.partial();
  app.patch("/api/admin/invoices/:id", isAdmin, async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid invoice" });
    }
    const [inv] = await db.update(invoices)
      .set({ ...parsed.data, updatedAt: new Date() } as any)
      .where(eq(invoices.id, req.params.id))
      .returning();
    if (!inv) return res.status(404).json({ message: "Not found" });
    res.json({ ...inv, totals: computeTotals(inv) });
  });

  // Delete
  app.delete("/api/admin/invoices/:id", isAdmin, async (req, res) => {
    const result = await db.delete(invoices).where(eq(invoices.id, req.params.id)).returning({ id: invoices.id });
    if (result.length === 0) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  });

  // PDF download
  app.get("/api/admin/invoices/:id/pdf", isAdmin, async (req, res) => {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, req.params.id)).limit(1);
    if (!inv) return res.status(404).json({ message: "Not found" });
    const buf = await renderPdf(inv, computeTotals(inv));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${inv.invoiceNumber}.pdf"`);
    res.send(buf);
  });

  // XLSX download
  app.get("/api/admin/invoices/:id/xlsx", isAdmin, async (req, res) => {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, req.params.id)).limit(1);
    if (!inv) return res.status(404).json({ message: "Not found" });
    const buf = renderXlsx(inv, computeTotals(inv));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${inv.invoiceNumber}.xlsx"`);
    res.send(buf);
  });

  // Next invoice number (for live preview in the create form)
  app.get("/api/admin/invoices-next-number", isAdmin, async (_req, res) => {
    res.json({ invoiceNumber: await nextInvoiceNumber() });
  });
}
