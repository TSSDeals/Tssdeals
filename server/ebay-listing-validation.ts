export const EBAY_LISTING_CONDITIONS: Record<string, string> = {
  "1000": "NEW",
  "1500": "NEW_OTHER",
  "2500": "SELLER_REFURBISHED",
  "3000": "USED_GOOD",
  "7000": "FOR_PARTS_OR_NOT_WORKING",
};

export interface EbayListingCreatePayload {
  title: string;
  description: string;
  price: number;
  condition: string;
  categoryName: string;
  imageUrls: string[];
  itemSpecifics: Record<string, string>;
  quantity: number;
}

export function sanitizeListingHtml(value: string): string {
  return value
    .replace(/<\/?(?:script|style|iframe|object|embed|form|input|button|meta|link)\b[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "");
}

export function validateListingCreatePayload(body: unknown):
  | { ok: true; value: EbayListingCreatePayload }
  | { ok: false; errors: string[] } {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const errors: string[] = [];
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const rawDescription = typeof input.description === "string" ? input.description.trim() : "";
  const price = typeof input.price === "number" ? input.price : Number(input.price);
  const quantity = typeof input.quantity === "number" ? input.quantity : Number(input.quantity ?? 1);
  const conditionId = typeof input.conditionId === "string" ? input.conditionId : "";
  const categoryName = typeof input.categoryName === "string" ? input.categoryName.trim() : "";
  const imageUrls = Array.isArray(input.imageUrls)
    ? input.imageUrls.filter((url): url is string => typeof url === "string")
    : [];
  const itemSpecifics = input.itemSpecifics && typeof input.itemSpecifics === "object" && !Array.isArray(input.itemSpecifics)
    ? Object.fromEntries(Object.entries(input.itemSpecifics as Record<string, unknown>)
      .filter(([key, value]) => key.trim() && typeof value === "string" && value.trim())
      .map(([key, value]) => [key.trim(), (value as string).trim()]))
    : {};

  if (!title) errors.push("Title is required.");
  if (title.length > 80) errors.push("Title must be 80 characters or fewer.");
  if (!rawDescription) errors.push("Description is required.");
  if (!Number.isFinite(price) || price <= 0) errors.push("Price must be a positive number confirmed by the seller.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) errors.push("Quantity must be an integer from 1 to 99.");
  if (!EBAY_LISTING_CONDITIONS[conditionId]) errors.push("Select an explicit valid condition.");
  if (!categoryName) errors.push("Category is required.");
  if (imageUrls.length === 0) errors.push("At least one item photo is required.");
  if (imageUrls.length > 12) errors.push("A maximum of 12 item photos is allowed.");
  if (imageUrls.some((url) => !/^data:image\/(?:jpeg|png|webp);base64,/i.test(url) && !/^https:\/\//i.test(url))) {
    errors.push("Every photo must be a valid uploaded image or HTTPS image URL.");
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      description: sanitizeListingHtml(rawDescription),
      price,
      condition: EBAY_LISTING_CONDITIONS[conditionId],
      categoryName,
      imageUrls,
      itemSpecifics,
      quantity,
    },
  };
}
