import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMicrosoftAuthorizeUrl,
  decryptOneDriveToken,
  encryptOneDriveToken,
  normalizeOneDriveLedgerPath,
} from "./onedrive-ledger-sync";

test("OneDrive ledger paths are normalized and restricted to Excel workbooks", () => {
  assert.equal(normalizeOneDriveLedgerPath(" /Business\\TSS Ledger_Copy.xlsx "), "Business/TSS Ledger_Copy.xlsx");
  assert.equal(normalizeOneDriveLedgerPath(""), "Desktop/TSS Ledger_Copy.xlsx");
  assert.throws(() => normalizeOneDriveLedgerPath("../ledger.xlsx"), /parent-directory/);
  assert.throws(() => normalizeOneDriveLedgerPath("ledger.csv"), /Excel/);
});

test("Microsoft authorization requests offline read-only file access", () => {
  const url = new URL(buildMicrosoftAuthorizeUrl({
    clientId: "client-id",
    redirectUri: "https://www.tssdeals.com/api/admin/operations/onedrive/callback",
    state: "signed-state",
  }));
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.match(url.searchParams.get("scope") ?? "", /offline_access/);
  assert.match(url.searchParams.get("scope") ?? "", /Files\.Read/);
  assert.doesNotMatch(url.searchParams.get("scope") ?? "", /Files\.ReadWrite/);
});

test("stored Microsoft tokens are encrypted and authenticated", () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "unit-test-session-secret";
  try {
    const encrypted = encryptOneDriveToken("sensitive-refresh-token");
    assert.notEqual(encrypted, "sensitive-refresh-token");
    assert.equal(decryptOneDriveToken(encrypted), "sensitive-refresh-token");
    const parts = encrypted.split(".");
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`;
    assert.throws(() => decryptOneDriveToken(parts.join(".")));
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
