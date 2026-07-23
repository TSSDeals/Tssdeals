import assert from "node:assert/strict";
import test from "node:test";
import type { IStorage } from "./storage";
import {
  getEbayInventoryScopes,
  getEbayOAuthConnectionStatus,
  getValidEbayUserToken,
  refreshEbayToken,
} from "./ebay-reports";
import { EbayIntegrationError, ebayErrorFromResponse } from "./ebay-errors";
import { fetchEbayInventory } from "./sidelineswap-inventory";
import { pricingReportFailureFields } from "./ebay-pricing-status";

const USER_ID = "test-user";
const INVENTORY_SCOPE = "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly";

function tokenRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "token-id",
    userId: USER_ID,
    accessToken: "old-access-token",
    refreshToken: "refresh-token",
    expiresAt: new Date(Date.now() - 60_000),
    scope: INVENTORY_SCOPE,
    ebayUsername: null,
    updatedAt: new Date("2026-07-13T12:00:00Z"),
    ...overrides,
  };
}

function storageWithToken(initial: ReturnType<typeof tokenRecord>) {
  let current = initial;
  const upserts: any[] = [];
  const storage = {
    async getEbayOauthToken() {
      return current;
    },
    async upsertEbayOauthToken(_userId: string, data: any) {
      upserts.push(data);
      current = { ...current, ...data, updatedAt: new Date() };
      return current;
    },
  } as unknown as IStorage;
  return { storage, upserts, current: () => current };
}

test("expired OAuth status is not connected when refresh requires reauthorization", async () => {
  const { storage } = storageWithToken(tokenRecord());
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    error: "invalid_grant",
    error_description: "refresh token revoked",
  }), { status: 400 });

  const status = await getEbayOAuthConnectionStatus(USER_ID, storage, {
    clientId: "client",
    clientSecret: "secret",
    fetchImpl,
  });

  assert.equal(status.connected, false);
  assert.equal(status.state, "reauthorization_required");
  assert.equal(status.reconnectRequired, true);
  assert.match(status.message ?? "", /reconnect/i);
});

test("expired access token refreshes successfully without expanding original scopes", async () => {
  const { storage, upserts } = storageWithToken(tokenRecord());
  let requestBody = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({
      access_token: "fresh-access-token",
      expires_in: 7200,
    }), { status: 200 });
  };

  const token = await getValidEbayUserToken(USER_ID, storage, {
    clientId: "client",
    clientSecret: "secret",
    fetchImpl,
    requiredScopesAnyOf: getEbayInventoryScopes(),
  });

  assert.equal(token, "fresh-access-token");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].accessToken, "fresh-access-token");
  assert.doesNotMatch(requestBody, /(?:^|&)scope=/);
});

test("failed token refresh is surfaced as reauthorization instead of an empty result", async () => {
  const { storage } = storageWithToken(tokenRecord());
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    error: "invalid_grant",
    error_description: "authorization revoked",
  }), { status: 400 });

  await assert.rejects(
    getValidEbayUserToken(USER_ID, storage, {
      clientId: "client",
      clientSecret: "secret",
      fetchImpl,
    }),
    (error: unknown) =>
      error instanceof EbayIntegrationError &&
      error.code === "reauthorization_required" &&
      error.reconnectRequired,
  );
});

test("stored credentials missing inventory scope require reconnection before inventory access", async () => {
  const { storage } = storageWithToken(tokenRecord({
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    scope: "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  }));

  await assert.rejects(
    getValidEbayUserToken(USER_ID, storage, {
      clientId: "client",
      clientSecret: "secret",
      requiredScopesAnyOf: getEbayInventoryScopes(),
    }),
    (error: unknown) =>
      error instanceof EbayIntegrationError &&
      error.code === "missing_scope" &&
      error.reconnectRequired,
  );
});

for (const [label, scope] of [
  ["null", null],
  ["empty", ""],
  ["whitespace-only", "   \t  "],
] as const) {
  test(`${label} stored scope cannot prove required inventory authorization`, async () => {
    const { storage } = storageWithToken(tokenRecord({
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scope,
    }));

    await assert.rejects(
      getValidEbayUserToken(USER_ID, storage, {
        requiredScopesAnyOf: getEbayInventoryScopes(),
      }),
      (error: unknown) =>
        error instanceof EbayIntegrationError &&
        error.code === "missing_scope" &&
        error.reconnectRequired,
    );
  });
}

test("any one valid stored inventory scope satisfies the requested alternatives", async () => {
  const { storage } = storageWithToken(tokenRecord({
    accessToken: "valid-access-token",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    scope: `https://api.ebay.com/oauth/api_scope ${INVENTORY_SCOPE}`,
  }));

  const token = await getValidEbayUserToken(USER_ID, storage, {
    requiredScopesAnyOf: getEbayInventoryScopes(),
  });

  assert.equal(token, "valid-access-token");
});

test("upstream inventory 400 preserves every safe eBay error and never becomes zero inventory", async () => {
  const { storage } = storageWithToken(tokenRecord({
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    errors: [
      { errorId: 25710, domain: "API_INVENTORY", category: "REQUEST", message: "First inventory error" },
      { errorId: 25711, domain: "API_INVENTORY", category: "REQUEST", message: "Second inventory error" },
    ],
  }), { status: 400 });

  try {
    await assert.rejects(
      fetchEbayInventory(USER_ID, storage, 100),
      (error: unknown) => {
        assert.ok(error instanceof EbayIntegrationError);
        assert.equal(error.upstreamStatus, 400);
        assert.equal(error.upstreamDetails.length, 2);
        assert.deepEqual(error.upstreamDetails.map((detail) => detail.errorId), [25710, 25711]);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("upstream error diagnostics redact tokens while retaining actionable details", async () => {
  const error = await ebayErrorFromResponse(new Response(JSON.stringify({
    errors: [{
      errorId: 1100,
      message: "Bad request",
      longMessage: "access_token=secret-token",
      parameters: [
        { name: "scope", value: "sell.inventory.readonly" },
        { name: "refresh_token", value: "refresh-secret" },
      ],
    }],
  }), { status: 400 }), "inventory retrieval");

  assert.equal(error.upstreamDetails[0].errorId, 1100);
  assert.equal(error.upstreamDetails[0].parameter, "scope");
  assert.equal(error.upstreamDetails[0].parameters?.length, 2);
  assert.doesNotMatch(JSON.stringify(error.upstreamDetails), /secret-token|refresh-secret/);
});

test("pricing inventory retrieval failures produce an error report status, never complete zero", () => {
  const upstream = new EbayIntegrationError({
    code: "upstream_error",
    operation: "pricing inventory search",
    message: "eBay could not complete pricing inventory search. Try again later or review the eBay integration diagnostics.",
    upstreamStatus: 400,
  });

  const fields = pricingReportFailureFields(upstream);
  assert.equal(fields.status, "error");
  assert.match(fields.errorMessage, /could not complete/i);
  assert.ok(fields.completedAt instanceof Date);
  assert.notEqual(fields.status, "complete");
});

test("refresh helper classifies missing-scope 400 as a reconnect requirement", async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    error: "invalid_scope",
    error_description: "Requested scope exceeds the original grant",
  }), { status: 400 });

  await assert.rejects(
    refreshEbayToken("refresh", "client", "secret", fetchImpl),
    (error: unknown) =>
      error instanceof EbayIntegrationError &&
      error.code === "missing_scope" &&
      error.reconnectRequired,
  );
});

test("eBay permission denial is classified as missing scope without exposing upstream text", async () => {
  const error = await ebayErrorFromResponse(new Response(JSON.stringify({
    errors: [{ errorId: 1100, message: "Access denied" }],
  }), { status: 403 }), "purchase order retrieval");

  assert.equal(error.code, "missing_scope");
  assert.equal(error.reconnectRequired, true);
  assert.match(error.message, /reconnect/i);
  assert.doesNotMatch(error.message, /1100/);
});
