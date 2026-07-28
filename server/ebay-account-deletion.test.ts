import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import {
  createEbayChallengeResponse,
  parseEbayAccountDeletionPayload,
  verifyEbayNotificationSignature,
} from "./ebay-account-deletion";

const samplePayload = {
  metadata: {
    topic: "MARKETPLACE_ACCOUNT_DELETION" as const,
    schemaVersion: "1.0",
    deprecated: false,
  },
  notification: {
    notificationId: "notification-123",
    eventDate: "2026-07-28T12:00:00.000Z",
    publishDate: "2026-07-28T12:00:01.000Z",
    publishAttemptCount: 1,
    data: {
      username: "deleted-user",
      userId: "immutable-user-id",
      eiasToken: "legacy-token",
    },
  },
};

test("challenge response follows eBay's documented concatenation order", () => {
  const expected = crypto
    .createHash("sha256")
    .update("challenge")
    .update("verification-token")
    .update("https://example.com/callback")
    .digest("hex");
  assert.equal(
    createEbayChallengeResponse(
      "challenge",
      "verification-token",
      "https://example.com/callback",
    ),
    expected,
  );
});

test("deletion payload validation requires the expected topic and an identifier", () => {
  assert.deepEqual(parseEbayAccountDeletionPayload(samplePayload), samplePayload);
  assert.throws(
    () =>
      parseEbayAccountDeletionPayload({
        ...samplePayload,
        notification: { ...samplePayload.notification, data: {} },
      }),
    /no eBay user identifier/,
  );
});

test("notification signature is verified with eBay's public-key response", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const signature = crypto
    .sign("sha256", Buffer.from(JSON.stringify(samplePayload)), privateKey)
    .toString("base64");
  const signatureHeader = Buffer.from(
    JSON.stringify({
      alg: "ECC",
      kid: `test-key-${Date.now()}`,
      signature,
      digest: "SHA256",
    }),
  ).toString("base64");

  const originalClientId = process.env.EBAY_CLIENT_ID;
  const originalClientSecret = process.env.EBAY_CLIENT_SECRET;
  process.env.EBAY_CLIENT_ID = "client";
  process.env.EBAY_CLIENT_SECRET = "secret";
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    if (String(url).includes("/identity/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "application-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        key: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    assert.equal(
      await verifyEbayNotificationSignature(signatureHeader, samplePayload, fetchImpl),
      true,
    );
    assert.equal(calls.length, 2);
  } finally {
    if (originalClientId === undefined) delete process.env.EBAY_CLIENT_ID;
    else process.env.EBAY_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.EBAY_CLIENT_SECRET;
    else process.env.EBAY_CLIENT_SECRET = originalClientSecret;
  }
});

test("one-line PEM keys and parsed JSON follow eBay's reference validator", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const signature = crypto
    .sign("ssl3-sha1", Buffer.from(JSON.stringify(samplePayload)), privateKey)
    .toString("base64");
  const signatureHeader = Buffer.from(
    JSON.stringify({
      alg: "ECC",
      kid: `one-line-pem-${Date.now()}`,
      signature,
    }),
  ).toString("base64");
  const oneLinePem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString()
    .replace(/\r?\n/g, "");

  const originalClientId = process.env.EBAY_CLIENT_ID;
  const originalClientSecret = process.env.EBAY_CLIENT_SECRET;
  process.env.EBAY_CLIENT_ID = "client";
  process.env.EBAY_CLIENT_SECRET = "secret";
  const fetchImpl = (async (url: string | URL | Request) => {
    if (String(url).includes("/identity/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "application-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ key: oneLinePem }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    assert.equal(
      await verifyEbayNotificationSignature(signatureHeader, samplePayload, fetchImpl),
      true,
    );
  } finally {
    if (originalClientId === undefined) delete process.env.EBAY_CLIENT_ID;
    else process.env.EBAY_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.EBAY_CLIENT_SECRET;
    else process.env.EBAY_CLIENT_SECRET = originalClientSecret;
  }
});
