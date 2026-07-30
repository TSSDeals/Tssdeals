import assert from "node:assert/strict";
import test from "node:test";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import {
  categorizeFinancialTransaction,
  normalizeAccountType,
  parseFinancialStatement,
  parseFinancialStatementText,
  parseUploadedFinancialStatement,
} from "./admin-financials";

function workbookBuffer(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Statement");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function pdfBuffer(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 36 });
    const chunks: Buffer[] = [];
    document.on("data", chunk => chunks.push(Buffer.from(chunk)));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
    for (const line of lines) document.text(line);
    document.end();
  });
}

test("financial accounts accept only the approved account type set", () => {
  assert.equal(normalizeAccountType("Credit Card"), "credit_card");
  assert.equal(normalizeAccountType("checking"), "checking");
  assert.equal(normalizeAccountType("brokerage"), "other");
});

test("statement parser preserves signed amounts and creates stable fingerprints", () => {
  const buffer = workbookBuffer([
    ["Transaction Date", "Description", "Amount"],
    ["2026-07-01", "eBay payout", 425.5],
    ["2026-07-02", "USPS postage", -18.25],
  ]);
  const first = parseFinancialStatement(buffer, "bank.xlsx");
  const second = parseFinancialStatement(buffer, "renamed.xlsx");
  assert.equal(first.length, 2);
  assert.equal(first[0].amountCents, 42_550);
  assert.equal(first[0].category, "Sales income");
  assert.equal(first[1].amountCents, -1_825);
  assert.equal(first[1].category, "Shipping");
  assert.equal(first[0].fingerprint, second[0].fingerprint);
});

test("statement parser combines separate debit and credit columns", () => {
  const rows = parseFinancialStatement(workbookBuffer([
    ["Date", "Memo", "Debit", "Credit"],
    ["2026-07-03", "Extra Innings Direct", 200, null],
    ["2026-07-04", "Shopify payout", null, 350],
  ]), "checking.xlsx");
  assert.deepEqual(rows.map((row) => row.amountCents), [-20_000, 35_000]);
  assert.deepEqual(rows.map((row) => row.category), ["Inventory", "Sales income"]);
});

test("transfers are excluded from operating cash flow by category", () => {
  assert.equal(categorizeFinancialTransaction("Online payment to card"), "Transfer");
  assert.equal(categorizeFinancialTransaction("Replit subscription"), "Software");
  assert.equal(categorizeFinancialTransaction("Unknown merchant"), "Uncategorized");
});

test("PDF text parser reads checking debits and credits with two date columns", () => {
  const rows = parseFinancialStatementText(`
    Statement ending 07/28/2026
    07/01 07/02 SHOPIFY PAYOUT 425.50
    07/03 07/04 USPS POSTAGE 18.25
  `, "checking.pdf", "checking");
  assert.deepEqual(rows.map(row => row.amountCents), [42_550, -1_825]);
  assert.deepEqual(rows.map(row => row.postedDate?.toISOString().slice(0, 10)), ["2026-07-02", "2026-07-04"]);
});

test("PDF text parser treats credit-card purchases as debt and payments as credits", () => {
  const rows = parseFinancialStatementText(`
    Statement Date 07/28/2026
    07/02 REPLIT SUBSCRIPTION $25.00
    07/05 PAYMENT THANK YOU $100.00
    07/07 MERCHANT REFUND 12.50 CR
  `, "card.pdf", "credit_card");
  assert.deepEqual(rows.map(row => row.amountCents), [-2_500, 10_000, 1_250]);
});

test("PDF statement dates cross the calendar year safely", () => {
  const rows = parseFinancialStatementText(`
    Statement ending 01/15/2026
    12/29 YEAR END SOFTWARE 25.00
    01/03 NEW YEAR DEPOSIT 100.00 CR
  `, "year-crossing.pdf", "checking");
  assert.deepEqual(
    rows.map(row => row.transactionDate.toISOString().slice(0, 10)),
    ["2025-12-29", "2026-01-03"],
  );
});

test("Chase PDF text parser combines multiline rows and excludes summary balances", () => {
  const rows = parseFinancialStatementText(`
    February 27, 2026
    DEPOSITS AND ADDITIONS
    DATE DESCRIPTION AMOUNT
    02/02 Real Time Transfer Recd From Acme Customer
    Reference 123456
    $76.71
    02/04 Shopify Payout
    156.84
    Total Deposits and Additions $233.55
    ATM & DEBIT CARD WITHDRAWALS
    DATE DESCRIPTION AMOUNT
    02/02 GOOGLE WORKSPACE $18.44
    Total ATM & Debit Card Withdrawals $18.44
    ELECTRONIC WITHDRAWALS
    DATE DESCRIPTION AMOUNT
    02/06 Extra Innings Direct
    Invoice 98765
    $63.68
    Total Electronic Withdrawals $63.68
    FEES
    DATE DESCRIPTION AMOUNT
    02/27 Monthly Service Fee $15.00
    Total Fees $15.00
    DAILY ENDING BALANCE
    02/02 $468.06
    02/04 $624.90
  `, "chase-checking.pdf", "checking");
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(row => row.amountCents), [7_671, 15_684, -1_844, -6_368, -1_500]);
  assert.equal(rows[0].transactionDate.toISOString().slice(0, 10), "2026-02-02");
  assert.equal(rows.some(row => row.description.includes("ENDING BALANCE")), false);
});

test("corrected Chase parser fingerprints change when a formerly incorrect year is repaired", () => {
  const corrected = parseFinancialStatementText(`
    February 27, 2026
    DEPOSITS AND ADDITIONS
    02/02 Shopify Payout
    $76.71
    ELECTRONIC WITHDRAWALS
    02/06 Supplier Payment
    $63.68
    DAILY ENDING BALANCE
  `, "checking.pdf", "checking");
  const formerlyIncorrect = parseFinancialStatementText(`
    Statement ending 02/27/2051
    02/02 SHOPIFY PAYOUT 76.71
    02/06 SUPPLIER PAYMENT 63.68
  `, "checking.pdf", "checking");
  assert.notDeepEqual(
    corrected.map(row => row.fingerprint),
    formerlyIncorrect.map(row => row.fingerprint),
  );
});

test("uploaded text-based PDF statements are extracted end to end", async () => {
  const buffer = await pdfBuffer([
    "Statement ending 07/28/2026",
    "07/01 07/02 SHOPIFY PAYOUT 425.50",
    "07/03 07/04 USPS POSTAGE 18.25",
  ]);
  const rows = await parseUploadedFinancialStatement(buffer, "checking.pdf", "checking");
  assert.deepEqual(rows.map(row => row.amountCents), [42_550, -1_825]);
});
