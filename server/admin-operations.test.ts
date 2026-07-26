import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  calculateWholesalePricing,
  parseLedgerWorkbook,
  parseWholesaleWorkbook,
} from "./admin-operations";

function workbookBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  });
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("EID fee is applied before the selected markup", () => {
  assert.deepEqual(calculateWholesalePricing(10_000, 10, 25), {
    feeAdjustedCostCents: 11_000,
    targetPriceCents: 13_750,
  });
});

test("wholesale parser finds descriptive and price columns after title rows", () => {
  const buffer = workbookBuffer({
    Gloves: [
      ["2027 PRICE LIST"],
      ["BRAND", "ITEM #", "PRODUCT DESCRIPTION", "SIZE", "MAP", "Extra Innings Direct"],
      ["Rawlings", "R0075", "REV1X Baseball Glove", "12.75 IN", 439.99, 317.625],
    ],
  });
  const rows = parseWholesaleWorkbook(buffer, "Rawlings pricing.xlsx");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, "R0075");
  assert.equal(rows[0].name, "REV1X Baseball Glove");
  assert.equal(rows[0].wholesaleCents, 31_763);
  assert.equal(rows[0].mapCents, 43_999);
});

test("ledger parser preserves the raw row and extracts operational fields", () => {
  const buffer = workbookBuffer({
    "Tracking Sheet": [
      [],
      ["Data Entry"],
      ["Item #", "Inventory Description", "Current Status", "Seller / Supplier", "Quantity", "Purchased Cost", "Delivered Cost", "Sale Price", "Total Revenue", "Total Profit"],
      [42, "Wilson A2000 1786", "Sold", "Extra Innings Direct", 1, 180, 198, 275, 260, 62],
    ],
  });
  const rows = parseLedgerWorkbook(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].itemNumber, "42");
  assert.equal(rows[0].deliveredCostCents, 19_800);
  assert.equal(rows[0].profitCents, 6_200);
  assert.equal(rows[0].raw["Current Status"], "Sold");
});
