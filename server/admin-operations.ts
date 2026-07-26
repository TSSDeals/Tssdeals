import type { Express, RequestHandler } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { sql } from "drizzle-orm";
import { db } from "./db";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 40 },
});

const clean = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cents = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const parsed = Number(clean(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
};
const validDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const HEADER_ALIASES = {
  sku: ["sku", "item", "item #", "item number", "style", "style number", "article", "material", "rht article #"],
  upc: ["upc", "gtin", "barcode", "rht upc"],
  description: ["description", "product description", "product name", "item description", "style name", "product", "name"],
  brand: ["brand", "manufacturer"],
  category: ["category", "product line", "sport"],
  size: ["size", "length"],
  color: ["color", "colour"],
  hand: ["throw hand", "hand"],
  wholesale: ["extra innings direct", "extra innings", "ei direct", "eidirect", "eid", "e i", "elite", "dealer", "wholesale", "group discount", "invoice", "cost", "net price", "price"],
  msrp: ["msrp", "retail", "published wholesale"],
  map: ["map", "map price", "msrp map"],
  image: ["image", "image link", "image url"],
} as const;

type Field = keyof typeof HEADER_ALIASES;
type ParsedWholesaleRow = {
  supplier: string;
  manufacturer: string | null;
  category: string | null;
  sku: string | null;
  upc: string | null;
  name: string;
  size: string | null;
  color: string | null;
  hand: string | null;
  wholesaleCents: number;
  msrpCents: number | null;
  mapCents: number | null;
  imageUrl: string | null;
  sourceSheet: string;
  sourceRow: number;
  raw: Record<string, unknown>;
};

function aliasMatch(header: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => header === alias || header.includes(alias));
}

function findHeader(rows: unknown[][]): { rowIndex: number; columns: Partial<Record<Field, number>> } | null {
  let best: { rowIndex: number; columns: Partial<Record<Field, number>>; score: number } | null = null;
  rows.slice(0, 20).forEach((row, rowIndex) => {
    const columns: Partial<Record<Field, number>> = {};
    row.forEach((value, columnIndex) => {
      const normalized = key(value);
      if (!normalized) return;
      (Object.keys(HEADER_ALIASES) as Field[]).forEach((field) => {
        if (columns[field] === undefined && aliasMatch(normalized, HEADER_ALIASES[field])) columns[field] = columnIndex;
      });
    });
    const score = Object.keys(columns).length
      + (columns.description !== undefined ? 2 : 0)
      + (columns.wholesale !== undefined ? 3 : 0);
    if (!best || score > best.score) best = { rowIndex, columns, score };
  });
  const selected = best as { rowIndex: number; columns: Partial<Record<Field, number>>; score: number } | null;
  return selected && selected.score >= 5 && selected.columns.wholesale !== undefined ? selected : null;
}

function inferManufacturer(filename: string, sheetName: string): string | null {
  const text = `${filename} ${sheetName}`.toLowerCase();
  const known = ["Rawlings", "Easton", "Wilson", "DeMarini", "Louisville Slugger", "Mizuno", "Warstic", "Marucci", "Victus", "Baum", "Champro", "Baden", "RIP-IT", "All-Star", "ProNine", "Mueller", "Portolite", "Trigon", "TCK", "Valle", "3N2"];
  return known.find((brand) => text.includes(brand.toLowerCase())) ?? null;
}

export function calculateWholesalePricing(
  wholesaleCents: number,
  feePercent = 10,
  markupPercent = 0,
): { feeAdjustedCostCents: number; targetPriceCents: number } {
  const feeAdjustedCostCents = Math.round(wholesaleCents * (1 + Math.max(0, feePercent) / 100));
  const targetPriceCents = Math.round(feeAdjustedCostCents * (1 + Math.max(0, markupPercent) / 100));
  return { feeAdjustedCostCents, targetPriceCents };
}

export function parseWholesaleWorkbook(buffer: Buffer, filename: string): ParsedWholesaleRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const parsed: ParsedWholesaleRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (/^sheet\d*$/i.test(sheetName.trim())) continue;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      range: 0,
      blankrows: false,
    }).slice(0, 25_000);
    const header = findHeader(rows);
    if (!header) continue;
    const headerValues = rows[header.rowIndex].map((value) => clean(value));
    let section = sheetName;
    for (let index = header.rowIndex + 1; index < rows.length; index++) {
      const row = rows[index];
      const wholesaleValue = header.columns.wholesale === undefined ? null : cents(row[header.columns.wholesale]);
      const description = header.columns.description === undefined ? "" : clean(row[header.columns.description]);
      const sku = header.columns.sku === undefined ? "" : clean(row[header.columns.sku]);
      const nonempty = row.filter((value) => clean(value)).length;
      if (wholesaleValue === null || wholesaleValue <= 0 || (!description && !sku)) {
        if (nonempty === 1) section = clean(row.find((value) => clean(value))) || section;
        continue;
      }
      const raw: Record<string, unknown> = {};
      headerValues.forEach((label, columnIndex) => {
        if (label && row[columnIndex] !== null && row[columnIndex] !== undefined) raw[label] = row[columnIndex];
      });
      const manufacturer = header.columns.brand === undefined
        ? inferManufacturer(filename, sheetName)
        : clean(row[header.columns.brand]) || inferManufacturer(filename, sheetName);
      const category = header.columns.category === undefined ? section : clean(row[header.columns.category]) || section;
      const name = description || sku;
      parsed.push({
        supplier: "Extra Innings Direct",
        manufacturer,
        category,
        sku: sku || null,
        upc: header.columns.upc === undefined ? null : clean(row[header.columns.upc]) || null,
        name,
        size: header.columns.size === undefined ? null : clean(row[header.columns.size]) || null,
        color: header.columns.color === undefined ? null : clean(row[header.columns.color]) || null,
        hand: header.columns.hand === undefined ? null : clean(row[header.columns.hand]) || null,
        wholesaleCents: wholesaleValue,
        msrpCents: header.columns.msrp === undefined ? null : cents(row[header.columns.msrp]),
        mapCents: header.columns.map === undefined ? null : cents(row[header.columns.map]),
        imageUrl: header.columns.image === undefined ? null : clean(row[header.columns.image]) || null,
        sourceSheet: sheetName,
        sourceRow: index + 1,
        raw,
      });
    }
  }
  return parsed;
}

function normalizeLedgerHeader(value: unknown, index: number): string {
  return clean(value) || `Column ${index + 1}`;
}

export function parseLedgerWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets["Tracking Sheet"] ?? workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  const headerIndex = rows.findIndex((row) => row.some((value) => key(value) === "item")
    && row.some((value) => key(value).includes("description")));
  if (headerIndex < 0) throw new Error("Ledger header row was not found");
  const headers = rows[headerIndex].map(normalizeLedgerHeader);
  return rows.slice(headerIndex + 1).map((row, index) => {
    const raw: Record<string, unknown> = {};
    headers.forEach((header, columnIndex) => {
      const value = row[columnIndex];
      if (value !== null && value !== undefined && value !== "") raw[header] = value;
    });
    const value = (label: string) => row[headers.findIndex((header) => key(header) === key(label))];
    return {
      sourceRow: headerIndex + index + 2,
      itemNumber: clean(value("Item #")) || null,
      description: clean(value("Inventory Description")) || clean(value("Item Description")) || clean(value("Item Description (Copied)")) || "Untitled entry",
      status: clean(value("Current Status")) || clean(value("Status")) || null,
      supplier: clean(value("Seller / Supplier")) || null,
      category: clean(value("Item Category")) || null,
      brand: clean(value("Brand")) || null,
      model: clean(value("Model")) || null,
      sku: clean(value("eBay SKU")) || null,
      quantity: Math.max(1, Number(value("Quantity")) || 1),
      purchaseDate: value("Purchase / Entered Date") || null,
      saleDate: value("Sale / Transfer Date") || null,
      purchaseCostCents: cents(value("Purchased Cost")),
      deliveredCostCents: cents(value("Delivered Cost")),
      salePriceCents: cents(value("Sale Price")),
      revenueCents: cents(value("Total Revenue")),
      profitCents: cents(value("Total Profit")) ?? cents(value("Net Profit")),
      raw,
    };
  }).filter((row) => row.itemNumber || Object.keys(row.raw).length > 2);
}

async function replaceWholesaleFile(filename: string, products: ParsedWholesaleRow[]) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM wholesale_imports WHERE source_file_name = ${filename}`);
    const inserted = await tx.execute(sql`
      INSERT INTO wholesale_imports (source_file_name, supplier, row_count, status)
      VALUES (${filename}, 'Extra Innings Direct', ${products.length}, 'complete')
      RETURNING id
    `);
    const importId = (inserted as any).rows[0].id;
    for (let offset = 0; offset < products.length; offset += 400) {
      const chunk = products.slice(offset, offset + 400);
      const values = chunk.map((product) => sql`(
        ${importId}, ${product.supplier}, ${product.manufacturer}, ${product.category},
        ${product.sku}, ${product.upc}, ${product.name}, ${product.size}, ${product.color},
        ${product.hand}, ${product.wholesaleCents}, ${product.msrpCents}, ${product.mapCents},
        ${product.imageUrl}, ${product.sourceSheet}, ${product.sourceRow},
        ${JSON.stringify(product.raw)}::jsonb,
        ${[product.manufacturer, product.category, product.sku, product.upc, product.name, product.size, product.color, product.hand].filter(Boolean).join(" ")}
      )`);
      await tx.execute(sql`
        INSERT INTO wholesale_products (
          import_id, supplier, manufacturer, category, sku, upc, name, size, color,
          hand, wholesale_cents, msrp_cents, map_cents, image_url, source_sheet,
          source_row, raw_data, search_text
        ) VALUES ${sql.join(values, sql.raw(","))}
      `);
    }
    return products.length;
  });
}

async function replaceLedger(filename: string, entries: ReturnType<typeof parseLedgerWorkbook>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM business_ledger_imports WHERE source_file_name = ${filename}`);
    const inserted = await tx.execute(sql`
      INSERT INTO business_ledger_imports (source_file_name, row_count, status)
      VALUES (${filename}, ${entries.length}, 'complete') RETURNING id
    `);
    const importId = (inserted as any).rows[0].id;
    for (let offset = 0; offset < entries.length; offset += 250) {
      const chunk = entries.slice(offset, offset + 250);
      const values = chunk.map((entry) => sql`(
        ${importId}, ${entry.sourceRow}, ${entry.itemNumber}, ${entry.description},
        ${entry.status}, ${entry.supplier}, ${entry.category}, ${entry.brand}, ${entry.model},
        ${entry.sku}, ${entry.quantity}, ${validDate(entry.purchaseDate)},
        ${validDate(entry.saleDate)}, ${entry.purchaseCostCents},
        ${entry.deliveredCostCents}, ${entry.salePriceCents}, ${entry.revenueCents},
        ${entry.profitCents}, ${JSON.stringify(entry.raw)}::jsonb
      )`);
      await tx.execute(sql`
        INSERT INTO business_ledger_entries (
          import_id, source_row, item_number, description, status, supplier, category,
          brand, model, sku, quantity, purchase_date, sale_date, purchase_cost_cents,
          delivered_cost_cents, sale_price_cents, revenue_cents, profit_cents, raw_data
        ) VALUES ${sql.join(values, sql.raw(","))}
      `);
    }
    return entries.length;
  });
}

export function registerAdminOperationsRoutes(app: Express, isAdmin: RequestHandler) {
  app.get("/api/admin/operations/summary", isAdmin, async (_req, res) => {
    const result = await db.execute(sql.raw(`
      SELECT
        (SELECT count(*)::int FROM wholesale_products) AS wholesale_products,
        (SELECT count(DISTINCT source_file_name)::int FROM wholesale_imports) AS wholesale_files,
        (SELECT count(*)::int FROM business_ledger_entries) AS ledger_entries,
        (SELECT coalesce(sum(revenue_cents),0)::bigint FROM business_ledger_entries) AS ledger_revenue_cents,
        (SELECT coalesce(sum(profit_cents),0)::bigint FROM business_ledger_entries) AS ledger_profit_cents,
        (SELECT max(imported_at) FROM wholesale_imports) AS wholesale_updated_at,
        (SELECT max(imported_at) FROM business_ledger_imports) AS ledger_updated_at
    `));
    res.json((result as any).rows[0]);
  });

  app.get("/api/admin/operations/wholesale", isAdmin, async (req, res) => {
    const query = clean(req.query.q);
    const category = clean(req.query.category);
    const markup = Math.min(500, Math.max(0, Number(req.query.markup) || 0));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    const result = await db.execute(sql`
      SELECT id, supplier, manufacturer, category, sku, upc, name, size, color, hand,
             wholesale_cents, msrp_cents, map_cents, image_url, source_sheet, source_row
      FROM wholesale_products
      WHERE (${query} = '' OR search_text ILIKE ${pattern})
        AND (${category} = '' OR category = ${category})
      ORDER BY manufacturer NULLS LAST, name
      LIMIT ${limit}
    `);
    res.json((result as any).rows.map((row: any) => ({
      ...row,
      ...calculateWholesalePricing(Number(row.wholesale_cents), 10, markup),
    })));
  });

  app.get("/api/admin/operations/ledger", isAdmin, async (req, res) => {
    const query = clean(req.query.q);
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const result = await db.execute(sql`
      SELECT id, source_row, item_number, description, status, supplier, category,
             brand, model, sku, quantity, purchase_date, sale_date, purchase_cost_cents,
             delivered_cost_cents, sale_price_cents, revenue_cents, profit_cents
      FROM business_ledger_entries
      WHERE ${query} = '' OR concat_ws(' ', item_number, description, status, supplier, category, brand, model, sku) ILIKE ${pattern}
      ORDER BY coalesce(sale_date, purchase_date) DESC NULLS LAST, source_row DESC
      LIMIT ${limit}
    `);
    res.json((result as any).rows);
  });

  app.post("/api/admin/operations/import-wholesale", isAdmin, upload.array("files", 40), async (req: any, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    if (!files.length) return res.status(400).json({ message: "Choose one or more Excel price lists." });
    const imported = [];
    for (const file of files) {
      const products = parseWholesaleWorkbook(file.buffer, file.originalname);
      imported.push({ file: file.originalname, rows: await replaceWholesaleFile(file.originalname, products) });
    }
    res.json({ imported, totalRows: imported.reduce((sum, item) => sum + item.rows, 0) });
  });

  app.post("/api/admin/operations/import-ledger", isAdmin, upload.single("file"), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ message: "Choose the TSS ledger workbook." });
    const entries = parseLedgerWorkbook(req.file.buffer);
    res.json({ file: req.file.originalname, rows: await replaceLedger(req.file.originalname, entries) });
  });
}
