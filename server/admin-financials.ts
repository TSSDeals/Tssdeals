import crypto from "crypto";
import type { Express, RequestHandler } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { sql } from "drizzle-orm";
import { db } from "./db";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

const clean = (value: unknown) => String(value ?? "").trim();
const headerKey = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const ACCOUNT_TYPES = new Set(["checking", "savings", "credit_card", "loan", "cash", "other"]);

export function normalizeAccountType(value: unknown) {
  const normalized = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
  return ACCOUNT_TYPES.has(normalized) ? normalized : "other";
}

function amountCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const raw = clean(value);
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || /-$/.test(raw);
  const parsed = Number(raw.replace(/[()$,%\s,]/g, "").replace(/-$/, ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) * (negative ? -1 : 1);
}

function validDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function categorizeFinancialTransaction(description: unknown) {
  const text = clean(description).toLowerCase();
  if (/\b(transfer|online payment|payment thank you|autopay)\b/.test(text)) return "Transfer";
  if (/\b(ebay|shopify|stripe|paypal|square|deposit|payout)\b/.test(text)) return "Sales income";
  if (/\b(extra innings|eidirect|wholesale|supplier|inventory)\b/.test(text)) return "Inventory";
  if (/\b(usps|ups|fedex|pirate ship|shipping|postage)\b/.test(text)) return "Shipping";
  if (/\b(replit|sendgrid|twilio|openai|github|software|subscription)\b/.test(text)) return "Software";
  if (/\b(interest|finance charge)\b/.test(text)) return "Interest";
  if (/\b(fee|service charge|annual fee)\b/.test(text)) return "Bank fees";
  if (/\b(refund|return)\b/.test(text)) return "Refunds";
  return "Uncategorized";
}

type ParsedTransaction = {
  transactionDate: Date;
  postedDate: Date | null;
  description: string;
  amountCents: number;
  category: string;
  fingerprint: string;
  raw: Record<string, unknown>;
};

const DATE_HEADERS = ["date", "transaction date", "trans date", "activity date"];
const POSTED_HEADERS = ["posted date", "post date"];
const DESCRIPTION_HEADERS = ["description", "details", "merchant", "name", "transaction description", "memo"];
const AMOUNT_HEADERS = ["amount", "transaction amount"];
const DEBIT_HEADERS = ["debit", "withdrawal", "charge", "money out"];
const CREDIT_HEADERS = ["credit", "deposit", "payment", "money in"];

function findColumn(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(headerKey(header)));
}

export function parseFinancialStatement(buffer: Buffer, filename: string): ParsedTransaction[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const parsed: ParsedTransaction[] = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    }).slice(0, 100_000);
    const headerIndex = rows.findIndex((row) => {
      const headers = row.map(headerKey);
      const hasDate = findColumn(headers, DATE_HEADERS) >= 0;
      const hasDescription = findColumn(headers, DESCRIPTION_HEADERS) >= 0;
      const hasAmount = findColumn(headers, AMOUNT_HEADERS) >= 0
        || findColumn(headers, DEBIT_HEADERS) >= 0
        || findColumn(headers, CREDIT_HEADERS) >= 0;
      return hasDate && hasDescription && hasAmount;
    });
    if (headerIndex < 0) continue;
    const headers = rows[headerIndex].map((value) => clean(value));
    const dateColumn = findColumn(headers, DATE_HEADERS);
    const postedColumn = findColumn(headers, POSTED_HEADERS);
    const descriptionColumn = findColumn(headers, DESCRIPTION_HEADERS);
    const amountColumn = findColumn(headers, AMOUNT_HEADERS);
    const debitColumn = findColumn(headers, DEBIT_HEADERS);
    const creditColumn = findColumn(headers, CREDIT_HEADERS);
    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const transactionDate = validDate(row[dateColumn]);
      const description = clean(row[descriptionColumn]);
      let signedAmount = amountColumn >= 0 ? amountCents(row[amountColumn]) : null;
      if (signedAmount === null) {
        const debit = debitColumn >= 0 ? amountCents(row[debitColumn]) : null;
        const credit = creditColumn >= 0 ? amountCents(row[creditColumn]) : null;
        if (debit !== null) signedAmount = -Math.abs(debit);
        else if (credit !== null) signedAmount = Math.abs(credit);
      }
      if (!transactionDate || !description || signedAmount === null || signedAmount === 0) continue;
      const raw: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header && row[index] !== null && row[index] !== "") raw[header] = row[index];
      });
      const fingerprint = crypto.createHash("sha256")
        .update([transactionDate.toISOString().slice(0, 10), signedAmount, description.toLowerCase()].join("|"))
        .digest("hex");
      parsed.push({
        transactionDate,
        postedDate: postedColumn >= 0 ? validDate(row[postedColumn]) : null,
        description,
        amountCents: signedAmount,
        category: categorizeFinancialTransaction(description),
        fingerprint,
        raw: { sourceFile: filename, sourceSheet: sheetName, sourceRow: rowIndex + 1, ...raw },
      });
    }
  }
  return parsed;
}

async function importStatement(accountId: string, filename: string, buffer: Buffer) {
  const transactions = parseFinancialStatement(buffer, filename);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  return db.transaction(async (tx) => {
    const account = await tx.execute(sql`
      SELECT id FROM financial_accounts WHERE id = ${accountId} AND is_active = true LIMIT 1
    `);
    if (!(account as any).rows?.[0]) throw new Error("Financial account was not found.");
    const prior = await tx.execute(sql`
      SELECT id, row_count FROM financial_imports
      WHERE account_id = ${accountId} AND file_checksum = ${checksum}
      LIMIT 1
    `);
    if ((prior as any).rows?.[0]) {
      return { imported: 0, duplicates: transactions.length, alreadyImported: true };
    }
    const imported = await tx.execute(sql`
      INSERT INTO financial_imports (account_id, source_file_name, file_checksum, row_count, status)
      VALUES (${accountId}, ${filename}, ${checksum}, ${transactions.length}, 'complete')
      RETURNING id
    `);
    const importId = (imported as any).rows[0].id;
    let inserted = 0;
    for (let offset = 0; offset < transactions.length; offset += 400) {
      const chunk = transactions.slice(offset, offset + 400);
      const values = chunk.map((transaction) => sql`(
        ${importId}, ${accountId}, ${transaction.fingerprint}, ${transaction.transactionDate},
        ${transaction.postedDate}, ${transaction.description}, ${transaction.amountCents},
        ${transaction.category}, 'rule', false, ${JSON.stringify(transaction.raw)}::jsonb
      )`);
      const result = await tx.execute(sql`
        INSERT INTO financial_transactions (
          import_id, account_id, fingerprint, transaction_date, posted_date,
          description, amount_cents, category, category_source, pending, raw_data
        ) VALUES ${sql.join(values, sql.raw(","))}
        ON CONFLICT (account_id, fingerprint) DO NOTHING
        RETURNING id
      `);
      inserted += (result as any).rows?.length ?? 0;
    }
    return { imported: inserted, duplicates: transactions.length - inserted, alreadyImported: false };
  });
}

export function registerAdminFinancialRoutes(app: Express, isAdmin: RequestHandler) {
  app.get("/api/admin/financial/accounts", isAdmin, async (_req, res) => {
    const result = await db.execute(sql`
      SELECT id, name, institution, account_type, last_four, current_balance_cents,
             credit_limit_cents, interest_rate_bps, minimum_payment_cents, is_active, updated_at
      FROM financial_accounts
      WHERE is_active = true
      ORDER BY CASE account_type WHEN 'checking' THEN 0 WHEN 'savings' THEN 1
        WHEN 'credit_card' THEN 2 WHEN 'loan' THEN 3 ELSE 4 END, name
    `);
    res.json((result as any).rows);
  });

  app.post("/api/admin/financial/accounts", isAdmin, async (req, res) => {
    const name = clean(req.body?.name);
    if (name.length < 2 || name.length > 120) return res.status(400).json({ message: "Enter an account name." });
    const accountType = normalizeAccountType(req.body?.accountType);
    const result = await db.execute(sql`
      INSERT INTO financial_accounts (
        name, institution, account_type, last_four, current_balance_cents,
        credit_limit_cents, interest_rate_bps, minimum_payment_cents
      ) VALUES (
        ${name}, ${clean(req.body?.institution) || null}, ${accountType},
        ${clean(req.body?.lastFour).replace(/\D/g, "").slice(-4) || null},
        ${amountCents(req.body?.currentBalance) ?? 0},
        ${amountCents(req.body?.creditLimit)},
        ${Math.round(Math.max(0, Number(req.body?.interestRate) || 0) * 100)},
        ${amountCents(req.body?.minimumPayment)}
      ) RETURNING id
    `);
    res.status(201).json((result as any).rows[0]);
  });

  app.post("/api/admin/financial/import", isAdmin, upload.single("file"), async (req: any, res) => {
    if (!req.file) return res.status(400).json({ message: "Choose a CSV or Excel statement." });
    const accountId = clean(req.body?.accountId);
    if (!accountId) return res.status(400).json({ message: "Choose the account for this statement." });
    try {
      res.json({
        file: req.file.originalname,
        ...(await importStatement(accountId, req.file.originalname, req.file.buffer)),
      });
    } catch (error: any) {
      res.status(400).json({ message: error?.message ?? "Statement import failed." });
    }
  });

  app.get("/api/admin/financial/summary", isAdmin, async (req, res) => {
    const months = Math.min(36, Math.max(1, Number(req.query.months) || 12));
    const result = await db.execute(sql`
      WITH recent AS (
        SELECT amount_cents, category, transaction_date
        FROM financial_transactions
        WHERE transaction_date >= CURRENT_DATE - (${months}::int * INTERVAL '1 month')
          AND pending = false
          AND category <> 'Transfer'
      )
      SELECT
        coalesce(sum(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END), 0)::bigint AS inflow_cents,
        coalesce(sum(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END), 0)::bigint AS outflow_cents,
        coalesce(sum(amount_cents), 0)::bigint AS net_cash_flow_cents,
        (SELECT coalesce(sum(current_balance_cents),0)::bigint FROM financial_accounts
          WHERE is_active = true AND account_type IN ('checking','savings','cash')) AS cash_balance_cents,
        (SELECT coalesce(sum(current_balance_cents),0)::bigint FROM financial_accounts
          WHERE is_active = true AND account_type IN ('credit_card','loan')) AS debt_balance_cents,
        (SELECT count(*)::int FROM financial_transactions WHERE category = 'Uncategorized') AS uncategorized_count
      FROM recent
    `);
    const monthly = await db.execute(sql`
      SELECT to_char(date_trunc('month', transaction_date), 'YYYY-MM') AS month,
             coalesce(sum(CASE WHEN amount_cents > 0 AND category <> 'Transfer' THEN amount_cents ELSE 0 END),0)::bigint AS inflow_cents,
             coalesce(sum(CASE WHEN amount_cents < 0 AND category <> 'Transfer' THEN -amount_cents ELSE 0 END),0)::bigint AS outflow_cents,
             coalesce(sum(CASE WHEN category <> 'Transfer' THEN amount_cents ELSE 0 END),0)::bigint AS net_cents
      FROM financial_transactions
      WHERE transaction_date >= CURRENT_DATE - (${months}::int * INTERVAL '1 month') AND pending = false
      GROUP BY date_trunc('month', transaction_date)
      ORDER BY date_trunc('month', transaction_date)
    `);
    res.json({ ...(result as any).rows[0], monthly: (monthly as any).rows });
  });

  app.get("/api/admin/financial/transactions", isAdmin, async (req, res) => {
    const accountId = clean(req.query.accountId);
    const category = clean(req.query.category);
    const query = clean(req.query.q);
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    const result = await db.execute(sql`
      SELECT transaction.id, transaction.account_id, account.name AS account_name,
             transaction.transaction_date, transaction.posted_date, transaction.description,
             transaction.amount_cents, transaction.category, transaction.category_source,
             transaction.pending
      FROM financial_transactions transaction
      JOIN financial_accounts account ON account.id = transaction.account_id
      WHERE (${accountId} = '' OR transaction.account_id = ${accountId})
        AND (${category} = '' OR transaction.category = ${category})
        AND (${query} = '' OR concat_ws(' ', transaction.description, transaction.category, account.name) ILIKE ${pattern})
      ORDER BY transaction.transaction_date DESC, transaction.created_at DESC
      LIMIT 250
    `);
    res.json((result as any).rows);
  });
}
