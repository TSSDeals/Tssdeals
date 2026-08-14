import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyGolfClubProduct,
  isGolfClubAccessoryOnly,
} from "./golf-product-classifier";
import { ebayItemToDeal, type EbayItemSummary } from "./ebay-api";
import { cjProductToDeal } from "./cj-affiliate";

test("classifies the main golf club forms into shopper categories", () => {
  assert.equal(classifyGolfClubProduct("TaylorMade Qi35 Max Driver 10.5 Stiff")?.equipmentTypeId, "golf-drivers");
  assert.equal(classifyGolfClubProduct("Callaway Elyte 3 Wood RH Regular")?.equipmentTypeId, "golf-irons");
  assert.equal(classifyGolfClubProduct("Ping G440 4 Hybrid 23 Degree")?.equipmentTypeId, "golf-irons");
  assert.equal(classifyGolfClubProduct("Mizuno JPX 925 Iron Set 5-PW, GW")?.equipmentTypeId, "golf-iron-sets");
  assert.equal(classifyGolfClubProduct("Titleist Vokey SM10 56 Degree Wedge")?.equipmentTypeId, "golf-wedges");
  assert.equal(classifyGolfClubProduct("Scotty Cameron Phantom 5.5 Putter")?.equipmentTypeId, "golf-putters");
  assert.equal(classifyGolfClubProduct("PING G430 MAX 10K 9° RH Stiff")?.equipmentTypeId, "golf-drivers");
  assert.equal(classifyGolfClubProduct("TaylorMade Qi10 3W Ventus Regular")?.equipmentTypeId, "golf-irons");
  assert.equal(classifyGolfClubProduct("Odyssey Ai-One Seven 34 inch")?.equipmentTypeId, "golf-putters");
});

test("keeps driving irons out of the driver category", () => {
  assert.equal(classifyGolfClubProduct("Titleist U505 3 Driving Iron")?.equipmentTypeId, "golf-irons");
});

test("rejects golf accessories, replacement shafts, and tool drivers", () => {
  const rejected = [
    "TaylorMade Qi10 Driver Headcover",
    "Ventus Blue Driver Shaft Stiff",
    "Golf Club Brush and Groove Cleaner",
    "Golf Pride Putter Grip Kit",
    "Callaway Driver Adapter Sleeve",
    "TaylorMade Qi10 Driver Head Only 10.5 Degree",
    "Callaway Paradym Triple Diamond Driver Head",
    "20V Cordless Impact Driver Tool Set",
    "Golf Rangefinder with Slope",
    "Set of 10 Neoprene Golf Iron Covers",
    "Golf Club Groove Sharpener Cleaning Tool",
    "Golf Swing Trainer Alignment Sticks",
    "Golf Club Extension Kit and Regripping Station",
    "Golf Club Loft and Lie Machine",
  ];
  for (const title of rejected) {
    assert.equal(classifyGolfClubProduct(title), null, title);
  }
  assert.equal(isGolfClubAccessoryOnly("Titleist Golf Towel"), true);
});

test("rejects non-golf hybrid products and compact model collisions", () => {
  for (const title of [
    "Valor Hybrid BBCOR Certified -3 Baseball Bat 33 30oz",
    "Spiderz Hybrid Custom Baseball Softball Batting Gloves",
    "Women's Navigator Hybrid Jacket Size XL",
    "TravisMathew Polo Shirt Mens XL Jasper Park Lodge Golf Club",
    "2026 Bettinardi BB-8W Milled Putter Golf Club",
    "MLB Los Angeles Dodgers Lucky Cat Driver Cover",
  ]) {
    const result = classifyGolfClubProduct(title);
    if (/Bettinardi/.test(title)) {
      assert.equal(result?.equipmentTypeId, "golf-putters");
    } else {
      assert.equal(result, null, title);
    }
  }
});

test("rejects generic set and Spider names without golf evidence", () => {
  assert.equal(classifyGolfClubProduct("Warrior Ritual G6 E+ Custom Regular Goalie Full Set"), null);
  assert.equal(classifyGolfClubProduct("H&H Lure 2 oz. Spider Sinker"), null);
  assert.equal(
    classifyGolfClubProduct("TaylorMade Spider Tour X Putter 34 inch")?.equipmentTypeId,
    "golf-putters",
  );
  assert.equal(
    classifyGolfClubProduct("Callaway Women's Complete Golf Club Set")?.equipmentTypeId,
    "golf-iron-sets",
  );
});

test("retains explicit golf hybrids", () => {
  assert.equal(
    classifyGolfClubProduct("Used Ping G25 Mens RH 4 Hybrid Golf Club")?.equipmentTypeId,
    "golf-irons",
  );
});

test("retains complete clubs that identify the installed shaft", () => {
  assert.equal(
    classifyGolfClubProduct("TaylorMade Qi10 Driver with Ventus Blue Shaft Stiff")?.equipmentTypeId,
    "golf-drivers",
  );
});

function ebayItem(title: string): EbayItemSummary {
  return {
    itemId: title,
    title,
    price: { value: "299.99", currency: "USD" },
    condition: "New",
    conditionId: "1000",
    itemWebUrl: "https://www.ebay.com/itm/test",
  };
}

test("eBay club ingestion refines categories and rejects query pollution", () => {
  assert.equal(
    ebayItemToDeal(ebayItem("Odyssey Ai-One Putter 34 inch"), "golf", "golf-drivers")?.equipmentTypeId,
    "golf-putters",
  );
  assert.equal(
    ebayItemToDeal(ebayItem("TaylorMade Qi10 Driver Headcover"), "golf", "golf-drivers"),
    null,
  );
  assert.equal(
    ebayItemToDeal(ebayItem("Titleist Pro V1 Golf Balls One Dozen"), "golf", "golf-balls")?.equipmentTypeId,
    "golf-balls",
  );
});

function cjProduct(title: string) {
  return {
    title,
    link: "https://merchant.example/item",
    imageLink: "https://merchant.example/item.jpg",
    price: { amount: "399.99", currency: "USD" },
    salePrice: null,
    brand: "TaylorMade",
    condition: "new",
    availability: "in stock",
    id: title,
    catalogId: "catalog",
    adId: "ad",
    advertiserName: "Golf Galaxy",
    description: "",
    gtin: "",
    mpn: "",
    productType: ["Golf Clubs"],
  };
}

test("CJ club ingestion uses the shared classifier and drops accessories", () => {
  assert.equal(
    cjProductToDeal(cjProduct("TaylorMade Qi35 Driver 10.5 Stiff") as any, "golf", "golf-other")?.equipmentTypeId,
    "golf-drivers",
  );
  assert.equal(
    cjProductToDeal(cjProduct("TaylorMade Qi35 Driver Headcover") as any, "golf", "golf-other"),
    null,
  );
  assert.equal(
    cjProductToDeal(cjProduct("Titleist Pro V1 Golf Balls One Dozen") as any, "golf", "golf-balls")?.equipmentTypeId,
    "golf-balls",
  );
});
