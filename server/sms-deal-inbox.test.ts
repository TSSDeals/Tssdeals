import assert from "node:assert/strict";
import test from "node:test";
import { approvedDealSmsSenders, extractDealUrls, normalizeSmsPhone, parseSmsDealHints, processSmsDealUrl, smsDealReply, twilioMediaProxyPath } from "./sms-deal-inbox";

test("normalizes and restricts deal inbox senders", () => {
  assert.equal(normalizeSmsPhone("865-919-3419"), "+18659193419");
  const approved = approvedDealSmsSenders();
  assert.equal(approved.has("+18659193419"), true);
  assert.equal(approved.has("+18654688946"), true);
  assert.equal(approved.has("+15555555555"), false);
});

test("extracts unique product links and removes message punctuation", () => {
  assert.deepEqual(extractDealUrls("ADD https://example.com/deal?x=1. Also https://example.com/deal?x=1"), [
    "https://example.com/deal?x=1",
  ]);
});

test("escapes SMS replies as valid TwiML", () => {
  assert.equal(smsDealReply("A & B <deal>"), "<Response><Message>A &amp; B &lt;deal&gt;</Message></Response>");
});

test("parses manual title and price hints for retailer pages that block previews", () => {
  assert.deepEqual(
    parseSmsDealHints("$34.99 Wilson A2000 1786 https://a.co/d/example"),
    { title: "Wilson A2000 1786", priceCents: 3499 },
  );
});

test("accepts only a canonical Twilio MMS image URL for the deal image proxy", () => {
  const messageSid = `SM${"a".repeat(32)}`;
  const mediaSid = `ME${"b".repeat(32)}`;
  assert.equal(
    twilioMediaProxyPath(`https://api.twilio.com/2010-04-01/Accounts/AC${"c".repeat(32)}/Messages/${messageSid}/Media/${mediaSid}`),
    `/api/sms-deal-media/${messageSid}/${mediaSid}`,
  );
  assert.equal(twilioMediaProxyPath("https://example.com/not-twilio.jpg"), null);
  assert.equal(twilioMediaProxyPath("https://api.twilio.com/invalid"), null);
});

test("verified links become featured deals through the bounded inbox pipeline", async () => {
  let captured: any;
  const result = await processSmsDealUrl("https://example.com/wilson-a2k", {
    getPreview: async () => ({
      title: "Wilson A2K 1786 Baseball Glove",
      description: "11.5 inch right hand throw fielding glove",
      images: ["https://example.com/glove.jpg"],
      priceCents: 29999,
      currency: "USD",
    }),
    ensureSource: async () => undefined,
    upsert: async (deals, label) => {
      captured = { deal: deals[0], label };
      return { created: 1, updated: 0 };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(captured.label, "sms-deal-inbox");
  assert.equal(captured.deal.isFeatured, true);
  assert.equal(captured.deal.autoIncluded, true);
  assert.equal(captured.deal.priceCents, 29999);
  assert.equal(captured.deal.raw.submittedVia, "sms-deal-inbox");
});

test("unverifiable links never create a deal", async () => {
  let upserted = false;
  const result = await processSmsDealUrl("https://example.com/no-price", {
    getPreview: async () => ({ title: "Product", description: null, images: [], priceCents: null, currency: null }),
    ensureSource: async () => undefined,
    upsert: async () => {
      upserted = true;
      return { created: 0, updated: 0 };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(upserted, false);
});

test("manual hints safely recover a blocked Amazon product preview", async () => {
  let captured: any;
  const result = await processSmsDealUrl("https://a.co/d/example", {
    getPreview: async () => ({ title: null, description: null, images: [], priceCents: null, currency: null }),
    ensureSource: async () => undefined,
    upsert: async (deals) => {
      captured = deals[0];
      return { created: 1, updated: 0 };
    },
  }, { title: "Rawlings Pro Preferred 11.5 Glove", priceCents: 29999 });
  assert.equal(result.ok, true);
  assert.equal(captured.sourceId, "amazon");
  assert.equal(captured.title, "Rawlings Pro Preferred 11.5 Glove");
  assert.equal(captured.priceCents, 29999);
});

test("an attached MMS photo overrides a blocked retailer image", async () => {
  let captured: any;
  await processSmsDealUrl("https://a.co/d/example", {
    getPreview: async () => ({ title: null, description: null, images: [], priceCents: null, currency: null }),
    ensureSource: async () => undefined,
    upsert: async (deals) => {
      captured = deals[0];
      return { created: 1, updated: 0 };
    },
  }, {
    title: "Wilson A2000 1810",
    priceCents: 16231,
    imageUrl: "/api/sms-deal-media/SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/MEbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  });
  assert.equal(captured.imageUrl, "/api/sms-deal-media/SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/MEbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(captured.raw.submittedImageUrl, captured.imageUrl);
});
