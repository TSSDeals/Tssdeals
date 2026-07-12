import cron from "node-cron";
import { log } from "./index";
import type { IStorage } from "./storage";
import { searchEbayProducts, ebayItemToDeal, getEbaySportKeywords, getEbayCategorySyncs } from "./ebay-api";
import { searchCJProductsPaginated, cjProductToDeal, getSportKeywords, getCJPartners } from "./cj-affiliate";
import { syncShopifyStore } from "./shopify-sync";
import { syncSidelineSwap } from "./sidelineswap";
import { searchShareASaleProducts, shareASaleProductToDeal, getShareASaleSportKeywords } from "./shareasale";
import { listImpactCatalogs, getImpactCatalogItems, impactItemToDeal } from "./impact-api";
import { searchRakutenProducts, rakutenProductToDeal, getRakutenSportKeywords, syncRakutenMerchant, RAKUTEN_MERCHANTS } from "./rakuten-api";
import { searchAmazonProductsAllPages, amazonItemToDeal, getAmazonSportKeywords, getAmazonSportBrowseNodes, getAmazonOAuth2Token, type AmazonAuth } from "./amazon-api";
import { syncNameOfTheGame } from "./woocommerce-sync";
import { syncBaseballResale } from "./baseball-resale-sync";
import { syncFanaticsDeals } from "./fanatics-sync";
import { syncMultipleShopifyStores } from "./shopify-multi-store-sync";
import { syncPlayItAgain } from "./playitagain-sync";
import { isPushConfigured, sendPushToUser } from "./push-notifications";
import { isSmsConfigured, sendPriceAlertSms, sendWelcomeSms } from "./sms-notifications";
import { getStopEpoch, stopRequestedSince } from "./process-control";

async function syncEbayDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    log("eBay sync skipped: credentials not configured", "deal-sync");
    return { created: 0, updated: 0, errors: 0 };
  }

  const sportKeywords = getEbaySportKeywords();
  const allEquipmentTypes = await storage.listEquipmentTypes();
  const stopEpoch = getStopEpoch();
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const sportId of Object.keys(sportKeywords)) {
    if (stopRequestedSince(stopEpoch)) break;
    const keywords = sportKeywords[sportId] ?? [`${sportId} sporting goods`];
    const sportEqTypes = allEquipmentTypes.filter(et => et.sportId === sportId);
    const defaultEqType = sportEqTypes.find(et => et.id.endsWith("-other"))?.id ?? sportEqTypes[0]?.id ?? null;

    for (const kw of keywords) {
      if (stopRequestedSince(stopEpoch)) break;
      try {
        const eqTypeId = defaultEqType ?? sportId;
        const items = await searchEbayProducts(clientId, clientSecret, {
          keywords: kw,
          sportId,
          equipmentTypeId: eqTypeId,
          condition: "all",
          maxResults: 5000,
        });

        const dealsToInsert = items
          .map((item) => ebayItemToDeal(item, sportId, eqTypeId))
          .filter((d): d is NonNullable<typeof d> => d !== null);

        if (dealsToInsert.length > 0) {
          await storage.ensureSource("ebay", "eBay", "https://www.ebay.com");
          const result = await storage.bulkUpsertDeals(dealsToInsert);
          totalCreated += result.created;
          totalUpdated += result.updated;
        }
      } catch (err: any) {
        log(`eBay sync error for "${kw}": ${err.message}`, "deal-sync");
        totalErrors++;
      }
    }
  }

  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

export async function syncEbaySellerDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { created: 0, updated: 0, errors: 0 };
  }

  const sellers = await storage.listEbaySellers();
  if (sellers.length === 0) {
    return { created: 0, updated: 0, errors: 0 };
  }

  const sellerCategories = [
    { categoryId: "16021", sportId: "baseball", equipmentTypeId: "bb-other", categoryName: "Baseball & Softball" },
    { categoryId: "1513", sportId: "golf", equipmentTypeId: "golf-other", categoryName: "Golf" },
    { categoryId: "21194", sportId: "basketball", equipmentTypeId: "bk-other", categoryName: "Basketball" },
    { categoryId: "261242", sportId: "football", equipmentTypeId: "fb-other", categoryName: "Football" },
    { categoryId: "20862", sportId: "soccer", equipmentTypeId: "soc-other", categoryName: "Soccer" },
    { categoryId: "261249", sportId: "lacrosse", equipmentTypeId: "lax-other", categoryName: "Lacrosse" },
    { categoryId: "261245", sportId: "hockey", equipmentTypeId: "hk-other", categoryName: "Hockey" },
    { categoryId: "1492", sportId: "fishing", equipmentTypeId: "fish-other", categoryName: "Fishing" },
    { categoryId: "261246", sportId: "volleyball", equipmentTypeId: "vb-other", categoryName: "Volleyball" },
    { categoryId: "261247", sportId: "wrestling", equipmentTypeId: "wrest-other", categoryName: "Wrestling" },
    { categoryId: "7294", sportId: "cycling", equipmentTypeId: "cyc-other", categoryName: "Cycling" },
    { categoryId: "95672", sportId: "running", equipmentTypeId: "run-shoes", categoryName: "Running" },
    { categoryId: "159136", sportId: "swimming", equipmentTypeId: "swim-other", categoryName: "Swimming" },
  ];

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  const stopEpoch = getStopEpoch();
  for (const seller of sellers) {
    if (stopRequestedSince(stopEpoch)) break;
    let sellerItemCount = 0;
    for (const cat of sellerCategories) {
      if (stopRequestedSince(stopEpoch)) break;
      try {
        const items = await searchEbayProducts(clientId, clientSecret, {
          keywords: "",
          sportId: cat.sportId,
          equipmentTypeId: cat.equipmentTypeId,
          condition: "all",
          maxResults: 2000,
          categoryId: cat.categoryId,
          sellerUsername: seller.username,
        });

        if (items.length === 0) continue;

        const dealsToInsert = items
          .map((item) => ebayItemToDeal(item, cat.sportId, cat.equipmentTypeId))
          .filter((d): d is NonNullable<typeof d> => d !== null);

        if (dealsToInsert.length > 0) {
          await storage.ensureSource("ebay", "eBay", "https://www.ebay.com");
          const result = await storage.bulkUpsertDeals(dealsToInsert);
          totalCreated += result.created;
          totalUpdated += result.updated;
          sellerItemCount += dealsToInsert.length;
        }
      } catch (err: any) {
        log(`eBay seller "${seller.username}" error in ${cat.categoryName}: ${err.message}`, "deal-sync");
        totalErrors++;
      }
    }
    if (sellerItemCount > 0) {
      log(`eBay seller "${seller.username}": ${sellerItemCount} items synced`, "deal-sync");
    }
  }

  if (totalCreated > 0 || totalUpdated > 0) {
    log(`eBay seller sync total: ${totalCreated} created, ${totalUpdated} updated`, "deal-sync");
  }

  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

async function syncEbayCategoryDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    log("eBay category sync skipped: credentials not configured", "deal-sync");
    return { created: 0, updated: 0, errors: 0 };
  }

  const categorySyncs = getEbayCategorySyncs();
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  const stopEpoch = getStopEpoch();
  for (const catSync of categorySyncs) {
    if (stopRequestedSince(stopEpoch)) break;
    try {
      const items = await searchEbayProducts(clientId, clientSecret, {
        keywords: catSync.keywords || "",
        sportId: catSync.sportId,
        equipmentTypeId: catSync.equipmentTypeId,
        condition: "all",
        maxResults: 10000,
        categoryId: catSync.categoryId,
      });

      const dealsToInsert = items
        .map((item) => ebayItemToDeal(item, catSync.sportId, catSync.equipmentTypeId))
        .filter((d): d is NonNullable<typeof d> => d !== null);

      if (dealsToInsert.length > 0) {
        await storage.ensureSource("ebay", "eBay", "https://www.ebay.com");
        const result = await storage.bulkUpsertDeals(dealsToInsert);
        totalCreated += result.created;
        totalUpdated += result.updated;
      }

      log(`eBay category "${catSync.categoryName}" (${catSync.categoryId}): ${items.length} items`, "deal-sync");
    } catch (err: any) {
      log(`eBay category sync error for "${catSync.categoryName}" (${catSync.categoryId}): ${err.message}`, "deal-sync");
      totalErrors++;
    }
  }

  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

async function syncCJDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  const apiKey = process.env.CJ_API_TOKEN;
  const companyId = process.env.CJ_COMPANY_ID;

  if (!apiKey || !companyId) {
    log("CJ sync skipped: credentials not configured", "deal-sync");
    return { created: 0, updated: 0, errors: 0 };
  }

  const partners = getCJPartners();
  const allEquipmentTypes = await storage.listEquipmentTypes();
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  const cjSportKeywords = getSportKeywords();

  const stopEpoch = getStopEpoch();
  for (const partner of partners) {
    if (stopRequestedSince(stopEpoch)) break;
    try {
      await storage.ensureSource(partner.sourceId, partner.name, "");

      const sportIdsToSync = partner.sportIds.length > 0
        ? partner.sportIds
        : Object.keys(cjSportKeywords);

      const partnerMaxDeals = partner.maxDeals ?? Infinity;
      let partnerDealCount = 0;

      for (const sportId of sportIdsToSync) {
        if (partnerDealCount >= partnerMaxDeals) break;

        const sportEqTypes = allEquipmentTypes.filter(et => et.sportId === sportId);
        const defaultEqType = sportEqTypes.find(et => et.id.endsWith("-other"))?.id ?? sportEqTypes[0]?.id ?? sportId;

        const keywords = cjSportKeywords[sportId] ?? [`${sportId} sporting goods`];
        for (const kw of keywords) {
          if (partnerDealCount >= partnerMaxDeals) break;
          if (stopRequestedSince(stopEpoch)) break;

          try {
            let offset = 0;
            const pageSize = 100;
            const maxPages = 10;
            let pagesProcessed = 0;

            while (pagesProcessed < maxPages) {
              if (partnerDealCount >= partnerMaxDeals) break;
              if (stopRequestedSince(stopEpoch)) break;

              const { products, totalCount } = await searchCJProductsPaginated(apiKey, companyId, {
                sportId,
                equipmentTypeId: defaultEqType,
                partnerIds: [partner.partnerId],
                keywords: kw,
                maxResults: pageSize,
                offset,
              });

              if (products.length === 0) break;

              if (pagesProcessed === 0 && totalCount > pageSize) {
                log(`CJ "${partner.name}" keyword "${kw}": ${totalCount} results (cap: ${partnerMaxDeals === Infinity ? 'unlimited' : partnerMaxDeals})`, "deal-sync");
              }

              const dealsToInsert = products
                .map((p) => cjProductToDeal(p, sportId, defaultEqType, partner.sourceId))
                .filter((d): d is NonNullable<typeof d> => d !== null);

              if (dealsToInsert.length > 0) {
                const result = await storage.bulkUpsertDeals(dealsToInsert);
                totalCreated += result.created;
                totalUpdated += result.updated;
                partnerDealCount += dealsToInsert.length;
              }

              offset += pageSize;
              pagesProcessed++;
              if (offset >= totalCount) break;
            }
          } catch (err: any) {
            log(`CJ sync error for "${partner.name}" keyword "${kw}": ${err.message}`, "deal-sync");
            totalErrors++;
          }
        }
      }

      if (partnerMaxDeals < Infinity) {
        log(`CJ "${partner.name}": synced ${partnerDealCount} deals (cap: ${partnerMaxDeals})`, "deal-sync");
      }
    } catch (err: any) {
      log(`CJ sync error for partner "${partner.name}": ${err.message}`, "deal-sync");
      totalErrors++;
    }
  }

  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

async function syncShopifyDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  try {
    const result = await syncShopifyStore(
      "https://www.twinseamsports.com",
      (deals) => storage.bulkUpsertDeals(deals),
      undefined,
      30,
    );
    return { created: result.created, updated: result.updated, errors: 0 };
  } catch (err: any) {
    log(`Shopify sync error: ${err.message}`, "deal-sync");
    return { created: 0, updated: 0, errors: 1 };
  }
}

async function syncSidelineSwapDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  try {
    await storage.ensureSource("sidelineswap", "SidelineSwap", "https://www.sidelineswap.com");
    const result = await syncSidelineSwap({
      maxPages: 100,
      condition: "all",
    });
    const { created, updated } = await storage.bulkUpsertDeals(result.deals);
    return { created, updated, errors: 0 };
  } catch (err: any) {
    log(`SidelineSwap sync error: ${err.message}`, "deal-sync");
    return { created: 0, updated: 0, errors: 1 };
  }
}

async function syncShareASaleDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  const affiliateId = process.env.SHAREASALE_AFFILIATE_ID;
  const token = process.env.SHAREASALE_API_TOKEN;
  const secret = process.env.SHAREASALE_API_SECRET;

  if (!affiliateId || !token || !secret) {
    log("ShareASale sync skipped: credentials not configured", "deal-sync");
    return { created: 0, updated: 0, errors: 0 };
  }

  const sportKeywords = getShareASaleSportKeywords();
  const allEquipmentTypes = await storage.listEquipmentTypes();
  const stopEpoch = getStopEpoch();
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const sportId of Object.keys(sportKeywords)) {
    if (stopRequestedSince(stopEpoch)) break;
    const keywords = sportKeywords[sportId] ?? [];
    const sportEqTypes = allEquipmentTypes.filter(et => et.sportId === sportId);
    const defaultEqType = sportEqTypes.find(et => et.id.endsWith("-other"))?.id ?? sportEqTypes[0]?.id ?? sportId;

    for (const kw of keywords) {
      if (stopRequestedSince(stopEpoch)) break;
      try {
        const products = await searchShareASaleProducts(affiliateId, token, secret, {
          keyword: kw,
          sportId,
          equipmentTypeId: defaultEqType,
          maxResults: 100,
        });

        const dealsToInsert = products
          .map((p) => shareASaleProductToDeal(p, sportId, defaultEqType))
          .filter((d): d is NonNullable<typeof d> => d !== null);

        for (const deal of dealsToInsert) {
          await storage.ensureSource(deal.sourceId, deal.sourceId.replace(/^sas-/, "").replace(/-/g, " "), "");
        }

        if (dealsToInsert.length > 0) {
          const result = await storage.bulkUpsertDeals(dealsToInsert);
          totalCreated += result.created;
          totalUpdated += result.updated;
        }
      } catch (err: any) {
        log(`ShareASale sync error for "${kw}": ${err.message}`, "deal-sync");
        totalErrors++;
      }
    }
  }

  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

const IMPACT_BRAND_SPORT_MAP: Array<{ pattern: RegExp; sportId: string; eqTypePrefix: string }> = [
  { pattern: /luxilon/i, sportId: "tennis", eqTypePrefix: "ten" },
  { pattern: /demarini|de\s*marini/i, sportId: "baseball", eqTypePrefix: "bb" },
  { pattern: /louisville\s*slugger/i, sportId: "baseball", eqTypePrefix: "bb" },
  { pattern: /evoshield/i, sportId: "baseball", eqTypePrefix: "bb" },
  { pattern: /\batec\b/i, sportId: "baseball", eqTypePrefix: "bb" },
  { pattern: /wilson.*sporting|wilson.*baseball|wilson.*softball/i, sportId: "baseball", eqTypePrefix: "bb" },
  { pattern: /wilson.*tennis/i, sportId: "tennis", eqTypePrefix: "ten" },
  { pattern: /wilson.*pickleball/i, sportId: "pickleball", eqTypePrefix: "pkl" },
  { pattern: /wilson.*volleyball/i, sportId: "volleyball", eqTypePrefix: "vb" },
  { pattern: /wilson.*basketball/i, sportId: "basketball", eqTypePrefix: "bk" },
  { pattern: /wilson.*football/i, sportId: "football", eqTypePrefix: "fb" },
];

function detectSportFromImpactItem(category: string, subCategory: string, name: string, advertiserName: string): { sportId: string; eqTypePrefix: string } {
  const haystack = [category, subCategory, name].join(" ").toLowerCase();

  if (/\btennis\b/.test(haystack)) return { sportId: "tennis", eqTypePrefix: "ten" };
  if (/\bpickleball\b/.test(haystack)) return { sportId: "pickleball", eqTypePrefix: "pkl" };
  if (/\bbadminton\b/.test(haystack)) return { sportId: "badminton", eqTypePrefix: "bad" };
  if (/\bsquash\b/.test(haystack)) return { sportId: "squash", eqTypePrefix: "sqsh" };
  if (/\bvolleyball\b/.test(haystack)) return { sportId: "volleyball", eqTypePrefix: "vb" };
  if (/\bbasketball\b/.test(haystack)) return { sportId: "basketball", eqTypePrefix: "bk" };
  if (/\bfootball\b/.test(haystack)) return { sportId: "football", eqTypePrefix: "fb" };
  if (/\bhockey\b/.test(haystack)) return { sportId: "hockey", eqTypePrefix: "hk" };
  if (/\blacrosse\b/.test(haystack)) return { sportId: "lacrosse", eqTypePrefix: "lax" };
  if (/\bsoccer\b/.test(haystack)) return { sportId: "soccer", eqTypePrefix: "soc" };
  if (/\bgolf\b/.test(haystack)) return { sportId: "golf", eqTypePrefix: "golf" };
  if (/\brunning\b|\bjogging\b/.test(haystack)) return { sportId: "running", eqTypePrefix: "run" };
  if (/\bfastpitch|fast.?pitch/.test(haystack)) return { sportId: "fastpitch-softball", eqTypePrefix: "fp" };
  if (/\bsoftball\b/.test(haystack)) return { sportId: "slowpitch-softball", eqTypePrefix: "sp" };
  if (/\bbaseball\b/.test(haystack)) return { sportId: "baseball", eqTypePrefix: "bb" };

  for (const entry of IMPACT_BRAND_SPORT_MAP) {
    if (entry.pattern.test(advertiserName)) return { sportId: entry.sportId, eqTypePrefix: entry.eqTypePrefix };
  }

  return { sportId: "baseball", eqTypePrefix: "bb" };
}

function detectEqTypeFromImpactItem(category: string, subCategory: string, name: string, eqTypePrefix: string, allEquipmentTypes: { id: string }[], advertiserName?: string): string {
  const haystack = [category, subCategory, name].join(" ").toLowerCase();
  const prefix = eqTypePrefix;
  const adv = (advertiserName ?? "").toLowerCase();

  // Cricket bats are not baseball bats — never let the broad "bat" keywords claim them.
  const isCricket = /\bcricket\b/.test(haystack);

  const eqMap: Record<string, string[]> = {
    glove: ["glove", "mitt"],
    bat: isCricket ? [] : ["bat ", " bat", "bats", "bbcor"],
    ball: ["ball", "balls", "shuttlecock"],
    paddle: ["paddle"],
    racket: ["racket", "racquet"],
    bags: ["bag", "backpack", "duffle", "duffel", "tote", "case"],
    shoes: ["shoe", "shoes", "footwear", "cleat", "cleats", "sneaker"],
    apparel: ["jersey", "shirt", "short", "pant", "sock", "apparel", "clothing", "cap", "hat", "helmet"],
    accessories: ["grip", "string", "overgrip", "vibration", "damper", "wristband", "headband"],
    protective: ["helmet", "chest", "protector", "guard", "shield", "cup", "slider", "elbow", "shin", "face mask"],
    training: ["pitching machine", "training aid", "rebounder", "tee", "batting tee", "net", "screen", "radar", "speed gun", "practice"],
  };

  if (/evoshield/i.test(adv)) {
    const id = `${prefix}-protective`;
    if (allEquipmentTypes.find(et => et.id === id)) return id;
  }
  if (/\batec\b/i.test(adv)) {
    const id = `${prefix}-training`;
    if (allEquipmentTypes.find(et => et.id === id)) return id;
  }
  if (/luxilon/i.test(adv)) {
    const id = `${prefix}-accessories`;
    if (allEquipmentTypes.find(et => et.id === id)) return id;
  }

  for (const [key, patterns] of Object.entries(eqMap)) {
    if (patterns.some(p => haystack.includes(p))) {
      const candidate = `${prefix}-${key}`;
      if (allEquipmentTypes.find(et => et.id === candidate)) return candidate;
    }
  }

  const otherCandidate = `${prefix}-other`;
  if (allEquipmentTypes.find(et => et.id === otherCandidate)) return otherCandidate;

  return allEquipmentTypes.find(et => et.id.startsWith(prefix))?.id ?? "bb-other";
}

export async function syncImpactDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  const accountSid = process.env.IMPACT_ACCOUNT_SID;
  const authToken = process.env.IMPACT_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    log("Impact sync skipped: credentials not configured", "deal-sync");
    return { created: 0, updated: 0, errors: 0 };
  }

  const allEquipmentTypes = await storage.listEquipmentTypes();
  const stopEpoch = getStopEpoch();
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  try {
    const catalogs = await listImpactCatalogs(accountSid, authToken);
    log(`Impact: found ${catalogs.length} catalogs`, "deal-sync");

    for (const catalog of catalogs) {
      if (stopRequestedSince(stopEpoch)) break;
      try {
        const advertiserSlug = (catalog.AdvertiserName || "impact")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const catalogSourceId = `impact-${advertiserSlug}`;
        await storage.ensureSource(catalogSourceId, catalog.AdvertiserName, "");

        let page = 1;
        const maxPages = 20;

        log(`Impact syncing catalog "${catalog.Name}" (source: ${catalogSourceId})`, "deal-sync");
        while (page <= maxPages) {
          if (stopRequestedSince(stopEpoch)) break;
          const { items, totalPages } = await getImpactCatalogItems(accountSid, authToken, catalog.Id, page);

          if (items.length === 0) break;

          const dealsToInsert = items
            .map((item) => {
              const { sportId, eqTypePrefix } = detectSportFromImpactItem(
                item.Category ?? "",
                item.SubCategory ?? "",
                item.Name ?? "",
                item.AdvertiserName ?? "",
              );
              const equipmentTypeId = detectEqTypeFromImpactItem(
                item.Category ?? "",
                item.SubCategory ?? "",
                item.Name ?? "",
                eqTypePrefix,
                allEquipmentTypes,
                item.AdvertiserName ?? "",
              );
              return impactItemToDeal(item, sportId, equipmentTypeId, catalogSourceId);
            })
            .filter((d): d is NonNullable<typeof d> => d !== null);

          if (dealsToInsert.length > 0) {
            const result = await storage.bulkUpsertDeals(dealsToInsert);
            totalCreated += result.created;
            totalUpdated += result.updated;
          }

          if (page >= totalPages) break;
          page++;
        }
      } catch (err: any) {
        log(`Impact sync error for catalog "${catalog.Name}": ${err.message}`, "deal-sync");
        totalErrors++;
      }
    }
  } catch (err: any) {
    log(`Impact sync error listing catalogs: ${err.message}`, "deal-sync");
    totalErrors++;
  }

  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

async function syncRakutenDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  const apiToken = process.env.RAKUTEN_API_TOKEN;

  if (!apiToken) {
    log("Rakuten sync skipped: credentials not configured", "deal-sync");
    return { created: 0, updated: 0, errors: 0 };
  }

  const sportKeywords = getRakutenSportKeywords();
  const allEquipmentTypes = await storage.listEquipmentTypes();
  const stopEpoch = getStopEpoch();
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const sportId of Object.keys(sportKeywords)) {
    if (stopRequestedSince(stopEpoch)) break;
    const keywords = sportKeywords[sportId] ?? [];
    const sportEqTypes = allEquipmentTypes.filter(et => et.sportId === sportId);
    const defaultEqType = sportEqTypes.find(et => et.id.endsWith("-other"))?.id ?? sportEqTypes[0]?.id ?? sportId;

    for (const kw of keywords) {
      if (stopRequestedSince(stopEpoch)) break;
      try {
        const products = await searchRakutenProducts(apiToken, {
          keyword: kw,
          sportId,
          equipmentTypeId: defaultEqType,
          maxResults: 50,
        });

        const dealsToInsert = products
          .map((p) => rakutenProductToDeal(p, sportId, defaultEqType))
          .filter((d): d is NonNullable<typeof d> => d !== null);

        for (const deal of dealsToInsert) {
          await storage.ensureSource(deal.sourceId, deal.sourceId.replace(/^rak-/, "").replace(/-/g, " "), "");
        }

        if (dealsToInsert.length > 0) {
          const result = await storage.bulkUpsertDeals(dealsToInsert);
          totalCreated += result.created;
          totalUpdated += result.updated;
        }
      } catch (err: any) {
        log(`Rakuten sync error for "${kw}": ${err.message}`, "deal-sync");
        totalErrors++;
      }
    }
  }

  for (const merchant of RAKUTEN_MERCHANTS) {
    if (stopRequestedSince(stopEpoch)) break;
    try {
      log(`Rakuten merchant sync: ${merchant.name} (MID: ${merchant.mid})`, "deal-sync");
      const { deals } = await syncRakutenMerchant(apiToken, merchant);
      const validDeals = deals.filter((d): d is NonNullable<typeof d> => d !== null);

      if (validDeals.length > 0) {
        await storage.ensureSource(merchant.sourceId, merchant.name, "");
        const result = await storage.bulkUpsertDeals(validDeals);
        totalCreated += result.created;
        totalUpdated += result.updated;
        log(`Rakuten ${merchant.name}: ${result.created} created, ${result.updated} updated from ${validDeals.length} products`, "deal-sync");
      }
    } catch (err: any) {
      log(`Rakuten merchant sync error for ${merchant.name}: ${err.message}`, "deal-sync");
      totalErrors++;
    }
  }

  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

async function syncNameOfTheGameDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  try {
    await storage.ensureSource("name-of-the-game", "NameOfTheGame", "https://www.nameofthegame.com");
    const result = await syncNameOfTheGame(
      (deals) => storage.bulkUpsertDeals(deals),
      20,
    );
    return { created: result.created, updated: result.updated, errors: 0 };
  } catch (err: any) {
    log(`NameOfTheGame sync error: ${err.message}`, "deal-sync");
    return { created: 0, updated: 0, errors: 1 };
  }
}

export async function syncPlayItAgainDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  try {
    await storage.ensureSource(
      "play-it-again-sports",
      "Play It Again Sports",
      "https://www.playitagainsports.com",
    );
    const result = await syncPlayItAgain(
      (deals) => storage.bulkUpsertDeals(deals),
    );
    return { created: result.created, updated: result.updated, errors: result.errors };
  } catch (err: any) {
    log(`Play It Again sync error: ${err.message}`, "deal-sync");
    return { created: 0, updated: 0, errors: 1 };
  }
}

async function syncBaseballResaleDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  try {
    await storage.ensureSource("baseball-resale", "Baseball Resale", "https://nrhdu0-sf.myshopify.com");
    const result = await syncBaseballResale(
      (deals) => storage.bulkUpsertDeals(deals),
      20,
    );
    return { created: result.created, updated: result.updated, errors: 0 };
  } catch (err: any) {
    log(`Baseball Resale sync error: ${err.message}`, "deal-sync");
    return { created: 0, updated: 0, errors: 1 };
  }
}

async function syncMultiShopifyDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  try {
    const result = await syncMultipleShopifyStores(
      (deals) => storage.bulkUpsertDeals(deals),
      (id, name, url) => storage.ensureSource(id, name, url),
    );
    return { created: result.totalCreated, updated: result.totalUpdated, errors: result.totalErrors };
  } catch (err: any) {
    log(`Multi-store Shopify sync error: ${err.message}`, "deal-sync");
    return { created: 0, updated: 0, errors: 1 };
  }
}

async function syncAmazonDeals(storage: IStorage): Promise<{ created: number; updated: number; errors: number }> {
  const clientId = process.env.AMAZON_CLIENT_ID;
  const clientSecret = process.env.AMAZON_CLIENT_SECRET;
  const accessKey = process.env.AMAZON_ACCESS_KEY;
  const secretKey = process.env.AMAZON_SECRET_KEY;
  const partnerTag = process.env.AMAZON_PARTNER_TAG;

  const hasOAuth2 = !!(clientId && clientSecret && partnerTag);
  const hasSigV4 = !!(accessKey && secretKey && partnerTag);

  if (!hasOAuth2 && !hasSigV4) {
    log("Amazon sync skipped: credentials not configured", "deal-sync");
    return { created: 0, updated: 0, errors: 0 };
  }

  let auth: AmazonAuth;
  if (hasOAuth2) {
    try {
      const bearerToken = await getAmazonOAuth2Token(clientId!, clientSecret!);
      auth = { mode: "oauth2", bearerToken };
      log("Amazon sync using OAuth2 (Creators API)", "deal-sync");
    } catch (err: any) {
      if (hasSigV4) {
        log(`Amazon OAuth2 token failed (${err.message}), falling back to SigV4`, "deal-sync");
        auth = { mode: "sigv4", accessKey: accessKey!, secretKey: secretKey! };
      } else {
        log(`Amazon sync skipped: OAuth2 token error: ${err.message}`, "deal-sync");
        return { created: 0, updated: 0, errors: 1 };
      }
    }
  } else {
    auth = { mode: "sigv4", accessKey: accessKey!, secretKey: secretKey! };
    log("Amazon sync using SigV4 (classic PA-API)", "deal-sync");
  }

  await storage.ensureSource("amazon", "Amazon", "https://www.amazon.com");

  const sportKeywords = getAmazonSportKeywords();
  const allEquipmentTypes = await storage.listEquipmentTypes();
  const stopEpoch = getStopEpoch();
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let globalAccessDenied = false;

  for (const sportId of Object.keys(sportKeywords)) {
    if (globalAccessDenied) break;
    if (stopRequestedSince(stopEpoch)) break;
    const keywords = sportKeywords[sportId] ?? [];
    const sportEqTypes = allEquipmentTypes.filter(et => et.sportId === sportId);
    const defaultEqType = sportEqTypes.find(et => et.id.endsWith("-other"))?.id ?? sportEqTypes[0]?.id ?? sportId;

    for (const kw of keywords) {
      if (globalAccessDenied) break;
      if (stopRequestedSince(stopEpoch)) break;
      try {
        const items = await searchAmazonProductsAllPages(auth, partnerTag!, {
          keywords: kw,
          sportId,
          equipmentTypeId: defaultEqType,
        });

        const dealsToInsert = items
          .map((item) => amazonItemToDeal(item, sportId, defaultEqType))
          .filter((d): d is NonNullable<typeof d> => d !== null);

        log(`Amazon keyword "${kw}": ${items.length} items, ${dealsToInsert.length} deals`, "deal-sync");

        if (dealsToInsert.length > 0) {
          const result = await storage.bulkUpsertDeals(dealsToInsert);
          totalCreated += result.created;
          totalUpdated += result.updated;
        }
      } catch (err: any) {
        log(`Amazon sync error for "${kw}": ${err.message}`, "deal-sync");
        totalErrors++;
        if (err.message?.includes("AccessDenied") || err.message?.includes("not enabled")) {
          log("Amazon PA-API credentials not authorized — skipping remaining keywords", "deal-sync");
          globalAccessDenied = true;
        } else if (err.message?.includes("rate limit")) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
  }

  const browseNodes = getAmazonSportBrowseNodes();
  for (const sportId of Object.keys(browseNodes)) {
    if (stopRequestedSince(stopEpoch)) break;
    const nodes = browseNodes[sportId] ?? [];
    const sportEqTypes = allEquipmentTypes.filter(et => et.sportId === sportId);
    const defaultEqType = sportEqTypes.find(et => et.id.endsWith("-other"))?.id ?? sportEqTypes[0]?.id ?? sportId;

    for (const node of nodes) {
      if (stopRequestedSince(stopEpoch)) break;
      try {
        const items = await searchAmazonProductsAllPages(auth, partnerTag!, {
          keywords: "",
          sportId,
          equipmentTypeId: defaultEqType,
          browseNodeId: node.nodeId,
        });

        const dealsToInsert = items
          .map((item) => amazonItemToDeal(item, sportId, defaultEqType))
          .filter((d): d is NonNullable<typeof d> => d !== null);

        log(`Amazon browse node "${node.label}": ${items.length} items, ${dealsToInsert.length} deals`, "deal-sync");
        if (dealsToInsert.length > 0) {
          const result = await storage.bulkUpsertDeals(dealsToInsert);
          totalCreated += result.created;
          totalUpdated += result.updated;
        }
      } catch (err: any) {
        log(`Amazon browse node "${node.label}" error: ${err.message}`, "deal-sync");
        totalErrors++;
        if (err.message?.includes("AccessDenied") || err.message?.includes("not enabled")) {
          globalAccessDenied = true;
          break;
        } else if (err.message?.includes("rate limit")) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    if (globalAccessDenied) break;
  }

  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

async function evaluatePostSyncAlerts(storage: IStorage) {
  log("Evaluating price alerts and computing historical lows...", "deal-sync");

  await storage.computeHistoricalLows();
  log("Historical lows computed for all deals", "deal-sync");

  const allDeals = await storage.listDeals({ limit: "all" });
  const dealIds = allDeals.map(d => d.id);

  const activeAlerts = await storage.getActiveAlertsForDeals(dealIds);
  if (activeAlerts.length === 0) {
    log("No active price alerts to evaluate", "deal-sync");
    return;
  }

  const dealMap = new Map(allDeals.map(d => [d.id, d]));
  let triggered = 0;

  function checkDealMeetsTarget(deal: any, alert: any): boolean {
    if (alert.targetPriceCents != null && deal.priceCents <= alert.targetPriceCents) {
      return true;
    }
    if (alert.targetPercentOff != null && deal.percentOff != null) {
      const currentPct = typeof deal.percentOff === "string" ? parseFloat(deal.percentOff) : Number(deal.percentOff);
      const targetPct = typeof alert.targetPercentOff === "string" ? parseFloat(alert.targetPercentOff) : Number(alert.targetPercentOff);
      if (currentPct >= targetPct) return true;
    }
    return false;
  }

  async function sendAlertNotifications(alert: any, deal: any, sellerNote: string) {
    await storage.markAlertTriggered(alert.id);
    triggered++;

    const subs = await storage.listPushSubscriptionsForUser(alert.userId);
    if (subs.length > 0 && isPushConfigured()) {
      const priceStr = `$${(deal.priceCents / 100).toFixed(2)}`;
      const pctStr = deal.percentOff ? ` (${deal.percentOff}% off)` : "";
      const result = await sendPushToUser(subs, {
        title: "Price Alert Triggered!",
        body: `${deal.title} is now ${priceStr}${pctStr}${sellerNote}`,
        url: deal.url || "/app/deals",
        tag: `alert-${alert.id}`,
      });
      log(`Price alert push sent for user ${alert.userId} on "${deal.title}": ${result.sent} sent, ${result.failed} failed`, "deal-sync");

      if (result.expired.length > 0) {
        for (const ep of result.expired) {
          await storage.removePushSubscription(alert.userId, ep);
        }
      }
    } else {
      log(`Price alert triggered for user ${alert.userId} on deal "${deal.title}" (no push subs or push not configured)`, "deal-sync");
    }

    if (isSmsConfigured()) {
      try {
        const userPrefs = await storage.getUserPreferences(alert.userId);
        if (userPrefs?.smsEnabled && userPrefs?.phoneNumber) {
          if (!userPrefs.firstSmsSent) {
            const welcomeOk = await sendWelcomeSms(userPrefs.phoneNumber);
            if (welcomeOk) {
              await storage.upsertUserPreferences(alert.userId, {
                condition: userPrefs.condition as "all" | "new" | "preowned",
                minPercentOff: Number(userPrefs.minPercentOff),
                pushEnabled: userPrefs.pushEnabled,
                smsEnabled: userPrefs.smsEnabled,
                phoneNumber: userPrefs.phoneNumber,
                equipmentTypeIds: userPrefs.equipmentTypeIds,
                sportId: userPrefs.sportId,
                hiddenSections: userPrefs.hiddenSections,
                firstSmsSent: true,
              });
            }
          }
          const priceStr = `$${(deal.priceCents / 100).toFixed(2)}`;
          const pctStr = deal.percentOff ? String(deal.percentOff) : null;
          const dealUrl = deal.url || "https://twinseamdeals.com/app/deals";
          await sendPriceAlertSms(userPrefs.phoneNumber, deal.title, priceStr, pctStr, dealUrl);
          log(`SMS price alert sent to user ${alert.userId} for "${deal.title}"`, "deal-sync");
        }
      } catch (smsErr: any) {
        log(`SMS alert failed for user ${alert.userId}: ${smsErr.message}`, "deal-sync");
      }
    }
  }

  for (const alert of activeAlerts) {
    if (alert.scope === "all_sellers" && alert.matchTitle) {
      const titleLower = alert.matchTitle.toLowerCase();
      const matchingDeals = allDeals.filter(d => {
        if (!d.title) return false;
        const dTitle = d.title.toLowerCase();
        if (dTitle === titleLower) return true;
        if (alert.matchBrand) {
          const brandLower = alert.matchBrand.toLowerCase();
          if (d.brand && d.brand.toLowerCase() === brandLower) {
            const titleWords = titleLower.split(/\s+/).filter(w => w.length > 2);
            const matchCount = titleWords.filter(w => dTitle.includes(w)).length;
            return matchCount >= Math.floor(titleWords.length * 0.5);
          }
        }
        return false;
      });

      let bestDeal: any = null;
      for (const d of matchingDeals) {
        if (checkDealMeetsTarget(d, alert)) {
          if (!bestDeal || d.priceCents < bestDeal.priceCents) bestDeal = d;
        }
      }

      if (bestDeal) {
        const sourceNote = bestDeal.id !== alert.dealId ? " (from another seller)" : "";
        await sendAlertNotifications(alert, bestDeal, sourceNote);
      }
    } else {
      const deal = dealMap.get(alert.dealId);
      if (!deal) continue;
      if (checkDealMeetsTarget(deal, alert)) {
        await sendAlertNotifications(alert, deal, "");
      }
    }
  }

  log(`Price alert evaluation complete: ${triggered} alerts triggered out of ${activeAlerts.length} active`, "deal-sync");
}

let isSyncing = false;
let syncStartedAt: Date | null = null;

export function getSyncStatus() {
  return {
    running: isSyncing,
    startedAt: syncStartedAt ? syncStartedAt.toISOString() : null,
  };
}

export interface FullSyncResult {
  totalCreated: number;
  totalUpdated: number;
  totalErrors: number;
  elapsedSeconds: string;
  breakdown: Record<string, { created: number; updated: number; errors: number }>;
}

export async function runFullSync(storage: IStorage): Promise<FullSyncResult | null> {
  if (isSyncing) {
    log("Deal sync already in progress, skipping this run", "deal-sync");
    return null;
  }
  isSyncing = true;
  syncStartedAt = new Date();
  const stopEpoch = getStopEpoch();

  log("Starting scheduled deal sync...", "deal-sync");
  const startTime = Date.now();

  try {
    const [ebay, ebayCats, ebaySellers, cj, shopify, sidelineswap, shareasale, impact, rakuten, amazon, notg, baseballResale, fanatics, multiShopify, playItAgain] = await Promise.allSettled([
      syncEbayDeals(storage),
      syncEbayCategoryDeals(storage),
      syncEbaySellerDeals(storage),
      syncCJDeals(storage),
      syncShopifyDeals(storage),
      syncSidelineSwapDeals(storage),
      syncShareASaleDeals(storage),
      syncImpactDeals(storage),
      syncRakutenDeals(storage),
      syncAmazonDeals(storage),
      syncNameOfTheGameDeals(storage),
      syncBaseballResaleDeals(storage),
      syncFanaticsDeals(storage),
      syncMultiShopifyDeals(storage),
      syncPlayItAgainDeals(storage),
    ]);

    const fallback = { created: 0, updated: 0, errors: 1 };
    const results = {
      ebay: ebay.status === "fulfilled" ? ebay.value : fallback,
      ebayCats: ebayCats.status === "fulfilled" ? ebayCats.value : fallback,
      ebaySellers: ebaySellers.status === "fulfilled" ? ebaySellers.value : fallback,
      cj: cj.status === "fulfilled" ? cj.value : fallback,
      shopify: shopify.status === "fulfilled" ? shopify.value : fallback,
      sidelineswap: sidelineswap.status === "fulfilled" ? sidelineswap.value : fallback,
      shareasale: shareasale.status === "fulfilled" ? shareasale.value : fallback,
      impact: impact.status === "fulfilled" ? impact.value : fallback,
      rakuten: rakuten.status === "fulfilled" ? rakuten.value : fallback,
      amazon: amazon.status === "fulfilled" ? amazon.value : fallback,
      notg: notg.status === "fulfilled" ? notg.value : fallback,
      baseballResale: baseballResale.status === "fulfilled" ? baseballResale.value : fallback,
      fanatics: fanatics.status === "fulfilled" ? fanatics.value : fallback,
      multiShopify: multiShopify.status === "fulfilled" ? multiShopify.value : fallback,
      playItAgain: playItAgain.status === "fulfilled" ? playItAgain.value : fallback,
    };

    const totalCreated = Object.values(results).reduce((s, r) => s + r.created, 0);
    const totalUpdated = Object.values(results).reduce((s, r) => s + r.updated, 0);
    const totalErrors = Object.values(results).reduce((s, r) => s + r.errors, 0);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const summary = Object.entries(results)
      .map(([name, r]) => `${name}: ${r.created}c/${r.updated}u`)
      .join(", ");

    log(
      `Deal sync complete in ${elapsed}s: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors. ${summary}`,
      "deal-sync",
    );

    if ((totalCreated > 0 || totalUpdated > 0) && !stopRequestedSince(stopEpoch)) {
      try {
        await evaluatePostSyncAlerts(storage);
      } catch (err: any) {
        log(`Post-sync alert evaluation error: ${err.message}`, "deal-sync");
      }

      // NOTE: All OpenAI work (MSRP verification + AI classification) is
      // deliberately NOT run here. The 8am/12pm/4pm/8pm/startup syncs stay
      // rule-based with zero OpenAI calls; AI runs once daily in runDailyAiPass
      // (12:15pm ET) to control cost.

      try {
        const { syncAllPromoCodes } = await import("./promo-codes");
        const promoResult = await syncAllPromoCodes();
        const totalPromos = promoResult.cj + promoResult.impact + promoResult.fanatics + promoResult.rakuten;
        if (totalPromos > 0) {
          log(`Promo sync: ${totalPromos} codes synced, ${promoResult.matched} sources matched`, "deal-sync");
        }
      } catch (err: any) {
        log(`Promo sync error: ${err.message}`, "deal-sync");
      }
    }

    return {
      totalCreated,
      totalUpdated,
      totalErrors,
      elapsedSeconds: elapsed,
      breakdown: results,
    };
  } catch (err: any) {
    log(`Deal sync failed: ${err.message}`, "deal-sync");
    return {
      totalCreated: 0,
      totalUpdated: 0,
      totalErrors: 1,
      elapsedSeconds: ((Date.now() - startTime) / 1000).toFixed(1),
      breakdown: {},
    };
  } finally {
    isSyncing = false;
    syncStartedAt = null;
  }
}

// Single daily gate for ALL OpenAI usage: AI deal classification (rescue the
// "-other"/default piles) followed by MSRP verification. Guarded by the API key
// and a re-entrancy flag so overlapping runs can't stack.
let isAiPassRunning = false;

export async function runDailyAiPass(storage: IStorage) {
  if (!process.env.OPENAI_API_KEY) {
    log("Daily AI pass skipped: OPENAI_API_KEY not set", "ai-pass");
    return;
  }
  if (isAiPassRunning) {
    log("Daily AI pass already running, skipping", "ai-pass");
    return;
  }
  isAiPassRunning = true;
  const start = Date.now();
  try {
    log("Daily AI pass started: classification + MSRP verification", "ai-pass");
    try {
      const { batchClassifyDeals } = await import("./ai-classifier");
      const r = await batchClassifyDeals({ limit: 150 });
      log(
        `AI classification: ${r.applied} applied, ${r.queued} queued, ${r.notSporting} non-sporting, ${r.skipped} skipped, ${r.failed} failed (of ${r.processed})`,
        "ai-pass",
      );
      // Rescue deals defaulted to baseball whose title signals a different sport.
      const rescue = await batchClassifyDeals({ mode: "baseball-rescue", limit: 150 });
      log(
        `AI baseball-rescue: ${rescue.applied} applied, ${rescue.queued} queued, ${rescue.notSporting} non-sporting, ${rescue.skipped} skipped, ${rescue.failed} failed (of ${rescue.processed})`,
        "ai-pass",
      );
    } catch (err: any) {
      log(`AI classification error: ${err.message}`, "ai-pass");
    }
    try {
      const { batchVerifyMsrps } = await import("./msrp-lookup");
      const m = await batchVerifyMsrps({ limit: 50 });
      log(`MSRP verify: ${m.verified} verified, ${m.skipped} skipped, ${m.failed} failed`, "ai-pass");
    } catch (err: any) {
      log(`MSRP verify error: ${err.message}`, "ai-pass");
    }
    log(`Daily AI pass complete in ${((Date.now() - start) / 1000).toFixed(1)}s`, "ai-pass");
  } finally {
    isAiPassRunning = false;
  }
}

export function startDealSyncScheduler(storage: IStorage) {
  cron.schedule(
    "0 8,12,16,20 * * *",
    () => { runFullSync(storage).catch(err => log(`Deal sync scheduler error: ${err.message}`, "deal-sync")); },
    { timezone: "America/New_York" },
  );

  log("Deal sync scheduler started: 8am, 12pm, 4pm, 8pm ET", "deal-sync");

  // 12:15pm ET — after the noon rule-based sync has populated fresh deals, run
  // the single daily AI pass (classification + MSRP). This is the ONLY OpenAI usage.
  cron.schedule(
    "15 12 * * *",
    () => { runDailyAiPass(storage).catch(err => log(`Daily AI pass scheduler error: ${err.message}`, "ai-pass")); },
    { timezone: "America/New_York" },
  );
  log("Daily AI pass scheduler started: 12:15pm ET", "deal-sync");

  cron.schedule(
    "0 6 * * *",
    () => {
      import("./ebay-pricing-analysis").then(({ generatePricingReport }) => {
        log("Running daily eBay pricing analysis report...", "ebay-pricing");
        generatePricingReport().catch(err => log(`Daily pricing report error: ${err.message}`, "ebay-pricing"));
      });
    },
    { timezone: "America/New_York" },
  );
  log("eBay pricing report scheduler started: 6am ET daily", "deal-sync");

  cron.schedule(
    "0 3 * * *",
    () => {
      runStaleDealCleanup().catch(err => log(`Daily stale deal cleanup error: ${err.message}`, "deal-cleanup"));
    },
    { timezone: "America/New_York" },
  );
  log("Stale deal cleanup scheduler started: 3am ET daily", "deal-sync");

  // Deal validation: runs every 30 minutes
  cron.schedule(
    "*/30 * * * *",
    () => {
      import("./deal-validation").then(({ runDealValidation }) => {
        log("Running deal validation (dead link check)...", "deal-validation");
        runDealValidation(500).then((r) => {
          log(
            `Deal validation complete: eBay ${r.ebayRemoved}/${r.ebayChecked} removed, SS ${r.ssRemoved}/${r.ssChecked} removed (${(r.durationMs / 1000).toFixed(1)}s)`,
            "deal-validation",
          );
        }).catch(err => log(`Deal validation error: ${err.message}`, "deal-validation"));
      });
    },
  );
  log("Deal validation scheduler started: every 30 minutes", "deal-sync");

  setTimeout(() => {
    log("Running initial deal sync on startup...", "deal-sync");
    runFullSync(storage).catch(err => log(`Initial deal sync error: ${err.message}`, "deal-sync"));
  }, 10000);
}

async function runStaleDealCleanup() {
  const { db } = await import("./db");
  const { sql } = await import("drizzle-orm");
  const stopEpoch = getStopEpoch();
  let totalDeleted = 0;
  const batchSize = 10000;
  const maxBatches = 20;
  let batches = 0;

  // Marketplace deals: 7 days
  let deleted = 0;
  do {
    if (stopRequestedSince(stopEpoch)) break;
    const result = await db.execute(sql.raw(`
      DELETE FROM deals WHERE id IN (
        SELECT id FROM deals
        WHERE source_id IN ('ebay', 'sidelineswap')
        AND last_seen_at < NOW() - INTERVAL '7 days'
        LIMIT ${batchSize}
      )
    `));
    deleted = (result as any).rowCount ?? 0;
    totalDeleted += deleted;
    batches++;
    if (deleted > 0) log(`Deleted batch of ${deleted} stale marketplace deals`, "deal-cleanup");
  } while (deleted >= batchSize && batches < maxBatches);

  // Retailer deals: 14 days
  do {
    if (stopRequestedSince(stopEpoch)) break;
    const result = await db.execute(sql.raw(`
      DELETE FROM deals WHERE id IN (
        SELECT id FROM deals
        WHERE source_id NOT IN ('ebay', 'sidelineswap')
        AND last_seen_at < NOW() - INTERVAL '14 days'
        LIMIT ${batchSize}
      )
    `));
    deleted = (result as any).rowCount ?? 0;
    totalDeleted += deleted;
    batches++;
    if (deleted > 0) log(`Deleted batch of ${deleted} stale retailer deals`, "deal-cleanup");
  } while (deleted >= batchSize && batches < maxBatches);

  if (batches >= maxBatches) {
    log(`Cleanup hit batch cap (${maxBatches}), more stale deals may remain`, "deal-cleanup");
  }

  if (totalDeleted > 0) {
    log(`Stale deal cleanup complete: ${totalDeleted} total deals removed`, "deal-cleanup");
  } else {
    log("No stale deals to clean up", "deal-cleanup");
  }
}
