import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { deals, ebayOauthTokens, ebaySellers, scheduledReports } from "@shared/schema";

export const DEFAULT_EBAY_NOTIFICATION_ENDPOINT =
  "https://deal-scout-twinseamsports.replit.app/api/ebay/account-deletion";

const PUBLIC_KEY_CACHE_MS = 60 * 60 * 1000;
const publicKeyCache = new Map<string, { key: string; expiresAt: number }>();

export type EbayAccountDeletionPayload = {
  metadata: {
    topic: "MARKETPLACE_ACCOUNT_DELETION";
    schemaVersion: string;
    deprecated: boolean;
  };
  notification: {
    notificationId: string;
    eventDate: string;
    publishDate: string;
    publishAttemptCount: number;
    data: {
      username?: string;
      userId?: string;
      eiasToken?: string;
    };
  };
};

type SignatureEnvelope = {
  alg: string;
  kid: string;
  signature: string;
  digest?: string;
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseEbayAccountDeletionPayload(value: unknown): EbayAccountDeletionPayload {
  const payload = value as Partial<EbayAccountDeletionPayload> | null;
  const metadata = payload?.metadata;
  const notification = payload?.notification;
  const data = notification?.data;

  if (
    metadata?.topic !== "MARKETPLACE_ACCOUNT_DELETION" ||
    !nonEmptyString(metadata.schemaVersion) ||
    typeof metadata.deprecated !== "boolean" ||
    !notification ||
    !nonEmptyString(notification.notificationId) ||
    !nonEmptyString(notification.eventDate) ||
    !nonEmptyString(notification.publishDate) ||
    typeof notification.publishAttemptCount !== "number" ||
    !data
  ) {
    throw new Error("Invalid marketplace account deletion notification");
  }

  if (![data.username, data.userId, data.eiasToken].some(nonEmptyString)) {
    throw new Error("Deletion notification contains no eBay user identifier");
  }

  return payload as EbayAccountDeletionPayload;
}

function decodeSignatureHeader(header: string): SignatureEnvelope {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    throw new Error("Invalid X-EBAY-SIGNATURE header");
  }

  const envelope = decoded as Partial<SignatureEnvelope>;
  if (
    !nonEmptyString(envelope.alg) ||
    !nonEmptyString(envelope.kid) ||
    !nonEmptyString(envelope.signature)
  ) {
    throw new Error("Incomplete X-EBAY-SIGNATURE header");
  }
  return envelope as SignatureEnvelope;
}

async function getApplicationToken(fetchImpl: typeof fetch): Promise<string> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("eBay client credentials are not configured");
  }

  const response = await fetchImpl("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!response.ok) {
    throw new Error(`eBay application token request failed (${response.status})`);
  }

  const body = (await response.json()) as { access_token?: string };
  if (!nonEmptyString(body.access_token)) {
    throw new Error("eBay application token response did not contain an access token");
  }
  return body.access_token;
}

async function getNotificationPublicKey(
  keyId: string,
  fetchImpl: typeof fetch,
  now = Date.now(),
): Promise<string> {
  const cached = publicKeyCache.get(keyId);
  if (cached && cached.expiresAt > now) return cached.key;

  const token = await getApplicationToken(fetchImpl);
  const response = await fetchImpl(
    `https://api.ebay.com/commerce/notification/v1/public_key/${encodeURIComponent(keyId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`eBay notification public-key request failed (${response.status})`);
  }

  const body = (await response.json()) as { key?: string };
  if (!nonEmptyString(body.key)) {
    throw new Error("eBay notification public-key response did not contain a key");
  }
  publicKeyCache.set(keyId, { key: body.key, expiresAt: now + PUBLIC_KEY_CACHE_MS });
  return body.key;
}

export async function verifyEbayNotificationSignature(
  signatureHeader: string,
  rawBody: Buffer,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const envelope = decodeSignatureHeader(signatureHeader);
  const publicKey = await getNotificationPublicKey(envelope.kid, fetchImpl);
  const digest = (envelope.digest || "SHA1").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (digest !== "sha1" && digest !== "sha256") {
    throw new Error("Unsupported eBay notification digest");
  }
  const key = publicKey.includes("BEGIN PUBLIC KEY")
    ? publicKey
    : crypto.createPublicKey({
        key: Buffer.from(publicKey, "base64"),
        format: "der",
        type: "spki",
      });
  return crypto.verify(
    digest,
    rawBody,
    key,
    Buffer.from(envelope.signature, "base64"),
  );
}

function identifiersFromPayload(payload: EbayAccountDeletionPayload): string[] {
  return [
    payload.notification.data.username,
    payload.notification.data.userId,
    payload.notification.data.eiasToken,
  ]
    .filter(nonEmptyString)
    .map((value) => value.trim());
}

export async function purgeEbayUserData(
  payload: EbayAccountDeletionPayload,
): Promise<{ oauthTokens: number; savedSellers: number; deals: number; reports: number }> {
  const identifiers = identifiersFromPayload(payload);
  const normalized = identifiers.map((value) => value.toLowerCase());

  return db.transaction(async (tx) => {
    const oauthRows = await tx
      .delete(ebayOauthTokens)
      .where(sql`lower(coalesce(${ebayOauthTokens.ebayUsername}, '')) in (${sql.join(normalized.map((id) => sql`${id}`), sql`, `)})`)
      .returning({ id: ebayOauthTokens.id });

    const sellerRows = await tx
      .delete(ebaySellers)
      .where(sql`lower(${ebaySellers.username}) in (${sql.join(normalized.map((id) => sql`${id}`), sql`, `)})`)
      .returning({ id: ebaySellers.id });

    const dealRows = await tx
      .delete(deals)
      .where(
        and(
          eq(deals.sourceId, "ebay"),
          sql`(
            lower(coalesce(${deals.raw}->>'ebaySeller', '')) in (${sql.join(normalized.map((id) => sql`${id}`), sql`, `)})
            or lower(coalesce(${deals.raw}->>'seller', '')) in (${sql.join(normalized.map((id) => sql`${id}`), sql`, `)})
            or lower(coalesce(${deals.raw}->>'sellerUsername', '')) in (${sql.join(normalized.map((id) => sql`${id}`), sql`, `)})
            or lower(coalesce(${deals.raw}->>'username', '')) in (${sql.join(normalized.map((id) => sql`${id}`), sql`, `)})
            or lower(coalesce(${deals.raw}->>'userId', '')) in (${sql.join(normalized.map((id) => sql`${id}`), sql`, `)})
            or coalesce(${deals.raw}->>'eiasToken', '') in (${sql.join(identifiers.map((id) => sql`${id}`), sql`, `)})
          )`,
        ),
      )
      .returning({ id: deals.id });

    const reportRows = await tx
      .delete(scheduledReports)
      .where(
        sql`exists (
          select 1
          from unnest(${identifiers}::text[]) as identifier
          where position(lower(identifier) in lower(${scheduledReports.csvContent})) > 0
        )`,
      )
      .returning({ id: scheduledReports.id });

    return {
      oauthTokens: oauthRows.length,
      savedSellers: sellerRows.length,
      deals: dealRows.length,
      reports: reportRows.length,
    };
  });
}

export function createEbayChallengeResponse(
  challengeCode: string,
  verificationToken: string,
  endpoint: string,
): string {
  return crypto
    .createHash("sha256")
    .update(challengeCode)
    .update(verificationToken)
    .update(endpoint)
    .digest("hex");
}
