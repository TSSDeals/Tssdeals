import assert from "node:assert/strict";
import test from "node:test";
import { buildGmailAuthorizeUrl, normalizePromotionReviewStatus, normalizePromotionSenderStatus, parseGmailPromotion, promotionSenderKey } from "./gmail-promotion-sync";

test("Google authorization is read-only and locked to the promotion inbox", () => {
  const url = new URL(buildGmailAuthorizeUrl({ clientId: "client", redirectUri: "https://www.tssdeals.com/callback", state: "signed" }));
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.readonly");
  assert.equal(url.searchParams.get("login_hint"), "admin@tssdeals.com");
  assert.equal(url.searchParams.get("access_type"), "offline");
});

test("promotion review accepts only the three explicit workflow states", () => {
  assert.equal(normalizePromotionReviewStatus(" APPROVED "), "approved");
  assert.equal(normalizePromotionReviewStatus("rejected"), "rejected");
  assert.equal(normalizePromotionReviewStatus("pending"), "pending");
  assert.throws(() => normalizePromotionReviewStatus("active"), /pending, approved, or rejected/);
});

test("sender trust is independent from promotion approval", () => {
  assert.equal(normalizePromotionSenderStatus(" TRUSTED "), "trusted");
  assert.equal(normalizePromotionSenderStatus("blocked"), "blocked");
  assert.equal(normalizePromotionSenderStatus("pending"), "pending");
  assert.throws(() => normalizePromotionSenderStatus("approved"), /pending, trusted, or blocked/);
  assert.equal(promotionSenderKey({ senderDomain: " BaselineSports.US ", senderEmail: "deals@example.com" }), "baselinesports.us");
  assert.equal(promotionSenderKey({ senderEmail: " Deals@Example.com " }), "deals@example.com");
});

test("promotion email parsing captures sender, coupon, discount, and landing page", () => {
  const result = parseGmailPromotion({ id: "message-1", internalDate: "1786000000000", payload: {
    headers: [
      { name: "From", value: "Baseline Sports <deals@baselinesports.us>" },
      { name: "Subject", value: "Save 15% on baseball gloves with code TSS15" },
    ],
    mimeType: "text/plain", body: { data: Buffer.from("Shop now https://baselinesports.us/collections/gloves").toString("base64url") },
  }});
  assert.equal(result.senderDomain, "baselinesports.us");
  assert.equal(result.code, "TSS15");
  assert.equal(result.discountType, "percent");
  assert.equal(result.discountValue, "15");
  assert.equal(result.landingUrl, "https://baselinesports.us/collections/gloves");
});
