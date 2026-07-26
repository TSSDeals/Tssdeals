import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  calculateWholesalePricing,
  deriveSupplierRetailIdentity,
  parseCatalogIdentityFile,
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

test("supplier descriptions are clearly separated from catalog-grade identities", () => {
  assert.deepEqual(
    deriveSupplierRetailIdentity({
      name: "REV1X Baseball Glove 12.75",
      manufacturer: "Rawlings",
      category: "Baseball Gloves",
      sku: "R0075",
    }),
    {
      retailName: "Rawlings REV1X Baseball Glove 12.75",
      retailBrand: "Rawlings",
      retailCategory: "Baseball Gloves",
      identityStatus: "supplier",
      identityConfidence: 65,
      identitySource: "supplier price list",
    },
  );
  assert.equal(deriveSupplierRetailIdentity({
    name: "BLACK",
    manufacturer: "Franklin",
    category: "Batting Gloves",
    sku: "20490F",
  }).identityStatus, "needs_catalog");
});

test("catalog identity import requires an exact identifier and evidence reference", () => {
  const matches = parseCatalogIdentityFile(Buffer.from(JSON.stringify({
    matches: [
      { sku: "R0075", retailName: "Rawlings REV1X 12.75-inch Outfield Glove", sourceRef: "2027 Retail Catalog p. 42", confidence: 98 },
      { retailName: "Untraceable name", sourceRef: "unknown" },
    ],
  })));
  assert.equal(matches.length, 1);
  assert.equal(matches[0].sku, "R0075");
  assert.equal(matches[0].confidence, 98);
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

test("descriptive UPC sheets are not mistaken for wholesale price sheets", () => {
  const buffer = workbookBuffer({
    UPCs: [
      ["PIM - Product Description", "PIM - Item Nbr", "PIM - Item Desc", "PIM - UPC"],
      ["Batting Glove", "21225F0", "MLB T XS BLK/WHT G2P BTG", "025725578634"],
    ],
  });
  assert.equal(parseWholesaleWorkbook(buffer, "Franklin UPCs.xlsx").length, 0);
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
