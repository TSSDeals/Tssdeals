import { eq, and, asc, desc, gte, ilike, inArray, isNull, isNotNull, not, or, sql as dsql } from "drizzle-orm";
import { normalizeBrand } from "./brand-normalizer";
import { expandEquipmentTypeIds, isBaseballBatGroupId, isBaseballGloveGroupId } from "../shared/equipment-groups";
import {
  BASEBALL_BAT_EVIDENCE_PATTERN,
  BASEBALL_BAT_NEGATIVE_EVIDENCE_PATTERN,
  BASEBALL_GLOVE_EVIDENCE_PATTERN,
  BASEBALL_GLOVE_FAMILY_PATTERN,
  BASEBALL_GLOVE_EXPLICIT_BASEBALL_PATTERN,
  BASEBALL_GLOVE_KNOWN_MODEL_PATTERN,
  BASEBALL_GLOVE_NEGATIVE_EVIDENCE_PATTERN,
  BASEBALL_GLOVE_STRUCTURED_CONTEXT_PATTERN,
  gloveSizeTitlePattern,
  hasStrongBaseballGloveSearchIntent,
  normalizeDealSearch,
  normalizeGloveSize,
  searchAliasPattern,
} from "./deal-search";
import {
  autoIncludeRules,
  deals,
  dealCategories,
  dealPriceAlerts,
  dealPriceHistory,
  ebaySellers,
  ebayOauthTokens,
  equipmentTypes,
  equipmentSubFilters,
  hiddenDeals,
  scheduledReports,
  searchQueries,
  sources,
  sports,
  userPreferences,
  pushSubscriptions,
  smsSubscribers,
  smsCampaigns,
  type SmsSubscriber,
  type SmsCampaign,
  type InsertSmsCampaign,
  type AutoIncludeRule,
  type Deal,
  type DealCategory,
  type DealPriceAlert,
  type DealPriceHistory,
  type DealsQueryParams,
  type EbaySeller,
  type EbayOauthToken,
  type EquipmentSubFilter,
  type InsertDeal,
  type InsertPushSubscription,
  type InsertUserPreferences,
  type EquipmentType,
  type ScheduledReport,
  type Source,
  type Sport,
  type UserPreferences,
  bonusDeals,
  type BonusDeal,
  type InsertBonusDeal,
  popularProducts,
  type PopularProduct,
  type InsertPopularProduct,
  dealClicks,
  sidelineswapSyncs,
  type SidelineswapSync,
  type InsertSidelineswapSync,
} from "@shared/schema";
import { db } from "./db";
import { assertTaxonomyApproval, type TaxonomyApprovalContext } from "./taxonomy-approval";

const defaultSeedDatabase = db;

export interface IStorage {
  listSports(): Promise<Sport[]>;
  createSport(name: string, approval: TaxonomyApprovalContext): Promise<Sport>;
  listEquipmentTypes(sportId?: string): Promise<EquipmentType[]>;
  createEquipmentType(name: string, sportId: string | undefined, approval: TaxonomyApprovalContext): Promise<EquipmentType>;
  listSources(): Promise<Source[]>;
  createSource(name: string, baseUrl: string): Promise<Source>;
  ensureSource(id: string, name: string, baseUrl: string): Promise<Source>;

  listDeals(params: DealsQueryParams): Promise<Deal[]>;
  hideDeal(userId: string, dealId: string): Promise<void>;
  unhideDeal(userId: string, dealId: string): Promise<void>;
  listFeaturedDeals(): Promise<Deal[]>;
  getDeal(id: string): Promise<Deal | undefined>;
  createDeal(deal: InsertDeal): Promise<Deal>;
  updateDeal(id: string, updates: Partial<InsertDeal>): Promise<Deal>;
  deleteDeal(id: string): Promise<void>;
  bulkUpsertDeals(newDeals: InsertDeal[], syncSourceLabel?: string): Promise<{ created: number; updated: number }>;
  recalculateDealDiscounts(dealIds?: string[]): Promise<number>;
  getDealPriceHistory(dealId: string): Promise<DealPriceHistory[]>;

  listBrands(params?: { sportId?: string; equipmentTypeId?: string; source?: string; condition?: string; minPercentOff?: number }): Promise<string[]>;

  listSubFilters(equipmentTypeId?: string): Promise<EquipmentSubFilter[]>;
  createSubFilter(name: string, equipmentTypeId: string, approval: TaxonomyApprovalContext): Promise<EquipmentSubFilter>;
  deleteSubFilter(id: string): Promise<void>;

  listAutoIncludeRules(): Promise<AutoIncludeRule[]>;

  listEbaySellers(): Promise<EbaySeller[]>;
  createEbaySeller(username: string, notes?: string): Promise<EbaySeller>;
  updateEbaySeller(id: string, data: { username?: string; notes?: string }): Promise<EbaySeller>;
  deleteEbaySeller(id: string): Promise<void>;
  getEbaySellerDealCounts(): Promise<Record<string, number>>;

  getEbayOauthToken(userId: string): Promise<EbayOauthToken | undefined>;
  listAllEbayOauthTokens(): Promise<EbayOauthToken[]>;
  upsertEbayOauthToken(userId: string, data: { accessToken: string; refreshToken: string; expiresAt: Date; scope?: string; ebayUsername?: string }): Promise<EbayOauthToken>;
  deleteEbayOauthToken(userId: string): Promise<void>;

  saveScheduledReport(userId: string, reportType: string, reportDate: string, csvContent: string, rowCount: number, error?: string): Promise<ScheduledReport>;
  listScheduledReports(userId: string, limit?: number): Promise<ScheduledReport[]>;
  getScheduledReport(id: string): Promise<ScheduledReport | undefined>;

  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  upsertUserPreferences(
    userId: string,
    prefs: InsertUserPreferences,
  ): Promise<UserPreferences>;

  addPushSubscription(userId: string, sub: InsertPushSubscription): Promise<void>;
  removePushSubscription(userId: string, endpoint: string): Promise<void>;
  listPushSubscriptionsForUser(userId: string): Promise<
    { endpoint: string; p256dh: string; auth: string }[]
  >;

  listDealCategories(enabledOnly?: boolean): Promise<DealCategory[]>;
  getDealCategory(slug: string): Promise<DealCategory | undefined>;
  getCategoryDeals(category: DealCategory, limit?: number): Promise<Deal[]>;
  trackSearch(query: string, userId?: string): Promise<void>;
  getPopularSearches(limit?: number, sinceDays?: number): Promise<{ query: string; count: number }[]>;
  ensureDynamicCategories(): Promise<void>;

  getUserPreferencesWithSms(userId: string): Promise<{ smsEnabled: boolean; phoneNumber: string | null } | undefined>;
  listSmsEnabledUsers(): Promise<{ userId: string; phoneNumber: string }[]>;
  optOutSmsByPhone(phoneNumber: string): Promise<number>;

  upsertSmsSubscriber(data: { phone: string; marketingConsent: boolean; transactionalConsent: boolean; optInIp?: string | null }): Promise<void>;
  optOutSmsSubscriberByPhone(phone: string): Promise<number>;
  listMarketingRecipients(): Promise<string[]>;

  createSmsCampaign(data: InsertSmsCampaign & { slug: string; createdBy?: string | null }): Promise<SmsCampaign>;
  listSmsCampaigns(): Promise<SmsCampaign[]>;
  getSmsCampaign(id: string): Promise<SmsCampaign | undefined>;
  getSmsCampaignBySlug(slug: string): Promise<SmsCampaign | undefined>;
  deleteSmsCampaign(id: string): Promise<void>;
  markSmsCampaignSent(id: string, recipientCount: number): Promise<void>;

  createPriceAlert(userId: string, dealId: string, targetPriceCents?: number | null, targetPercentOff?: number | null, scope?: string, matchTitle?: string | null, matchBrand?: string | null): Promise<DealPriceAlert>;
  listUserPriceAlerts(userId: string): Promise<DealPriceAlert[]>;
  listDealPriceAlerts(dealId: string, userId: string): Promise<DealPriceAlert[]>;
  deletePriceAlert(id: string, userId: string): Promise<void>;
  getActiveAlertsForDeals(dealIds: string[]): Promise<DealPriceAlert[]>;
  markAlertTriggered(id: string): Promise<void>;
  computeHistoricalLows(dealIds?: string[]): Promise<void>;
  getDefaultFeed(opts?: { perSport?: number; sportIds?: string[] }): Promise<{ sportId: string; sportName: string; deals: Deal[] }[]>;

  listBonusDeals(activeOnly?: boolean): Promise<BonusDeal[]>;
  createBonusDeal(data: InsertBonusDeal): Promise<BonusDeal>;
  updateBonusDeal(id: string, data: Partial<InsertBonusDeal>): Promise<BonusDeal>;
  deleteBonusDeal(id: string): Promise<void>;

  listPopularProducts(activeOnly?: boolean): Promise<PopularProduct[]>;
  createPopularProduct(data: InsertPopularProduct): Promise<PopularProduct>;
  updatePopularProduct(id: string, data: Partial<InsertPopularProduct>): Promise<PopularProduct>;
  deletePopularProduct(id: string): Promise<void>;
  getTrendingProducts(limit?: number): Promise<{ name: string; slug: string; sport: string; clicks: number }[]>;

  listSidelineswapSyncs(): Promise<SidelineswapSync[]>;
  getSidelineswapSync(ebaySku: string): Promise<SidelineswapSync | undefined>;
  upsertSidelineswapSync(data: InsertSidelineswapSync): Promise<SidelineswapSync>;
  updateSidelineswapSync(id: string, data: Partial<InsertSidelineswapSync>): Promise<SidelineswapSync>;
  deleteSidelineswapSync(id: string): Promise<void>;

  seed(database?: any): Promise<void>;
}

// Normalize a US phone to E.164 (+1XXXXXXXXXX). Falls back to a "+"-prefixed
// digit string for non-10-digit inputs so storage/dedup stays deterministic.
function toE164(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// Normalize a deal title to a variant-collapsed key.
// Strips sizes, drops, weights, bundle quantities, and size/gender words so that
// "2024 Meta X (-8) 34" / 24 oz." and "2024 Meta X (-9) 33"" → same key.
export function normalizeVariantTitle(title: string | null): string {
  const raw = title ?? "";
  return raw
    .split("|")[0]                                                  // first pipe segment only
    .replace(/&#\d+;/g, "")                                        // strip HTML entities (&#8243; etc.)
    .replace(/\bREAD\s+AD!*\b/gi, "")                              // seller attention tags "READ AD!"
    .replace(/\b(?:bundle|pack|lot)\b\s*(?:of\s+)?(?:\w+\s+){0,2}?\d+/gi, "") // "Bundle of any 10", "Pack of 5"
    .replace(/\b\d+[- ]?(?:bat|pack|count|ct|pc|piece)\b/gi, "")  // "3-Bat BOGO", "6 pack"
    .replace(/\b(?:bundle|bogo|closeout|sale)\b/gi, "")            // leftover BUNDLE / BOGO words
    .replace(/\b(?:three|four|five|six|seven|eight|nine|ten)\b/gi, "") // written counts
    .replace(/\b[2-9]\s+(?=[A-Za-z])/g, "")                       // lone quantity digit: "2 Adult", "3 Youth"
    .replace(/\([-]?\d+\)/g, "")                                   // drop weights: (-8), (-3)
    .replace(/\d{2,3}\s*[""''″′]\s*/g, "")                        // lengths like 33", 34"
    .replace(/\d+\s*[\/\\]\s*\d+/g, "")                           // size fractions: 34/24, 31/21
    .replace(/\d+\s*(?:oz|lb|kg|in|cm|mm)\.?\b/gi, "")           // weights/dims with numbers
    .replace(/\b(?:oz|lb|kg|in|cm)\.?\b/gi, "")                   // standalone unit words
    .replace(/\b(?:xs|sm|md|lg|xl|xxl|xxxl|small|medium|large|x-large)\b/gi, "") // clothing sizes
    .replace(/\b(?:junior|youth|adult|senior|jr|sr|men|women|womens|mens|girls|boys|unisex)\b/gi, "")
    .replace(/\b(?:left|right|lh|rh)\b/gi, "")                    // handedness
    .replace(/\b(?:new|used|open box|refurb)\b/gi, "")            // condition words
    .replace(/\b(helmet|bat|glove|shoe|pad|cleat|ball|guard|shin|stick|club)s\b/gi, "$1") // singularize
    .replace(/\b(?:of|or|and|the|a|an|any|for|with|by|at|from|to)\b/gi, "")
    .replace(/[\/\\&.,;:!?()\[\]"']+/g, " ")                      // punctuation → space
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Deduplicate a pool of deals, keeping the highest-discount representative for each group.
// Two deals collapse if they share the same normalized title OR the same imageUrl.
// By default keys are scoped per source (sourceId::title); pass crossSource to collapse
// the same product across different retailers (used for curated "top deal" lists).
export function dedupeDealPool(pool: Deal[], opts?: { crossSource?: boolean }): Deal[] {
  const crossSource = opts?.crossSource ?? false;
  const byTitle = new Map<string, Deal>();
  const byImage = new Map<string, Deal>();
  const result: Deal[] = [];

  for (const deal of pool) {
    const normalized = normalizeVariantTitle(deal.title);
    const tKey = crossSource ? normalized : `${deal.sourceId}::${normalized}`;
    const iKey = deal.imageUrl
      ? (crossSource ? deal.imageUrl : `${deal.sourceId}::${deal.imageUrl}`)
      : null;

    // Per-source dedup keys on the (possibly empty) normalized title — matching the
    // original behavior. Cross-source dedup skips empty titles so unrelated products
    // with un-normalizable titles aren't all collapsed into one.
    const useTitleKey = crossSource ? normalized.length > 0 : true;

    const titleMatch = useTitleKey ? byTitle.get(tKey) : undefined;
    const imageMatch = iKey ? byImage.get(iKey) : undefined;
    const existing = titleMatch ?? imageMatch;

    if (!existing) {
      if (useTitleKey) byTitle.set(tKey, deal);
      if (iKey) byImage.set(iKey, deal);
      result.push(deal);
    } else if (Number(deal.percentOff ?? 0) > Number(existing.percentOff ?? 0)) {
      const idx = result.indexOf(existing);
      if (idx !== -1) result[idx] = deal;
      if (useTitleKey) byTitle.set(tKey, deal);
      if (iKey) byImage.set(iKey, deal);
    }
  }
  return result;
}

export class DatabaseStorage implements IStorage {
  async listSports(): Promise<Sport[]> {
    return await db.select().from(sports).orderBy(sports.name);
  }

  async createSport(name: string, approval: TaxonomyApprovalContext): Promise<Sport> {
    assertTaxonomyApproval(approval);
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const existing = await db.select().from(sports).where(eq(sports.id, id)).limit(1);
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(sports).values({ id, name, userCreated: true }).returning();
    return created;
  }

  async listEquipmentTypes(sportId?: string): Promise<EquipmentType[]> {
    if (sportId) {
      return await db
        .select()
        .from(equipmentTypes)
        .where(eq(equipmentTypes.sportId, sportId))
        .orderBy(equipmentTypes.name);
    }
    return await db.select().from(equipmentTypes).orderBy(equipmentTypes.name);
  }

  async createEquipmentType(name: string, sportId: string | undefined, approval: TaxonomyApprovalContext): Promise<EquipmentType> {
    assertTaxonomyApproval(approval);
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const existing = await db.select().from(equipmentTypes).where(eq(equipmentTypes.id, id)).limit(1);
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(equipmentTypes).values({ id, name, sportId: sportId ?? null, userCreated: true }).returning();
    return created;
  }

  async listSources(): Promise<Source[]> {
    return await db
      .select()
      .from(sources)
      .orderBy(desc(sources.isOurStore), desc(sources.priorityBoost), sources.name);
  }

  async createSource(name: string, baseUrl: string): Promise<Source> {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const existing = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(sources).values({ id, name, baseUrl }).returning();
    return created;
  }

  async listDeals(params: DealsQueryParams): Promise<Deal[]> {
    const whereParts: any[] = [];
    const amzBypass = eq(deals.sourceId, "amazon-manual");
    const normalizedSearch = params.q?.trim() ? normalizeDealSearch(params.q) : null;

    if (normalizedSearch?.concepts.length) {
      const conceptConditions = normalizedSearch.concepts.map((concept) => {
        if (concept.kind === "text") {
          return or(
            ilike(deals.title, `%${concept.value}%`),
            ilike(deals.brand, `%${concept.value}%`),
            dsql`search_vector @@ plainto_tsquery('english', ${concept.value})`,
          )!;
        }
        if (concept.kind === "alias") {
          const pattern = searchAliasPattern(concept.values);
          return or(dsql`${deals.title} ~* ${pattern}`, dsql`COALESCE(${deals.brand}, '') ~* ${pattern}`)!;
        }
        if (concept.kind === "glove-size") {
          const sizePattern = gloveSizeTitlePattern(concept.size);
          return or(
            dsql`${deals.title} ~* ${sizePattern}`,
            dsql`TRIM(REGEXP_REPLACE(COALESCE(${deals.sizeNumber}, ''), '[^0-9.]', '', 'g')) = ${concept.size}`,
          )!;
        }
        const dropPattern = `(^|[^a-z0-9])(drop\\s*-?\\s*|-)${concept.drop}([^a-z0-9]|$)`;
        const dropCondition = or(
          eq(deals.dropWeight, concept.drop),
          dsql`${deals.title} ~* ${dropPattern}`,
          dsql`COALESCE(${deals.brand}, '') ~* ${dropPattern}`,
        )!;
        if (concept.kind === "drop") return dropCondition;
        const sizePattern = `(^|[^0-9])${concept.length}\\s*(/|x|by)\\s*${concept.weight}([^0-9]|$)`;
        return or(dsql`${deals.title} ~* ${sizePattern}`, dropCondition)!;
      });
      whereParts.push(and(...conceptConditions));
    }

    if (params.q && !normalizedSearch) {
      const searchTerms = params.q.trim().split(/\s+/).filter(Boolean);
      if (searchTerms.length > 0) {
        const termConditions = searchTerms.map((term) =>
          or(
            ilike(deals.title, `%${term}%`),
            ilike(deals.brand, `%${term}%`),
          )
        );
        // Combine ILIKE-based matches (accelerated by trigram GIN index)
        // with FTS matches (handles stemming: "gloves" → "glove", "batting" → "bat")
        const ftsMatch = dsql`search_vector @@ websearch_to_tsquery('english', ${params.q.trim()})`;
        whereParts.push(or(...termConditions, ftsMatch));
      }
    }

    // For sport/equipment/sub-filter: amazon-manual deals only bypass if they have NO classification
    // (null sport/equipment). If they ARE tagged, they must match the selected filter.
    const amzNoSport = and(amzBypass, isNull(deals.sportId));
    const amzNoEquip = and(amzBypass, isNull(deals.equipmentTypeId));
    const requestedEquipmentIds = expandEquipmentTypeIds(params.sportId, params.equipmentTypeIds?.length
      ? params.equipmentTypeIds
      : (params.equipmentTypeId ? [params.equipmentTypeId] : []));
    const baseballBatEvidence = params.sportId === "baseball" && requestedEquipmentIds.some(isBaseballBatGroupId)
      ? and(
          dsql`(COALESCE(${deals.title}, '') || ' ' || COALESCE(${deals.brand}, '') || ' ' || COALESCE(${deals.raw}::text, '')) ~* ${BASEBALL_BAT_EVIDENCE_PATTERN}`,
          dsql`COALESCE(${deals.title}, '') !~* ${BASEBALL_BAT_NEGATIVE_EVIDENCE_PATTERN}`,
          dsql`(${deals.sportId} IS NULL OR ${deals.sportId} NOT IN ('fastpitch-softball', 'slowpitch-softball'))`,
          dsql`(${deals.equipmentTypeId} IS NULL OR (${deals.equipmentTypeId} NOT LIKE 'fp-%' AND ${deals.equipmentTypeId} NOT LIKE 'sp-%'))`,
        )
      : null;
    const baseballGloveGroupRequest = requestedEquipmentIds.some(isBaseballGloveGroupId);
    const baseballGloveSportSearchRecovery = params.sportId === "baseball"
      && requestedEquipmentIds.length === 0
      && hasStrongBaseballGloveSearchIntent(params.q);
    const baseballGloveTitleAndBrand = dsql`(COALESCE(${deals.title}, '') || ' ' || COALESCE(${deals.brand}, ''))`;
    const baseballGloveStructuredContext = dsql`(
      COALESCE(${deals.sourceId}, '') || ' ' ||
      COALESCE(${deals.raw}->>'category', '') || ' ' ||
      COALESCE(${deals.raw}->>'categoryName', '') || ' ' ||
      COALESCE(${deals.raw}->>'productType', '') || ' ' ||
      COALESCE(${deals.raw}->>'shopifyProductType', '') || ' ' ||
      COALESCE(${deals.raw}->>'collection', '') || ' ' ||
      COALESCE((${deals.raw}->'collections')::text, '') || ' ' ||
      COALESCE((${deals.raw}->'breadcrumbs')::text, '') || ' ' ||
      COALESCE(${deals.raw}->>'seller', '') || ' ' ||
      COALESCE(${deals.raw}->>'sellerName', '') || ' ' ||
      COALESCE(${deals.raw}->>'storeName', '')
    )`;
    const strongStoredSoftballOverride = and(
      dsql`${baseballGloveTitleAndBrand} ~* ${BASEBALL_GLOVE_KNOWN_MODEL_PATTERN}`,
      dsql`${deals.title} ~* ${BASEBALL_GLOVE_EXPLICIT_BASEBALL_PATTERN}`,
    );
    const baseballGloveStoredSportAllowed = or(
      dsql`(${deals.sportId} IS NULL OR ${deals.sportId} NOT IN ('fastpitch-softball', 'slowpitch-softball', 'golf', 'boxing', 'cricket'))`,
      and(inArray(deals.sportId, ['fastpitch-softball', 'slowpitch-softball']), strongStoredSoftballOverride),
    );
    const baseballGloveStoredEquipmentAllowed = or(
      dsql`(${deals.equipmentTypeId} IS NULL OR (${deals.equipmentTypeId} NOT LIKE 'fp-%' AND ${deals.equipmentTypeId} NOT LIKE 'sp-%' AND ${deals.equipmentTypeId} NOT IN ('bb-batting-gloves', 'golf-glove', 'boxing-gloves')))`,
      and(
        or(dsql`${deals.equipmentTypeId} LIKE 'fp-%'`, dsql`${deals.equipmentTypeId} LIKE 'sp-%'`),
        dsql`${deals.equipmentTypeId} NOT LIKE '%batting%'`,
        strongStoredSoftballOverride,
      ),
    );
    const baseballGloveEvidence = params.sportId === "baseball" && (baseballGloveGroupRequest || baseballGloveSportSearchRecovery)
      ? and(
          or(
            dsql`${baseballGloveTitleAndBrand} ~* ${BASEBALL_GLOVE_EVIDENCE_PATTERN}`,
            and(
              dsql`${baseballGloveTitleAndBrand} ~* ${BASEBALL_GLOVE_FAMILY_PATTERN}`,
              or(
                dsql`${deals.title} ~* ${'(^|[^0-9.])(?:8|9|1[0-5])(?:\\.[0-9]{1,2})?[\\s-]*(?:["″]|in(?:ch(?:es)?)?\\.?)?(?=[^0-9.]|$)'}`,
                dsql`TRIM(REGEXP_REPLACE(COALESCE(${deals.sizeNumber}, ''), '[^0-9.]', '', 'g')) ~ '^(?:8|9|1[0-5])(?:\\.[0-9]{1,2})?$'`,
              ),
              dsql`${baseballGloveStructuredContext} ~* ${BASEBALL_GLOVE_STRUCTURED_CONTEXT_PATTERN}`,
            ),
          ),
          dsql`COALESCE(${deals.title}, '') !~* ${BASEBALL_GLOVE_NEGATIVE_EVIDENCE_PATTERN}`,
          baseballGloveStoredSportAllowed,
          baseballGloveStoredEquipmentAllowed,
        )
      : null;

    // When a specific source is explicitly selected (e.g. eBay), marketplace listings often have
    // null equipment types because they aren't pre-classified. Extend the bypass so that unclassified
    // deals from the selected source still appear (sport filter still applies).
    const selectedSrcNoEquip = params.source && params.source !== "amazon-manual"
      ? and(eq(deals.sourceId, params.source), isNull(deals.equipmentTypeId))
      : null;

    if (params.sportId) {
      const conditions: any[] = [eq(deals.sportId, params.sportId), amzNoSport];
      if (baseballBatEvidence) conditions.push(baseballBatEvidence);
      if (baseballGloveEvidence) conditions.push(baseballGloveEvidence);
      whereParts.push(or(...conditions));
    }

    if (requestedEquipmentIds.length > 0) {
      const conditions: any[] = [inArray(deals.equipmentTypeId, requestedEquipmentIds), amzNoEquip];
      if (selectedSrcNoEquip) conditions.push(selectedSrcNoEquip);
      if (baseballBatEvidence) conditions.push(baseballBatEvidence);
      if (baseballGloveEvidence) conditions.push(baseballGloveEvidence);
      whereParts.push(or(...conditions));
    }

    if (params.sportId === "baseball" && baseballGloveGroupRequest) {
      whereParts.push(dsql`COALESCE(${deals.title}, '') !~* ${BASEBALL_GLOVE_NEGATIVE_EVIDENCE_PATTERN}`);
      whereParts.push(baseballGloveStoredSportAllowed!);
      whereParts.push(baseballGloveStoredEquipmentAllowed!);
    }

    // Cricket bats get misclassified as baseball/softball bats by broad "bat" keyword
    // matching. Keep them out of any bat or baseball/softball view.
    const BAT_EQ_IDS = ["bb-bats", "fp-bats", "sp-bats"];
    const BASEBALL_SPORT_IDS = ["baseball", "fastpitch-softball", "slowpitch-softball"];
    const eqIds = requestedEquipmentIds;
    const isBatOrBaseballView =
      eqIds.some((id) => BAT_EQ_IDS.includes(id)) ||
      (params.sportId && BASEBALL_SPORT_IDS.includes(params.sportId));
    if (isBatOrBaseballView) {
      whereParts.push(dsql`LOWER(${deals.title}) NOT LIKE '%cricket%'`);
    }

    if (params.subFilterId) {
      // Many deals are imported without a sub_filter_id assigned (e.g. ~43% of
      // bats, ~96% of basketballs). Strict equality hides them and produces
      // empty result sets for filters that should match. Fall back to a
      // keyword match against the deal title/brand using the sub-filter's
      // name (and a handful of synonyms for common drop-weight style filters)
      // so that any deal that semantically belongs surfaces.
      const [sf] = await db
        .select({ id: equipmentSubFilters.id, name: equipmentSubFilters.name })
        .from(equipmentSubFilters)
        .where(eq(equipmentSubFilters.id, params.subFilterId))
        .limit(1);
      if (sf) {
        const keywords: string[] = [sf.name];
        const dropMatch = sf.name.match(/^Drop\s*-?\s*(\d+)$/i);
        // Match whole-number sizes (e.g. "Size 5") as well as decimal sizes (e.g. "Size 11.5", "Size 12.75").
        const normalizedSize = normalizeGloveSize(sf.name)
          ?? sf.name.match(/^Size\s*(\d{1,3}(?:\.\d{1,2})?)$/i)?.[1]
          ?? null;
        if (dropMatch) {
          keywords.push(`-${dropMatch[1]}`, `drop ${dropMatch[1]}`, `drop-${dropMatch[1]}`);
        }
        // Use word-boundary regex to avoid false positives like "Wood" matching
        // "Woodson". ILIKE prefilter keeps the GIN trigram index in play; the
        // ~* regex match narrows results to whole-word hits.
        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const keywordMatches = keywords.flatMap((kw) => {
          const pattern = `(^|[^a-z0-9])${escapeRegex(kw)}([^a-z0-9]|$)`;
          return [
            and(ilike(deals.title, `%${kw}%`), dsql`${deals.title} ~* ${pattern}`),
            and(ilike(deals.brand, `%${kw}%`), dsql`COALESCE(${deals.brand}, '') ~* ${pattern}`),
          ];
        });
        // Match the legacy single-tag column, ANY entry in the multi-tag join
        // table, the keyword fallback, OR the derived numeric attribute columns
        // (populated at sync time by classifyDealAttributes). The EXISTS clause
        // lets a deal surface under any of its multiple tags.
        const orParts: any[] = [
          eq(deals.subFilterId, params.subFilterId),
          dsql`EXISTS (SELECT 1 FROM deal_sub_filters dsf WHERE dsf.deal_id = ${deals.id} AND dsf.sub_filter_id = ${params.subFilterId})`,
          ...keywordMatches,
        ];
        if (dropMatch) {
          orParts.push(eq(deals.dropWeight, parseInt(dropMatch[1], 10)));
        }
        if (normalizedSize) {
          // Normalize equivalent punctuation in titles and stored size_number values.
          orParts.push(dsql`${deals.title} ~* ${gloveSizeTitlePattern(normalizedSize)}`);
          orParts.push(dsql`TRIM(REGEXP_REPLACE(COALESCE(${deals.sizeNumber}, ''), '[^0-9.]', '', 'g')) = ${normalizedSize}`);
        }
        whereParts.push(or(...orParts)!);
      } else {
        whereParts.push(
          or(
            eq(deals.subFilterId, params.subFilterId),
            dsql`EXISTS (SELECT 1 FROM deal_sub_filters dsf WHERE dsf.deal_id = ${deals.id} AND dsf.sub_filter_id = ${params.subFilterId})`,
          )!,
        );
      }
    }

    if (params.ebaySeller) {
      whereParts.push(
        or(dsql`LOWER(${deals.raw}->>'ebaySeller') = LOWER(${params.ebaySeller})`, amzBypass)
      );
    }

    if (params.brand) {
      whereParts.push(or(ilike(deals.brand, params.brand), amzBypass));
    }

    if (params.condition && params.condition !== "all") {
      whereParts.push(or(eq(deals.condition, params.condition), amzBypass));
    }

    const marketplaceSources = ["ebay", "sidelineswap"];

    const minPercentOff =
      typeof params.minPercentOff === "number" ? params.minPercentOff : 50;
    const discountConditions: any[] = [
      gte(deals.percentOff, String(minPercentOff)),
      eq(deals.autoIncluded, true),
      amzBypass,
    ];
    if (params.ebaySeller) {
      discountConditions.push(
        dsql`LOWER(${deals.raw}->>'ebaySeller') = LOWER(${params.ebaySeller})`
      );
    }
    if (params.q && params.q.trim()) {
      discountConditions.push(isNull(deals.percentOff));
    }
    if (minPercentOff === 0) {
      discountConditions.push(isNull(deals.percentOff));
    }
    // Marketplace sources (eBay, SidelineSwap) typically lack compare_at_price,
    // so when one is explicitly selected bypass the discount filter entirely —
    // the source filter in whereParts still narrows results to that marketplace.
    if (params.source && marketplaceSources.includes(params.source)) {
      discountConditions.push(eq(deals.sourceId, params.source));
    }
    whereParts.push(or(...discountConditions));

    if (typeof params.maxPrice === "number" && params.maxPrice > 0) {
      const maxPriceCents = Math.round(params.maxPrice * 100);
      whereParts.push(
        or(
          dsql`${deals.priceCents} <= ${maxPriceCents}`,
          amzBypass,
        )
      );
    }

    if (params.featured) {
      whereParts.push(eq(deals.isFeatured, true));
    } else if (params.source) {
      whereParts.push(eq(deals.sourceId, params.source));
      if (params.source === "twin-seam-sports") {
        whereParts.push(
          or(
            dsql`${deals.raw}->>'shopifyVendor' = 'Twin Seam Sports'`,
            gte(deals.percentOff, String(45)),
          )
        );
      }
    }

    if (params.priceDropOnly) {
      whereParts.push(or(eq(deals.hasPriceDrop, true), amzBypass));
    }

    if (params.currency) {
      whereParts.push(eq(deals.currency, params.currency));
    }

    const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    whereParts.push(
      or(
        not(inArray(deals.sourceId, marketplaceSources)),
        gte(deals.lastSeenAt, staleCutoff),
      )
    );

    // Exclude deals hidden by this user
    if (params.userId) {
      whereParts.push(
        not(inArray(deals.id, db.select({ id: hiddenDeals.dealId }).from(hiddenDeals).where(eq(hiddenDeals.userId, params.userId))))
      );
    }

    const where = whereParts.length ? and(...whereParts) : undefined;

    const isAll = params.limit === "all";
    const limit = isAll ? 10000 : Math.max(1, Math.min(200, (typeof params.limit === "number" ? params.limit : 50)));

    let orderClause: any[];
    if (params.q) {
      const searchTerms = (normalizedSearch?.rankQuery || params.q).split(/\s+/).filter(Boolean);
      const qEsc = (normalizedSearch?.rankQuery || params.q.trim()).replace(/'/g, "''");

      // When the user explicitly picks a non-default sort, respect it as the primary
      // ordering. Relevance scoring only applies when using the default sort.
      const hasExplicitSort = params.sortBy && params.sortBy !== "discount-high";

      if (hasExplicitSort) {
        // User overrode the default — sort by their choice first, relevance as tiebreaker
        const ftsRank = dsql.raw(
          `ts_rank_cd(COALESCE(search_vector, to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(brand,''))), websearch_to_tsquery('english', '${qEsc}'), 4)`
        );
        switch (params.sortBy) {
          case "price-low":
            orderClause = [asc(deals.priceCents), desc(ftsRank), desc(deals.foundAt)];
            break;
          case "price-high":
            orderClause = [desc(deals.priceCents), desc(ftsRank), desc(deals.foundAt)];
            break;
          case "oldest":
            orderClause = [asc(deals.foundAt), desc(ftsRank)];
            break;
          case "newest":
            orderClause = [desc(deals.foundAt), desc(ftsRank)];
            break;
          case "a-z":
            orderClause = [asc(deals.title), desc(ftsRank)];
            break;
          case "z-a":
            orderClause = [desc(deals.title), desc(ftsRank)];
            break;
          case "discount-high":
          default:
            orderClause = [desc(deals.percentOff), desc(ftsRank), desc(deals.foundAt)];
        }
      } else {
        // Default: rank by relevance first
        const ftsRank = dsql.raw(
          `ts_rank_cd(COALESCE(search_vector, to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(brand,''))), websearch_to_tsquery('english', '${qEsc}'), 4)`
        );

        // Secondary: term-count score (more matching terms = higher rank)
        const termScoreParts = searchTerms.map((term) => {
          const esc = term.replace(/'/g, "''");
          return `(CASE WHEN title ILIKE '%${esc}%' OR brand ILIKE '%${esc}%' THEN 1 ELSE 0 END)`;
        });
        const matchCountExpr = dsql.raw(`(${termScoreParts.join(" + ")})`);

        // Tertiary: bonus for exact phrase match in title
        const phraseBonus = dsql.raw(`CASE WHEN title ILIKE '%${qEsc}%' THEN 1 ELSE 0 END`);

        const batSize = normalizedSearch?.concepts.find((concept) => concept.kind === "bat-size");
        const relevanceOrder = [desc(ftsRank), desc(matchCountExpr), desc(phraseBonus), desc(deals.percentOff), desc(deals.foundAt)];
        orderClause = batSize && batSize.kind === "bat-size"
          ? [
              desc(dsql`CASE WHEN ${deals.title} ~* ${`(^|[^0-9])${batSize.length}\\s*(/|x|by)\\s*${batSize.weight}([^0-9]|$)`} THEN 1 ELSE 0 END`),
              ...relevanceOrder,
            ]
          : relevanceOrder;
      }
    } else {
      switch (params.sortBy) {
        case "oldest":
          orderClause = [asc(deals.foundAt)];
          break;
        case "price-low":
          orderClause = [asc(deals.priceCents), desc(deals.foundAt)];
          break;
        case "price-high":
          orderClause = [desc(deals.priceCents), desc(deals.foundAt)];
          break;
        case "a-z":
          orderClause = [asc(deals.title), desc(deals.foundAt)];
          break;
        case "z-a":
          orderClause = [desc(deals.title), desc(deals.foundAt)];
          break;
        case "newest":
          orderClause = [desc(deals.foundAt)];
          break;
        case "discount-high":
        default:
          orderClause = [desc(deals.percentOff), desc(deals.foundAt)];
          break;
      }
    }

    const results = await db
      .select()
      .from(deals)
      .where(where)
      .orderBy(...orderClause)
      .limit(limit);

    return results;
  }

  async hideDeal(userId: string, dealId: string): Promise<void> {
    await db.insert(hiddenDeals).values({ userId, dealId }).onConflictDoNothing();
  }

  async unhideDeal(userId: string, dealId: string): Promise<void> {
    await db.delete(hiddenDeals).where(and(eq(hiddenDeals.userId, userId), eq(hiddenDeals.dealId, dealId)));
  }

  async listBrands(params?: { sportId?: string; equipmentTypeId?: string; source?: string; condition?: string; minPercentOff?: number }): Promise<string[]> {
    const whereParts: any[] = [isNotNull(deals.brand)];
    if (params?.sportId) whereParts.push(eq(deals.sportId, params.sportId));
    if (params?.equipmentTypeId) whereParts.push(eq(deals.equipmentTypeId, params.equipmentTypeId));
    if (params?.source) whereParts.push(eq(deals.sourceId, params.source));
    if (params?.condition && params.condition !== "all") whereParts.push(eq(deals.condition, params.condition));
    const minPct = typeof params?.minPercentOff === "number" ? params.minPercentOff : 0;
    if (minPct > 0) {
      whereParts.push(
        or(gte(deals.percentOff, String(minPct)), eq(deals.autoIncluded, true))
      );
    }
    const rows = await db
      .selectDistinct({ brand: deals.brand })
      .from(deals)
      .where(and(...whereParts))
      .orderBy(deals.brand);
    return rows.map((r) => r.brand!).filter(Boolean);
  }

  async listFeaturedDeals(): Promise<Deal[]> {
    return await db
      .select()
      .from(deals)
      .where(eq(deals.isFeatured, true))
      .orderBy(desc(deals.foundAt))
      .limit(50);
  }

  async getDeal(id: string): Promise<Deal | undefined> {
    const [deal] = await db.select().from(deals).where(eq(deals.id, id));
    return deal;
  }

  async createDeal(deal: InsertDeal): Promise<Deal> {
    deal.brand = normalizeBrand(deal.brand);
    const [created] = await db.insert(deals).values(deal).returning();
    return created;
  }

  async updateDeal(id: string, updates: Partial<InsertDeal>): Promise<Deal> {
    if (updates.brand !== undefined) {
      updates.brand = normalizeBrand(updates.brand);
    }
    const [updated] = await db
      .update(deals)
      .set({ ...updates, lastSeenAt: new Date() })
      .where(eq(deals.id, id))
      .returning();
    return updated;
  }

  async ensureSource(id: string, name: string, baseUrl: string): Promise<Source> {
    const existing = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
    if (existing.length > 0) {
      if (existing[0].name !== name) {
        const [updated] = await db.update(sources).set({ name }).where(eq(sources.id, id)).returning();
        return updated;
      }
      return existing[0];
    }
    const [created] = await db.insert(sources).values({ id, name, baseUrl }).returning();
    return created;
  }

  async deleteDeal(id: string): Promise<void> {
    await db.delete(deals).where(eq(deals.id, id));
  }

  async bulkUpsertDeals(newDeals: InsertDeal[], syncSourceLabel?: string): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    const PRICE_DROP_THRESHOLD = 20;
    const upsertedIds: string[] = [];

    // Load valid sub_filter IDs from the DB so we can null out any that don't exist
    // (production DB may have different IDs than what the classifiers generate)
    const validSubFilterRows = await db.select({ id: equipmentSubFilters.id }).from(equipmentSubFilters);
    const validSubFilterIds = new Set(validSubFilterRows.map((r) => r.id));

    const seenTitles = new Set<string>();

    for (const deal of newDeals) {
      // Normalize brand to canonical form before any DB operation
      deal.brand = normalizeBrand(deal.brand);

      if (deal.subFilterId && !validSubFilterIds.has(deal.subFilterId)) {
        deal.subFilterId = null;
      }
      const normalizedTitle = deal.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 120);
      const dedupKey = `${deal.sourceId}|${normalizedTitle}|${deal.priceCents}`;
      if (seenTitles.has(dedupKey)) {
        continue;
      }
      seenTitles.add(dedupKey);

      const existing = await db
        .select({
          id: deals.id,
          priceCents: deals.priceCents,
          originalPriceCents: deals.originalPriceCents,
          highestPriceCents: deals.highestPriceCents,
        })
        .from(deals)
        .where(and(eq(deals.url, deal.url), eq(deals.sourceId, deal.sourceId)))
        .limit(1);

      if (existing.length === 0) {
        const titleDupe = await db
          .select({ id: deals.id, priceCents: deals.priceCents, originalPriceCents: deals.originalPriceCents, highestPriceCents: deals.highestPriceCents })
          .from(deals)
          .where(
            and(
              eq(deals.sourceId, deal.sourceId),
              dsql`LOWER(REGEXP_REPLACE(${deals.title}, '[^a-zA-Z0-9]', '', 'g')) = ${normalizedTitle}`,
            )
          )
          .limit(1);

        if (titleDupe.length > 0) {
          existing.push(titleDupe[0]);
        }
      }

      if (existing.length > 0) {
        const ex = existing[0];
        const originalPrice = ex.originalPriceCents ?? ex.priceCents;
        const highestPrice = Math.max(ex.highestPriceCents ?? ex.priceCents, ex.priceCents);
        const referencePrice = Math.max(originalPrice, highestPrice);

        const dropPercent = referencePrice > 0
          ? ((referencePrice - deal.priceCents) / referencePrice) * 100
          : 0;
        const hasDrop = dropPercent >= PRICE_DROP_THRESHOLD;

        const hasHistory = await db.select({ cnt: dsql<number>`count(*)::int` }).from(dealPriceHistory).where(eq(dealPriceHistory.dealId, ex.id));
        const historyCount = hasHistory[0]?.cnt ?? 0;
        if (deal.priceCents !== ex.priceCents || historyCount === 0) {
          await db.insert(dealPriceHistory).values({
            dealId: ex.id,
            priceCents: deal.priceCents,
            syncSource: syncSourceLabel,
          });
        }

        const now = new Date();
        await db
          .update(deals)
          .set({
            url: deal.url,
            priceCents: deal.priceCents,
            msrpCents: deal.msrpCents,
            percentOff: deal.percentOff,
            lastSeenAt: now,
            lastPriceConfirmedAt: now,
            imageUrl: deal.imageUrl,
            title: deal.title,
            brand: deal.brand,
            originalPriceCents: originalPrice,
            highestPriceCents: highestPrice,
            priceDropPercent: dropPercent > 0 ? String(dropPercent) : null,
            hasPriceDrop: hasDrop,
            raw: deal.raw ?? undefined,
            // Persist smart-classifier fields on update so newly-added rules
            // and re-parsed titles propagate to existing deals on the next
            // sync. Without these, recurring deals would be stuck with their
            // original classification forever and the catalog-wide reclassify
            // job would be the only way to update them.
            subFilterId: deal.subFilterId ?? null,
            dropWeight: deal.dropWeight ?? null,
            sizeNumber: deal.sizeNumber ?? null,
          })
          .where(eq(deals.id, ex.id));

        // Update search_vector for FTS
        await db.execute(dsql`
          UPDATE deals
          SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(brand, ''))
          WHERE id = ${ex.id}
        `);

        upsertedIds.push(ex.id);
        await this.syncDealSubFilters(ex.id, deal);
        updated++;
      } else {
        const insertNow = new Date();
        await db.insert(deals).values({
          ...deal,
          originalPriceCents: deal.priceCents,
          highestPriceCents: deal.priceCents,
          lastPriceConfirmedAt: insertNow,
        });

        const inserted = await db
          .select({ id: deals.id })
          .from(deals)
          .where(and(eq(deals.url, deal.url), eq(deals.sourceId, deal.sourceId)))
          .limit(1);

        if (inserted.length > 0) {
          await db.insert(dealPriceHistory).values({
            dealId: inserted[0].id,
            priceCents: deal.priceCents,
            syncSource: syncSourceLabel,
          });

          // Set search_vector for FTS on new deal
          await db.execute(dsql`
            UPDATE deals
            SET search_vector = to_tsvector('english', coalesce(title, '') || ' ' || coalesce(brand, ''))
            WHERE id = ${inserted[0].id}
          `);

          upsertedIds.push(inserted[0].id);
          await this.syncDealSubFilters(inserted[0].id, deal);
        }
        created++;
      }
    }

    // Recalculate percent_off for all deals we just touched using the enriched pricing logic
    if (upsertedIds.length > 0) {
      await this.recalculateDealDiscounts(upsertedIds);
    }

    return { created, updated };
  }

  /**
   * Recalculate percent_off for deals using the best available reference price.
   * Priority order:
   *   1. manufacturer_msrp_cents (AI-verified MSRP) — new & used
   *   2. msrp_cents (retailer/marketplace provided MSRP)
   *   3. original_price_cents only if it is strictly higher than current price
   *   4. 90-day historical high from deal_price_history (if higher than current price)
   *   5. 0 for preowned items with no reference; NULL for new/unknown items
   *
   * @param dealIds  Optional list of deal IDs to limit update scope. Omit to recalculate all.
   * @returns number of rows updated
   */
  async recalculateDealDiscounts(dealIds?: string[]): Promise<number> {
    const idFilter = dealIds && dealIds.length > 0
      ? dsql.raw(`AND d.id = ANY(ARRAY[${dealIds.map(id => `'${id.replace(/'/g, "''")}'`).join(",")}])`)
      : dsql.raw("");

    const result = await db.execute(dsql`
      WITH hist AS (
        SELECT
          deal_id,
          MAX(price_cents) AS high_90d
        FROM deal_price_history
        WHERE recorded_at >= NOW() - INTERVAL '90 days'
        GROUP BY deal_id
      ),
      computed AS (
        SELECT
          d.id,
          d.price_cents,
          d.condition,
          d.manufacturer_msrp_cents,
          d.msrp_cents,
          d.original_price_cents,
          h.high_90d,
          CASE
            -- 1. AI-verified MSRP (applies to all conditions, always highest priority)
            WHEN d.manufacturer_msrp_cents IS NOT NULL
                 AND d.manufacturer_msrp_cents > d.price_cents
              THEN ROUND(
                (d.manufacturer_msrp_cents - d.price_cents) * 100.0
                / d.manufacturer_msrp_cents, 3
              )
            -- 2. Retailer / marketplace MSRP
            WHEN d.msrp_cents IS NOT NULL
                 AND d.msrp_cents > d.price_cents
              THEN ROUND(
                (d.msrp_cents - d.price_cents) * 100.0
                / d.msrp_cents, 3
              )
            -- 3. Original / compare-at price (only meaningful if strictly higher)
            WHEN d.original_price_cents IS NOT NULL
                 AND d.original_price_cents > d.price_cents
              THEN ROUND(
                (d.original_price_cents - d.price_cents) * 100.0
                / d.original_price_cents, 3
              )
            -- 4a. New / unknown condition: 90-day history high or NULL
            WHEN d.condition IS DISTINCT FROM 'preowned' THEN
              CASE
                WHEN h.high_90d IS NOT NULL AND h.high_90d > d.price_cents
                  THEN ROUND(
                    (h.high_90d - d.price_cents) * 100.0
                    / h.high_90d, 3
                  )
                ELSE NULL
              END
            -- 4b. Preowned: 90-day history high or 0
            ELSE
              CASE
                WHEN h.high_90d IS NOT NULL AND h.high_90d > d.price_cents
                  THEN ROUND(
                    (h.high_90d - d.price_cents) * 100.0
                    / h.high_90d, 3
                  )
                ELSE 0
              END
          END AS new_percent_off
        FROM deals d
        LEFT JOIN hist h ON h.deal_id = d.id
        WHERE d.price_cents IS NOT NULL
          AND d.price_cents > 0
          ${idFilter}
      )
      UPDATE deals
      SET percent_off = computed.new_percent_off
      FROM computed
      WHERE deals.id = computed.id
        AND (deals.percent_off IS DISTINCT FROM computed.new_percent_off)
    `);

    return (result as any).rowCount ?? 0;
  }

  async getDealPriceHistory(dealId: string): Promise<DealPriceHistory[]> {
    return await db
      .select()
      .from(dealPriceHistory)
      .where(eq(dealPriceHistory.dealId, dealId))
      .orderBy(desc(dealPriceHistory.recordedAt));
  }

  async listSubFilters(equipmentTypeId?: string): Promise<EquipmentSubFilter[]> {
    if (equipmentTypeId) {
      return await db
        .select()
        .from(equipmentSubFilters)
        .where(eq(equipmentSubFilters.equipmentTypeId, equipmentTypeId))
        .orderBy(equipmentSubFilters.name);
    }
    return await db.select().from(equipmentSubFilters).orderBy(equipmentSubFilters.name);
  }

  async createSubFilter(name: string, equipmentTypeId: string, approval: TaxonomyApprovalContext): Promise<EquipmentSubFilter> {
    assertTaxonomyApproval(approval);
    const [created] = await db
      .insert(equipmentSubFilters)
      .values({ name, equipmentTypeId })
      .returning();
    return created;
  }

  async deleteSubFilter(id: string): Promise<void> {
    // FK on deal_sub_filters cascades, but be explicit and idempotent.
    await db.execute(dsql`DELETE FROM deal_sub_filters WHERE sub_filter_id = ${id}`);
    await db.update(deals).set({ subFilterId: null }).where(eq(deals.subFilterId, id));
    await db.delete(equipmentSubFilters).where(eq(equipmentSubFilters.id, id));
  }

  /**
   * Sync the multi-tag join table for a single deal during sync/upsert.
   * Strategy: classify the title against every rule for the deal's equipment
   * type and INSERT…ON CONFLICT DO NOTHING. This grows the tag set as new
   * rules match but never removes admin-added tags. The legacy single tag
   * (deal.subFilterId) is also included so it stays consistent with the join
   * table.
   */
  private async syncDealSubFilters(
    dealId: string,
    deal: { title?: string | null; equipmentTypeId?: string | null; subFilterId?: string | null; subFilterIds?: string[] | null },
  ): Promise<void> {
    try {
      const { classifyAllSubFilters } = await import("./sub-filter-classifier");
      const { dealSubFilters } = await import("@shared/schema");
      const tags = new Set<string>();
      if (deal.subFilterId) tags.add(deal.subFilterId);
      if (Array.isArray(deal.subFilterIds)) {
        for (const t of deal.subFilterIds) if (t) tags.add(t);
      }
      if (deal.title && deal.equipmentTypeId) {
        for (const t of classifyAllSubFilters(deal.title, deal.equipmentTypeId)) {
          tags.add(t);
        }
      }
      if (tags.size === 0) return;
      await db
        .insert(dealSubFilters)
        .values(Array.from(tags).map((subFilterId) => ({ dealId, subFilterId })))
        .onConflictDoNothing();
    } catch (e) {
      // Multi-tag sync is best-effort and must never break the main upsert.
      console.warn(`[deal-sub-filters] sync failed for ${dealId}:`, (e as Error).message);
    }
  }

  async listAutoIncludeRules(): Promise<AutoIncludeRule[]> {
    return await db.select().from(autoIncludeRules).orderBy(autoIncludeRules.name);
  }

  async listEbaySellers(): Promise<EbaySeller[]> {
    return await db.select().from(ebaySellers).orderBy(ebaySellers.username);
  }

  async createEbaySeller(username: string, notes?: string): Promise<EbaySeller> {
    const existing = await db.select().from(ebaySellers).where(eq(ebaySellers.username, username)).limit(1);
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(ebaySellers).values({ username, notes: notes ?? null }).returning();
    return created;
  }

  async updateEbaySeller(id: string, data: { username?: string; notes?: string }): Promise<EbaySeller> {
    const updates: any = {};
    if (data.username !== undefined) updates.username = data.username;
    if (data.notes !== undefined) updates.notes = data.notes;
    const [updated] = await db.update(ebaySellers).set(updates).where(eq(ebaySellers.id, id)).returning();
    if (!updated) throw new Error("Seller not found");
    return updated;
  }

  async deleteEbaySeller(id: string): Promise<void> {
    await db.delete(ebaySellers).where(eq(ebaySellers.id, id));
  }

  async getEbaySellerDealCounts(): Promise<Record<string, number>> {
    const result = await db.execute(dsql`
      SELECT es.username, COUNT(d.id)::int as deal_count
      FROM ebay_sellers es
      LEFT JOIN deals d ON LOWER(d.raw->>'ebaySeller') = LOWER(es.username) AND d.source_id = 'ebay'
      GROUP BY es.username
    `);
    const counts: Record<string, number> = {};
    const rows = (result as any).rows ?? result;
    for (const row of rows as any[]) {
      counts[row.username] = parseInt(row.deal_count, 10) || 0;
    }
    return counts;
  }

  async getEbayOauthToken(userId: string): Promise<EbayOauthToken | undefined> {
    const [token] = await db
      .select()
      .from(ebayOauthTokens)
      .where(eq(ebayOauthTokens.userId, userId));
    return token;
  }

  async upsertEbayOauthToken(userId: string, data: { accessToken: string; refreshToken: string; expiresAt: Date; scope?: string; ebayUsername?: string }): Promise<EbayOauthToken> {
    const existing = await this.getEbayOauthToken(userId);
    if (existing) {
      const [updated] = await db
        .update(ebayOauthTokens)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(ebayOauthTokens.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(ebayOauthTokens)
      .values({ userId, ...data })
      .returning();
    return created;
  }

  async listAllEbayOauthTokens(): Promise<EbayOauthToken[]> {
    return db.select().from(ebayOauthTokens);
  }

  async deleteEbayOauthToken(userId: string): Promise<void> {
    await db.delete(ebayOauthTokens).where(eq(ebayOauthTokens.userId, userId));
  }

  async saveScheduledReport(userId: string, reportType: string, reportDate: string, csvContent: string, rowCount: number, error?: string): Promise<ScheduledReport> {
    const [report] = await db
      .insert(scheduledReports)
      .values({ userId, reportType, reportDate, csvContent, rowCount, error })
      .returning();
    return report;
  }

  async listScheduledReports(userId: string, limit: number = 30): Promise<ScheduledReport[]> {
    return db
      .select()
      .from(scheduledReports)
      .where(eq(scheduledReports.userId, userId))
      .orderBy(desc(scheduledReports.createdAt))
      .limit(limit);
  }

  async getScheduledReport(id: string): Promise<ScheduledReport | undefined> {
    const [report] = await db
      .select()
      .from(scheduledReports)
      .where(eq(scheduledReports.id, id));
    return report;
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return prefs;
  }

  async upsertUserPreferences(
    userId: string,
    prefs: InsertUserPreferences,
  ): Promise<UserPreferences> {
    const [saved] = await db
      .insert(userPreferences)
      .values({
        userId,
        condition: prefs.condition,
        minPercentOff: String(prefs.minPercentOff),
        pushEnabled: prefs.pushEnabled,
        smsEnabled: prefs.smsEnabled ?? false,
        phoneNumber: prefs.phoneNumber ?? null,
        equipmentTypeIds: prefs.equipmentTypeIds,
        sportId: prefs.sportId ?? null,
        hiddenSections: prefs.hiddenSections ?? [],
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          condition: prefs.condition,
          minPercentOff: String(prefs.minPercentOff),
          pushEnabled: prefs.pushEnabled,
          smsEnabled: prefs.smsEnabled ?? false,
          phoneNumber: prefs.phoneNumber ?? null,
          equipmentTypeIds: prefs.equipmentTypeIds,
          sportId: prefs.sportId ?? null,
          hiddenSections: prefs.hiddenSections ?? [],
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  async getUserPreferencesWithSms(userId: string): Promise<{ smsEnabled: boolean; phoneNumber: string | null } | undefined> {
    const [prefs] = await db
      .select({
        smsEnabled: userPreferences.smsEnabled,
        phoneNumber: userPreferences.phoneNumber,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return prefs;
  }

  async listSmsEnabledUsers(): Promise<{ userId: string; phoneNumber: string }[]> {
    const rows = await db
      .select({
        userId: userPreferences.userId,
        phoneNumber: userPreferences.phoneNumber,
      })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.smsEnabled, true),
          dsql`${userPreferences.phoneNumber} IS NOT NULL`,
        )
      );
    return rows.filter((r): r is { userId: string; phoneNumber: string } => r.phoneNumber !== null);
  }

  async optOutSmsByPhone(phoneNumber: string): Promise<number> {
    const digits = phoneNumber.replace(/\D/g, "");
    const variants = [phoneNumber];
    if (digits.length === 10) {
      variants.push(digits, `+1${digits}`, `1${digits}`, `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`);
    } else if (digits.length === 11 && digits.startsWith("1")) {
      const local = digits.slice(1);
      variants.push(digits, `+${digits}`, local, `+1${local}`, `(${local.slice(0,3)}) ${local.slice(3,6)}-${local.slice(6)}`);
    }

    const result = await db
      .update(userPreferences)
      .set({ smsEnabled: false })
      .where(
        and(
          eq(userPreferences.smsEnabled, true),
          inArray(userPreferences.phoneNumber, variants),
        )
      )
      .returning();
    return result.length;
  }

  async upsertSmsSubscriber(data: { phone: string; marketingConsent: boolean; transactionalConsent: boolean; optInIp?: string | null }): Promise<void> {
    const phone = toE164(data.phone);
    await db
      .insert(smsSubscribers)
      .values({
        phone,
        marketingConsent: data.marketingConsent,
        transactionalConsent: data.transactionalConsent,
        status: "active",
        optInIp: data.optInIp ?? null,
      })
      .onConflictDoUpdate({
        target: smsSubscribers.phone,
        set: {
          marketingConsent: data.marketingConsent,
          transactionalConsent: data.transactionalConsent,
          status: "active",
          optInIp: data.optInIp ?? null,
          optInAt: new Date(),
          unsubscribedAt: null,
          updatedAt: new Date(),
        },
      });
  }

  async optOutSmsSubscriberByPhone(phone: string): Promise<number> {
    const e164 = toE164(phone);
    const result = await db
      .update(smsSubscribers)
      .set({ status: "unsubscribed", unsubscribedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(smsSubscribers.phone, e164), eq(smsSubscribers.status, "active")))
      .returning();
    return result.length;
  }

  async listMarketingRecipients(): Promise<string[]> {
    // Public marketing subscribers who actively consented to marketing...
    const subs = await db
      .select({ phone: smsSubscribers.phone })
      .from(smsSubscribers)
      .where(and(eq(smsSubscribers.status, "active"), eq(smsSubscribers.marketingConsent, true)));
    // ...plus logged-in app users who enabled SMS deal alerts (their opt-in is a marketing/deal-alert consent).
    const appUsers = await this.listSmsEnabledUsers();
    const byDigits = new Map<string, string>();
    for (const s of subs) {
      const d = s.phone.replace(/\D/g, "").slice(-10);
      if (d.length === 10) byDigits.set(d, toE164(s.phone));
    }
    for (const u of appUsers) {
      const d = u.phoneNumber.replace(/\D/g, "").slice(-10);
      if (d.length === 10 && !byDigits.has(d)) byDigits.set(d, toE164(u.phoneNumber));
    }
    return Array.from(byDigits.values());
  }

  async createSmsCampaign(data: InsertSmsCampaign & { slug: string; createdBy?: string | null }): Promise<SmsCampaign> {
    const [row] = await db
      .insert(smsCampaigns)
      .values({
        slug: data.slug,
        retailerUrl: data.retailerUrl,
        title: data.title ?? null,
        writeup: data.writeup ?? null,
        smsText: data.smsText,
        images: data.images ?? [],
        createdBy: data.createdBy ?? null,
      })
      .returning();
    return row;
  }

  async listSmsCampaigns(): Promise<SmsCampaign[]> {
    return db.select().from(smsCampaigns).orderBy(desc(smsCampaigns.createdAt));
  }

  async getSmsCampaign(id: string): Promise<SmsCampaign | undefined> {
    const [row] = await db.select().from(smsCampaigns).where(eq(smsCampaigns.id, id)).limit(1);
    return row;
  }

  async getSmsCampaignBySlug(slug: string): Promise<SmsCampaign | undefined> {
    const [row] = await db.select().from(smsCampaigns).where(eq(smsCampaigns.slug, slug)).limit(1);
    return row;
  }

  async deleteSmsCampaign(id: string): Promise<void> {
    await db.delete(smsCampaigns).where(eq(smsCampaigns.id, id));
  }

  async markSmsCampaignSent(id: string, recipientCount: number): Promise<void> {
    await db
      .update(smsCampaigns)
      .set({ sentAt: new Date(), recipientCount })
      .where(eq(smsCampaigns.id, id));
  }

  async addPushSubscription(
    userId: string,
    sub: InsertPushSubscription,
  ): Promise<void> {
    const values = {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      createdAt: new Date(),
    };

    // Prevent duplicates by endpoint per user.
    const existing = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, sub.endpoint),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(pushSubscriptions).values(values);
    }
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<void> {
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      );
  }

  async listPushSubscriptionsForUser(userId: string): Promise<
    { endpoint: string; p256dh: string; auth: string }[]
  > {
    return await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }

  async createPriceAlert(userId: string, dealId: string, targetPriceCents?: number | null, targetPercentOff?: number | null, scope?: string, matchTitle?: string | null, matchBrand?: string | null): Promise<DealPriceAlert> {
    const [alert] = await db.insert(dealPriceAlerts).values({
      userId,
      dealId,
      targetPriceCents: targetPriceCents ?? null,
      targetPercentOff: targetPercentOff != null ? String(targetPercentOff) : null,
      scope: scope || "all_sellers",
      matchTitle: matchTitle ?? null,
      matchBrand: matchBrand ?? null,
      active: true,
    }).returning();
    return alert;
  }

  async listUserPriceAlerts(userId: string): Promise<DealPriceAlert[]> {
    return await db.select().from(dealPriceAlerts)
      .where(eq(dealPriceAlerts.userId, userId))
      .orderBy(desc(dealPriceAlerts.createdAt));
  }

  async listDealPriceAlerts(dealId: string, userId: string): Promise<DealPriceAlert[]> {
    return await db.select().from(dealPriceAlerts)
      .where(and(eq(dealPriceAlerts.dealId, dealId), eq(dealPriceAlerts.userId, userId)))
      .orderBy(desc(dealPriceAlerts.createdAt));
  }

  async deletePriceAlert(id: string, userId: string): Promise<void> {
    await db.delete(dealPriceAlerts)
      .where(and(eq(dealPriceAlerts.id, id), eq(dealPriceAlerts.userId, userId)));
  }

  async getActiveAlertsForDeals(dealIds: string[]): Promise<DealPriceAlert[]> {
    if (dealIds.length === 0) return [];
    return await db.select().from(dealPriceAlerts)
      .where(and(eq(dealPriceAlerts.active, true), inArray(dealPriceAlerts.dealId, dealIds)));
  }

  async markAlertTriggered(id: string): Promise<void> {
    await db.update(dealPriceAlerts)
      .set({ active: false, triggeredAt: new Date() })
      .where(eq(dealPriceAlerts.id, id));
  }

  async computeHistoricalLows(dealIds?: string[]): Promise<void> {
    await db.execute(dsql`
      UPDATE deals SET
        is_low_30d = sub.is_low_30d,
        is_low_60d = sub.is_low_60d,
        is_low_90d = sub.is_low_90d,
        is_low_180d = sub.is_low_180d,
        is_low_365d = sub.is_low_365d
      FROM (
        SELECT
          d.id,
          COALESCE(d.price_cents <= (SELECT MIN(ph.price_cents) FROM deal_price_history ph WHERE ph.deal_id = d.id AND ph.recorded_at >= NOW() - INTERVAL '30 days') AND (SELECT COUNT(*) FROM deal_price_history ph WHERE ph.deal_id = d.id AND ph.recorded_at >= NOW() - INTERVAL '30 days') >= 2, false) AS is_low_30d,
          COALESCE(d.price_cents <= (SELECT MIN(ph.price_cents) FROM deal_price_history ph WHERE ph.deal_id = d.id AND ph.recorded_at >= NOW() - INTERVAL '60 days') AND (SELECT COUNT(*) FROM deal_price_history ph WHERE ph.deal_id = d.id AND ph.recorded_at >= NOW() - INTERVAL '60 days') >= 2, false) AS is_low_60d,
          COALESCE(d.price_cents <= (SELECT MIN(ph.price_cents) FROM deal_price_history ph WHERE ph.deal_id = d.id AND ph.recorded_at >= NOW() - INTERVAL '90 days') AND (SELECT COUNT(*) FROM deal_price_history ph WHERE ph.deal_id = d.id AND ph.recorded_at >= NOW() - INTERVAL '90 days') >= 2, false) AS is_low_90d,
          COALESCE(d.price_cents <= (SELECT MIN(ph.price_cents) FROM deal_price_history ph WHERE ph.deal_id = d.id AND ph.recorded_at >= NOW() - INTERVAL '180 days') AND (SELECT COUNT(*) FROM deal_price_history ph WHERE ph.deal_id = d.id AND ph.recorded_at >= NOW() - INTERVAL '180 days') >= 2, false) AS is_low_180d,
          COALESCE(d.price_cents <= (SELECT MIN(ph.price_cents) FROM deal_price_history ph WHERE ph.deal_id = d.id AND ph.recorded_at >= NOW() - INTERVAL '365 days') AND (SELECT COUNT(*) FROM deal_price_history ph WHERE ph.deal_id = d.id AND ph.recorded_at >= NOW() - INTERVAL '365 days') >= 2, false) AS is_low_365d
        FROM deals d
        ${dealIds && dealIds.length > 0 ? dsql`WHERE d.id = ANY(${dealIds})` : dsql``}
      ) sub
      WHERE deals.id = sub.id
    `);
  }

  async getDefaultFeed(opts?: { perSport?: number; sportIds?: string[] }): Promise<{ sportId: string; sportName: string; deals: Deal[] }[]> {
    // Per-sport focus: only show specific equipment types, with optional filters.
    // Each segment = { eqTypeIds, minPriceCents?, titleKeywords?, excludeSources? }.
    // Deal must match ONE segment to qualify (titleKeywords = at least one must match title).
    type Segment = {
      eqTypeIds: string[];
      minPriceCents?: number;
      titleKeywords?: string[];       // at least one must appear in the deal title (case-insensitive)
      titleExcludeKeywords?: string[]; // ALL must be absent from the deal title (case-insensitive)
      excludeSources?: string[];      // sourceIds to skip for this segment
    };
    const SPORT_FOCUS: Record<string, Segment[]> = {
      baseball: [
        { eqTypeIds: ["bb-gloves"], minPriceCents: 6500 },  // gloves over $65
        { eqTypeIds: ["bb-bats"],   minPriceCents: 7500 },  // bats over $75
      ],
      "fastpitch-softball": [
        { eqTypeIds: ["fp-gloves"], minPriceCents: 6500 },
        { eqTypeIds: ["fp-bats"],   minPriceCents: 7500 },
      ],
      "slowpitch-softball": [
        { eqTypeIds: ["sp-gloves"], minPriceCents: 6500 },
        { eqTypeIds: ["sp-bats"],   minPriceCents: 7500 },
      ],
      basketball: [
        // bk-balls: require "basketball" in title; exclude trading cards, tablecloths, etc.
        {
          eqTypeIds: ["bk-balls"],
          titleKeywords: ["basketball"],
          titleExcludeKeywords: ["card", "graded", "tablecloth", "panini", "topps", "donruss",
                                  "chrome", "bowman", "prizm", "jersey", "patch", "sticker",
                                  "trading", "soccer ball", "football ball", "slam ball", "wall ball"],
        },
        { eqTypeIds: ["bk-hoops-nets"] },     // goals / hoops
        {
          eqTypeIds: ["bk-shoes-apparel"],
          titleKeywords: ["basketball", "shoe", "sneaker", "boot", "cleat"],
          titleExcludeKeywords: ["card", "graded", "tablecloth"],
        },
      ],
      football: [
        { eqTypeIds: ["fb-balls"] },          // footballs
        { eqTypeIds: ["fb-protective"] },     // helmets + WR gloves
        { eqTypeIds: ["fb-shoes-apparel"] },  // shoes / cleats
      ],
      soccer: [
        {
          eqTypeIds: ["soc-balls"],
          titleKeywords: ["soccer ball", "futsal ball", "football ball", "soccer", "futsal"],
          titleExcludeKeywords: ["slam ball", "wall ball", "medicine ball", "tennis ball",
                                  "basketball", "volleyball", "baseball", "softball", "lacrosse"],
        },
        { eqTypeIds: ["soc-protective"] },    // shin guards
        { eqTypeIds: ["soc-shoes-apparel"] }, // cleats / shoes
      ],
    };

    const DEFAULT_SPORTS = [
      { id: "baseball",          name: "Baseball" },
      { id: "fastpitch-softball", name: "Fastpitch Softball" },
      { id: "slowpitch-softball", name: "Slowpitch Softball" },
      { id: "basketball",        name: "Basketball" },
      { id: "football",          name: "Football" },
      { id: "soccer",            name: "Soccer" },
    ];
    const ALLOWED_PER_SPORT = [10, 20, 50, 100];
    const PER_SPORT = ALLOWED_PER_SPORT.includes(opts?.perSport ?? 0) ? opts!.perSport! : 10;
    // Fetch a wider pool so deduplication still yields PER_SPORT unique items (capped to bound query size)
    const FETCH_POOL = Math.min(PER_SPORT * 8, 800);
    const MIN_DISCOUNT = 25;

    // Per-source dedup (collapse variants within a single retailer) — shared helper.
    const deduplicate = (pool: Deal[]): Deal[] => dedupeDealPool(pool);

    const results: { sportId: string; sportName: string; deals: Deal[] }[] = [];
    const mktSources = ["ebay", "sidelineswap"];
    const freshCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const sportsToShow = opts?.sportIds !== undefined
      ? DEFAULT_SPORTS.filter((s) => opts.sportIds!.includes(s.id))
      : DEFAULT_SPORTS;

    for (const sport of sportsToShow) {
      const segments = SPORT_FOCUS[sport.id] ?? [];
      const freshFilter = or(not(inArray(deals.sourceId, mktSources)), gte(deals.lastSeenAt, freshCutoff));

      // Build an OR across all segments: (eqType IN [...] AND price >= min)
      let equipFilter: any = undefined;
      if (segments.length > 0) {
        const segmentClauses = segments.map((seg) => {
          const eqCond = inArray(deals.equipmentTypeId, seg.eqTypeIds);
          return seg.minPriceCents
            ? and(eqCond, gte(deals.priceCents, seg.minPriceCents))
            : eqCond;
        });
        equipFilter = segmentClauses.length === 1 ? segmentClauses[0] : or(...segmentClauses);
      }

      const baseWhere = [
        eq(deals.sportId, sport.id),
        dsql`CAST(${deals.percentOff} AS numeric) >= ${MIN_DISCOUNT}`,
        freshFilter,
        ...(equipFilter ? [equipFilter] : []),
      ];

      // Fetch a large pool, deduplicate, then take top PER_SPORT
      const rawPool = await db
        .select()
        .from(deals)
        .where(and(...baseWhere))
        .orderBy(desc(dsql`CAST(${deals.percentOff} AS numeric)`), desc(deals.foundAt))
        .limit(FETCH_POOL);

      // Post-fetch: apply titleKeywords, titleExcludeKeywords, and excludeSources per-segment
      const pool = rawPool.filter((deal) => {
        if (segments.length === 0) return true;
        const titleLower = (deal.title ?? "").toLowerCase();
        return segments.some((seg) => {
          if (!seg.eqTypeIds.includes(deal.equipmentTypeId ?? "")) return false;
          if (seg.excludeSources?.includes(deal.sourceId ?? "")) return false;
          if (seg.titleKeywords && seg.titleKeywords.length > 0) {
            if (!seg.titleKeywords.some((kw) => titleLower.includes(kw.toLowerCase()))) return false;
          }
          if (seg.titleExcludeKeywords && seg.titleExcludeKeywords.length > 0) {
            if (seg.titleExcludeKeywords.some((kw) => titleLower.includes(kw.toLowerCase()))) return false;
          }
          return true;
        });
      });

      let finalDeals = deduplicate(pool).slice(0, PER_SPORT);

      // Fallback: if deduplication left fewer than PER_SPORT, fetch more (no discount floor)
      if (finalDeals.length < PER_SPORT && segments.length > 0) {
        const usedIds = new Set(finalDeals.map((d) => d.id));
        const fallbackWhere: any[] = [
          eq(deals.sportId, sport.id),
          freshFilter,
          equipFilter,
        ];
        const fallbackPool = await db
          .select()
          .from(deals)
          .where(and(...fallbackWhere))
          .orderBy(desc(deals.priceCents))
          .limit(FETCH_POOL);

        const dedupedFallback = deduplicate(fallbackPool).filter((d) => !usedIds.has(d.id));
        finalDeals = [...finalDeals, ...dedupedFallback].slice(0, PER_SPORT);
      }

      if (finalDeals.length > 0) {
        results.push({ sportId: sport.id, sportName: sport.name, deals: finalDeals });
      }
    }

    return results;
  }

  async seed(database?: any): Promise<void> {
    // Startup migrations pass their transaction here. Keeping the executor
    // local prevents seed writes from escaping the migration/ledger commit.
    const db = database ?? defaultSeedDatabase;
    const existingCats = await db.select().from(dealCategories).limit(1);
    if (existingCats.length === 0) {
      await db.insert(dealCategories).values([
        { name: "Top 20 Baseball/Softball Glove Deals Today", slug: "baseball-softball-gloves", description: "Best glove deals from across the web", searchQuery: "glove mitt", sportId: "baseball", isPredefined: true, sortOrder: 1, enabled: true },
        { name: "Top 20 Baseball Bat Deals Today", slug: "baseball-bats", description: "Best baseball bat deals available now", searchQuery: "bat bbcor", sportId: "baseball", isPredefined: true, sortOrder: 2, enabled: true },
        { name: "Top 20 Fastpitch Softball Bat Deals Today", slug: "fastpitch-softball-bats", description: "Best fastpitch softball bat deals today", searchQuery: "fastpitch bat", sportId: "fastpitch-softball", isPredefined: true, sortOrder: 3, enabled: true },
        { name: "Top 20 Running Shoes Deals Today", slug: "running-shoes", description: "Top deals on running shoes", searchQuery: "running shoes sneakers", isPredefined: true, sortOrder: 4, enabled: true },
        { name: "Top 20 Baseball/Football/Softball Cleats Deals", slug: "cleats", description: "Best cleat deals across baseball, football, and softball", searchQuery: "cleats spikes", isPredefined: true, sortOrder: 5, enabled: true },
        { name: "Premium & Collector Gloves", slug: "premium-collector-gloves", description: "High-end, limited edition, and handmade baseball gloves from premium brands including Japanese hardball/hard grab gloves", searchQuery: "glove mitt", sportId: "baseball", brandKeywords: ["Mizuno Pro", "Haga", "Junkei", "Atoms", "JB", "Slaps", "Jax", "Jax Athletics", "Wilson Staff", "Wilson A2K", "Rawlings Pro Preferred", "Rawlings Heart of the Hide", "Rawlings Pro Limited", "ASICS", "SSK", "Zett", "Hi-Gold", "HiGold", "IP Select", "Donaiya", "Kubota Slugger", "Tamazawa", "Ryu", "Glove Studio Ryu", "Leggera", "Pro Haga", "Mizuno Pro Select", "Mizuno Limited", "Made in Japan", "Handmade", "Wagyu-JB", "Wagyu", "David Sports", "D-Quest", "Emery"], isPredefined: true, sortOrder: 5, enabled: true, skipDiscount: true, sortByPrice: true, minPriceCents: 35000, maxResults: 200 },
        { name: "Elite Baseball Glove Deals", slug: "elite-baseball-gloves", description: "Premium high-end baseball glove deals from top brands", searchQuery: "glove", sportId: "baseball", brandKeywords: ["Wilson A2K", "Rawlings Pro Preferred", "Mizuno Pro", "Junkei", "Slaps", "Ryu Glove Designs", "IP Select", "Leggera"], isPredefined: true, sortOrder: 6, enabled: true, skipDiscount: true, sortByPrice: true, maxResults: 500 },
        { name: "Top Fitness & Exercise Deals Today", slug: "fitness-exercise", description: "Best deals on fitness and exercise equipment", searchQuery: "fitness exercise gym equipment weights", isPredefined: true, sortOrder: 7, enabled: true },
        { name: "Top 20 Golf Club Deals Today", slug: "golf-clubs", description: "Best golf club deals from drivers to putters", searchQuery: "club driver iron wedge putter", sportId: "golf", isPredefined: true, sortOrder: 8, enabled: true },
      ]).onConflictDoNothing();
    }

    const existingSports = await db.select().from(sports).limit(1);
    if (existingSports.length > 0) return;

    await db.insert(sports).values([
      { id: "baseball", name: "Baseball" },
      { id: "fastpitch-softball", name: "Fastpitch Softball" },
      { id: "slowpitch-softball", name: "Slowpitch Softball" },
      { id: "golf", name: "Golf" },
      { id: "basketball", name: "Basketball" },
      { id: "lacrosse", name: "Lacrosse" },
      { id: "soccer", name: "Soccer" },
      { id: "football", name: "Football" },
      { id: "fishing", name: "Fishing" },
      { id: "volleyball", name: "Volleyball" },
      { id: "wrestling", name: "Wrestling" },
      { id: "hockey", name: "Hockey" },
      { id: "cycling", name: "Cycling" },
      { id: "gymnastics", name: "Gymnastics" },
      { id: "cheerleading", name: "Cheerleading" },
      { id: "rugby", name: "Rugby" },
      { id: "swimming", name: "Swimming" },
      { id: "disc-golf", name: "Disc Golf" },
      { id: "running", name: "Running" },
    ]);

    await db.insert(equipmentTypes).values([
      { id: "bb-gloves", name: "Gloves", sportId: "baseball" },
      { id: "bb-bats", name: "Bats", sportId: "baseball" },
      { id: "bb-balls", name: "Balls", sportId: "baseball" },
      { id: "bb-protective", name: "Protective Equipment", sportId: "baseball" },
      { id: "bb-training", name: "Training Equipment", sportId: "baseball" },
      { id: "bb-cleats", name: "Cleats", sportId: "baseball" },
      { id: "bb-shoes-apparel", name: "Shoes / Apparel", sportId: "baseball" },
      { id: "bb-bags", name: "Bat Bags / Equipment Bags", sportId: "baseball" },
      { id: "bb-batting-gloves", name: "Batting Gloves", sportId: "baseball" },
      { id: "bb-field-equipment", name: "Field Equipment", sportId: "baseball" },
      { id: "bb-care-accessories", name: "Equipment Care & Accessories", sportId: "baseball" },
      { id: "bb-other", name: "Other", sportId: "baseball" },

      { id: "fp-gloves", name: "Gloves", sportId: "fastpitch-softball" },
      { id: "fp-bats", name: "Bats", sportId: "fastpitch-softball" },
      { id: "fp-balls", name: "Balls", sportId: "fastpitch-softball" },
      { id: "fp-protective", name: "Protective Equipment", sportId: "fastpitch-softball" },
      { id: "fp-training", name: "Training Equipment", sportId: "fastpitch-softball" },
      { id: "fp-cleats", name: "Cleats", sportId: "fastpitch-softball" },
      { id: "fp-shoes-apparel", name: "Shoes / Apparel", sportId: "fastpitch-softball" },
      { id: "fp-bags", name: "Bat Bags / Equipment Bags", sportId: "fastpitch-softball" },
      { id: "fp-batting-gloves", name: "Batting Gloves", sportId: "fastpitch-softball" },
      { id: "fp-field-equipment", name: "Field Equipment", sportId: "fastpitch-softball" },
      { id: "fp-care-accessories", name: "Equipment Care & Accessories", sportId: "fastpitch-softball" },
      { id: "fp-other", name: "Other", sportId: "fastpitch-softball" },

      { id: "sp-gloves", name: "Gloves", sportId: "slowpitch-softball" },
      { id: "sp-bats", name: "Bats", sportId: "slowpitch-softball" },
      { id: "sp-balls", name: "Balls", sportId: "slowpitch-softball" },
      { id: "sp-protective", name: "Protective Equipment", sportId: "slowpitch-softball" },
      { id: "sp-training", name: "Training Equipment", sportId: "slowpitch-softball" },
      { id: "sp-cleats", name: "Cleats", sportId: "slowpitch-softball" },
      { id: "sp-shoes-apparel", name: "Shoes / Apparel", sportId: "slowpitch-softball" },
      { id: "sp-bags", name: "Bat Bags / Equipment Bags", sportId: "slowpitch-softball" },
      { id: "sp-batting-gloves", name: "Batting Gloves", sportId: "slowpitch-softball" },
      { id: "sp-field-equipment", name: "Field Equipment", sportId: "slowpitch-softball" },
      { id: "sp-care-accessories", name: "Equipment Care & Accessories", sportId: "slowpitch-softball" },
      { id: "sp-other", name: "Other", sportId: "slowpitch-softball" },

      { id: "golf-drivers", name: "Drivers", sportId: "golf" },
      { id: "golf-irons", name: "Irons", sportId: "golf" },
      { id: "golf-iron-sets", name: "Iron Sets", sportId: "golf" },
      { id: "golf-wedges", name: "Wedges", sportId: "golf" },
      { id: "golf-putters", name: "Putters", sportId: "golf" },
      { id: "golf-balls", name: "Balls", sportId: "golf" },
      { id: "golf-bags", name: "Bags", sportId: "golf" },
      { id: "golf-shoes-apparel", name: "Shoes / Apparel", sportId: "golf" },
      { id: "golf-training", name: "Training Equipment", sportId: "golf" },
      { id: "golf-other", name: "Other", sportId: "golf" },

      { id: "bk-balls", name: "Balls", sportId: "basketball" },
      { id: "bk-shoes-apparel", name: "Shoes / Apparel", sportId: "basketball" },
      { id: "bk-protective", name: "Protective Equipment", sportId: "basketball" },
      { id: "bk-training", name: "Training Equipment", sportId: "basketball" },
      { id: "bk-hoops-nets", name: "Hoops/Nets", sportId: "basketball" },
      { id: "bk-bags", name: "Bags", sportId: "basketball" },
      { id: "bk-other", name: "Other", sportId: "basketball" },

      { id: "lax-sticks", name: "Sticks", sportId: "lacrosse" },
      { id: "lax-balls", name: "Balls", sportId: "lacrosse" },
      { id: "lax-protective", name: "Protective Equipment", sportId: "lacrosse" },
      { id: "lax-training", name: "Training Equipment", sportId: "lacrosse" },
      { id: "lax-shoes-apparel", name: "Shoes / Apparel", sportId: "lacrosse" },
      { id: "lax-bags", name: "Bags", sportId: "lacrosse" },
      { id: "lax-other", name: "Other", sportId: "lacrosse" },

      { id: "soc-balls", name: "Balls", sportId: "soccer" },
      { id: "soc-nets", name: "Nets", sportId: "soccer" },
      { id: "soc-shoes-apparel", name: "Shoes / Apparel", sportId: "soccer" },
      { id: "soc-protective", name: "Protective Equipment", sportId: "soccer" },
      { id: "soc-training", name: "Training Equipment", sportId: "soccer" },
      { id: "soc-bags", name: "Bags", sportId: "soccer" },
      { id: "soc-other", name: "Other", sportId: "soccer" },

      { id: "fb-balls", name: "Balls", sportId: "football" },
      { id: "fb-shoes-apparel", name: "Shoes / Apparel", sportId: "football" },
      { id: "fb-protective", name: "Protective Equipment", sportId: "football" },
      { id: "fb-training", name: "Training Equipment", sportId: "football" },
      { id: "fb-bags", name: "Bags", sportId: "football" },
      { id: "fb-other", name: "Other", sportId: "football" },

      { id: "fish-rods", name: "Rods", sportId: "fishing" },
      { id: "fish-reels", name: "Reels", sportId: "fishing" },
      { id: "fish-lures-line", name: "Lures/Line", sportId: "fishing" },
      { id: "fish-training", name: "Training Equipment", sportId: "fishing" },
      { id: "fish-apparel", name: "Apparel", sportId: "fishing" },
      { id: "fish-bags", name: "Bags", sportId: "fishing" },
      { id: "fish-other", name: "Other", sportId: "fishing" },

      { id: "vb-balls", name: "Balls", sportId: "volleyball" },
      { id: "vb-nets", name: "Nets", sportId: "volleyball" },
      { id: "vb-shoes-apparel", name: "Shoes / Apparel", sportId: "volleyball" },
      { id: "vb-protective", name: "Protective Equipment", sportId: "volleyball" },
      { id: "vb-training", name: "Training Equipment", sportId: "volleyball" },
      { id: "vb-bags", name: "Bags", sportId: "volleyball" },
      { id: "vb-other", name: "Other", sportId: "volleyball" },

      { id: "wrest-shoes-apparel", name: "Shoes / Apparel", sportId: "wrestling" },
      { id: "wrest-bags", name: "Bags", sportId: "wrestling" },

      { id: "hk-sticks", name: "Sticks", sportId: "hockey" },
      { id: "hk-skates", name: "Skates", sportId: "hockey" },
      { id: "hk-nets", name: "Nets", sportId: "hockey" },
      { id: "hk-protective", name: "Protective Equipment", sportId: "hockey" },
      { id: "hk-training", name: "Training Equipment", sportId: "hockey" },
      { id: "hk-other", name: "Other", sportId: "hockey" },
      { id: "hk-apparel", name: "Apparel", sportId: "hockey" },
      { id: "hk-bags", name: "Bags", sportId: "hockey" },

      { id: "cyc-bikes", name: "Bikes", sportId: "cycling" },
      { id: "cyc-scooters", name: "Scooters", sportId: "cycling" },
      { id: "cyc-electric", name: "Electric", sportId: "cycling" },
      { id: "cyc-shoes-apparel", name: "Shoes / Apparel", sportId: "cycling" },
      { id: "cyc-protective", name: "Protective Equipment", sportId: "cycling" },
      { id: "cyc-training", name: "Training Equipment", sportId: "cycling" },
      { id: "cyc-bags", name: "Bags", sportId: "cycling" },
      { id: "cyc-other", name: "Other", sportId: "cycling" },

      { id: "gym-shoes-apparel", name: "Shoes / Apparel", sportId: "gymnastics" },
      { id: "gym-protective", name: "Protective Equipment", sportId: "gymnastics" },
      { id: "gym-training", name: "Training Equipment", sportId: "gymnastics" },
      { id: "gym-bags", name: "Bags", sportId: "gymnastics" },
      { id: "gym-other", name: "Other", sportId: "gymnastics" },

      { id: "cheer-pompoms", name: "Pompoms", sportId: "cheerleading" },
      { id: "cheer-shoes-apparel", name: "Shoes / Apparel", sportId: "cheerleading" },
      { id: "cheer-protective", name: "Protective Equipment", sportId: "cheerleading" },
      { id: "cheer-training", name: "Training Equipment", sportId: "cheerleading" },
      { id: "cheer-bags", name: "Bags", sportId: "cheerleading" },
      { id: "cheer-other", name: "Other", sportId: "cheerleading" },

      { id: "rug-balls", name: "Balls", sportId: "rugby" },
      { id: "rug-shoes-apparel", name: "Shoes / Apparel", sportId: "rugby" },
      { id: "rug-protective", name: "Protective Equipment", sportId: "rugby" },
      { id: "rug-training", name: "Training Equipment", sportId: "rugby" },
      { id: "rug-bags", name: "Bags", sportId: "rugby" },
      { id: "rug-other", name: "Other", sportId: "rugby" },

      { id: "swim-goggles", name: "Goggles", sportId: "swimming" },
      { id: "swim-caps", name: "Swim Caps", sportId: "swimming" },
      { id: "swim-apparel", name: "Swimming Apparel", sportId: "swimming" },
      { id: "swim-timing", name: "Timing Equipment", sportId: "swimming" },
      { id: "swim-protective", name: "Protective Equipment", sportId: "swimming" },
      { id: "swim-training", name: "Training Equipment", sportId: "swimming" },
      { id: "swim-bags", name: "Bags", sportId: "swimming" },
      { id: "swim-other", name: "Other", sportId: "swimming" },

      { id: "dg-distance", name: "Distance Drivers", sportId: "disc-golf" },
      { id: "dg-fairway", name: "Fairway Drivers", sportId: "disc-golf" },
      { id: "dg-midrange", name: "Midrange Discs", sportId: "disc-golf" },
      { id: "dg-putters", name: "Putters", sportId: "disc-golf" },
      { id: "dg-bags", name: "Bags", sportId: "disc-golf" },
      { id: "dg-baskets", name: "Baskets/Targets", sportId: "disc-golf" },
      { id: "dg-shoes-apparel", name: "Shoes / Apparel", sportId: "disc-golf" },
      { id: "dg-accessories", name: "Accessories", sportId: "disc-golf" },
      { id: "dg-other", name: "Other", sportId: "disc-golf" },

      { id: "run-shoes", name: "Shoes", sportId: "running" },
      { id: "run-shorts", name: "Shorts", sportId: "running" },
      { id: "run-socks", name: "Socks", sportId: "running" },
      { id: "run-apparel", name: "Apparel", sportId: "running" },
      { id: "run-watches-tech", name: "Watches / Tech", sportId: "running" },
      { id: "run-hydration", name: "Hydration", sportId: "running" },
      { id: "run-bags", name: "Bags / Vests", sportId: "running" },
      { id: "run-accessories", name: "Accessories", sportId: "running" },
      { id: "run-other", name: "Other", sportId: "running" },
    ]);

    await db.insert(sources).values([
      // Our Store
      { id: "twin-seam-sports", name: "Twin Seam Sports", baseUrl: "https://www.twinseamsports.com", isOurStore: true, priorityBoost: 50, category: "baseball" },

      // Multi-Sport General Retailers
      { id: "ebay", name: "eBay", baseUrl: "https://www.ebay.com", category: "multi-sport" },
      { id: "dicks-sporting-goods", name: "DICK'S Sporting Goods", baseUrl: "https://www.dickssportinggoods.com", category: "multi-sport" },
      { id: "amazon", name: "Amazon", baseUrl: "https://www.amazon.com", category: "multi-sport" },
      { id: "walmart", name: "Walmart", baseUrl: "https://www.walmart.com", category: "multi-sport" },
      { id: "academy-sports", name: "Academy Sports", baseUrl: "https://www.academy.com", category: "multi-sport" },
      { id: "scheels", name: "Scheels", baseUrl: "https://www.scheels.com", category: "multi-sport" },
      { id: "play-it-again-sports", name: "Play It Again Sports", baseUrl: "https://www.playitagainsports.com", category: "multi-sport" },
      { id: "rei", name: "REI", baseUrl: "https://www.rei.com", category: "multi-sport" },
      { id: "target", name: "Target", baseUrl: "https://www.target.com", category: "multi-sport" },
      { id: "big-5-sporting-goods", name: "Big 5 Sporting Goods", baseUrl: "https://www.big5sportinggoods.com", category: "multi-sport" },
      { id: "dunhams-sports", name: "Dunham's Sports", baseUrl: "https://www.dunhamssports.com", category: "multi-sport" },
      { id: "sportsmans-warehouse", name: "Sportsman's Warehouse", baseUrl: "https://www.sportsmans.com", category: "multi-sport" },
      { id: "sierra-trading-post", name: "Sierra Trading Post", baseUrl: "https://www.sierra.com", category: "multi-sport" },
      { id: "sidelineswap", name: "SidelineSwap", baseUrl: "https://www.sidelineswap.com", category: "multi-sport" },
      { id: "eastbay", name: "Eastbay", baseUrl: "https://www.eastbay.com", category: "multi-sport" },
      { id: "finish-line", name: "Finish Line", baseUrl: "https://www.finishline.com", category: "multi-sport" },
      { id: "foot-locker", name: "Foot Locker", baseUrl: "https://www.footlocker.com", category: "multi-sport" },
      { id: "champs-sports", name: "Champs Sports", baseUrl: "https://www.champssports.com", category: "multi-sport" },
      { id: "fanatics", name: "Fanatics", baseUrl: "https://www.fanatics.com", category: "multi-sport" },

      // Baseball/Softball Specialty
      { id: "justbats", name: "JustBats", baseUrl: "https://www.justbats.com", category: "baseball" },
      { id: "justgloves", name: "JustGloves", baseUrl: "https://www.justgloves.com", category: "baseball" },
      { id: "playbaseball", name: "PlayBaseball.com", baseUrl: "https://www.playbaseball.com", category: "baseball" },
      { id: "name-of-the-game", name: "NameOfTheGame", baseUrl: "https://www.nameofthegame.com", category: "baseball" },
      { id: "better-baseball", name: "BetterBaseball", baseUrl: "https://www.betterbaseball.com", category: "baseball" },
      { id: "smash-it-sports", name: "Smash It Sports", baseUrl: "https://www.smashitsports.com", category: "baseball" },
      { id: "headbanger-sports", name: "Headbanger Sports", baseUrl: "https://www.headbangersports.com", category: "baseball" },
      { id: "hit-a-double", name: "Hit a Double", baseUrl: "https://www.hitadouble.com", category: "baseball" },
      { id: "hit-after-hit", name: "Hit After Hit Online", baseUrl: "https://www.hitafterhitonline.com", category: "baseball" },
      { id: "baseball-monkey", name: "Baseball Monkey", baseUrl: "https://www.baseballmonkey.com", category: "baseball" },
      { id: "baseball-savings", name: "Baseball Savings", baseUrl: "https://www.baseballsavings.com", category: "baseball" },
      { id: "closeout-bats", name: "CloseoutBats", baseUrl: "https://www.closeoutbats.com", category: "baseball" },
      { id: "baseball-express", name: "BaseballExpress", baseUrl: "https://www.baseballexpress.com", category: "baseball" },
      { id: "d-bat", name: "D-Bat", baseUrl: "https://www.dbat.com", category: "baseball" },
      { id: "baseball-rampage", name: "Baseball Rampage", baseUrl: "https://www.baseballrampage.com", category: "baseball" },

      // Golf Specialty
      { id: "golf-galaxy", name: "Golf Galaxy", baseUrl: "https://www.golfgalaxy.com", category: "golf" },
      { id: "callaway-golf-preowned", name: "Callaway Golf Pre-Owned", baseUrl: "https://www.callawaygolfpreowned.com", category: "golf" },
      { id: "global-golf", name: "GlobalGolf", baseUrl: "https://www.globalgolf.com", category: "golf" },
      { id: "2nd-swing-golf", name: "2nd Swing Golf", baseUrl: "https://www.2ndswing.com", category: "golf" },
      { id: "tgw", name: "TGW (The Golf Warehouse)", baseUrl: "https://www.tgw.com", category: "golf" },
      { id: "pga-tour-superstore", name: "PGA Tour Superstore", baseUrl: "https://www.pgatoursuperstore.com", category: "golf" },
      { id: "rock-bottom-golf", name: "Rock Bottom Golf", baseUrl: "https://www.rockbottomgolf.com", category: "golf" },
      { id: "carls-golfland", name: "Carl's Golfland", baseUrl: "https://www.carlsgolfland.com", category: "golf" },
      { id: "worldwide-golf-shops", name: "Worldwide Golf Shops", baseUrl: "https://www.worldwidegolfshops.com", category: "golf" },
      { id: "budget-golf", name: "Budget Golf", baseUrl: "https://www.budgetgolf.com", category: "golf" },
      { id: "maple-hill-golf", name: "Maple Hill Golf", baseUrl: "https://www.maplehillgolf.com", category: "golf" },
      { id: "golf-avenue", name: "Golf Avenue", baseUrl: "https://www.golfavenue.com", category: "golf" },

      // Soccer Specialty
      { id: "soccer-com", name: "Soccer.com", baseUrl: "https://www.soccer.com", category: "soccer" },
      { id: "world-soccer-shop", name: "World Soccer Shop", baseUrl: "https://www.worldsoccershop.com", category: "soccer" },
      { id: "soccer-pro", name: "SoccerPro", baseUrl: "https://www.soccerpro.com", category: "soccer" },
      { id: "we-got-soccer", name: "WeGotSoccer", baseUrl: "https://www.wegotsoccer.com", category: "soccer" },

      // Hockey Specialty
      { id: "hockey-monkey", name: "Hockey Monkey", baseUrl: "https://www.hockeymonkey.com", category: "hockey" },
      { id: "pure-hockey", name: "Pure Hockey", baseUrl: "https://www.purehockey.com", category: "hockey" },
      { id: "ice-warehouse", name: "Ice Warehouse", baseUrl: "https://www.icewarehouse.com", category: "hockey" },
      { id: "total-hockey", name: "Total Hockey", baseUrl: "https://www.totalhockey.com", category: "hockey" },

      // Fishing Specialty
      { id: "bass-pro-shops", name: "Bass Pro Shops", baseUrl: "https://www.basspro.com", category: "fishing" },
      { id: "cabelas", name: "Cabela's", baseUrl: "https://www.cabelas.com", category: "fishing" },
      { id: "tackle-warehouse", name: "Tackle Warehouse", baseUrl: "https://www.tacklewarehouse.com", category: "fishing" },
      { id: "tackle-direct", name: "TackleDirect", baseUrl: "https://www.tackledirect.com", category: "fishing" },
      { id: "fish-usa", name: "FishUSA", baseUrl: "https://www.fishusa.com", category: "fishing" },
      { id: "karls-bait-tackle", name: "Karl's Bait & Tackle", baseUrl: "https://www.karlsbait.com", category: "fishing" },

      // Lacrosse Specialty
      { id: "lacrosse-monkey", name: "Lacrosse Monkey", baseUrl: "https://www.lacrossemonkey.com", category: "lacrosse" },
      { id: "lax-com", name: "LAX.com", baseUrl: "https://www.lax.com", category: "lacrosse" },
      { id: "universal-lacrosse", name: "Universal Lacrosse", baseUrl: "https://www.universallacrosse.com", category: "lacrosse" },
      { id: "lacrosse-unlimited", name: "Lacrosse Unlimited", baseUrl: "https://www.lacrosseunlimited.com", category: "lacrosse" },
      { id: "stringking", name: "StringKing", baseUrl: "https://www.stringking.com", category: "lacrosse" },

      // Volleyball Specialty
      { id: "all-volleyball", name: "All Volleyball", baseUrl: "https://www.allvolleyball.com", category: "volleyball" },
      { id: "volleyball-central", name: "Volleyball Central", baseUrl: "https://www.volleyballcentral.com", category: "volleyball" },

      // Wrestling Specialty
      { id: "wrestling-mart", name: "WrestlingMart", baseUrl: "https://www.wrestlingmart.com", category: "wrestling" },
      { id: "suplay", name: "Suplay", baseUrl: "https://www.suplay.com", category: "wrestling" },

      // Cycling Specialty
      { id: "competitive-cyclist", name: "Competitive Cyclist", baseUrl: "https://www.competitivecyclist.com", category: "cycling" },
      { id: "jenson-usa", name: "Jenson USA", baseUrl: "https://www.jensonusa.com", category: "cycling" },
      { id: "chain-reaction-cycles", name: "Chain Reaction Cycles", baseUrl: "https://www.chainreactioncycles.com", category: "cycling" },
      { id: "performance-bicycle", name: "Performance Bicycle", baseUrl: "https://www.performancebike.com", category: "cycling" },
      { id: "mikes-bikes", name: "Mike's Bikes", baseUrl: "https://www.mikesbikes.com", category: "cycling" },

      // Swimming Specialty
      { id: "swim-outlet", name: "SwimOutlet", baseUrl: "https://www.swimoutlet.com", category: "swimming" },
      { id: "tyr-sport", name: "TYR Sport", baseUrl: "https://www.tyr.com", category: "swimming" },

      // Gymnastics Specialty
      { id: "gk-elite", name: "GK Elite", baseUrl: "https://www.gkelite.com", category: "gymnastics" },
      { id: "tumbl-trak", name: "Tumbl Trak", baseUrl: "https://www.tumbltrak.com", category: "gymnastics" },

      // Cheerleading Specialty
      { id: "omni-cheer", name: "Omni Cheer", baseUrl: "https://www.omnicheer.com", category: "cheerleading" },
      { id: "varsity-spirit", name: "Varsity Spirit", baseUrl: "https://www.varsity.com", category: "cheerleading" },

      // Rugby Specialty
      { id: "world-rugby-shop", name: "World Rugby Shop", baseUrl: "https://www.worldrugbyshop.com", category: "rugby" },
      { id: "rugby-imports", name: "Rugby Imports", baseUrl: "https://www.rugbyimports.com", category: "rugby" },

      // Football Specialty
      { id: "football-america", name: "Football America", baseUrl: "https://www.footballamerica.com", category: "football" },
      { id: "riddell", name: "Riddell", baseUrl: "https://www.riddell.com", category: "football" },

      // Disc Golf Specialty
      { id: "infinite-discs", name: "Infinite Discs", baseUrl: "https://infinitediscs.com", category: "disc-golf" },
      { id: "disc-golf-united", name: "Disc Golf United", baseUrl: "https://discgolfunited.com", category: "disc-golf" },
      { id: "otb-discs", name: "OTB Discs", baseUrl: "https://otbdiscs.com", category: "disc-golf" },
      { id: "marshall-street", name: "Marshall Street Disc Golf", baseUrl: "https://www.marshallstreetdiscgolf.com", category: "disc-golf" },
      { id: "disc-store", name: "The Disc Store", baseUrl: "https://www.discstore.com", category: "disc-golf" },

      // Manufacturer Direct Stores
      { id: "rawlings", name: "Rawlings", baseUrl: "https://www.rawlings.com", category: "baseball", isManufacturer: true },
      { id: "wilson-sporting-goods", name: "Wilson Sporting Goods", baseUrl: "https://www.wilson.com", category: "multi-sport", isManufacturer: true },
      { id: "marucci-sports", name: "Marucci Sports", baseUrl: "https://www.maruccisports.com", category: "baseball", isManufacturer: true },
      { id: "louisville-slugger", name: "Louisville Slugger", baseUrl: "https://www.slugger.com", category: "baseball", isManufacturer: true },
      { id: "easton", name: "Easton", baseUrl: "https://www.easton.com", category: "baseball", isManufacturer: true },
      { id: "demarini", name: "DeMarini", baseUrl: "https://www.demarini.com", category: "baseball", isManufacturer: true },
      { id: "mizuno", name: "Mizuno", baseUrl: "https://www.mizuno.com", category: "multi-sport", isManufacturer: true },
      { id: "nike", name: "Nike", baseUrl: "https://www.nike.com", category: "multi-sport", isManufacturer: true },
      { id: "adidas", name: "adidas", baseUrl: "https://www.adidas.com", category: "multi-sport", isManufacturer: true },
      { id: "under-armour", name: "Under Armour", baseUrl: "https://www.underarmour.com", category: "multi-sport", isManufacturer: true },
      { id: "taylormade-golf", name: "TaylorMade Golf", baseUrl: "https://www.taylormadegolf.com", category: "golf", isManufacturer: true },
      { id: "callaway-golf", name: "Callaway Golf", baseUrl: "https://www.callawaygolf.com", category: "golf", isManufacturer: true },
      { id: "titleist", name: "Titleist", baseUrl: "https://www.titleist.com", category: "golf", isManufacturer: true },
      { id: "cobra-golf", name: "Cobra Golf", baseUrl: "https://www.cobragolf.com", category: "golf", isManufacturer: true },
      { id: "cleveland-golf", name: "Cleveland Golf", baseUrl: "https://www.clevelandgolf.com", category: "golf", isManufacturer: true },
      { id: "shimano", name: "Shimano", baseUrl: "https://fish.shimano.com", category: "fishing", isManufacturer: true },
      { id: "abu-garcia", name: "Abu Garcia", baseUrl: "https://www.abugarcia.com", category: "fishing", isManufacturer: true },
      { id: "speedo", name: "Speedo", baseUrl: "https://www.speedo.com", category: "swimming", isManufacturer: true },
      { id: "bauer-hockey", name: "Bauer Hockey", baseUrl: "https://www.bauer.com", category: "hockey", isManufacturer: true },
      { id: "ccm-hockey", name: "CCM Hockey", baseUrl: "https://www.ccmhockey.com", category: "hockey", isManufacturer: true },
      { id: "stx-lacrosse", name: "STX Lacrosse", baseUrl: "https://www.stx.com", category: "lacrosse", isManufacturer: true },
      { id: "spalding", name: "Spalding", baseUrl: "https://www.spalding.com", category: "basketball", isManufacturer: true },
      { id: "warrior-lacrosse", name: "Warrior Lacrosse", baseUrl: "https://www.warrior.com", category: "lacrosse", isManufacturer: true },
      { id: "new-balance", name: "New Balance", baseUrl: "https://www.newbalance.com", category: "multi-sport", isManufacturer: true },
      { id: "asics", name: "ASICS", baseUrl: "https://www.asics.com", category: "multi-sport", isManufacturer: true },
      { id: "trek-bicycles", name: "Trek Bicycles", baseUrl: "https://www.trekbikes.com", category: "cycling", isManufacturer: true },
      { id: "specialized", name: "Specialized", baseUrl: "https://www.specialized.com", category: "cycling", isManufacturer: true },
      { id: "innova", name: "Innova Disc Golf", baseUrl: "https://www.innovadiscs.com", category: "disc-golf", isManufacturer: true },
      { id: "discraft", name: "Discraft", baseUrl: "https://www.discraft.com", category: "disc-golf", isManufacturer: true },
      { id: "mvp-disc-sports", name: "MVP Disc Sports", baseUrl: "https://mvpdiscsports.com", category: "disc-golf", isManufacturer: true },
      { id: "dynamic-discs", name: "Dynamic Discs", baseUrl: "https://www.dynamicdiscs.com", category: "disc-golf", isManufacturer: true },
      { id: "latitude-64", name: "Latitude 64", baseUrl: "https://www.latitude64.se", category: "disc-golf", isManufacturer: true },
    ]);

    const now = new Date();
    await db.insert(deals).values([
      // Original 26 deals with new MSRP fields
      { sourceId: "twin-seam-sports", title: "Rawlings Heart of the Hide 11.75\" Infield Glove (PRO204-2BCF)", brand: "Rawlings", url: "https://www.twinseamsports.com/rawlings-hoh-pro204", sportId: "baseball", equipmentTypeId: "bb-gloves", condition: "new", msrpCents: 29999, manufacturerMsrpCents: 29999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 14999, percentOff: "50.002", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/rawlings-hoh-glove.png" },
      { sourceId: "twin-seam-sports", title: "Wilson A2000 1787 11.75\" Infield Glove", brand: "Wilson", url: "https://www.twinseamsports.com/wilson-a2000-1787", sportId: "baseball", equipmentTypeId: "bb-gloves", condition: "new", msrpCents: 27999, manufacturerMsrpCents: 27999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 13999, percentOff: "50.002", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/wilson-a2000-glove.png" },
      { sourceId: "twin-seam-sports", title: "Marucci CATX Connect (-3) BBCOR Bat 33\"/30oz", brand: "Marucci", url: "https://www.twinseamsports.com/marucci-catx-connect", sportId: "baseball", equipmentTypeId: "bb-bats", condition: "new", msrpCents: 39999, manufacturerMsrpCents: 39999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 18999, percentOff: "52.501", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/bbcor-bat-composite.png" },
      { sourceId: "justbats", title: "DeMarini CF (-3) BBCOR Baseball Bat 33\"/30oz", brand: "DeMarini", url: "https://www.justbats.com/demarini-cf", sportId: "baseball", equipmentTypeId: "bb-bats", condition: "new", msrpCents: 39999, manufacturerMsrpCents: 39999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 19999, percentOff: "50.001", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/bbcor-bat-composite.png" },
      { sourceId: "justgloves", title: "Rawlings R9 Series 11.5\" Infield Glove", brand: "Rawlings", url: "https://www.justgloves.com/rawlings-r9", sportId: "baseball", equipmentTypeId: "bb-gloves", condition: "new", msrpCents: 12999, manufacturerMsrpCents: 12999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 6499, percentOff: "50.004", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/rawlings-hoh-glove.png" },
      { sourceId: "dicks-sporting-goods", title: "Nike Alpha Huarache Elite 4 Baseball Cleats", brand: "Nike", url: "https://www.dickssportinggoods.com/nike-cleats", sportId: "baseball", equipmentTypeId: "bb-shoes-apparel", condition: "new", msrpCents: 13999, manufacturerMsrpCents: 13999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 6999, percentOff: "50.004", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/baseball-cleats.png" },
      { sourceId: "dicks-sporting-goods", title: "Nike LeBron 21 Basketball Shoes", brand: "Nike", url: "https://www.dickssportinggoods.com/nike-lebron", sportId: "basketball", equipmentTypeId: "bk-shoes-apparel", condition: "new", msrpCents: 19999, manufacturerMsrpCents: 19999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 9999, percentOff: "50.003", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/basketball-shoes.png" },
      { sourceId: "amazon", title: "Spalding TF-1000 Legacy Indoor Basketball", brand: "Spalding", url: "https://www.amazon.com/spalding-tf1000", sportId: "basketball", equipmentTypeId: "bk-balls", condition: "new", msrpCents: 8999, manufacturerMsrpCents: 8999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 4499, percentOff: "50.006", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/basketball-indoor.png" },
      { sourceId: "amazon", title: "Shimano Stradic FL 2500 Spinning Reel", brand: "Shimano", url: "https://www.amazon.com/shimano-stradic", sportId: "fishing", equipmentTypeId: "fish-reels", condition: "new", msrpCents: 24999, manufacturerMsrpCents: 24999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 11999, percentOff: "52.002", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/fishing-reel-spinning.png" },
      { sourceId: "smash-it-sports", title: "Easton Ghost Advanced (-11) Fastpitch Bat", brand: "Easton", url: "https://www.smashitsports.com/ghost-advanced", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats", condition: "new", msrpCents: 44999, manufacturerMsrpCents: 44999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 21999, percentOff: "51.112", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/fastpitch-bat.png" },
      { sourceId: "headbanger-sports", title: "DeMarini Prism+ (-10) Fastpitch Bat", brand: "DeMarini", url: "https://www.headbangersports.com/prism-plus", sportId: "fastpitch-softball", equipmentTypeId: "fp-bats", condition: "new", msrpCents: 39999, manufacturerMsrpCents: 39999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 18999, percentOff: "52.501", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/fastpitch-bat.png" },
      { sourceId: "hit-a-double", title: "Mizuno Pro Select 12\" Pitcher Glove", brand: "Mizuno", url: "https://www.hitadouble.com/mizuno-pro-select", sportId: "baseball", equipmentTypeId: "bb-gloves", condition: "new", msrpCents: 34999, manufacturerMsrpCents: 34999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 16999, percentOff: "51.430", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/pitcher-glove.png" },
      { sourceId: "play-it-again-sports", title: "Wilson A2000 SuperSkin 12.25\" Outfield Glove - Used", brand: "Wilson", url: "https://www.playitagainsports.com/wilson-a2000-used", sportId: "baseball", equipmentTypeId: "bb-gloves", condition: "preowned", msrpCents: 25999, msrpSource: "retailer", msrpVerified: false, priceCents: 9999, percentOff: "61.537", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/outfield-glove.png" },
      { sourceId: "hit-after-hit", title: "Rawlings Quatro Pro (-3) BBCOR 32\"/29oz", brand: "Rawlings", url: "https://www.hitafterhitonline.com/quatro-pro", sportId: "baseball", equipmentTypeId: "bb-bats", condition: "new", msrpCents: 34999, manufacturerMsrpCents: 34999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 16999, percentOff: "51.430", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/bbcor-bat-composite.png" },
      { sourceId: "better-baseball", title: "ATEC M3X Pitching Machine", brand: "ATEC", url: "https://www.betterbaseball.com/atec-m3x", sportId: "baseball", equipmentTypeId: "bb-training", condition: "new", msrpCents: 189999, msrpSource: "retailer", msrpVerified: false, priceCents: 89999, percentOff: "52.632", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/pitching-machine.png" },
      { sourceId: "playbaseball", title: "Nokona Walnut 11.75\" Classic Infield Glove", brand: "Nokona", url: "https://www.playbaseball.com/nokona-walnut", sportId: "baseball", equipmentTypeId: "bb-gloves", condition: "new", msrpCents: 37999, manufacturerMsrpCents: 37999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 18999, percentOff: "50.001", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/nokona-glove.png" },
      { sourceId: "name-of-the-game", title: "Louisville Slugger Select PWR (-3) BBCOR Bat", brand: "Louisville Slugger", url: "https://www.nameofthegame.com/ls-select-pwr", sportId: "baseball", equipmentTypeId: "bb-bats", condition: "new", msrpCents: 29999, manufacturerMsrpCents: 29999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 14999, percentOff: "50.002", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/bbcor-bat-composite.png" },
      { sourceId: "baseball-monkey", title: "Under Armour Harper 8 TPU Baseball Cleats", brand: "Under Armour", url: "https://www.baseballmonkey.com/ua-harper8", sportId: "baseball", equipmentTypeId: "bb-shoes-apparel", condition: "new", msrpCents: 9999, msrpSource: "retailer", msrpVerified: false, priceCents: 4999, percentOff: "50.005", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/baseball-cleats-ua.png" },
      { sourceId: "bass-pro-shops", title: "Abu Garcia Revo SX Low Profile Reel", brand: "Abu Garcia", url: "https://www.basspro.com/abu-garcia-revo", sportId: "fishing", equipmentTypeId: "fish-reels", condition: "new", msrpCents: 14999, manufacturerMsrpCents: 14999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 6999, percentOff: "53.337", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/fishing-reel-baitcast.png" },
      { sourceId: "cabelas", title: "Rapala X-Rap Shad 06 Lure 3-Pack", brand: "Rapala", url: "https://www.cabelas.com/rapala-xrap", sportId: "fishing", equipmentTypeId: "fish-lures-line", condition: "new", msrpCents: 3599, msrpSource: "retailer", msrpVerified: false, priceCents: 1799, percentOff: "50.014", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/fishing-lures.png" },
      { sourceId: "walmart", title: "Wilson NFL 'The Duke' Official Football", brand: "Wilson", url: "https://www.walmart.com/wilson-duke", sportId: "football", equipmentTypeId: "fb-balls", condition: "new", msrpCents: 12999, manufacturerMsrpCents: 12999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 5999, percentOff: "53.843", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/football-official.png" },
      { sourceId: "academy-sports", title: "adidas Predator Accuracy.1 FG Soccer Cleats", brand: "adidas", url: "https://www.academy.com/adidas-predator", sportId: "soccer", equipmentTypeId: "soc-shoes-apparel", condition: "new", msrpCents: 27999, manufacturerMsrpCents: 27999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 13999, percentOff: "50.002", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/soccer-cleats-predator.png" },
      { sourceId: "scheels", title: "TaylorMade Stealth 2 Driver 10.5", brand: "TaylorMade", url: "https://www.scheels.com/taylormade-stealth2", sportId: "golf", equipmentTypeId: "golf-drivers", condition: "new", msrpCents: 59999, manufacturerMsrpCents: 59999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 28999, percentOff: "51.668", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/golf-driver.png" },

      // ~15 new deals across expanded sources
      { sourceId: "golf-galaxy", title: "Callaway Paradym X Iron Set (5-PW, AW)", brand: "Callaway", url: "https://www.golfgalaxy.com/callaway-paradym-x", sportId: "golf", equipmentTypeId: "golf-iron-sets", condition: "new", msrpCents: 119999, manufacturerMsrpCents: 119999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 57999, percentOff: "51.667", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/golf-iron-set.png" },
      { sourceId: "swim-outlet", title: "Speedo Vanquisher 2.0 Mirrored Goggles", brand: "Speedo", url: "https://www.swimoutlet.com/speedo-vanquisher", sportId: "swimming", equipmentTypeId: "swim-goggles", condition: "new", msrpCents: 3999, manufacturerMsrpCents: 3999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 1899, percentOff: "52.513", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/swim-goggles.png" },
      { sourceId: "hockey-monkey", title: "Bauer Vapor X4 Senior Hockey Skates", brand: "Bauer", url: "https://www.hockeymonkey.com/bauer-vapor-x4", sportId: "hockey", equipmentTypeId: "hk-skates", condition: "new", msrpCents: 34999, manufacturerMsrpCents: 34999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 16999, percentOff: "51.430", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/hockey-skates.png" },
      { sourceId: "soccer-com", title: "Nike Mercurial Superfly 9 Elite FG", brand: "Nike", url: "https://www.soccer.com/nike-mercurial-superfly", sportId: "soccer", equipmentTypeId: "soc-shoes-apparel", condition: "new", msrpCents: 27499, manufacturerMsrpCents: 27499, msrpSource: "manufacturer", msrpVerified: true, priceCents: 12999, percentOff: "52.725", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/soccer-cleats-mercurial.png" },
      { sourceId: "rei", title: "Pearl Izumi Attack Air Cycling Jersey", brand: "Pearl Izumi", url: "https://www.rei.com/pearl-izumi-attack", sportId: "cycling", equipmentTypeId: "cyc-shoes-apparel", condition: "new", msrpCents: 8999, msrpSource: "retailer", msrpVerified: false, priceCents: 4299, percentOff: "52.217", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/cycling-jersey.png" },
      { sourceId: "competitive-cyclist", title: "Giro Aether MIPS Helmet", brand: "Giro", url: "https://www.competitivecyclist.com/giro-aether", sportId: "cycling", equipmentTypeId: "cyc-protective", condition: "new", msrpCents: 29999, manufacturerMsrpCents: 29999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 14499, percentOff: "51.672", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/cycling-helmet.png" },
      { sourceId: "lacrosse-monkey", title: "STX Surgeon 700 Lacrosse Head", brand: "STX", url: "https://www.lacrossemonkey.com/stx-surgeon-700", sportId: "lacrosse", equipmentTypeId: "lax-sticks", condition: "new", msrpCents: 10999, manufacturerMsrpCents: 10999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 5299, percentOff: "51.814", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/lacrosse-head.png" },
      { sourceId: "all-volleyball", title: "Mizuno Wave Lightning Z7 Volleyball Shoes", brand: "Mizuno", url: "https://www.allvolleyball.com/mizuno-wave-lightning", sportId: "volleyball", equipmentTypeId: "vb-shoes-apparel", condition: "new", msrpCents: 13999, manufacturerMsrpCents: 13999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 6799, percentOff: "51.432", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/volleyball-shoes.png" },
      { sourceId: "tackle-warehouse", title: "Daiwa Tatula SV TW Baitcasting Reel", brand: "Daiwa", url: "https://www.tacklewarehouse.com/daiwa-tatula", sportId: "fishing", equipmentTypeId: "fish-reels", condition: "new", msrpCents: 19999, msrpSource: "retailer", msrpVerified: false, priceCents: 9499, percentOff: "52.503", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/fishing-reel-baitcast.png" },
      { sourceId: "pga-tour-superstore", title: "Titleist Vokey SM9 Wedge 56/10 S Grind", brand: "Titleist", url: "https://www.pgatoursuperstore.com/titleist-sm9", sportId: "golf", equipmentTypeId: "golf-wedges", condition: "new", msrpCents: 17999, manufacturerMsrpCents: 17999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 8999, percentOff: "50.003", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/golf-wedge.png" },
      { sourceId: "pure-hockey", title: "CCM Jetspeed FT6 Pro Senior Stick", brand: "CCM", url: "https://www.purehockey.com/ccm-jetspeed-ft6", sportId: "hockey", equipmentTypeId: "hk-sticks", condition: "new", msrpCents: 29999, manufacturerMsrpCents: 29999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 14299, percentOff: "52.335", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/hockey-stick.png" },
      { sourceId: "soccer-pro", title: "adidas Copa Pure+ FG Soccer Cleats", brand: "adidas", url: "https://www.soccerpro.com/adidas-copa-pure", sportId: "soccer", equipmentTypeId: "soc-shoes-apparel", condition: "new", msrpCents: 29999, manufacturerMsrpCents: 29999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 14499, percentOff: "51.672", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/soccer-cleats-copa.png" },
      { sourceId: "wrestling-mart", title: "ASICS Matflex 7 Wrestling Shoes", brand: "ASICS", url: "https://www.wrestlingmart.com/asics-matflex-7", sportId: "wrestling", equipmentTypeId: "wrest-shoes-apparel", condition: "new", msrpCents: 7499, msrpSource: "retailer", msrpVerified: false, priceCents: 3599, percentOff: "52.007", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/wrestling-shoes.png" },
      { sourceId: "football-america", title: "Riddell SpeedFlex Adult Football Helmet", brand: "Riddell", url: "https://www.footballamerica.com/riddell-speedflex", sportId: "football", equipmentTypeId: "fb-protective", condition: "new", msrpCents: 44999, manufacturerMsrpCents: 44999, msrpSource: "manufacturer", msrpVerified: true, priceCents: 21999, percentOff: "51.112", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/football-helmet.png" },
      { sourceId: "world-rugby-shop", title: "Canterbury Vapodri Raze Rugby Boot", brand: "Canterbury", url: "https://www.worldrugbyshop.com/canterbury-raze", sportId: "rugby", equipmentTypeId: "rug-shoes-apparel", condition: "new", msrpCents: 10999, msrpSource: "retailer", msrpVerified: false, priceCents: 5299, percentOff: "51.814", isBuyItNow: true, foundAt: now, lastSeenAt: now, imageUrl: "/images/products/rugby-boot.png" },
    ]);

    await db.insert(autoIncludeRules).values([
      { name: "Premium Gloves Tier 1 (< $200)", equipmentCategory: "gloves", condition: "new", brandKeywords: ["Wilson A2000", "Rawlings Heart of the Hide", "Mizuno Pro Select"], maxPriceCents: 20000, enabled: true },
      { name: "Elite Gloves Tier 2 (< $250)", equipmentCategory: "gloves", condition: "new", brandKeywords: ["Wilson A2K", "Rawlings Pro Preferred", "Mizuno PRO"], maxPriceCents: 25000, enabled: true },
      { name: "Japanese Crafted Gloves Tier 3 (< $450)", equipmentCategory: "gloves", condition: "new", brandKeywords: ["Leggera", "Ryu Glove Studio", "Junkei", "Mizuno Pro Haga", "JB Wagyu", "Kubota Slugger"], maxPriceCents: 45000, enabled: true },
      { name: "Emery Gloves (< $180)", equipmentCategory: "gloves", condition: "new", brandKeywords: ["Emery"], maxPriceCents: 18000, enabled: true },
    ]);

    // Classification/auto-inclusion is intentionally not applied by static
    // seeding. It is an explicit maintenance concern and must never run on boot.
  }

  async applyAutoIncludeRules(): Promise<void> {
    const rules = await this.listAutoIncludeRules();
    const allDeals = await db.select().from(deals);

    for (const deal of allDeals) {
      let matched = false;
      let matchedRuleId: string | null = null;

      for (const rule of rules) {
        if (!rule.enabled) continue;
        if (deal.condition !== rule.condition) continue;
        if (deal.priceCents > rule.maxPriceCents) continue;

        if (rule.equipmentCategory === "gloves") {
          const isGlove = deal.equipmentTypeId?.includes("glove") || deal.title.toLowerCase().includes("glove");
          if (!isGlove) continue;
        }

        const titleLower = deal.title.toLowerCase();
        const brandLower = (deal.brand || "").toLowerCase();
        const keywordMatch = rule.brandKeywords.some(kw => {
          const kwLower = kw.toLowerCase();
          return titleLower.includes(kwLower) || brandLower.includes(kwLower);
        });
        if (!keywordMatch) continue;

        matched = true;
        matchedRuleId = rule.id;
        break;
      }

      if (matched !== deal.autoIncluded || matchedRuleId !== deal.autoIncludeRuleId) {
        await db.update(deals).set({ autoIncluded: matched, autoIncludeRuleId: matchedRuleId }).where(eq(deals.id, deal.id));
      }
    }
  }

  async listDealCategories(enabledOnly = true): Promise<DealCategory[]> {
    if (enabledOnly) {
      return await db
        .select()
        .from(dealCategories)
        .where(eq(dealCategories.enabled, true))
        .orderBy(dealCategories.sortOrder);
    }
    return await db.select().from(dealCategories).orderBy(dealCategories.sortOrder);
  }

  async getDealCategory(slug: string): Promise<DealCategory | undefined> {
    const [cat] = await db.select().from(dealCategories).where(eq(dealCategories.slug, slug)).limit(1);
    return cat;
  }

  async getCategoryDeals(category: DealCategory, limit = 20): Promise<Deal[]> {
    const whereParts: any[] = [];

    if (!category.skipDiscount) {
      whereParts.push(isNotNull(deals.percentOff));
      whereParts.push(gte(dsql`CAST(${deals.percentOff} AS numeric)`, 20));
    }
    whereParts.push(gte(deals.priceCents, 100));

    if (category.sportId) {
      whereParts.push(eq(deals.sportId, category.sportId));
    }
    if (category.equipmentTypeId) {
      whereParts.push(eq(deals.equipmentTypeId, category.equipmentTypeId));
    }
    if (category.condition) {
      whereParts.push(eq(deals.condition, category.condition));
    }

    const searchTerms = category.searchQuery.trim().split(/\s+/).filter(Boolean);
    if (searchTerms.length > 0) {
      const termConditions = searchTerms.map((term) =>
        or(
          ilike(deals.title, `%${term}%`),
          ilike(deals.brand, `%${term}%`),
          ilike(deals.equipmentTypeId, `%${term}%`),
        )
      );
      whereParts.push(or(...termConditions));
    }

    const BATTING_GLOVE_EQ_IDS = ["bb-batting-gloves", "fp-batting-gloves", "sp-batting-gloves"];
    const isGloveCategory = searchTerms.some((t) => /glove|mitt/i.test(t));
    if (isGloveCategory) {
      whereParts.push(
        dsql`${deals.equipmentTypeId} NOT IN (${dsql.join(BATTING_GLOVE_EQ_IDS.map(id => dsql`${id}`), dsql`, `)})`
      );
      whereParts.push(
        dsql`LOWER(${deals.title}) NOT LIKE '%batting glove%'`
      );
    }

    if (category.brandKeywords && category.brandKeywords.length > 0) {
      const brandConditions = category.brandKeywords.map((brand) =>
        or(
          ilike(deals.title, `%${brand}%`),
          ilike(deals.brand, `%${brand}%`),
        )
      );
      if (category.minPriceCents) {
        whereParts.push(
          or(
            or(...brandConditions),
            gte(deals.priceCents, category.minPriceCents),
          )
        );
      } else {
        whereParts.push(or(...brandConditions));
      }
    } else if (category.minPriceCents) {
      whereParts.push(gte(deals.priceCents, category.minPriceCents));
    }

    // Cricket bats get misclassified as baseball/softball bats by broad "bat" keyword
    // matching. Keep them out of any bat or baseball/softball category.
    const BAT_EQ_IDS = ["bb-bats", "fp-bats", "sp-bats"];
    const BASEBALL_SPORT_IDS = ["baseball", "fastpitch-softball", "slowpitch-softball"];
    const isBatOrBaseballCategory =
      (category.equipmentTypeId && BAT_EQ_IDS.includes(category.equipmentTypeId)) ||
      (category.sportId && BASEBALL_SPORT_IDS.includes(category.sportId)) ||
      searchTerms.some((t) => /^bats?$/i.test(t));
    if (isBatOrBaseballCategory) {
      whereParts.push(dsql`LOWER(${deals.title}) NOT LIKE '%cricket%'`);
    }

    const effectiveLimit = category.maxResults ?? limit;
    const where = whereParts.length ? and(...whereParts) : undefined;

    const orderClauses = category.sortByPrice
      ? [desc(deals.priceCents), desc(deals.foundAt)]
      : [desc(dsql`CAST(${deals.percentOff} AS numeric)`), desc(deals.foundAt)];

    // Fetch a wider pool so cross-source deduplication still yields a full list of
    // unique products, then collapse same-product duplicates (highest discount wins).
    const pool = await db
      .select()
      .from(deals)
      .where(where)
      .orderBy(...orderClauses)
      .limit(effectiveLimit * 5);

    return dedupeDealPool(pool, { crossSource: true }).slice(0, effectiveLimit);
  }

  async trackSearch(query: string, userId?: string): Promise<void> {
    const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return;
    await db.insert(searchQueries).values({
      query: query.trim(),
      normalizedQuery: normalized,
      userId: userId ?? null,
    });
  }

  async getPopularSearches(limit = 10, sinceDays = 7): Promise<{ query: string; count: number }[]> {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);

    const results = await db
      .select({
        query: searchQueries.normalizedQuery,
        count: dsql<number>`count(*)::int`,
      })
      .from(searchQueries)
      .where(gte(searchQueries.searchedAt, since))
      .groupBy(searchQueries.normalizedQuery)
      .orderBy(desc(dsql`count(*)`))
      .limit(limit);

    return results.map((r) => ({ query: r.query, count: r.count }));
  }

  async ensureDynamicCategories(): Promise<void> {
    const popular = await this.getPopularSearches(20, 7);

    const existingSlugs = new Set(
      (await db.select({ slug: dealCategories.slug }).from(dealCategories)).map((c) => c.slug)
    );

    let maxOrder = 100;
    for (const { query, count } of popular) {
      if (count < 3) continue;
      const slug = `dynamic-${query.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;
      if (existingSlugs.has(slug)) continue;

      await db.insert(dealCategories).values({
        name: `Top 20 ${query.charAt(0).toUpperCase() + query.slice(1)} Deals`,
        slug,
        description: `Popular search: "${query}"`,
        searchQuery: query,
        isDynamic: true,
        sortOrder: maxOrder++,
        enabled: true,
      });
      existingSlugs.add(slug);
    }
  }

  async listBonusDeals(activeOnly = true): Promise<BonusDeal[]> {
    if (activeOnly) {
      return await db.select().from(bonusDeals).where(eq(bonusDeals.isActive, true)).orderBy(desc(bonusDeals.createdAt));
    }
    return await db.select().from(bonusDeals).orderBy(desc(bonusDeals.createdAt));
  }

  async createBonusDeal(data: InsertBonusDeal): Promise<BonusDeal> {
    const [created] = await db.insert(bonusDeals).values(data).returning();
    return created;
  }

  async updateBonusDeal(id: string, data: Partial<InsertBonusDeal>): Promise<BonusDeal> {
    const rows = await db.update(bonusDeals).set(data).where(eq(bonusDeals.id, id)).returning();
    if (!rows.length) throw new Error("Bonus deal not found");
    return rows[0];
  }

  async deleteBonusDeal(id: string): Promise<void> {
    await db.delete(bonusDeals).where(eq(bonusDeals.id, id));
  }

  async listPopularProducts(activeOnly = true): Promise<PopularProduct[]> {
    if (activeOnly) {
      return await db.select().from(popularProducts).where(eq(popularProducts.isActive, true)).orderBy(popularProducts.sortOrder);
    }
    return await db.select().from(popularProducts).orderBy(popularProducts.sortOrder);
  }

  async createPopularProduct(data: InsertPopularProduct): Promise<PopularProduct> {
    const [created] = await db.insert(popularProducts).values(data).returning();
    return created;
  }

  async updatePopularProduct(id: string, data: Partial<InsertPopularProduct>): Promise<PopularProduct> {
    const rows = await db.update(popularProducts).set(data).where(eq(popularProducts.id, id)).returning();
    if (!rows.length) throw new Error("Popular product not found");
    return rows[0];
  }

  async deletePopularProduct(id: string): Promise<void> {
    await db.delete(popularProducts).where(eq(popularProducts.id, id));
  }

  async getTrendingProducts(limit = 12): Promise<{ name: string; slug: string; sport: string; clicks: number }[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db.execute(dsql`
      SELECT
        d.title,
        d.brand,
        d.sport_id,
        COUNT(dc.id)::int AS click_count
      FROM deal_clicks dc
      JOIN deals d ON dc.deal_id = d.id
      WHERE dc.clicked_at >= ${thirtyDaysAgo}
        AND d.brand IS NOT NULL
        AND d.brand != ''
      GROUP BY d.title, d.brand, d.sport_id
      ORDER BY click_count DESC
      LIMIT ${limit * 3}
    `);
    const rows = (result as any).rows ?? result ?? [];
    const seen = new Set<string>();
    const results: { name: string; slug: string; sport: string; clicks: number }[] = [];
    for (const row of rows as any[]) {
      const title = (row.title || "").trim();
      const brand = (row.brand || "").trim();
      if (!title || !brand) continue;
      const words = title.split(/\s+/).slice(0, 4).join(" ");
      const productName = words.length > 5 ? words : title.substring(0, 40).trim();
      const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (seen.has(slug) || slug.length < 3) continue;
      seen.add(slug);
      const sportId = row.sport_id || "";
      const sportLabel = sportId.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Sports";
      results.push({ name: productName, slug, sport: sportLabel, clicks: row.click_count });
      if (results.length >= limit) break;
    }
    return results;
  }

  async listSidelineswapSyncs(): Promise<SidelineswapSync[]> {
    return await db.select().from(sidelineswapSyncs).orderBy(sidelineswapSyncs.updatedAt);
  }

  async getSidelineswapSync(ebaySku: string): Promise<SidelineswapSync | undefined> {
    const rows = await db.select().from(sidelineswapSyncs).where(eq(sidelineswapSyncs.ebaySku, ebaySku)).limit(1);
    return rows[0];
  }

  async upsertSidelineswapSync(data: InsertSidelineswapSync): Promise<SidelineswapSync> {
    const existing = await this.getSidelineswapSync(data.ebaySku);
    if (existing) {
      const rows = await db.update(sidelineswapSyncs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(sidelineswapSyncs.ebaySku, data.ebaySku))
        .returning();
      return rows[0];
    }
    const [created] = await db.insert(sidelineswapSyncs).values(data).returning();
    return created;
  }

  async updateSidelineswapSync(id: string, data: Partial<InsertSidelineswapSync>): Promise<SidelineswapSync> {
    const rows = await db.update(sidelineswapSyncs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sidelineswapSyncs.id, id))
      .returning();
    if (!rows[0]) throw new Error("SidelineSwap sync record not found");
    return rows[0];
  }

  async deleteSidelineswapSync(id: string): Promise<void> {
    await db.delete(sidelineswapSyncs).where(eq(sidelineswapSyncs.id, id));
  }
}

export const storage = new DatabaseStorage();
