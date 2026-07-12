import type { IStorage } from "./storage";
import { getValidEbayUserToken } from "./ebay-reports";

const EBAY_INVENTORY_URL = "https://api.ebay.com/sell/inventory/v1";
const EBAY_OFFER_URL = "https://api.ebay.com/sell/inventory/v1/offer";
const EBAY_TAXONOMY_URL = "https://api.ebay.com/commerce/taxonomy/v1";

export interface EbayListingInput {
  title: string;
  description: string;
  price: number;
  condition: string;
  categoryName: string;
  imageUrls: string[];
  itemSpecifics: Record<string, string>;
  quantity?: number;
}

interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
}

async function suggestCategory(
  accessToken: string,
  query: string,
): Promise<CategorySuggestion | null> {
  const params = new URLSearchParams({ q: query });
  const url = `${EBAY_TAXONOMY_URL}/category_tree/0/get_category_suggestions?${params}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`eBay category suggestion error: ${response.status} ${text.slice(0, 300)}`);
    return null;
  }

  const data = await response.json();
  const suggestions = data.categorySuggestions;
  if (suggestions && suggestions.length > 0) {
    return {
      categoryId: suggestions[0].category.categoryId,
      categoryName: suggestions[0].category.categoryName,
    };
  }

  return null;
}

async function uploadImage(
  accessToken: string,
  imageBuffer: Buffer,
  filename: string,
): Promise<string | null> {
  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: "image/jpeg" });
  formData.append("file", blob, filename);

  const response = await fetch("https://api.ebay.com/commerce/media/v1_beta/create_upload_task", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.imageUrl || null;
}

export async function createEbayDraftListing(
  userId: string,
  storage: IStorage,
  input: EbayListingInput,
): Promise<{ success: boolean; sku?: string; offerId?: string; listingId?: string; error?: string }> {
  try {
    const accessToken = await getValidEbayUserToken(userId, storage);
    const sku = `TSS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const categorySuggestion = await suggestCategory(accessToken, input.categoryName || input.title);
    const categoryId = categorySuggestion?.categoryId || "888";

    const aspects: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(input.itemSpecifics || {})) {
      if (value) {
        aspects[key] = [value];
      }
    }

    const inventoryItem = {
      availability: {
        shipToLocationAvailability: {
          quantity: input.quantity || 1,
        },
      },
      condition: input.condition || "USED_EXCELLENT",
      product: {
        title: input.title,
        description: input.description,
        aspects,
        imageUrls: input.imageUrls.length > 0 ? input.imageUrls : undefined,
      },
    };

    const createItemRes = await fetch(`${EBAY_INVENTORY_URL}/inventory_item/${sku}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": "en-US",
      },
      body: JSON.stringify(inventoryItem),
    });

    if (!createItemRes.ok) {
      const errorText = await createItemRes.text();
      return { success: false, error: `Failed to create inventory item: ${createItemRes.status} ${errorText.slice(0, 500)}` };
    }

    const offer = {
      sku,
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      availableQuantity: input.quantity || 1,
      categoryId,
      listingDescription: input.description,
      listingPolicies: {
        fulfillmentPolicyId: undefined as string | undefined,
        paymentPolicyId: undefined as string | undefined,
        returnPolicyId: undefined as string | undefined,
      },
      pricingSummary: {
        price: {
          value: String(input.price.toFixed(2)),
          currency: "USD",
        },
      },
    };

    const policiesRes = await fetch(`https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (policiesRes.ok) {
      const policiesData = await policiesRes.json();
      if (policiesData.fulfillmentPolicies?.length > 0) {
        offer.listingPolicies.fulfillmentPolicyId = policiesData.fulfillmentPolicies[0].fulfillmentPolicyId;
      }
    }

    const paymentRes = await fetch(`https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id=EBAY_US`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (paymentRes.ok) {
      const paymentData = await paymentRes.json();
      if (paymentData.paymentPolicies?.length > 0) {
        offer.listingPolicies.paymentPolicyId = paymentData.paymentPolicies[0].paymentPolicyId;
      }
    }

    const returnRes = await fetch(`https://api.ebay.com/sell/account/v1/return_policy?marketplace_id=EBAY_US`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (returnRes.ok) {
      const returnData = await returnRes.json();
      if (returnData.returnPolicies?.length > 0) {
        offer.listingPolicies.returnPolicyId = returnData.returnPolicies[0].returnPolicyId;
      }
    }

    const createOfferRes = await fetch(EBAY_OFFER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": "en-US",
      },
      body: JSON.stringify(offer),
    });

    if (!createOfferRes.ok) {
      const errorText = await createOfferRes.text();
      return {
        success: true,
        sku,
        error: `Inventory item created but offer creation failed: ${createOfferRes.status} ${errorText.slice(0, 500)}. You may need to set up business policies on eBay first.`,
      };
    }

    const offerData = await createOfferRes.json();

    return {
      success: true,
      sku,
      offerId: offerData.offerId,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function publishEbayOffer(
  userId: string,
  storage: IStorage,
  offerId: string,
): Promise<{ success: boolean; listingId?: string; error?: string }> {
  try {
    const accessToken = await getValidEbayUserToken(userId, storage);

    const publishRes = await fetch(`${EBAY_OFFER_URL}/${offerId}/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!publishRes.ok) {
      const errorText = await publishRes.text();
      return { success: false, error: `Publish failed: ${publishRes.status} ${errorText.slice(0, 500)}` };
    }

    const data = await publishRes.json();
    return { success: true, listingId: data.listingId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export const EBAY_CONDITION_MAP: Record<string, string> = {
  "1000": "NEW",
  "1500": "NEW_OTHER",
  "2500": "SELLER_REFURBISHED",
  "3000": "USED_EXCELLENT",
  "7000": "FOR_PARTS_OR_NOT_WORKING",
};
