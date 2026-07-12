import { db } from "./db";
import { deals } from "../shared/schema";
import { and, inArray, lt, gt, like, notLike, sql } from "drizzle-orm";

const EBAY_AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_ITEM_URL = "https://api.ebay.com/buy/browse/v1/item";

let cachedEbayToken: { token: string; expiresAt: number } | null = null;

async function getEbayAppToken(): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedEbayToken && Date.now() < cachedEbayToken.expiresAt - 60000) {
    return cachedEbayToken.token;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(EBAY_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) return null;
  const data = await res.json() as any;
  cachedEbayToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

function extractEbayItemId(url: string): string | null {
  const match = url.match(/\/itm\/(?:[^/?]+\/)?(\d{8,})/);
  return match ? match[1] : null;
}

async function checkEbayItemActive(itemId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${EBAY_BROWSE_ITEM_URL}/v1|${itemId}|0`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404 || res.status === 410) return false;
    if (!res.ok) return true;
    const data = await res.json() as any;
    // Check availability status
    if (Array.isArray(data.estimatedAvailabilities)) {
      const avail = data.estimatedAvailabilities[0];
      if (avail?.estimatedAvailabilityStatus === "UNAVAILABLE") return false;
    }
    // Check if BIN item is still purchasable
    if (data.buyingOptions && !data.buyingOptions.includes("FIXED_PRICE") && !data.buyingOptions.includes("AUCTION")) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

async function checkSidelineSwapItemActive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TSSDeals/1.0; +https://tssdeals.com)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404 || res.status === 410 || res.status === 301) return false;
    return res.status < 400;
  } catch {
    return true;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export interface ValidationResult {
  ebayChecked: number;
  ebayRemoved: number;
  ssChecked: number;
  ssRemoved: number;
  durationMs: number;
}

export async function runDealValidation(maxPerSource = 500): Promise<ValidationResult> {
  const start = Date.now();
  const result: ValidationResult = { ebayChecked: 0, ebayRemoved: 0, ssChecked: 0, ssRemoved: 0, durationMs: 0 };

  // --- eBay validation ---
  const token = await getEbayAppToken();
  if (token) {
    // Prioritize deals not refreshed recently — oldest lastSeenAt first, limit to maxPerSource
    const ebayDeals = await db
      .select({ id: deals.id, url: deals.url })
      .from(deals)
      .where(
        and(
          like(deals.url, "%ebay.com/itm/%"),
          lt(deals.lastSeenAt, new Date(Date.now() - 2 * 60 * 60 * 1000)), // older than 2h
        )
      )
      .orderBy(deals.lastSeenAt) // oldest first = most likely to be dead
      .limit(maxPerSource);

    const deadEbayIds: string[] = [];
    const batchSize = 5;

    for (let i = 0; i < ebayDeals.length; i += batchSize) {
      const batch = ebayDeals.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (deal) => {
          const itemId = extractEbayItemId(deal.url);
          if (!itemId) return;
          result.ebayChecked++;
          const active = await checkEbayItemActive(itemId, token);
          if (!active) deadEbayIds.push(deal.id);
        })
      );
      if (i + batchSize < ebayDeals.length) await sleep(300);
    }

    if (deadEbayIds.length > 0) {
      const batchDelete = 500;
      for (let i = 0; i < deadEbayIds.length; i += batchDelete) {
        await db.delete(deals).where(inArray(deals.id, deadEbayIds.slice(i, i + batchDelete)));
      }
      result.ebayRemoved = deadEbayIds.length;
    }
  }

  // --- SidelineSwap validation ---
  const ssDeals = await db
    .select({ id: deals.id, url: deals.url })
    .from(deals)
    .where(
      and(
        inArray(deals.sourceId as any, ["sidelineswap"]),
        lt(deals.lastSeenAt, new Date(Date.now() - 2 * 60 * 60 * 1000)),
      )
    )
    .orderBy(deals.lastSeenAt)
    .limit(maxPerSource);

  const deadSsIds: string[] = [];
  const ssBatchSize = 10;

  for (let i = 0; i < ssDeals.length; i += ssBatchSize) {
    const batch = ssDeals.slice(i, i + ssBatchSize);
    await Promise.all(
      batch.map(async (deal) => {
        if (!deal.url.includes("sidelineswap.com")) return;
        result.ssChecked++;
        const active = await checkSidelineSwapItemActive(deal.url);
        if (!active) deadSsIds.push(deal.id);
      })
    );
    if (i + ssBatchSize < ssDeals.length) await sleep(200);
  }

  if (deadSsIds.length > 0) {
    await db.delete(deals).where(inArray(deals.id, deadSsIds));
    result.ssRemoved = deadSsIds.length;
  }

  result.durationMs = Date.now() - start;
  return result;
}
