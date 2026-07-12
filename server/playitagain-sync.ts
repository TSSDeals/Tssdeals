import type { InsertDeal } from "@shared/schema";
import { reclassifyBattingGloves } from "./ebay-api";
import { classifyDealAttributes } from "./sub-filter-classifier";

// Play It Again Sports runs a national BigCommerce (Stencil) catalog that
// aggregates predominantly USED gear from all franchise locations. There is no
// products.json (unlike the Shopify/Woo scrapers), so we parse the
// server-rendered category listing pages (~50 items per request, no per-product
// detail fetch). Cards expose RRP / non-sale / current price markers, but for
// resale items the RRP/non-sale markers are almost always empty — so most deals
// carry only a sale price and leave msrp/percentOff null, consistent with the
// app's other no-affiliate scrapers.

const PIAS_BASE = "https://playitagainsports.com";
const PIAS_SOURCE_ID = "play-it-again-sports";
const CATEGORY_BASE = `${PIAS_BASE}/baseball-and-softball`;

const USER_AGENT =
  "Mozilla/5.0 (compatible; TSSDealsBot/1.0; +https://tssdeals.com)";

type EquipKind =
  | "gloves"
  | "bats"
  | "balls"
  | "protective"
  | "training"
  | "bags"
  | "batting-gloves";

type BaseSport = "baseball" | "fastpitch-softball" | "slowpitch-softball";

interface CategoryDef {
  slug: string;
  sport: BaseSport;
  kind: EquipKind;
}

// Core gear only (per product decision): bats, gloves, catcher's gear, helmets,
// bags, balls, batting gloves, training aids. Apparel / cleats / socks / umpire /
// field equipment are intentionally excluded.
const CATEGORIES: CategoryDef[] = [
  // Balls
  { slug: "baseballs", sport: "baseball", kind: "balls" },
  { slug: "softballs", sport: "fastpitch-softball", kind: "balls" },
  // Gloves
  { slug: "fielders-gloves", sport: "baseball", kind: "gloves" },
  { slug: "first-base-gloves", sport: "baseball", kind: "gloves" },
  { slug: "catchers-gloves", sport: "baseball", kind: "gloves" },
  { slug: "fastpitch-gloves", sport: "fastpitch-softball", kind: "gloves" },
  // Catcher's gear + helmets -> protective
  { slug: "catchers-equipment", sport: "baseball", kind: "protective" },
  { slug: "baseball-and-softball-helmets", sport: "baseball", kind: "protective" },
  // Bags
  { slug: "baseball-and-softball-equipment-bags", sport: "baseball", kind: "bags" },
  // Training
  { slug: "baseball-and-softball-training-aids", sport: "baseball", kind: "training" },
  // Batting gloves
  { slug: "batting-gloves", sport: "baseball", kind: "batting-gloves" },
  // Bats (baseball)
  { slug: "high-school-bats", sport: "baseball", kind: "bats" },
  { slug: "senior-league-bats", sport: "baseball", kind: "bats" },
  { slug: "youth-league-bats", sport: "baseball", kind: "bats" },
  { slug: "tee-ball-bats", sport: "baseball", kind: "bats" },
  { slug: "wood-bats", sport: "baseball", kind: "bats" },
  { slug: "other-bats", sport: "baseball", kind: "bats" },
  { slug: "usa-2-1-2-barrel-bats", sport: "baseball", kind: "bats" },
  { slug: "usa-2-1-4-barrel-bats", sport: "baseball", kind: "bats" },
  { slug: "usa-2-5-8-barrel-bats", sport: "baseball", kind: "bats" },
  { slug: "usssa-2-3-4-barrel-bats", sport: "baseball", kind: "bats" },
  { slug: "usssa-2-5-8-barrel-bats", sport: "baseball", kind: "bats" },
  // Bats (softball)
  { slug: "fastpitch-bats", sport: "fastpitch-softball", kind: "bats" },
  { slug: "slowpitch-bats", sport: "slowpitch-softball", kind: "bats" },
];

const SPORT_PREFIX: Record<BaseSport, string> = {
  baseball: "bb",
  "fastpitch-softball": "fp",
  "slowpitch-softball": "sp",
};

const KNOWN_BRANDS = [
  "Rawlings", "Wilson", "Easton", "Marucci", "Louisville Slugger",
  "DeMarini", "Mizuno", "Under Armour", "Nike", "Adidas", "New Balance",
  "All-Star", "All Star", "Franklin", "Nokona", "Victus", "Warstic",
  "Stinger", "Combat", "Axe", "Baum", "Worth", "Miken", "Anderson",
  "Boombah", "Evoshield", "EvoShield", "Lizard Skins", "Champro",
  "Schutt", "Shock Doctor", "44 Pro", "Akadema", "SSK", "Spalding",
  "Bownet", "SKLZ", "Tanner", "JUGS", "Markwort", "Dudley", "Diamond",
  "Wilson Sporting Goods", "Mizuno USA",
];

interface PiasCard {
  title: string;
  url: string;
  imageUrl: string | null;
  priceCents: number;
  originalCents: number | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function dollarsToCents(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/([0-9][0-9,]*\.[0-9]{2})/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}

// BigCommerce nests the dollar value after an sr-only label span, e.g.
//   <span data-product-rrp-price-without-tax ...><span class="sr-only">MSRP:</span> $25.99</span>
// The three price markers (rrp / non-sale / current) are distinct literals and
// always appear in that document order. To read one marker's value without
// bleeding into the next section, slice the block from this marker up to the
// next marker and grab the first dollar amount inside that segment.
const PRICE_MARKERS = [
  "data-product-rrp-price-without-tax",
  "data-product-non-sale-price-without-tax",
  "data-product-price-without-tax",
];

function priceFromMarker(block: string, dataAttr: string): number | null {
  const start = block.indexOf(dataAttr);
  if (start < 0) return null;
  let end = block.length;
  for (const other of PRICE_MARKERS) {
    if (other === dataAttr) continue;
    const j = block.indexOf(other, start + dataAttr.length);
    if (j > start && j < end) end = j;
  }
  return dollarsToCents(block.slice(start, end));
}

function extractBrand(title: string): string | null {
  for (const brand of KNOWN_BRANDS) {
    if (title.toLowerCase().includes(brand.toLowerCase())) {
      // Normalize a couple of aliases.
      if (/^all[ -]star$/i.test(brand)) return "All-Star";
      if (/^evoshield$/i.test(brand)) return "EvoShield";
      return brand;
    }
  }
  return null;
}

// Split a category listing page into individual product card blocks.
export function parseListingCards(html: string): PiasCard[] {
  const blocks = html.split(/<li[^>]*class="[^"]*product[^"]*"/i).slice(1);
  const cards: PiasCard[] = [];

  for (const block of blocks) {
    const urlMatch = block.match(/href="([^"]*\/product\/[^"]+)"/i);
    if (!urlMatch) continue;
    let url = urlMatch[1];
    if (url.startsWith("/")) url = PIAS_BASE + url;

    // Title: prefer the card-title heading; fall back to the link aria-label.
    let title: string | null = null;
    const titleMatch = block.match(
      /class="[^"]*card-title[^"]*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i
    );
    if (titleMatch) title = decodeEntities(stripTags(titleMatch[1]));
    if (!title) {
      const aria = block.match(/aria-label="([^"]+)"/i);
      if (aria) title = decodeEntities(aria[1]);
    }
    if (!title) continue;

    const priceCents = priceFromMarker(block, "data-product-price-without-tax");
    if (!priceCents) continue;

    const rrp = priceFromMarker(block, "data-product-rrp-price-without-tax");
    const nonSale = priceFromMarker(
      block,
      "data-product-non-sale-price-without-tax"
    );
    let originalCents: number | null = null;
    if (rrp && rrp > priceCents) originalCents = rrp;
    else if (nonSale && nonSale > priceCents) originalCents = nonSale;

    // Image: prefer lazy data-src, then srcset, then src; only product CDN images.
    let imageUrl: string | null = null;
    const imgData = block.match(/data-src="([^"]+)"/i);
    const imgSrc = block.match(/<img[^>]+src="([^"]+)"/i);
    const candidate = imgData?.[1] || imgSrc?.[1] || null;
    if (candidate && !/data:image/i.test(candidate)) imageUrl = candidate;

    cards.push({ title, url, imageUrl, priceCents, originalCents });
  }

  return cards;
}

// Per-item sport refinement: most cards are generic "BB/SB"; only override the
// category default when the title clearly names fastpitch / slowpitch.
function resolveSportKind(
  def: CategoryDef,
  title: string
): { sport: BaseSport; kind: EquipKind } {
  let sport = def.sport;
  const t = title.toLowerCase();
  if (def.sport === "baseball") {
    if (t.includes("fastpitch") || /\bfp\b/.test(t)) sport = "fastpitch-softball";
    else if (t.includes("slowpitch") || t.includes("slow pitch") || /\bsp\b/.test(t))
      sport = "slowpitch-softball";
  }
  return { sport, kind: def.kind };
}

function cardToDeal(card: PiasCard, def: CategoryDef): InsertDeal | null {
  const { sport, kind } = resolveSportKind(def, card.title);
  let equipmentTypeId = `${SPORT_PREFIX[sport]}-${kind}`;

  const cleanName = card.title.slice(0, 200);
  equipmentTypeId = reclassifyBattingGloves(cleanName, sport, equipmentTypeId);
  const { subFilterId, dropWeight, sizeNumber } = classifyDealAttributes(
    cleanName,
    equipmentTypeId
  );

  // PIAS prefixes titles with "Used ..." or "New ..."; the catalog is
  // predominantly resale, so anything not explicitly labeled new is preowned.
  const condition = /^\s*new\b/i.test(card.title) ? "new" : "preowned";

  let msrpCents: number | null = null;
  let percentOff: string | null = null;
  if (card.originalCents && card.originalCents > card.priceCents) {
    msrpCents = card.originalCents;
    percentOff = (
      ((card.originalCents - card.priceCents) / card.originalCents) *
      100
    ).toFixed(3);
  }

  return {
    sourceId: PIAS_SOURCE_ID,
    title: cleanName,
    brand: extractBrand(cleanName),
    url: card.url,
    imageUrl: card.imageUrl,
    sportId: sport,
    equipmentTypeId,
    subFilterId,
    dropWeight,
    sizeNumber,
    condition,
    currency: "USD",
    msrpCents,
    manufacturerMsrpCents: null,
    msrpSource: msrpCents ? "retailer" : null,
    msrpVerified: false,
    priceCents: card.priceCents,
    percentOff,
    isBuyItNow: true,
    autoIncluded: false,
    autoIncludeRuleId: null,
    raw: {
      piasCategory: def.slug,
      piasUrl: card.url,
    },
  };
}

async function fetchCategoryPage(
  slug: string,
  page: number
): Promise<string | null> {
  const url = `${CATEGORY_BASE}/${slug}/?limit=50&page=${page}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface PiasSyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  total: number;
  log: string[];
}

export async function syncPlayItAgain(
  bulkUpsertDeals: (
    deals: InsertDeal[]
  ) => Promise<{ created: number; updated: number }>,
  maxPagesPerCategory: number = 8
): Promise<PiasSyncResult> {
  const log: string[] = [];
  const dealsToInsert: InsertDeal[] = [];
  const seenUrls = new Set<string>();
  let skipped = 0;
  let errors = 0;

  for (const def of CATEGORIES) {
    let catCount = 0;
    for (let page = 1; page <= maxPagesPerCategory; page++) {
      const html = await fetchCategoryPage(def.slug, page);
      // A null here is a fetch/HTTP failure (the normal end-of-pages signal is
      // an empty card list below), so surface it instead of silently stopping.
      if (html === null) {
        errors++;
        log.push(`${def.slug} p${page}: fetch failed`);
        break;
      }

      const cards = parseListingCards(html);
      if (cards.length === 0) break;

      for (const card of cards) {
        if (seenUrls.has(card.url)) continue;
        seenUrls.add(card.url);
        const deal = cardToDeal(card, def);
        if (deal) {
          dealsToInsert.push(deal);
          catCount++;
        } else {
          skipped++;
        }
      }

      // Last page if fewer than a full page of products.
      if (cards.length < 50) break;
      // Politeness delay between requests.
      await new Promise((r) => setTimeout(r, 600));
    }
    log.push(`${def.slug}: ${catCount} deals`);
    await new Promise((r) => setTimeout(r, 400));
  }

  let created = 0;
  let updated = 0;
  if (dealsToInsert.length > 0) {
    const result = await bulkUpsertDeals(dealsToInsert);
    created = result.created;
    updated = result.updated;
  }

  log.push(
    `Summary: ${dealsToInsert.length} deals (${skipped} skipped, ${errors} fetch errors), ${created} new, ${updated} updated`
  );

  return {
    created,
    updated,
    skipped,
    errors,
    total: dealsToInsert.length,
    log,
  };
}
