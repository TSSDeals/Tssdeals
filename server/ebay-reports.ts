import type { IStorage } from "./storage";
import {
  EbayIntegrationError,
  ebayErrorFromResponse,
  ebayErrorFromText,
  logEbayError,
  safeEbayError,
} from "./ebay-errors";

const EBAY_AUTH_BASE = "https://auth.ebay.com/oauth2/authorize";
const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_FULFILLMENT_URL = "https://api.ebay.com/sell/fulfillment/v1/order";

const OAUTH_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
].join(" ");

interface EbayOrder {
  orderId: string;
  creationDate: string;
  orderFulfillmentStatus: string;
  orderPaymentStatus: string;
  buyer?: { username: string };
  pricingSummary?: {
    total?: { value: string; currency: string };
    priceSubtotal?: { value: string; currency: string };
    deliveryCost?: { value: string; currency: string };
    tax?: { value: string; currency: string };
  };
  lineItems?: Array<{
    lineItemId: string;
    legacyItemId: string;
    title: string;
    quantity: number;
    lineItemCost?: { value: string; currency: string };
    deliveryCost?: { total?: { value: string; currency: string } };
    sku?: string;
  }>;
  salesRecordReference?: string;
}

interface EbayOrdersResponse {
  orders?: EbayOrder[];
  total: number;
  offset: number;
  limit: number;
  errors?: Array<{ message: string; errorId: number }>;
}

export function getEbayOAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: OAUTH_SCOPES,
    state,
  });
  return `${EBAY_AUTH_BASE}?${params.toString()}`;
}

export async function exchangeEbayCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string }> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    throw await ebayErrorFromResponse(response, "authorization code exchange");
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope || "",
  };
}

export async function refreshEbayToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetchImpl(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    throw await ebayErrorFromResponse(response, "token refresh");
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

export async function getValidEbayUserToken(
  userId: string,
  storage: IStorage,
  options: {
    clientId?: string;
    clientSecret?: string;
    fetchImpl?: typeof fetch;
    requiredScopesAnyOf?: string[];
  } = {},
): Promise<string> {
  const tokenRecord = await storage.getEbayOauthToken(userId);
  if (!tokenRecord) {
    throw new EbayIntegrationError({
      code: "reauthorization_required",
      operation: "authorization check",
      message: "eBay account is not connected. Connect the eBay account to continue.",
    });
  }

  const clientId = options.clientId ?? process.env.EBAY_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.EBAY_CLIENT_SECRET;

  const assertRequiredScope = (scope: string | null) => {
    if (!options.requiredScopesAnyOf?.length) return;
    if (!scope?.trim()) {
      throw new EbayIntegrationError({
        code: "missing_scope",
        operation: "authorization check",
        message: "eBay authorization does not include verifiable inventory permissions. Reconnect the eBay account to grant the current permissions.",
      });
    }
    const granted = new Set(scope.split(/\s+/).filter(Boolean));
    if (!options.requiredScopesAnyOf.some((required) => granted.has(required))) {
      throw new EbayIntegrationError({
        code: "missing_scope",
        operation: "authorization check",
        message: "eBay authorization is missing inventory access. Reconnect the eBay account to grant the current permissions.",
      });
    }
  };

  assertRequiredScope(tokenRecord.scope);

  if (Date.now() >= tokenRecord.expiresAt.getTime() - 60000) {
    if (!clientId || !clientSecret) {
      throw new EbayIntegrationError({
        code: "upstream_error",
        operation: "token refresh",
        message: "The eBay integration is not configured to refresh an expired authorization.",
      });
    }
    try {
      const refreshed = await refreshEbayToken(
        tokenRecord.refreshToken,
        clientId,
        clientSecret,
        options.fetchImpl,
      );
      await storage.upsertEbayOauthToken(userId, {
        accessToken: refreshed.accessToken,
        refreshToken: tokenRecord.refreshToken,
        expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        scope: tokenRecord.scope || undefined,
        ebayUsername: tokenRecord.ebayUsername || undefined,
      });
      return refreshed.accessToken;
    } catch (err) {
      logEbayError(err);
      throw err;
    }
  }

  return tokenRecord.accessToken;
}

const INVENTORY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
];

export function getEbayInventoryScopes(): string[] {
  return [...INVENTORY_SCOPES];
}

export async function getEbayOAuthConnectionStatus(
  userId: string,
  storage: IStorage,
  options: {
    clientId?: string;
    clientSecret?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<{
  connected: boolean;
  state: "connected" | "not_connected" | "reauthorization_required" | "error";
  message: string | null;
  reconnectRequired: boolean;
  ebayUsername: string | null;
  expiresAt: Date | null;
  updatedAt: Date | null;
}> {
  const token = await storage.getEbayOauthToken(userId);
  if (!token) {
    return {
      connected: false,
      state: "not_connected",
      message: null,
      reconnectRequired: false,
      ebayUsername: null,
      expiresAt: null,
      updatedAt: null,
    };
  }

  try {
    await getValidEbayUserToken(userId, storage, {
      ...options,
      requiredScopesAnyOf: INVENTORY_SCOPES,
    });
    const current = await storage.getEbayOauthToken(userId);
    return {
      connected: true,
      state: "connected",
      message: null,
      reconnectRequired: false,
      ebayUsername: current?.ebayUsername ?? token.ebayUsername ?? null,
      expiresAt: current?.expiresAt ?? token.expiresAt,
      updatedAt: current?.updatedAt ?? token.updatedAt,
    };
  } catch (error) {
    const safe = safeEbayError(error);
    return {
      connected: false,
      state: safe.reconnectRequired ? "reauthorization_required" : "error",
      message: safe.message,
      reconnectRequired: safe.reconnectRequired,
      ebayUsername: token.ebayUsername ?? null,
      expiresAt: token.expiresAt,
      updatedAt: token.updatedAt,
    };
  }
}

export async function fetchEbaySalesOrders(
  accessToken: string,
  startDate?: string,
  endDate?: string,
  limit: number = 200,
): Promise<EbayOrder[]> {
  const allOrders: EbayOrder[] = [];
  let offset = 0;
  const pageLimit = Math.min(limit, 200);
  let dateRetryAttempt = 0;

  let effectiveStartDate = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  let effectiveEndDate = endDate;

  while (true) {
    const params = new URLSearchParams({
      limit: String(pageLimit),
      offset: String(offset),
    });

    const filters: string[] = [];
    filters.push(`creationdate:[${effectiveStartDate}T00:00:00.000Z..]`);
    if (effectiveEndDate) filters.push(`creationdate:[..${effectiveEndDate}T23:59:59.999Z]`);
    params.set("filter", filters.join(","));

    const response = await fetch(`${EBAY_FULFILLMENT_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 400 && (text.includes("in the future") || text.includes("Start date is missing")) && dateRetryAttempt < 3) {
        dateRetryAttempt++;
        const fallbackYear = new Date().getFullYear() - dateRetryAttempt;
        effectiveStartDate = `${fallbackYear}-01-01`;
        effectiveEndDate = undefined;
        console.log(`[ebay-reports] Date filter rejected (attempt ${dateRetryAttempt}), retrying with start date ${effectiveStartDate}`);
        offset = 0;
        continue;
      }
      throw ebayErrorFromText(response.status, text, "sales order retrieval");
    }

    const data = (await response.json()) as EbayOrdersResponse;

    if (data.errors && data.errors.length > 0) {
      throw ebayErrorFromText(
        200,
        JSON.stringify({ errors: data.errors }),
        "sales order retrieval",
      );
    }

    if (data.orders) {
      allOrders.push(...data.orders);
    }

    if (!data.orders || data.orders.length < pageLimit || allOrders.length >= data.total) {
      break;
    }

    offset += pageLimit;

    if (allOrders.length >= 1000) break;
  }

  return allOrders;
}

export function salesOrdersToCsv(orders: EbayOrder[]): string {
  const headers = [
    "Order ID",
    "Date",
    "Buyer",
    "Item Title",
    "SKU",
    "Quantity",
    "Item Price",
    "Shipping",
    "Tax",
    "Order Total",
    "Payment Status",
    "Fulfillment Status",
    "Sales Record",
  ];

  const rows: string[][] = [];

  for (const order of orders) {
    const lineItems = order.lineItems ?? [];
    if (lineItems.length === 0) {
      rows.push([
        order.orderId,
        order.creationDate ? new Date(order.creationDate).toISOString().split("T")[0] : "",
        order.buyer?.username ?? "",
        "",
        "",
        "",
        "",
        order.pricingSummary?.deliveryCost?.value ?? "",
        order.pricingSummary?.tax?.value ?? "",
        order.pricingSummary?.total?.value ?? "",
        order.orderPaymentStatus ?? "",
        order.orderFulfillmentStatus ?? "",
        order.salesRecordReference ?? "",
      ]);
    } else {
      for (const item of lineItems) {
        rows.push([
          order.orderId,
          order.creationDate ? new Date(order.creationDate).toISOString().split("T")[0] : "",
          order.buyer?.username ?? "",
          item.title ?? "",
          item.sku ?? "",
          String(item.quantity ?? ""),
          item.lineItemCost?.value ?? "",
          item.deliveryCost?.total?.value ?? "",
          order.pricingSummary?.tax?.value ?? "",
          order.pricingSummary?.total?.value ?? "",
          order.orderPaymentStatus ?? "",
          order.orderFulfillmentStatus ?? "",
          order.salesRecordReference ?? "",
        ]);
      }
    }
  }

  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvLines = [headers.map(escape).join(",")];
  for (const row of rows) {
    csvLines.push(row.map(escape).join(","));
  }

  return csvLines.join("\n");
}

export async function fetchEbayPurchases(
  accessToken: string,
  startDate?: string,
  endDate?: string,
): Promise<any[]> {
  const params = new URLSearchParams({ limit: "200" });

  let useDateFilter = !!(startDate || endDate);
  if (useDateFilter) {
    const filters: string[] = [];
    if (startDate) filters.push(`creationdate:[${startDate}T00:00:00.000Z..]`);
    if (endDate) filters.push(`creationdate:[..${endDate}T23:59:59.999Z]`);
    params.set("filter", filters.join(","));
  }

  let response = await fetch(
    `https://api.ebay.com/buy/order/v2/purchase_order?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok && response.status === 400 && useDateFilter) {
    const text = await response.text();
    if (text.includes("in the future")) {
      console.log("[ebay-reports] Purchase date filter rejected as 'in the future', retrying without date filter");
      const retryParams = new URLSearchParams({ limit: "200" });
      response = await fetch(
        `https://api.ebay.com/buy/order/v2/purchase_order?${retryParams.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    }
  }

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw await ebayErrorFromResponse(response, "purchase order retrieval");
  }

  const data = await response.json();
  return data.orders ?? data.purchaseOrders ?? [];
}

export function purchasesToCsv(purchases: any[]): string {
  const headers = [
    "Order ID",
    "Date",
    "Seller",
    "Item Title",
    "Quantity",
    "Item Price",
    "Shipping",
    "Order Total",
    "Status",
  ];

  const rows: string[][] = [];

  for (const order of purchases) {
    const items = order.lineItems ?? order.purchaseOrderItems ?? [];
    if (items.length === 0) {
      rows.push([
        order.purchaseOrderId ?? order.orderId ?? "",
        order.purchaseOrderCreationDate ?? order.creationDate ?? "",
        "",
        "",
        "",
        "",
        "",
        order.pricingSummary?.total?.value ?? order.totalAmount?.value ?? "",
        order.purchaseOrderStatus ?? order.orderFulfillmentStatus ?? "",
      ]);
    } else {
      for (const item of items) {
        rows.push([
          order.purchaseOrderId ?? order.orderId ?? "",
          order.purchaseOrderCreationDate ?? order.creationDate
            ? new Date(order.purchaseOrderCreationDate ?? order.creationDate).toISOString().split("T")[0]
            : "",
          item.seller?.username ?? "",
          item.title ?? item.itemTitle ?? "",
          String(item.quantity ?? ""),
          item.lineItemCost?.value ?? item.netPrice?.value ?? "",
          item.lineItemDeliveryCost?.value ?? "",
          order.pricingSummary?.total?.value ?? order.totalAmount?.value ?? "",
          order.purchaseOrderStatus ?? order.orderFulfillmentStatus ?? "",
        ]);
      }
    }
  }

  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvLines = [headers.map(escape).join(",")];
  for (const row of rows) {
    csvLines.push(row.map(escape).join(","));
  }

  return csvLines.join("\n");
}
