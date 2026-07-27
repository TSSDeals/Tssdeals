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
  retailName: string;
  retailBrand: string | null;
  retailCategory: string | null;
  identityStatus: "supplier" | "needs_catalog";
  identityConfidence: number;
  identitySource: string;
};

const GENERIC_PRODUCT_WORDS = new Set([
  "black", "white", "navy", "red", "royal", "grey", "gray", "green", "yellow",
  "orange", "purple", "pink", "pair", "each", "adult", "youth", "small", "medium",
  "large", "xl", "xxl", "glove", "bat", "ball", "helmet", "bag", "shoe",
]);

const WHOLESALE_SEARCH_SYNONYMS: Record<string, string[]> = {
  baseball: ["baseball", "ball"],
  glove: ["glove", "gloves", "mitt", "mitts"],
  gloves: ["glove", "gloves", "mitt", "mitts"],
  mitt: ["glove", "gloves", "mitt", "mitts"],
  mitts: ["glove", "gloves", "mitt", "mitts"],
  left: ["left", "lht"],
  lht: ["left", "lht"],
  right: ["right", "rht"],
  rht: ["right", "rht"],
  bat: ["bat", "bats"],
  bats: ["bat", "bats"],
};

export function normalizeWholesaleSearchGroups(query: unknown): string[][] {
  const tokens = Array.from(new Set(key(query).split(" ").filter(Boolean)));
  return tokens.map((token) => Array.from(new Set(WHOLESALE_SEARCH_SYNONYMS[token] ?? [token])));
}

export function classifyWholesaleText(value: unknown) {
  const text = ` ${key(value)} `;
  const has = (pattern: RegExp) => pattern.test(text);
  const sport = has(/\b(fastpitch|slowpitch|softball)\b/) ? "Softball"
    : has(/\b(baseball|bbcor|usssa|tee ball|t ball|umpire|a2000|a1000|ball glove|fielding glove|first base mitt|catchers mitt|catcher mitt)\b/) ? "Baseball"
    : has(/\b(hockey|puck)\b/) ? "Hockey"
    : has(/\b(golf|putter|wedge|fairway|driver)\b/) ? "Golf"
    : has(/\b(soccer|futsal)\b/) ? "Soccer"
    : has(/\b(football|gridiron)\b/) ? "Football"
    : has(/\b(basketball)\b/) ? "Basketball"
    : has(/\b(lacrosse)\b/) ? "Lacrosse"
    : has(/\b(volleyball)\b/) ? "Volleyball"
    : has(/\b(tennis|pickleball)\b/) ? "Racquet Sports"
    : "General Sporting Goods";
  const sportSubcategory = has(/\bfastpitch\b/) ? "Fastpitch Softball"
    : has(/\bslowpitch\b/) ? "Slowpitch Softball"
    : has(/\b(tee ball|t ball)\b/) ? "Tee Ball"
    : has(/\bumpire\b/) ? "Umpire"
    : sport;
  const productType = has(/\b(batting glove|batting gloves)\b/) ? "Batting Gloves"
    : has(/\b(catcher gear|catchers gear|chest protector|leg guard|catchers kit|catcher kit)\b/) ? "Catcher's Gear"
    : has(/\b(glove|gloves|mitt|mitts|a2000|a1000)\b/) ? "Fielding Gloves"
    : has(/\b(bbcor|usssa|baseball bat|softball bat|fastpitch bat|slowpitch bat)\b/) ? "Bats"
    : has(/\b(helmet|helmets)\b/) ? "Helmets"
    : has(/\b(cleat|cleats|shoe|shoes|footwear)\b/) ? "Cleats & Footwear"
    : has(/\b(bag|bags|backpack)\b/) ? "Bags"
    : has(/\b(ball|balls|baseball|softball|basketball|football|volleyball|puck)\b/) ? "Balls"
    : has(/\b(chest protector|protective|guard|guards|mask)\b/) ? "Protective Gear"
    : has(/\b(training|trainer|tee|net|rebounder)\b/) ? "Training Equipment"
    : has(/\b(shirt|jersey|pant|pants|short|shorts|jacket|hoodie|apparel)\b/) ? "Apparel"
    : "Other";
  return { sport, sportSubcategory, productType };
}

const wholesaleClassificationSource = `
  lower(concat_ws(' ',
    coalesce(retail_name, name), coalesce(retail_brand, manufacturer),
    coalesce(retail_model, ''), coalesce(retail_category, category),
    coalesce(source_sheet, ''), coalesce(sku, ''), coalesce(size, ''),
    coalesce(hand, ''), coalesce(color, '')
  ))
`;
const wholesaleSportSql = `CASE
  WHEN wholesale_text ~ '\\m(fastpitch|slowpitch|softball)\\M' THEN 'Softball'
  WHEN wholesale_text ~ '\\m(baseball|bbcor|usssa|umpire|a2000|a1000)\\M'
    OR wholesale_text ~ '(tee ball|t ball|ball glove|fielding glove|first base mitt|catcher.?s mitt)' THEN 'Baseball'
  WHEN wholesale_text ~ '\\m(hockey|puck)\\M' THEN 'Hockey'
  WHEN wholesale_text ~ '\\m(golf|putter|wedge|fairway|driver)\\M' THEN 'Golf'
  WHEN wholesale_text ~ '\\m(soccer|futsal)\\M' THEN 'Soccer'
  WHEN wholesale_text ~ '\\m(football|gridiron)\\M' THEN 'Football'
  WHEN wholesale_text ~ '\\mbasketball\\M' THEN 'Basketball'
  WHEN wholesale_text ~ '\\mlacrosse\\M' THEN 'Lacrosse'
  WHEN wholesale_text ~ '\\mvolleyball\\M' THEN 'Volleyball'
  WHEN wholesale_text ~ '\\m(tennis|pickleball)\\M' THEN 'Racquet Sports'
  ELSE 'General Sporting Goods' END`;
const wholesaleSubcategorySql = `CASE
  WHEN wholesale_text ~ '\\mfastpitch\\M' THEN 'Fastpitch Softball'
  WHEN wholesale_text ~ '\\mslowpitch\\M' THEN 'Slowpitch Softball'
  WHEN wholesale_text ~ '(tee ball|t ball)' THEN 'Tee Ball'
  WHEN wholesale_text ~ '\\mumpire\\M' THEN 'Umpire'
  ELSE sport END`;
const wholesaleProductTypeSql = `CASE
  WHEN wholesale_text ~ '(batting glove|batting gloves)' THEN 'Batting Gloves'
  WHEN wholesale_text ~ '(catcher.?s? gear|chest protector|leg guard|catcher.?s? kit)' THEN 'Catcher''s Gear'
  WHEN wholesale_text ~ '\\m(glove|gloves|mitt|mitts|a2000|a1000)\\M' THEN 'Fielding Gloves'
  WHEN wholesale_text ~ '\\m(bbcor|usssa)\\M' OR wholesale_text ~ '(baseball bat|softball bat|fastpitch bat|slowpitch bat)' THEN 'Bats'
  WHEN wholesale_text ~ '\\m(helmet|helmets)\\M' THEN 'Helmets'
  WHEN wholesale_text ~ '\\m(cleat|cleats|shoe|shoes|footwear)\\M' THEN 'Cleats & Footwear'
  WHEN wholesale_text ~ '\\m(bag|bags|backpack)\\M' THEN 'Bags'
  WHEN wholesale_text ~ '\\m(ball|balls|baseball|softball|basketball|football|volleyball|puck)\\M' THEN 'Balls'
  WHEN wholesale_text ~ '\\m(protective|guard|guards|mask)\\M' THEN 'Protective Gear'
  WHEN wholesale_text ~ '\\m(training|trainer|tee|net|rebounder)\\M' THEN 'Training Equipment'
  WHEN wholesale_text ~ '\\m(shirt|jersey|pant|pants|short|shorts|jacket|hoodie|apparel)\\M' THEN 'Apparel'
  ELSE 'Other' END`;

export function deriveSupplierRetailIdentity(input: {
  name: string;
  manufacturer: string | null;
  category: string | null;
  sku: string | null;
}) {
  const words = key(input.name).split(" ").filter(Boolean);
  const descriptiveWords = words.filter((word) => !GENERIC_PRODUCT_WORDS.has(word) && !/^\d+$/.test(word));
  const meaningful = input.name.length >= 8 && descriptiveWords.length >= 2;
  const brandAlreadyPresent = input.manufacturer
    ? key(input.name).includes(key(input.manufacturer))
    : false;
  const retailName = meaningful
    ? [brandAlreadyPresent ? null : input.manufacturer, input.name].filter(Boolean).join(" ")
    : input.name;
  return {
    retailName,
    retailBrand: input.manufacturer,
    retailCategory: input.category,
    identityStatus: meaningful ? "supplier" as const : "needs_catalog" as const,
    identityConfidence: meaningful ? 65 : 15,
    identitySource: "supplier price list",
  };
}

function aliasMatch(header: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => header === alias || (alias.length > 5 && header.includes(alias)));
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

const LEDGER_SORT_COLUMNS: Record<string, string> = {
  date: "coalesce(sale_date, purchase_date)",
  itemNumber: "item_number",
  description: "description",
  status: "status",
  supplier: "supplier",
  category: "category",
  brand: "brand",
  model: "model",
  sku: "sku",
  quantity: "quantity",
  purchaseDate: "purchase_date",
  saleDate: "sale_date",
  purchaseCost: "purchase_cost_cents",
  deliveredCost: "delivered_cost_cents",
  finalCog: "final_cog_cents",
  salePrice: "sale_price_cents",
  revenue: "revenue_cents",
  ebayBreakEven: "ebay_break_even_cents",
  inPersonMinimum: "in_person_minimum_cents",
  netProfit: "profit_cents",
};

export function resolveLedgerSort(sortBy: unknown, sortDirection: unknown) {
  const requested = clean(sortBy);
  const selected = Object.prototype.hasOwnProperty.call(LEDGER_SORT_COLUMNS, requested)
    ? requested
    : "date";
  return {
    sortBy: selected,
    column: LEDGER_SORT_COLUMNS[selected],
    direction: clean(sortDirection).toLowerCase() === "asc" ? "ASC" : "DESC",
  };
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
      const identity = deriveSupplierRetailIdentity({ name, manufacturer, category, sku: sku || null });
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
        ...identity,
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
    const finalCogCents = cents(value("Final COG"));
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
      finalCogCents,
      salePriceCents: cents(value("Sale Price")),
      revenueCents: cents(value("Total Revenue")),
      profitCents: cents(value("Net Profit")),
      ebayBreakEvenCents: cents(value("eBay Break Even Price (no ship profit)")),
      inPersonMinimumCents: finalCogCents === null ? null : Math.round(finalCogCents * 1.1),
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
        ${[product.manufacturer, product.category, product.sku, product.upc, product.name, product.retailName, product.size, product.color, product.hand].filter(Boolean).join(" ")},
        ${product.retailName}, ${product.retailBrand}, ${product.retailCategory},
        ${product.identityStatus}, ${product.identityConfidence}, ${product.identitySource}
      )`);
      await tx.execute(sql`
        INSERT INTO wholesale_products (
          import_id, supplier, manufacturer, category, sku, upc, name, size, color,
          hand, wholesale_cents, msrp_cents, map_cents, image_url, source_sheet,
          source_row, raw_data, search_text, retail_name, retail_brand, retail_category,
          identity_status, identity_confidence, identity_source
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
        ${entry.deliveredCostCents}, ${entry.finalCogCents}, ${entry.salePriceCents},
        ${entry.revenueCents}, ${entry.profitCents}, ${entry.ebayBreakEvenCents},
        ${entry.inPersonMinimumCents}, ${JSON.stringify(entry.raw)}::jsonb
      )`);
      await tx.execute(sql`
        INSERT INTO business_ledger_entries (
          import_id, source_row, item_number, description, status, supplier, category,
          brand, model, sku, quantity, purchase_date, sale_date, purchase_cost_cents,
          delivered_cost_cents, final_cog_cents, sale_price_cents, revenue_cents,
          profit_cents, ebay_break_even_cents, in_person_minimum_cents, raw_data
        ) VALUES ${sql.join(values, sql.raw(","))}
      `);
    }
    return entries.length;
  });
}

type CatalogIdentity = {
  sku?: string;
  upc?: string;
  retailName: string;
  brand?: string;
  model?: string;
  category?: string;
  sourceRef: string;
  confidence?: number;
};

export function parseCatalogIdentityFile(buffer: Buffer): CatalogIdentity[] {
  const parsed = JSON.parse(buffer.toString("utf8"));
  const candidates = Array.isArray(parsed) ? parsed : parsed?.matches;
  if (!Array.isArray(candidates)) throw new Error("Catalog identity file must contain a matches array.");
  return candidates.map((candidate: any) => ({
    sku: clean(candidate.sku) || undefined,
    upc: clean(candidate.upc) || undefined,
    retailName: clean(candidate.retailName),
    brand: clean(candidate.brand) || undefined,
    model: clean(candidate.model) || undefined,
    category: clean(candidate.category) || undefined,
    sourceRef: clean(candidate.sourceRef),
    confidence: Math.min(100, Math.max(0, Number(candidate.confidence) || 90)),
  })).filter((candidate) =>
    candidate.retailName.length >= 4
    && candidate.sourceRef.length >= 3
    && Boolean(candidate.sku || candidate.upc));
}

async function applyCatalogIdentities(matches: CatalogIdentity[]) {
  let updated = 0;
  for (let offset = 0; offset < matches.length; offset += 250) {
    const chunk = matches.slice(offset, offset + 250);
    const values = chunk.map((match) => sql`(
      ${match.sku ?? null}, ${match.upc ?? null}, ${match.retailName}, ${match.brand ?? null},
      ${match.model ?? null}, ${match.category ?? null}, ${match.sourceRef}, ${match.confidence ?? 90}
    )`);
    const result = await db.execute(sql`
      UPDATE wholesale_products AS product
      SET retail_name = match.retail_name,
          retail_brand = coalesce(match.brand, product.retail_brand, product.manufacturer),
          retail_model = coalesce(match.model, product.retail_model),
          retail_category = coalesce(match.category, product.retail_category, product.category),
          identity_status = 'catalog_matched',
          identity_confidence = match.confidence,
          identity_source = 'manufacturer catalog',
          identity_source_ref = match.source_ref,
          search_text = concat_ws(' ', product.search_text, match.retail_name, match.brand, match.model, match.category)
      FROM (VALUES ${sql.join(values, sql.raw(","))})
        AS match(sku, upc, retail_name, brand, model, category, source_ref, confidence)
      WHERE (match.sku IS NOT NULL AND lower(product.sku) = lower(match.sku))
         OR (match.upc IS NOT NULL AND product.upc = match.upc)
      RETURNING product.id
    `);
    updated += (result as any).rows?.length ?? 0;
  }
  return updated;
}

export function registerAdminOperationsRoutes(app: Express, isAdmin: RequestHandler) {
  app.get("/api/admin/operations/summary", isAdmin, async (_req, res) => {
    const result = await db.execute(sql.raw(`
      SELECT
        (SELECT count(*)::int FROM wholesale_products) AS wholesale_products,
        (SELECT count(DISTINCT source_file_name)::int FROM wholesale_imports) AS wholesale_files,
        (SELECT count(*)::int FROM wholesale_products WHERE identity_status = 'catalog_matched') AS catalog_matched_products,
        (SELECT count(*)::int FROM wholesale_products WHERE identity_status = 'needs_catalog') AS needs_catalog_products,
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
    const company = clean(req.query.company);
    const sport = clean(req.query.sport);
    const sportSubcategory = clean(req.query.sportSubcategory);
    const productType = clean(req.query.productType);
    const identityStatus = clean(req.query.identityStatus);
    const markup = Math.min(500, Math.max(0, Number(req.query.markup) || 0));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const searchGroups = normalizeWholesaleSearchGroups(query);
    const searchPredicate = searchGroups.length
      ? sql.join(searchGroups.map((group) => sql`(${sql.join(group.map((term) => {
          const pattern = `%${term.replace(/[%_]/g, "\\$&")}%`;
          return sql`classified_search_text ILIKE ${pattern}`;
        }), sql` OR `)})`), sql` AND `)
      : sql`TRUE`;
    const result = await db.execute(sql`
      WITH source AS (
        SELECT *, ${sql.raw(wholesaleClassificationSource)} AS wholesale_text,
               coalesce(nullif(retail_brand, ''), nullif(manufacturer, ''), supplier) AS company
        FROM wholesale_products
      ), sporting AS (
        SELECT *, ${sql.raw(wholesaleSportSql)} AS sport FROM source
      ), classified AS (
        SELECT *, ${sql.raw(wholesaleSubcategorySql)} AS sport_subcategory,
               ${sql.raw(wholesaleProductTypeSql)} AS product_type
        FROM sporting
      ), searchable AS (
        SELECT *, concat_ws(' ', search_text, company, sport, sport_subcategory, product_type) AS classified_search_text
        FROM classified
      )
      SELECT id, supplier, manufacturer, category, sku, upc, name, size, color, hand,
             wholesale_cents, msrp_cents, map_cents, image_url, source_sheet, source_row,
             retail_name, retail_brand, retail_model, retail_category, identity_status,
             identity_confidence, identity_source, identity_source_ref,
             company, sport, sport_subcategory, product_type
      FROM searchable
      WHERE ${searchPredicate}
        AND (${company} = '' OR company = ${company})
        AND (${sport} = '' OR sport = ${sport})
        AND (${sportSubcategory} = '' OR sport_subcategory = ${sportSubcategory})
        AND (${productType} = '' OR product_type = ${productType})
        AND (${identityStatus} = '' OR identity_status = ${identityStatus})
      ORDER BY
        CASE WHEN lower(coalesce(sku, '')) = lower(${query}) OR lower(coalesce(upc, '')) = lower(${query}) THEN 0 ELSE 1 END,
        company NULLS LAST, coalesce(retail_name, name)
      LIMIT ${limit}
    `);
    res.json((result as any).rows.map((row: any) => ({
      ...row,
      ...calculateWholesalePricing(Number(row.wholesale_cents), 10, markup),
    })));
  });

  app.get("/api/admin/operations/wholesale-filters", isAdmin, async (_req, res) => {
    const base = `WITH source AS (
      SELECT *, ${wholesaleClassificationSource} AS wholesale_text,
             coalesce(nullif(retail_brand, ''), nullif(manufacturer, ''), supplier) AS company
      FROM wholesale_products
    ), sporting AS (
      SELECT *, ${wholesaleSportSql} AS sport FROM source
    ), classified AS (
      SELECT *, ${wholesaleSubcategorySql} AS sport_subcategory,
             ${wholesaleProductTypeSql} AS product_type
      FROM sporting
    )`;
    const optionQuery = (column: string) => db.execute(sql.raw(`${base}
      SELECT ${column} AS value, count(*)::int AS count
      FROM classified
      WHERE ${column} IS NOT NULL AND btrim(${column}) <> ''
      GROUP BY ${column}
      ORDER BY ${column}`));
    const [companies, sports, sportSubcategories, productTypes, identityStatuses] = await Promise.all([
      optionQuery("company"),
      optionQuery("sport"),
      optionQuery("sport_subcategory"),
      optionQuery("product_type"),
      optionQuery("identity_status"),
    ]);
    res.json({
      companies: (companies as any).rows,
      sports: (sports as any).rows,
      sportSubcategories: (sportSubcategories as any).rows,
      productTypes: (productTypes as any).rows,
      identityStatuses: (identityStatuses as any).rows,
    });
  });

  app.get("/api/admin/operations/ledger", isAdmin, async (req, res) => {
    const query = clean(req.query.q);
    const status = clean(req.query.status);
    const order = resolveLedgerSort(req.query.sort, req.query.direction);
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const result = await db.execute(sql`
      SELECT id, source_row, item_number, description, status, supplier, category,
             brand, model, sku, quantity, purchase_date, sale_date, purchase_cost_cents,
             delivered_cost_cents, final_cog_cents, sale_price_cents, revenue_cents,
             profit_cents, ebay_break_even_cents, in_person_minimum_cents
      FROM business_ledger_entries
      WHERE (${query} = '' OR concat_ws(' ', item_number, description, status, supplier, category, brand, model, sku) ILIKE ${pattern})
        AND (${status} = '' OR status = ${status})
      ORDER BY ${sql.raw(order.column)} ${sql.raw(order.direction)} NULLS LAST, source_row DESC
      LIMIT ${limit}
    `);
    res.json((result as any).rows);
  });

  app.get("/api/admin/operations/ledger-statuses", isAdmin, async (_req, res) => {
    const result = await db.execute(sql`
      SELECT status, count(*)::int AS count
      FROM business_ledger_entries
      WHERE status IS NOT NULL AND btrim(status) <> ''
      GROUP BY status
      ORDER BY status
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

  app.post("/api/admin/operations/import-catalog-identities", isAdmin, upload.single("file"), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ message: "Choose a generated catalog identity JSON file." });
    const matches = parseCatalogIdentityFile(req.file.buffer);
    res.json({ matches: matches.length, updatedRows: await applyCatalogIdentities(matches) });
  });
}
