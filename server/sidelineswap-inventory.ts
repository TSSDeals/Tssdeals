import type { IStorage } from "./storage";
import { getValidEbayUserToken } from "./ebay-reports";

const SS_BASE = "https://developer.sidelineswap.com/api/v1";
const EBAY_INVENTORY_URL = "https://api.ebay.com/sell/inventory/v1";
const EBAY_OFFER_URL = "https://api.ebay.com/sell/inventory/v1/offer";

export interface EbayInventoryItem {
  sku: string;
  ebayItemId?: string;
  title: string;
  description?: string;
  imageUrls: string[];
  condition: string;
  conditionDescription?: string;
  quantity: number;
  priceCents?: number;
  categoryName?: string;
  aspects?: Record<string, string[]>;
}

export interface SSCategory {
  id: string;
  name: string;
}

export interface SSAddress {
  id: string;
  firstName: string;
  lastName: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface SSListingPayload {
  listingSku: string;
  name: string;
  description?: string;
  category: string;
  brand: string;
  model?: string;
  acceptsOffers?: boolean;
  shipFromAddressId: string;
  images?: string[];
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  items: Array<{
    itemSku: string;
    quantity: number;
    listPrice: number;
    retailPrice?: number;
    details?: Array<{ type: string; option: string }>;
    images?: string[];
    shipFromAddressId?: string;
  }>;
}

function ssHeaders(): Record<string, string> {
  const apiKey = process.env.SIDELINESWAP_API_KEY;
  const clientId = process.env.SIDELINESWAP_CLIENT_ID;
  if (!apiKey || !clientId) {
    throw new Error("SidelineSwap API credentials not configured. Set SIDELINESWAP_API_KEY and SIDELINESWAP_CLIENT_ID.");
  }
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "x-client-id": clientId,
  };
}

export function isSidelineSwapConfigured(): boolean {
  return !!(process.env.SIDELINESWAP_API_KEY && process.env.SIDELINESWAP_CLIENT_ID);
}

export async function getSidelineSwapCategories(): Promise<SSCategory[]> {
  const res = await fetch(`${SS_BASE}/categories`, { headers: ssHeaders() });
  if (!res.ok) throw new Error(`SidelineSwap categories error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data as any[]).map((c) => ({ id: c.id, name: c.name }));
}

export async function getSidelineSwapAddresses(): Promise<SSAddress[]> {
  const res = await fetch(`${SS_BASE}/addresses`, { headers: ssHeaders() });
  if (!res.ok) throw new Error(`SidelineSwap addresses error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data as any[]).map((a) => ({
    id: a.id,
    firstName: a.first_name,
    lastName: a.last_name,
    street1: a.street_1,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
  }));
}

export async function createSidelineSwapListing(payload: SSListingPayload): Promise<{ id: string; status: string; errors: any[] }> {
  const body = {
    listing_sku: payload.listingSku,
    name: payload.name,
    description: payload.description,
    category: payload.category,
    brand: payload.brand,
    model: payload.model,
    accepts_offers: payload.acceptsOffers ?? true,
    ship_from_address_id: payload.shipFromAddressId,
    images: payload.images,
    length: payload.length,
    width: payload.width,
    height: payload.height,
    weight: payload.weight,
    items: payload.items.map((item) => ({
      item_sku: item.itemSku,
      quantity: item.quantity,
      list_price: item.listPrice,
      retail_price: item.retailPrice,
      details: item.details,
      images: item.images,
      ship_from_address_id: item.shipFromAddressId,
    })),
  };

  const res = await fetch(`${SS_BASE}/listings`, {
    method: "POST",
    headers: ssHeaders(),
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.errors?.map((e: any) => `${e.field}: ${e.message}`).join(", ") || JSON.stringify(data);
    throw new Error(`SidelineSwap listing error: ${res.status} — ${errMsg}`);
  }
  return {
    id: data.data?.id,
    status: data.data?.status,
    errors: data.errors || [],
  };
}

export async function batchCreateSidelineSwapListings(payloads: SSListingPayload[]): Promise<{ results: any[]; errors: any[] }> {
  const body = payloads.map((payload) => ({
    listing_sku: payload.listingSku,
    name: payload.name,
    description: payload.description,
    category: payload.category,
    brand: payload.brand,
    model: payload.model,
    accepts_offers: payload.acceptsOffers ?? true,
    ship_from_address_id: payload.shipFromAddressId,
    images: payload.images,
    items: payload.items.map((item) => ({
      item_sku: item.itemSku,
      quantity: item.quantity,
      list_price: item.listPrice,
      retail_price: item.retailPrice,
      details: item.details,
      images: item.images,
      ship_from_address_id: item.shipFromAddressId,
    })),
  }));

  const res = await fetch(`${SS_BASE}/listings/batch`, {
    method: "POST",
    headers: ssHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`SidelineSwap batch error: ${res.status} ${JSON.stringify(data)}`);
  }
  return { results: data.data || [], errors: data.errors || [] };
}

export async function getSidelineSwapListings(): Promise<any[]> {
  const res = await fetch(`${SS_BASE}/listings`, { headers: ssHeaders() });
  if (!res.ok) throw new Error(`SidelineSwap listings error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.data || [];
}

export async function updateSidelineSwapPrice(sku: string, price: number, quantity: number): Promise<void> {
  const body = { item_sku: sku, list_price: price, quantity };
  const res = await fetch(`${SS_BASE}/listings/quantity-price`, {
    method: "POST",
    headers: ssHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SidelineSwap update error: ${res.status} ${await res.text()}`);
}

export async function fetchEbayInventory(
  userId: string,
  storage: IStorage,
  limit = 100
): Promise<EbayInventoryItem[]> {
  const accessToken = await getValidEbayUserToken(userId, storage);

  const items: EbayInventoryItem[] = [];
  let offset = 0;
  const pageSize = Math.min(limit, 100);

  while (items.length < limit) {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    const res = await fetch(`${EBAY_INVENTORY_URL}/inventory_item?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`eBay inventory fetch error: ${res.status} ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    const page: any[] = data.inventoryItems || [];
    if (page.length === 0) break;

    for (const item of page) {
      const product = item.product || {};
      items.push({
        sku: item.sku,
        title: product.title || item.sku,
        description: product.description,
        imageUrls: product.imageUrls || [],
        condition: item.condition || "USED_EXCELLENT",
        conditionDescription: item.conditionDescription,
        quantity: item.availability?.shipToLocationAvailability?.quantity ?? 0,
        aspects: product.aspects,
      });
    }

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  if (items.length === 0) return items;

  const skus = items.map((i) => i.sku);
  const offerMap = await fetchEbayOffersForSkus(accessToken, skus);
  for (const item of items) {
    const offer = offerMap[item.sku];
    if (offer) {
      const priceStr = offer.pricingSummary?.price?.value || offer.price?.value;
      if (priceStr) item.priceCents = Math.round(parseFloat(priceStr) * 100);
      item.ebayItemId = offer.listingId;
      item.categoryName = offer.categoryId;
    }
  }

  return items;
}

async function fetchEbayOffersForSkus(
  accessToken: string,
  skus: string[]
): Promise<Record<string, any>> {
  const map: Record<string, any> = {};
  const batchSize = 20;

  for (let i = 0; i < skus.length; i += batchSize) {
    const batch = skus.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (sku) => {
        try {
          const params = new URLSearchParams({ sku });
          const res = await fetch(`${EBAY_OFFER_URL}?${params}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          });
          if (!res.ok) return;
          const data = await res.json();
          const offers: any[] = data.offers || [];
          if (offers.length > 0) map[sku] = offers[0];
        } catch {
        }
      })
    );
  }

  return map;
}
