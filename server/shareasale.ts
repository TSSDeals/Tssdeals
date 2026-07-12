import crypto from "crypto";
import type { InsertDeal } from "@shared/schema";

const SHAREASALE_API_URL = "https://api.shareasale.com/x.cfm";

interface ShareASaleProduct {
  ProductID: string;
  Name: string;
  MerchantID: string;
  Merchant: string;
  URL: string;
  ImageURL: string;
  Price: string;
  RetailPrice: string;
  Category: string;
  SubCategory: string;
  Description: string;
  Custom1: string;
  Custom2: string;
  Custom3: string;
  Custom4: string;
  Custom5: string;
  LastUpdated: string;
  Status: string;
  Manufacturer: string;
  PartNumber: string;
  MerchantCategory: string;
  MerchantSubcategory: string;
  ShortDescription: string;
  ISBN: string;
  UPC: string;
  SKU: string;
  CrossSell: string;
  MerchantGroup: string;
  MerchantSubgroup: string;
  CompatibleWith: string;
  CompareTo: string;
  QuantityDiscount: string;
  Bestseller: string;
  AddToCartURL: string;
  MobileURL: string;
  Keywords: string;
}

interface ShareASaleSyncOptions {
  keyword: string;
  sportId: string;
  equipmentTypeId: string;
  merchantId?: string;
  maxResults?: number;
}

function buildAuthHeaders(affiliateId: string, token: string, secret: string, action: string): Record<string, string> {
  const timestamp = new Date().toUTCString();
  const sigString = `${token}:${timestamp}:${action}:${secret}`;
  const sig = crypto.createHash("sha256").update(sigString).digest("hex");

  return {
    "x-ShareASale-Date": timestamp,
    "x-ShareASale-Authentication": sig,
    "x-ShareASale-QID": affiliateId,
  };
}

export async function searchShareASaleProducts(
  affiliateId: string,
  token: string,
  secret: string,
  options: ShareASaleSyncOptions,
): Promise<ShareASaleProduct[]> {
  const action = "getProducts";
  const headers = buildAuthHeaders(affiliateId, token, secret, action);

  const params = new URLSearchParams({
    affiliateId,
    token,
    action,
    version: "2.3",
    XMLFormat: "1",
    keyword: options.keyword,
  });

  if (options.merchantId) {
    params.set("merchantID", options.merchantId);
  }

  const url = `${SHAREASALE_API_URL}?${params.toString()}`;

  const response = await fetch(url, { headers });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`ShareASale API error ${response.status}: ${text.slice(0, 300)}`);
  }

  if (text.includes("Error Code")) {
    throw new Error(`ShareASale API error: ${text.slice(0, 500)}`);
  }

  return parseShareASaleXML(text, options.maxResults ?? 100);
}

function parseShareASaleXML(xml: string, maxResults: number): ShareASaleProduct[] {
  const products: ShareASaleProduct[] = [];

  const productBlocks = xml.split(/<product>/i).slice(1);

  for (const block of productBlocks.slice(0, maxResults)) {
    const get = (tag: string): string => {
      const match = block.match(new RegExp(`<${tag}><!\\[CDATA\\[(.+?)\\]\\]></${tag}>`, "is"))
        || block.match(new RegExp(`<${tag}>(.+?)</${tag}>`, "is"));
      return match?.[1]?.trim() ?? "";
    };

    products.push({
      ProductID: get("productid") || get("ProductID"),
      Name: get("name") || get("Name") || get("productname"),
      MerchantID: get("merchantid") || get("MerchantID"),
      Merchant: get("merchant") || get("Merchant"),
      URL: get("url") || get("URL") || get("producturl"),
      ImageURL: get("imageurl") || get("ImageURL") || get("imageURL"),
      Price: get("price") || get("Price"),
      RetailPrice: get("retailprice") || get("RetailPrice"),
      Category: get("category") || get("Category"),
      SubCategory: get("subcategory") || get("SubCategory"),
      Description: get("description") || get("Description"),
      Custom1: get("custom1") || get("Custom1"),
      Custom2: get("custom2") || get("Custom2"),
      Custom3: get("custom3") || get("Custom3"),
      Custom4: get("custom4") || get("Custom4"),
      Custom5: get("custom5") || get("Custom5"),
      LastUpdated: get("lastupdated") || get("LastUpdated"),
      Status: get("status") || get("Status"),
      Manufacturer: get("manufacturer") || get("Manufacturer"),
      PartNumber: get("partnumber") || get("PartNumber"),
      MerchantCategory: get("merchantcategory") || get("MerchantCategory"),
      MerchantSubcategory: get("merchantsubcategory") || get("MerchantSubcategory"),
      ShortDescription: get("shortdescription") || get("ShortDescription"),
      ISBN: get("isbn") || get("ISBN"),
      UPC: get("upc") || get("UPC"),
      SKU: get("sku") || get("SKU"),
      CrossSell: get("crosssell") || get("CrossSell"),
      MerchantGroup: get("merchantgroup") || get("MerchantGroup"),
      MerchantSubgroup: get("merchantsubgroup") || get("MerchantSubgroup"),
      CompatibleWith: get("compatiblewith") || get("CompatibleWith"),
      CompareTo: get("compareto") || get("CompareTo"),
      QuantityDiscount: get("quantitydiscount") || get("QuantityDiscount"),
      Bestseller: get("bestseller") || get("Bestseller"),
      AddToCartURL: get("addtocarturl") || get("AddToCartURL"),
      MobileURL: get("mobileurl") || get("MobileURL"),
      Keywords: get("keywords") || get("Keywords"),
    });
  }

  return products;
}

function parsePriceCents(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^0-9.]/g, "");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

export function shareASaleProductToDeal(
  product: ShareASaleProduct,
  sportId: string,
  equipmentTypeId: string,
): InsertDeal | null {
  const priceCents = parsePriceCents(product.Price);
  const retailPriceCents = parsePriceCents(product.RetailPrice);

  if (priceCents <= 0) return null;

  const msrp = retailPriceCents > 0 ? retailPriceCents : priceCents;
  let percentOff: string | null = null;

  if (retailPriceCents > 0 && priceCents < retailPriceCents) {
    percentOff = (((retailPriceCents - priceCents) / retailPriceCents) * 100).toFixed(3);
  }

  const merchantSlug = (product.Merchant || "shareasale")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    sourceId: `sas-${merchantSlug}`,
    title: (product.Name || "").slice(0, 200),
    brand: product.Manufacturer || null,
    url: product.URL,
    imageUrl: product.ImageURL || null,
    sportId,
    equipmentTypeId,
    condition: "new" as const,
    currency: "USD",
    msrpCents: msrp,
    manufacturerMsrpCents: null,
    msrpSource: "retailer" as const,
    msrpVerified: false,
    priceCents,
    percentOff,
    isBuyItNow: true,
    autoIncluded: false,
    autoIncludeRuleId: null,
    raw: {
      shareASaleProductId: product.ProductID,
      shareASaleMerchantId: product.MerchantID,
      shareASaleMerchant: product.Merchant,
      shareASaleUPC: product.UPC,
      shareASaleSKU: product.SKU,
    },
  };
}

export function getShareASaleSportKeywords(): Record<string, string[]> {
  return {
    baseball: ["baseball bat", "baseball glove", "batting gloves"],
    "fastpitch-softball": ["fastpitch bat", "softball glove"],
    "slowpitch-softball": ["slowpitch bat", "softball"],
    golf: ["golf clubs", "golf balls", "golf bag"],
    basketball: ["basketball shoes", "basketball"],
    lacrosse: ["lacrosse stick", "lacrosse helmet"],
    soccer: ["soccer cleats", "soccer ball"],
    football: ["football helmet", "football cleats"],
    fishing: ["fishing rod", "fishing reel"],
    volleyball: ["volleyball shoes", "volleyball"],
    wrestling: ["wrestling shoes"],
    hockey: ["hockey stick", "hockey skates"],
    cycling: ["bicycle", "cycling helmet"],
    gymnastics: ["gymnastics leotard"],
    cheerleading: ["cheerleading shoes"],
    rugby: ["rugby ball"],
    swimming: ["swim goggles", "swimsuit"],
    running: ["running shoes", "trail shoes", "running shorts"],
  };
}
