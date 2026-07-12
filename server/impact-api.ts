import type { InsertDeal } from "@shared/schema";

interface ImpactCatalog {
  Id: string;
  Name: string;
  AdvertiserId: string;
  AdvertiserName: string;
  CampaignId: string;
  CampaignName: string;
  NumberOfItems: string;
  Currency: string;
  LastUpdated: string;
  ItemsUri: string;
}

interface ImpactCatalogItem {
  CatalogItemId: string;
  Name: string;
  Description: string;
  Manufacturer: string;
  Url: string;
  ImageUrl: string;
  CurrentPrice: string;
  OriginalPrice: string;
  DiscountPercentage: string;
  StockAvailability: string;
  Currency: string;
  Category: string;
  SubCategory: string;
  Gtin: string;
  Asin: string;
  Mpn: string;
  Sku: string;
  Color: string;
  Size: string;
  Gender: string;
  AdvertiserId: string;
  AdvertiserName: string;
  CampaignId: string;
  CampaignName: string;
}

interface ImpactCatalogsResponse {
  Catalogs: ImpactCatalog[];
  "@page": string;
  "@numpages": string;
}

interface ImpactItemsResponse {
  Items: ImpactCatalogItem[];
  "@page": string;
  "@numpages": string;
}

function buildBasicAuth(accountSid: string, authToken: string): string {
  return "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

export async function listImpactCatalogs(
  accountSid: string,
  authToken: string,
): Promise<ImpactCatalog[]> {
  const url = `https://api.impact.com/Mediapartners/${accountSid}/Catalogs`;

  const response = await fetch(url, {
    headers: {
      Authorization: buildBasicAuth(accountSid, authToken),
      Accept: "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Impact API error ${response.status}: ${text.slice(0, 300)}`);
  }

  let data: ImpactCatalogsResponse;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Impact API returned unexpected response: ${text.slice(0, 200)}`);
  }

  return data.Catalogs ?? [];
}

export async function getImpactCatalogItems(
  accountSid: string,
  authToken: string,
  catalogId: string,
  page: number = 1,
): Promise<{ items: ImpactCatalogItem[]; totalPages: number }> {
  const url = `https://api.impact.com/Mediapartners/${accountSid}/Catalogs/${catalogId}/Items?Page=${page}&PageSize=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: buildBasicAuth(accountSid, authToken),
      Accept: "application/json",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Impact API error ${response.status}: ${text.slice(0, 300)}`);
  }

  let data: ImpactItemsResponse;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Impact API returned unexpected response: ${text.slice(0, 200)}`);
  }

  return {
    items: data.Items ?? [],
    totalPages: parseInt(data["@numpages"] || "1", 10),
  };
}

function parsePriceCents(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^0-9.]/g, "");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

export function impactItemToDeal(
  item: ImpactCatalogItem,
  sportId: string,
  equipmentTypeId: string,
  catalogSourceId?: string,
): InsertDeal | null {
  const currentPriceCents = parsePriceCents(item.CurrentPrice);
  const originalPriceCents = parsePriceCents(item.OriginalPrice);

  if (currentPriceCents <= 0) return null;

  const msrp = originalPriceCents > 0 ? originalPriceCents : currentPriceCents;
  let percentOff: string | null = null;

  if (originalPriceCents > 0 && currentPriceCents < originalPriceCents) {
    percentOff = (((originalPriceCents - currentPriceCents) / originalPriceCents) * 100).toFixed(3);
  }

  const itemAdvertiserSlug = (item.AdvertiserName || "impact")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const resolvedSourceId = catalogSourceId ?? `impact-${itemAdvertiserSlug}`;

  const availability = (item.StockAvailability || "").toLowerCase();
  if (availability.includes("out of stock") || availability.includes("unavailable")) {
    return null;
  }

  return {
    sourceId: resolvedSourceId,
    title: (item.Name || "").slice(0, 200),
    brand: item.Manufacturer || null,
    url: item.Url,
    imageUrl: item.ImageUrl || null,
    sportId,
    equipmentTypeId,
    condition: "new" as const,
    currency: item.Currency || "USD",
    msrpCents: msrp,
    manufacturerMsrpCents: null,
    msrpSource: "retailer" as const,
    msrpVerified: false,
    priceCents: currentPriceCents,
    percentOff,
    isBuyItNow: true,
    autoIncluded: false,
    autoIncludeRuleId: null,
    raw: {
      impactCatalogItemId: item.CatalogItemId,
      impactAdvertiserId: item.AdvertiserId,
      impactAdvertiser: item.AdvertiserName,
      impactGtin: item.Gtin,
      impactAsin: item.Asin,
    },
  };
}
