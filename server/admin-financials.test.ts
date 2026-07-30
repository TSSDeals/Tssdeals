import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  categorizeFinancialTransaction,
  normalizeAccountType,
  parseFinancialStatement,
} from "./admin-financials";

function workbookBuffer(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Statement");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
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
