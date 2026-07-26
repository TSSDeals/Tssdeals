import assert from "node:assert/strict";
import test from "node:test";
import {
  CJ_PROMOTION_TYPES,
  parseCJLinkSearchJson,
  parseCJLinkSearchXml,
  parseCJPromotionDate,
} from "./cj-promotions";

test("CJ promotion sync covers coupons and code-free promotional links", () => {
  assert.deepEqual(CJ_PROMOTION_TYPES, [
    "coupon",
    "sale/discount",
    "free shipping",
    "seasonal link",
  ]);
});

test("CJ promotion dates safely support ongoing and malformed values", () => {
  assert.equal(parseCJPromotionDate("ongoing"), null);
  assert.equal(parseCJPromotionDate(""), null);
  assert.equal(parseCJPromotionDate("not-a-date"), null);
  assert.equal(parseCJPromotionDate("07/26/2026")?.getFullYear(), 2026);
});

test("CJ Link Search XML parsing preserves tracking URLs and optional coupon codes", () => {
  const xml = `<?xml version="1.0"?>
    <cj-api><links>
      <link>
        <link-id>123</link-id>
        <advertiser-id>7345657</advertiser-id>
        <advertiser-name>DICK&apos;S Sporting Goods</advertiser-name>
        <promotion-type>coupon</promotion-type>
        <coupon-code>SAVE20</coupon-code>
        <description><![CDATA[20% off select equipment]]></description>
        <clickURL><![CDATA[https://www.anrdoezrs.net/click-1-2?sid=a%2Bb&url=https%3A%2F%2Fexample.com]]></clickURL>
      </link>
      <link>
        <link-id>124</link-id>
        <advertiser-name>DICK'S Sporting Goods</advertiser-name>
        <promotion-type>free shipping</promotion-type>
        <coupon-code></coupon-code>
        <link-name>Free shipping over $65</link-name>
        <click-url>https://www.jdoqocy.com/click-1-3</click-url>
      </link>
    </links></cj-api>`;

  const parsed = parseCJLinkSearchXml(xml);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].couponCode, "SAVE20");
  assert.equal(
    parsed[0].clickUrl,
    "https://www.anrdoezrs.net/click-1-2?sid=a%2Bb&url=https%3A%2F%2Fexample.com",
  );
  assert.equal(parsed[1].couponCode, "");
  assert.equal(parsed[1].description, "Free shipping over $65");
});

test("CJ Link Search JSON parsing accepts API field names", () => {
  const [promotion] = parseCJLinkSearchJson({
    links: [{
      "link-id": "9",
      "advertiser-id": "7345657",
      "advertiser-name": "DICK'S Sporting Goods",
      "promotion-type": "sale/discount",
      "coupon-code": "",
      description: "Summer clearance",
      clickURL: "https://example.test/tracking",
    }],
  });

  assert.equal(promotion.promotionType, "sale/discount");
  assert.equal(promotion.couponCode, "");
  assert.equal(promotion.clickUrl, "https://example.test/tracking");
});
