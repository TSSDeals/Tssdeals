import type { InsertDeal } from "@shared/schema";
import { reclassifyBattingGloves } from "./ebay-api";
import { classifyDealAttributes } from "./sub-filter-classifier";

// Creators API endpoints
// v3.x (LWA) uses api.amazon.com with JSON body and scope creatorsapi::default
// v2.x (Cognito) uses regional Cognito pools with form-encoded body and scope creatorsapi/default
const CREATORS_API_BASE = "https://creatorsapi.amazon/catalog/v1";
const CREATORS_API_VERSION = process.env.AMAZON_CREDENTIAL_VERSION || "3.1";

function getTokenEndpoint(version: string): string {
  switch (version) {
    case "2.1": return "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token";
    case "2.2": return "https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token";
    case "2.3": return "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token";
    case "3.1": return "https://api.amazon.com/auth/o2/token";
    case "3.2": return "https://api.amazon.co.uk/auth/o2/token";
    case "3.3": return "https://api.amazon.co.jp/auth/o2/token";
    default: return "https://api.amazon.com/auth/o2/token";
  }
}

function isLwa(version: string): boolean {
  return version.startsWith("3.");
}

function getScope(version: string): string {
  return isLwa(version) ? "creatorsapi::default" : "creatorsapi/default";
}

let cachedOAuth2Token: { token: string; expiresAt: number } | null = null;

export async function getAmazonOAuth2Token(credentialId: string, credentialSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedOAuth2Token && cachedOAuth2Token.expiresAt > now + 60_000) {
    return cachedOAuth2Token.token;
  }

  const version = CREATORS_API_VERSION;
  const tokenUrl = getTokenEndpoint(version);
  const scope = getScope(version);

  let response: Response;
  if (isLwa(version)) {
    // v3.x LWA: JSON body with client_id/client_secret in body
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: credentialId,
        client_secret: credentialSecret,
        scope,
      }),
    });
  } else {
    // v2.x Cognito: form-encoded body with Basic auth header
    const basicAuth = Buffer.from(`${credentialId}:${credentialSecret}`).toString("base64");
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope }).toString(),
    });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Amazon Creators API token error ${response.status}: ${text.slice(0, 400)}`);
  }

  let data: { access_token: string; expires_in: number };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Amazon Creators API token unexpected response: ${text.slice(0, 200)}`);
  }

  cachedOAuth2Token = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  console.log(`[amazon] Creators API token obtained (expires in ${data.expires_in}s)`);
  return cachedOAuth2Token.token;
}

// Creators API uses camelCase response fields
interface CreatorsPrice {
  amount: number;
  currency: string;
  displayAmount: string;
}

interface CreatorsItem {
  asin: string;
  detailPageURL: string;
  images?: {
    primary?: {
      large?: { url: string; height: number; width: number };
      medium?: { url: string; height: number; width: number };
      small?: { url: string; height: number; width: number };
    };
  };
  itemInfo?: {
    title?: { displayValue: string };
    byLineInfo?: {
      brand?: { displayValue: string };
      manufacturer?: { displayValue: string };
    };
    features?: { displayValues: string[] };
    classifications?: {
      binding?: { displayValue: string };
      productGroup?: { displayValue: string };
    };
  };
  offersV2?: {
    listings?: Array<{
      price?: CreatorsPrice;
      savingBasis?: CreatorsPrice;
      condition?: { value: string };
      availability?: { message: string };
    }>;
  };
  parentASIN?: string;
}

interface CreatorsSearchResponse {
  searchResult?: {
    items: CreatorsItem[];
    totalResultCount: number;
    searchURL?: string;
  };
  errors?: Array<{
    type: string;
    message: string;
    reason?: string;
  }>;
}

interface AmazonSyncOptions {
  keywords: string;
  sportId: string;
  equipmentTypeId: string;
  searchIndex?: string;
  maxResults?: number;
  page?: number;
  browseNodeId?: string;
}

const AMAZON_SPORT_BROWSE_NODES: Record<string, { nodeId: string; label: string }[]> = {
  baseball: [{ nodeId: "3403841", label: "Baseball & Softball" }],
  "fastpitch-softball": [{ nodeId: "3403841", label: "Baseball & Softball" }],
  "slowpitch-softball": [{ nodeId: "3403841", label: "Baseball & Softball" }],
  basketball: [{ nodeId: "3403851", label: "Basketball" }],
  football: [{ nodeId: "3403861", label: "Football" }],
  golf: [{ nodeId: "3403871", label: "Golf" }],
  hockey: [{ nodeId: "3403881", label: "Hockey" }],
  soccer: [{ nodeId: "3403921", label: "Soccer" }],
  tennis: [{ nodeId: "3403931", label: "Tennis & Racquet Sports" }],
  swimming: [{ nodeId: "3403941", label: "Swimming" }],
  running: [{ nodeId: "3403911", label: "Running" }],
  volleyball: [{ nodeId: "3403961", label: "Volleyball" }],
  wrestling: [{ nodeId: "3403971", label: "Wrestling" }],
  cycling: [{ nodeId: "3403859", label: "Cycling" }],
  lacrosse: [{ nodeId: "3403891", label: "Lacrosse" }],
  fishing: [{ nodeId: "1285916", label: "Fishing" }],
  gymnastics: [{ nodeId: "3403875", label: "Gymnastics" }],
  rugby: [{ nodeId: "3403915", label: "Rugby" }],
  cheerleading: [{ nodeId: "3403855", label: "Cheerleading" }],
};

export function getAmazonSportBrowseNodes(): Record<string, { nodeId: string; label: string }[]> {
  return AMAZON_SPORT_BROWSE_NODES;
}

// Kept for scheduler compatibility — oauth2 mode only going forward
export type AmazonAuth =
  | { mode: "oauth2"; bearerToken: string }
  | { mode: "sigv4"; accessKey: string; secretKey: string };

export async function searchAmazonProducts(
  auth: AmazonAuth,
  partnerTag: string,
  options: AmazonSyncOptions,
): Promise<CreatorsItem[]> {
  if (auth.mode !== "oauth2") {
    throw new Error("Amazon Creators API only supports OAuth2 auth. SigV4 is no longer supported.");
  }

  // Creators API uses camelCase parameters
  const requestBody: Record<string, unknown> = {
    keywords: options.keywords,
    partnerTag,
    partnerType: "Associates",
    searchIndex: options.searchIndex || "SportingGoods",
    itemCount: 10,
    itemPage: options.page ?? 1,
    marketplace: "www.amazon.com",
    resources: [
      "images.primary.large",
      "images.primary.medium",
      "itemInfo.title",
      "itemInfo.byLineInfo",
      "itemInfo.classifications",
      "offersV2.listings.price",
      "offersV2.listings.savingBasis",
      "offersV2.listings.condition",
      "offersV2.listings.availability",
    ],
  };
  if (options.browseNodeId) {
    requestBody.browseNodeId = options.browseNodeId;
  }

  const payload = JSON.stringify(requestBody);

  // v3.x (LWA): plain "Bearer {token}" — no Version suffix
  // v2.x (Cognito): "Bearer {token}, Version {version}"
  const authHeader = isLwa(CREATORS_API_VERSION)
    ? `Bearer ${auth.bearerToken}`
    : `Bearer ${auth.bearerToken}, Version ${CREATORS_API_VERSION}`;

  const response = await fetch(`${CREATORS_API_BASE}/searchItems`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      "x-marketplace": "www.amazon.com",
    },
    body: payload,
  });

  const text = await response.text();

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Amazon Creators API rate limit exceeded.");
    }
    if (response.status === 403) {
      throw new Error(`Amazon Creators API AccessDenied ${response.status}: ${text.slice(0, 300)}`);
    }
    throw new Error(`Amazon Creators API error ${response.status}: ${text.slice(0, 300)}`);
  }

  let data: CreatorsSearchResponse;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Amazon Creators API unexpected response: ${text.slice(0, 200)}`);
  }

  if (data.errors?.length) {
    const errMsg = data.errors.map(e => `${e.type}: ${e.message}`).join(", ");
    if (data.errors.some(e => e.type === "AccessDeniedException")) {
      throw new Error(`Amazon Creators API AccessDenied: ${errMsg}`);
    }
    throw new Error(`Amazon Creators API error: ${errMsg}`);
  }

  return data.searchResult?.items ?? [];
}

export async function searchAmazonProductsAllPages(
  auth: AmazonAuth,
  partnerTag: string,
  options: Omit<AmazonSyncOptions, "page">,
  maxPages = 10,
  delayMs = 1100,
): Promise<CreatorsItem[]> {
  const allItems: CreatorsItem[] = [];
  for (let page = 1; page <= Math.min(maxPages, 10); page++) {
    const items = await searchAmazonProducts(auth, partnerTag, { ...options, page });
    allItems.push(...items);
    if (items.length < 10) break;
    if (page < Math.min(maxPages, 10)) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return allItems;
}

export function amazonItemToDeal(
  item: CreatorsItem,
  sportId: string,
  equipmentTypeId: string,
): InsertDeal | null {
  const listing = item.offersV2?.listings?.[0];
  if (!listing?.price) return null;

  const priceCents = Math.round((listing.price.amount || 0) * 100);
  if (priceCents <= 0) return null;

  const msrpCents = listing.savingBasis
    ? Math.round((listing.savingBasis.amount || 0) * 100)
    : priceCents;

  let percentOff: string | null = null;
  if (msrpCents > priceCents) {
    percentOff = (((msrpCents - priceCents) / msrpCents) * 100).toFixed(3);
  }

  const conditionVal = (listing.condition?.value || "").toLowerCase();
  const condition: "new" | "preowned" =
    conditionVal === "used" || conditionVal === "refurbished" ? "preowned" : "new";

  const title = item.itemInfo?.title?.displayValue || "";
  const brand = item.itemInfo?.byLineInfo?.brand?.displayValue
    || item.itemInfo?.byLineInfo?.manufacturer?.displayValue
    || null;
  const imageUrl = item.images?.primary?.large?.url
    || item.images?.primary?.medium?.url
    || null;

  const finalEquipmentTypeId = reclassifyBattingGloves(title, sportId, equipmentTypeId);
  const { subFilterId, dropWeight, sizeNumber } = classifyDealAttributes(title, finalEquipmentTypeId);

  return {
    sourceId: "amazon",
    title: title.slice(0, 200),
    brand,
    url: item.detailPageURL,
    imageUrl,
    sportId,
    equipmentTypeId: finalEquipmentTypeId,
    subFilterId,
    dropWeight,
    sizeNumber,
    condition,
    currency: listing.price.currency || "USD",
    msrpCents,
    manufacturerMsrpCents: null,
    msrpSource: "retailer" as const,
    msrpVerified: false,
    priceCents,
    percentOff,
    isBuyItNow: true,
    autoIncluded: false,
    autoIncludeRuleId: null,
    raw: {
      amazonAsin: item.asin,
    },
  };
}

export function getAmazonSportKeywords(): Record<string, string[]> {
  return {
    baseball: ["baseball bat", "baseball glove", "batting gloves", "baseball cleats"],
    "fastpitch-softball": ["fastpitch bat", "softball glove"],
    "slowpitch-softball": ["slowpitch bat", "slowpitch glove"],
    golf: ["golf driver", "golf irons", "golf putter", "golf balls"],
    basketball: ["basketball shoes", "basketball"],
    lacrosse: ["lacrosse stick", "lacrosse helmet"],
    soccer: ["soccer cleats", "soccer ball"],
    football: ["football helmet", "football cleats", "football gloves"],
    fishing: ["fishing rod", "fishing reel"],
    hockey: ["hockey stick", "hockey skates", "hockey pads"],
    running: ["running shoes", "trail running shoes"],
    swimming: ["swim goggles", "swim fins", "swimsuit"],
    tennis: ["tennis racket", "tennis shoes"],
    volleyball: ["volleyball", "volleyball knee pads"],
    cycling: ["bike helmet", "cycling shoes", "bicycle"],
    wrestling: ["wrestling shoes", "wrestling headgear"],
    gymnastics: ["gymnastics grips", "gymnastics mat"],
    rugby: ["rugby cleats", "rugby ball"],
    pickleball: ["pickleball paddle", "pickleball"],
    "field-hockey": ["field hockey stick", "field hockey goggles"],
  };
}
