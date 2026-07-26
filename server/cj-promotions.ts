export const CJ_LINK_SEARCH_URL = "https://link-search.api.cj.com/v2/link-search";

export const CJ_PROMOTION_TYPES = [
  "coupon",
  "sale/discount",
  "free shipping",
  "seasonal link",
] as const;

export interface CJPromotion {
  id: string;
  promotionType: string;
  couponCode: string;
  promotionStartDate: string;
  promotionEndDate: string;
  clickUrl: string;
  description: string;
  advertiserName: string;
  advertiserId: string;
  status: string;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function xmlValue(block: string, ...tags: string[]): string {
  for (const tag of tags) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(
      `<${escaped}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${escaped}>`,
      "i",
    ).exec(block);
    const value = (match?.[1] ?? match?.[2] ?? "").trim();
    if (value) return decodeXml(value);
  }
  return "";
}

export function parseCJLinkSearchXml(xml: string): CJPromotion[] {
  const promotions: CJPromotion[] = [];
  const linkRegex = /<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(xml)) !== null) {
    const block = match[1];
    const description = xmlValue(block, "description") || xmlValue(block, "link-name");
    promotions.push({
      id: xmlValue(block, "link-id", "id"),
      promotionType: xmlValue(block, "promotion-type"),
      couponCode: xmlValue(block, "coupon-code"),
      promotionStartDate: xmlValue(block, "promotion-start-date"),
      promotionEndDate: xmlValue(block, "promotion-end-date"),
      clickUrl: xmlValue(block, "clickURL", "click-url"),
      description,
      advertiserName: xmlValue(block, "advertiser-name"),
      advertiserId: xmlValue(block, "advertiser-id"),
      status: xmlValue(block, "relationship-status"),
    });
  }

  return promotions;
}

export function parseCJLinkSearchJson(payload: any): CJPromotion[] {
  const links = payload?.links ?? payload?.data?.links ?? payload?.data ?? [];
  if (!Array.isArray(links)) return [];

  return links.map((link: any) => ({
    id: String(link["link-id"] ?? link.linkId ?? link.id ?? ""),
    promotionType: String(link["promotion-type"] ?? link.promotionType ?? ""),
    couponCode: String(link["coupon-code"] ?? link.couponCode ?? ""),
    promotionStartDate: String(link["promotion-start-date"] ?? link.promotionStartDate ?? ""),
    promotionEndDate: String(link["promotion-end-date"] ?? link.promotionEndDate ?? ""),
    clickUrl: String(link.clickURL ?? link["click-url"] ?? link.clickUrl ?? ""),
    description: String(link.description ?? link["link-name"] ?? link.linkName ?? ""),
    advertiserName: String(link["advertiser-name"] ?? link.advertiserName ?? ""),
    advertiserId: String(link["advertiser-id"] ?? link.advertiserId ?? ""),
    status: String(link["relationship-status"] ?? link.relationshipStatus ?? ""),
  }));
}

export function parseCJPromotionDate(value: string): Date | null {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "ongoing") return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
