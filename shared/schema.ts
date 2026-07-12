import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";
import { users } from "./models/auth";

export const magicLinks = pgTable("magic_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const a2pStatusEvents = pgTable("a2p_status_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type").notNull(),
  resourceSid: varchar("resource_sid"),
  status: varchar("status"),
  failureReason: text("failure_reason"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const smsAuthCodes = pgTable("sms_auth_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: varchar("phone").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Public marketing/transactional SMS opt-ins (from the /notifications page).
// Persisted for audit + to target marketing blasts only at marketing-consented numbers.
export const smsSubscribers = pgTable("sms_subscribers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: varchar("phone").notNull().unique(),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  transactionalConsent: boolean("transactional_consent").notNull().default(false),
  status: varchar("status", { length: 16 }).notNull().default("active"), // active | unsubscribed
  optInIp: varchar("opt_in_ip"),
  optInAt: timestamp("opt_in_at").defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin-created "SMS deal blast" campaigns. Each has a short-link landing page.
export const smsCampaigns = pgTable("sms_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 16 }).notNull().unique(),
  retailerUrl: text("retailer_url").notNull(),
  title: text("title"),
  writeup: text("writeup"),
  smsText: text("sms_text").notNull(),
  images: text("images").array().notNull().default(sql`ARRAY[]::text[]`),
  sentAt: timestamp("sent_at"),
  recipientCount: integer("recipient_count").notNull().default(0),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSmsCampaignSchema = createInsertSchema(smsCampaigns).omit({
  id: true,
  slug: true,
  sentAt: true,
  recipientCount: true,
  createdBy: true,
  createdAt: true,
});
export type InsertSmsCampaign = z.infer<typeof insertSmsCampaignSchema>;
export type SmsCampaign = typeof smsCampaigns.$inferSelect;
export type SmsSubscriber = typeof smsSubscribers.$inferSelect;

export type Condition = "new" | "preowned";

export const sports = pgTable("sports", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  userCreated: boolean("user_created").notNull().default(false),
});

export const equipmentTypes = pgTable("equipment_types", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  sportId: varchar("sport_id").references(() => sports.id, {
    onDelete: "set null",
  }),
  userCreated: boolean("user_created").notNull().default(false),
});

export const equipmentSubFilters = pgTable("equipment_sub_filters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  equipmentTypeId: varchar("equipment_type_id")
    .notNull()
    .references(() => equipmentTypes.id, { onDelete: "cascade" }),
});

export const sources = pgTable("sources", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url"),
  isOurStore: boolean("is_our_store").notNull().default(false),
  priorityBoost: integer("priority_boost").notNull().default(0),
  category: text("category").notNull().default("multi-sport"),
  isManufacturer: boolean("is_manufacturer").notNull().default(false),
});

export const deals = pgTable(
  "deals",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

    sourceId: varchar("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    brand: text("brand"),
    url: text("url").notNull(),
    imageUrl: text("image_url"),

    sportId: varchar("sport_id").references(() => sports.id, {
      onDelete: "set null",
    }),
    equipmentTypeId: varchar("equipment_type_id").references(
      () => equipmentTypes.id,
      { onDelete: "set null" }
    ),

    condition: varchar("condition", { length: 16 }).notNull(),

    currency: varchar("currency", { length: 8 }).notNull().default("USD"),
    msrpCents: integer("msrp_cents"),
    manufacturerMsrpCents: integer("manufacturer_msrp_cents"),
    msrpSource: varchar("msrp_source", { length: 16 }),
    msrpVerified: boolean("msrp_verified").notNull().default(false),
    priceCents: integer("price_cents").notNull(),

    percentOff: numeric("percent_off", { precision: 6, scale: 3 }),

    isBuyItNow: boolean("is_buy_it_now").notNull().default(true),

    foundAt: timestamp("found_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    lastPriceConfirmedAt: timestamp("last_price_confirmed_at"),

    subFilterId: varchar("sub_filter_id").references(
      () => equipmentSubFilters.id,
      { onDelete: "set null" }
    ),

    // Derived numeric attributes parsed from the title at sync time.
    // dropWeight: bat length minus weight (e.g. 30/20 → 10). Used for "Drop -10" style filters.
    // sizeNumber: ball size for soccer/basketball/volleyball (3/4/5/etc).
    dropWeight: integer("drop_weight"),
    sizeNumber: varchar("size_number", { length: 20 }),

    autoIncluded: boolean("auto_included").notNull().default(false),
    autoIncludeRuleId: varchar("auto_include_rule_id"),

    raw: jsonb("raw"),

    originalPriceCents: integer("original_price_cents"),
    highestPriceCents: integer("highest_price_cents"),
    priceDropPercent: numeric("price_drop_percent", { precision: 6, scale: 3 }),
    hasPriceDrop: boolean("has_price_drop").notNull().default(false),

    isFeatured: boolean("is_featured").notNull().default(false),

    isLow30d: boolean("is_low_30d").notNull().default(false),
    isLow60d: boolean("is_low_60d").notNull().default(false),
    isLow90d: boolean("is_low_90d").notNull().default(false),
    isLow180d: boolean("is_low_180d").notNull().default(false),
    isLow365d: boolean("is_low_365d").notNull().default(false),

    promoCode: text("promo_code"),
    promoDescription: text("promo_description"),

    // How the current sport/equipment classification was assigned, and the
    // AI's confidence when classificationSource = 'ai'. Nullable: legacy rows
    // and rule-based rows leave these null until the daily AI pass touches them.
    classificationSource: varchar("classification_source", { length: 16 }),
    classificationConfidence: varchar("classification_confidence", { length: 16 }),
  },
  (t) => [
    index("deals_found_at_idx").on(t.foundAt),
    index("deals_source_idx").on(t.sourceId),
    index("deals_sport_idx").on(t.sportId),
    index("deals_equipment_type_idx").on(t.equipmentTypeId),
    index("deals_percent_off_idx").on(t.percentOff),
    index("deals_price_drop_idx").on(t.hasPriceDrop),
    index("deals_is_featured_idx").on(t.isFeatured),
  ]
);

// deal_sub_filters: many-to-many join between deals and equipment_sub_filters.
// A deal can carry multiple sub-filter tags (e.g. a glove can be both "Infield"
// and "11.5"). The legacy `deals.sub_filter_id` column is kept in sync with the
// "primary" (first) tag so existing untagged counts and single-tag filter URLs
// still work — this table is the source of truth for the full tag set.
export const dealSubFilters = pgTable(
  "deal_sub_filters",
  {
    dealId: varchar("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    subFilterId: varchar("sub_filter_id")
      .notNull()
      .references(() => equipmentSubFilters.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.dealId, t.subFilterId] }),
    index("deal_sub_filters_sub_idx").on(t.subFilterId),
  ],
);

export type DealSubFilter = typeof dealSubFilters.$inferSelect;

export const dealPriceHistory = pgTable(
  "deal_price_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    dealId: varchar("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
    syncSource: text("sync_source"),
  },
  (t) => [
    index("deal_price_history_deal_idx").on(t.dealId),
    index("deal_price_history_recorded_idx").on(t.recordedAt),
  ]
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: varchar("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),

    condition: varchar("condition", { length: 16 }).notNull().default("all"),

    minPercentOff: numeric("min_percent_off", { precision: 6, scale: 3 })
      .notNull()
      .default("50"),

    pushEnabled: boolean("push_enabled").notNull().default(false),

    smsEnabled: boolean("sms_enabled").notNull().default(false),
    phoneNumber: varchar("phone_number", { length: 20 }),
    firstSmsSent: boolean("first_sms_sent").notNull().default(false),

    equipmentTypeIds: text("equipment_type_ids").array().notNull().default(sql`'{}'::text[]`),

    sportId: varchar("sport_id", { length: 100 }),

    hiddenSections: text("hidden_sections").array().notNull().default(sql`'{}'::text[]`),

    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("user_preferences_push_idx").on(t.pushEnabled),
    index("user_preferences_sms_idx").on(t.smsEnabled),
  ]
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("push_subscriptions_user_idx").on(t.userId),
    index("push_subscriptions_endpoint_idx").on(t.endpoint),
  ]
);

export const appSettings = pgTable(
  "app_settings",
  {
    key: varchar("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export const dealPriceAlerts = pgTable(
  "deal_price_alerts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dealId: varchar("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    targetPriceCents: integer("target_price_cents"),
    targetPercentOff: numeric("target_percent_off", { precision: 6, scale: 3 }),
    scope: varchar("scope", { length: 20 }).notNull().default("this_listing"),
    matchTitle: text("match_title"),
    matchBrand: text("match_brand"),
    active: boolean("active").notNull().default(true),
    triggeredAt: timestamp("triggered_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("deal_price_alerts_user_idx").on(t.userId),
    index("deal_price_alerts_deal_idx").on(t.dealId),
    index("deal_price_alerts_active_idx").on(t.active),
  ]
);

export const ebaySellers = pgTable("ebay_sellers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  notes: text("notes"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const ebayOauthTokens = pgTable("ebay_oauth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  scope: text("scope"),
  ebayUsername: text("ebay_username"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type EbayOauthToken = typeof ebayOauthTokens.$inferSelect;

export const autoIncludeRules = pgTable("auto_include_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  equipmentCategory: text("equipment_category").notNull(),
  condition: varchar("condition", { length: 16 }).notNull().default("new"),
  brandKeywords: text("brand_keywords").array().notNull(),
  maxPriceCents: integer("max_price_cents").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const notificationRuns = pgTable(
  "notification_runs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    scheduledForEt: text("scheduled_for_et").notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
    status: varchar("status", { length: 32 }).notNull().default("running"),
    stats: jsonb("stats"),
  },
  (t) => [index("notification_runs_started_idx").on(t.startedAt)]
);

export const scheduledReports = pgTable(
  "scheduled_reports",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull(),
    reportType: varchar("report_type", { length: 32 }).notNull(),
    reportDate: varchar("report_date", { length: 10 }).notNull(),
    csvContent: text("csv_content").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    error: text("error"),
  },
  (t) => [index("scheduled_reports_user_date_idx").on(t.userId, t.reportDate)]
);

export type ScheduledReport = typeof scheduledReports.$inferSelect;

// Invoices issued via the admin invoice generator. Line items live in a single
// jsonb column to keep the data model tiny — invoices are write-rarely,
// read-when-needed, so no need for a separate line_items table.
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull().defaultNow(),
  billToName: text("bill_to_name").notNull(),
  billToStreet: text("bill_to_street"),
  billToCity: text("bill_to_city"),
  billToState: text("bill_to_state"),
  billToZip: text("bill_to_zip"),
  billToCountry: text("bill_to_country"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  paymentMethod: text("payment_method"),
  paid: boolean("paid").notNull().default(false),
  // Each line item: { item, description, qty, unitPrice } — totals are computed.
  lineItems: jsonb("line_items")
    .$type<Array<{ item: string; description: string; qty: number; unitPrice: number }>>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  shipping: numeric("shipping", { precision: 12, scale: 2 }).notNull().default("0"),
  // Stored as a percentage, e.g. "9.0750" for 9.075%.
  taxRate: numeric("tax_rate", { precision: 6, scale: 4 }).notNull().default("9.075"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invoiceLineItemSchema = z.object({
  item: z.string().trim().max(200).default(""),
  description: z.string().trim().max(500).default(""),
  qty: z.coerce.number().min(0).max(1_000_000).default(1),
  unitPrice: z.coerce.number().min(0).max(1_000_000).default(0),
});
export const insertInvoiceSchema = createInsertSchema(invoices, {
  lineItems: z.array(invoiceLineItemSchema).default([]),
  discount: z.coerce.number().min(0).default(0).transform(n => String(n)),
  shipping: z.coerce.number().min(0).default(0).transform(n => String(n)),
  taxRate: z.coerce.number().min(0).max(100).default(9.075).transform(n => String(n)),
  invoiceDate: z.coerce.date().optional(),
}).omit({
  id: true,
  invoiceNumber: true, // server-assigned
  createdAt: true,
  updatedAt: true,
});
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;

export const dealCategories = pgTable("deal_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: varchar("slug").notNull().unique(),
  description: text("description"),
  sportId: varchar("sport_id").references(() => sports.id, { onDelete: "set null" }),
  equipmentTypeId: varchar("equipment_type_id").references(() => equipmentTypes.id, { onDelete: "set null" }),
  searchQuery: text("search_query").notNull(),
  brandKeywords: text("brand_keywords").array().notNull().default(sql`'{}'::text[]`),
  condition: varchar("condition", { length: 16 }),
  isPredefined: boolean("is_predefined").notNull().default(false),
  isDynamic: boolean("is_dynamic").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  skipDiscount: boolean("skip_discount").notNull().default(false),
  sortByPrice: boolean("sort_by_price").notNull().default(false),
  minPriceCents: integer("min_price_cents"),
  maxResults: integer("max_results"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const searchQueries = pgTable(
  "search_queries",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    query: text("query").notNull(),
    normalizedQuery: text("normalized_query").notNull(),
    userId: varchar("user_id"),
    searchedAt: timestamp("searched_at").notNull().defaultNow(),
  },
  (t) => [
    index("search_queries_normalized_idx").on(t.normalizedQuery),
    index("search_queries_searched_at_idx").on(t.searchedAt),
  ]
);

export type DealCategory = typeof dealCategories.$inferSelect;
export type SearchQuery = typeof searchQueries.$inferSelect;

export const insertSportSchema = createInsertSchema(sports).omit({ userCreated: true });
export const insertEquipmentTypeSchema = createInsertSchema(equipmentTypes).omit({ userCreated: true });

export const createSportInputSchema = z.object({
  name: z.string().min(1).max(100),
});
export const createEquipmentTypeInputSchema = z.object({
  name: z.string().min(1).max(100),
  sportId: z.string().min(1).optional(),
});
export const insertSourceSchema = createInsertSchema(sources);
export const insertSourceInputSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().url().max(200),
});

export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  foundAt: true,
  lastSeenAt: true,
});
export const insertUserPreferencesSchema = createInsertSchema(userPreferences)
  .omit({ userId: true, updatedAt: true })
  .extend({
    condition: z.enum(["new", "preowned", "all"]),
    equipmentTypeIds: z.array(z.string()).default([]),
    minPercentOff: z.coerce.number().min(0).max(100).default(50),
    pushEnabled: z.coerce.boolean().default(false),
    smsEnabled: z.coerce.boolean().default(false),
    phoneNumber: z.string().nullable().optional(),
    sportId: z.string().nullable().optional(),
    hiddenSections: z.array(z.string()).default([]),
  });
export const insertPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const insertAutoIncludeRuleSchema = createInsertSchema(autoIncludeRules).omit({ id: true });

export const insertEquipmentSubFilterSchema = createInsertSchema(equipmentSubFilters).omit({ id: true });
export const createEquipmentSubFilterInputSchema = z.object({
  name: z.string().min(1).max(100),
  equipmentTypeId: z.string().min(1),
});

export const insertDealPriceAlertSchema = createInsertSchema(dealPriceAlerts).omit({ id: true, triggeredAt: true, createdAt: true });
export const createPriceAlertInputSchema = z.object({
  dealId: z.string().min(1),
  targetPriceCents: z.number().int().positive().optional().nullable(),
  targetPercentOff: z.number().min(0).max(100).optional().nullable(),
  scope: z.enum(["this_listing", "all_sellers"]).optional().default("all_sellers"),
}).refine(
  (d) => d.targetPriceCents != null || d.targetPercentOff != null,
  { message: "Must set a target price or target percent off" }
);

export const insertEbaySellerSchema = createInsertSchema(ebaySellers).omit({ id: true, addedAt: true });
export const createEbaySellerInputSchema = z.object({
  username: z.string().min(1).max(100).transform(s => s.trim()),
  notes: z.string().max(500).optional(),
});

export type AutoIncludeRule = typeof autoIncludeRules.$inferSelect;
export type InsertAutoIncludeRule = z.infer<typeof insertAutoIncludeRuleSchema>;

export type EbaySeller = typeof ebaySellers.$inferSelect;
export type InsertEbaySeller = z.infer<typeof insertEbaySellerSchema>;

export type EquipmentSubFilter = typeof equipmentSubFilters.$inferSelect;
export type InsertEquipmentSubFilter = z.infer<typeof insertEquipmentSubFilterSchema>;

export type Sport = typeof sports.$inferSelect;
export type InsertSport = z.infer<typeof insertSportSchema>;

export type EquipmentType = typeof equipmentTypes.$inferSelect;
export type InsertEquipmentType = z.infer<typeof insertEquipmentTypeSchema>;

export type Source = typeof sources.$inferSelect;
export type InsertSource = z.infer<typeof insertSourceSchema>;

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = z.infer<typeof insertDealSchema>;

export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

export type CreateSportRequest = InsertSport;
export type CreateEquipmentTypeRequest = InsertEquipmentType;
export type CreateSourceRequest = InsertSource;
export type CreateDealRequest = InsertDeal;
export type UpdateDealRequest = Partial<InsertDeal>;

export type DealResponse = Deal;
export type DealsListResponse = Deal[];

export type UpsertUserPreferencesRequest = InsertUserPreferences;
export type UserPreferencesResponse = UserPreferences;

export type CreatePushSubscriptionRequest = z.infer<
  typeof insertPushSubscriptionSchema
>;

export type DealPriceHistory = typeof dealPriceHistory.$inferSelect;
export type DealPriceAlert = typeof dealPriceAlerts.$inferSelect;
export type InsertDealPriceAlert = z.infer<typeof insertDealPriceAlertSchema>;

export const bonusDeals = pgTable("bonus_deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 500 }).notNull(),
  url: text("url").notNull(),
  imageUrl: text("image_url"),
  priceCents: integer("price_cents").notNull(),
  originalPriceCents: integer("original_price_cents"),
  description: text("description"),
  brand: varchar("brand", { length: 200 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBonusDealSchema = createInsertSchema(bonusDeals).omit({ id: true, createdAt: true });
export type BonusDeal = typeof bonusDeals.$inferSelect;
export type InsertBonusDeal = z.infer<typeof insertBonusDealSchema>;

export const dealClicks = pgTable(
  "deal_clicks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    dealId: varchar("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sourceId: varchar("source_id"),
    sportId: varchar("sport_id"),
    clickedAt: timestamp("clicked_at").notNull().defaultNow(),
  },
  (t) => [
    index("deal_clicks_clicked_at_idx").on(t.clickedAt),
    index("deal_clicks_deal_idx").on(t.dealId),
    index("deal_clicks_user_idx").on(t.userId),
  ]
);

export type DealClick = typeof dealClicks.$inferSelect;

export const userVisits = pgTable(
  "user_visits",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sessionId: varchar("session_id").notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    durationSeconds: integer("duration_seconds"),
    pagesViewed: integer("pages_viewed").notNull().default(1),
    userAgent: text("user_agent"),
    ipHash: varchar("ip_hash"),
  },
  (t) => [
    index("user_visits_user_idx").on(t.userId),
    index("user_visits_started_idx").on(t.startedAt),
    index("user_visits_session_idx").on(t.sessionId),
  ]
);

export type UserVisit = typeof userVisits.$inferSelect;

export const msrpLookups = pgTable(
  "msrp_lookups",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    brand: varchar("brand").notNull(),
    model: varchar("model").notNull(),
    sportId: varchar("sport_id"),
    manufacturerMsrpCents: integer("manufacturer_msrp_cents"),
    confidence: varchar("confidence", { length: 16 }),
    sourceUrl: text("source_url"),
    aiResponse: jsonb("ai_response"),
    lookupCount: integer("lookup_count").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("msrp_lookups_brand_model_idx").on(t.brand, t.model),
    index("msrp_lookups_sport_idx").on(t.sportId),
  ]
);

export type MsrpLookup = typeof msrpLookups.$inferSelect;
export type InsertMsrpLookup = typeof msrpLookups.$inferInsert;

// Cache of AI classification results, keyed by a normalized brand+title
// signature so repeated/near-identical products reuse a result instead of
// re-calling OpenAI. Mirrors the msrp_lookups pattern.
export const aiClassifications = pgTable(
  "ai_classifications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    signature: text("signature").notNull(),
    sportId: varchar("sport_id"),
    equipmentTypeId: varchar("equipment_type_id"),
    subFilterId: varchar("sub_filter_id"),
    isSportingGoods: boolean("is_sporting_goods").notNull().default(true),
    confidence: varchar("confidence", { length: 16 }).notNull().default("low"),
    reasoning: text("reasoning"),
    aiResponse: jsonb("ai_response"),
    lookupCount: integer("lookup_count").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ai_classifications_signature_idx").on(t.signature)]
);

export type AiClassification = typeof aiClassifications.$inferSelect;
export type InsertAiClassification = typeof aiClassifications.$inferInsert;

// Taxonomy-gap review queue: when the AI is confident an item belongs to a
// sport/category that does NOT exist in our taxonomy, we queue it here for an
// admin to approve (create category + reclassify) or reject. Nothing is
// auto-created — categories only appear after explicit admin approval.
export const classificationReviewQueue = pgTable(
  "classification_review_queue",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    dealId: varchar("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    brand: text("brand"),
    // An existing sport id when the AI is confident of the sport but the
    // equipment category is missing; otherwise null + a proposed new name.
    suggestedSportId: varchar("suggested_sport_id"),
    suggestedSportName: text("suggested_sport_name"),
    suggestedEquipmentName: text("suggested_equipment_name"),
    confidence: varchar("confidence", { length: 16 }),
    reasoning: text("reasoning"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [
    index("classification_review_status_idx").on(t.status),
    uniqueIndex("classification_review_pending_deal_idx")
      .on(t.dealId)
      .where(sql`status = 'pending'`),
  ]
);

export type ClassificationReviewItem = typeof classificationReviewQueue.$inferSelect;
export type InsertClassificationReviewItem = typeof classificationReviewQueue.$inferInsert;

export interface DealsQueryParams {
  q?: string;
  sportId?: string;
  equipmentTypeId?: string;
  equipmentTypeIds?: string[];
  subFilterId?: string;
  ebaySeller?: string;
  condition?: "new" | "preowned" | "all";
  minPercentOff?: number;
  maxPrice?: number;
  source?: string;
  brand?: string;
  featured?: boolean;
  priceDropOnly?: boolean;
  limit?: number | "all";
  currency?: string;
  sortBy?: "newest" | "oldest" | "price-low" | "price-high" | "discount-high" | "a-z" | "z-a";
  userId?: string;
}

export const ebayPricingReports = pgTable(
  "ebay_pricing_reports",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    totalListings: integer("total_listings").default(0),
    reportData: jsonb("report_data"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
);

export type EbayPricingReport = typeof ebayPricingReports.$inferSelect;
export type InsertEbayPricingReport = typeof ebayPricingReports.$inferInsert;
export const insertEbayPricingReportSchema = createInsertSchema(ebayPricingReports).omit({ id: true, createdAt: true });

export const ebayItemCosts = pgTable(
  "ebay_item_costs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ebayItemId: varchar("ebay_item_id").notNull().unique(),
    title: text("title").notNull(),
    procurementCostCents: integer("procurement_cost_cents"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("ebay_item_costs_item_idx").on(t.ebayItemId),
  ]
);

export type EbayItemCost = typeof ebayItemCosts.$inferSelect;
export type InsertEbayItemCost = typeof ebayItemCosts.$inferInsert;
export const insertEbayItemCostSchema = createInsertSchema(ebayItemCosts).omit({ id: true, createdAt: true, updatedAt: true });

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    source: text("source").notNull(),
    advertiserId: text("advertiser_id"),
    advertiserName: text("advertiser_name").notNull(),
    code: text("code").notNull(),
    description: text("description"),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    status: text("status").notNull().default("active"),
    discountType: text("discount_type"),
    discountValue: text("discount_value"),
    minimumPurchase: text("minimum_purchase"),
    trackingUrl: text("tracking_url"),
    categories: text("categories"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("promo_codes_source_idx").on(t.source),
    index("promo_codes_advertiser_idx").on(t.advertiserName),
    index("promo_codes_status_idx").on(t.status),
  ]
);

export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = typeof promoCodes.$inferInsert;
export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true, createdAt: true, updatedAt: true });

export const popularProducts = pgTable(
  "popular_products",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    sport: varchar("sport", { length: 100 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export type PopularProduct = typeof popularProducts.$inferSelect;
export const insertPopularProductSchema = createInsertSchema(popularProducts).omit({ id: true, createdAt: true });
export type InsertPopularProduct = z.infer<typeof insertPopularProductSchema>;

export const dealClickReturns = pgTable(
  "deal_click_returns",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    dealId: varchar("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    sourceId: varchar("source_id"),
    sportId: varchar("sport_id"),
    minutesAway: integer("minutes_away"),
    isLikelyConversion: boolean("is_likely_conversion").notNull().default(false),
    returnedAt: timestamp("returned_at").notNull().defaultNow(),
  },
  (t) => [
    index("deal_click_returns_deal_idx").on(t.dealId),
    index("deal_click_returns_returned_at_idx").on(t.returnedAt),
  ]
);

export type DealClickReturn = typeof dealClickReturns.$inferSelect;

export const affiliateConversions = pgTable(
  "affiliate_conversions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    network: text("network").notNull(),
    orderId: text("order_id"),
    dealId: varchar("deal_id").references(() => deals.id, { onDelete: "set null" }),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    advertiserId: text("advertiser_id"),
    advertiserName: text("advertiser_name"),
    commissionCents: integer("commission_cents"),
    saleCents: integer("sale_cents"),
    currency: text("currency").default("USD"),
    status: text("status").default("confirmed"),
    rawPostback: jsonb("raw_postback"),
    convertedAt: timestamp("converted_at").notNull().defaultNow(),
  },
  (t) => [
    index("affiliate_conversions_network_idx").on(t.network),
    index("affiliate_conversions_converted_at_idx").on(t.convertedAt),
    index("affiliate_conversions_order_idx").on(t.orderId),
  ]
);

export type AffiliateConversion = typeof affiliateConversions.$inferSelect;

export const sidelineswapSyncs = pgTable(
  "sidelineswap_syncs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    ebaySku: text("ebay_sku").notNull().unique(),
    ebayItemId: text("ebay_item_id"),
    ebayTitle: text("ebay_title"),
    ebayPriceCents: integer("ebay_price_cents"),
    ebayQuantity: integer("ebay_quantity"),
    ebayCondition: text("ebay_condition"),
    ebayImages: text("ebay_images").array(),
    ebayCategory: text("ebay_category"),
    sidelineswapListingId: text("sidelineswap_listing_id"),
    sidelineswapStatus: text("sidelineswap_status"),
    sidelineswapCategory: text("sidelineswap_category"),
    errorMessage: text("error_message"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("sidelineswap_syncs_sku_idx").on(t.ebaySku),
    index("sidelineswap_syncs_status_idx").on(t.sidelineswapStatus),
  ]
);

export type SidelineswapSync = typeof sidelineswapSyncs.$inferSelect;
export type InsertSidelineswapSync = typeof sidelineswapSyncs.$inferInsert;

export const hiddenDeals = pgTable(
  "hidden_deals",
  {
    userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    dealId: varchar("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
    hiddenAt: timestamp("hidden_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.dealId] }),
  ]
);

export interface FeaturedRules {
  ourStoreSourceId: string;
  withinPercentPoints: number;
  bonusScore: number;
}

export interface ScheduledTimesEt {
  times: string[];
  timezone: "America/New_York";
}

// =============================================================================
// Baseball team stats (Knox Stars 7U and any future teams)
// =============================================================================

export const bbTeams = pgTable("bb_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: text("name").notNull(),
  season: varchar("season", { length: 50 }),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bbPlayers = pgTable(
  "bb_players",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    teamId: varchar("team_id").notNull().references(() => bbTeams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    jerseyNumber: varchar("jersey_number", { length: 10 }),
    position: varchar("position", { length: 20 }),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("bb_players_team_idx").on(t.teamId)]
);

export const bbGames = pgTable(
  "bb_games",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    teamId: varchar("team_id").notNull().references(() => bbTeams.id, { onDelete: "cascade" }),
    gameDate: timestamp("game_date").notNull(),
    gameTime: text("game_time"),
    opponent: text("opponent").notNull(),
    // "Home" / "Visitor" — our team's side. Used to map the file's
    // "Final Score (Home)" / "Final Score (Visitor)" columns back to our_score
    // and opp_score consistently.
    ourHomeVisitor: varchar("our_home_visitor", { length: 10 }),
    location: text("location"),
    ourScore: integer("our_score"),
    oppScore: integer("opp_score"),
    notes: text("notes"),
    // Season tag (e.g. "Spring 2026"). Stamped at insert time from the team's
    // current active season; can be edited on a per-game basis later.
    season: varchar("season", { length: 50 }).notNull().default("Spring 2026"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("bb_games_team_date_idx").on(t.teamId, t.gameDate),
    index("bb_games_team_season_idx").on(t.teamId, t.season),
  ]
);

export const bbPlayerGame = pgTable(
  "bb_player_game",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    gameId: varchar("game_id").notNull().references(() => bbGames.id, { onDelete: "cascade" }),
    playerId: varchar("player_id").notNull().references(() => bbPlayers.id, { onDelete: "cascade" }),
    // Hitting (per scorebook). `ab` is raw plate appearances by this team's
    // convention (walks/sacrifices/HBP/SF are NOT subtracted) — see replit.md.
    ab: integer("ab"),
    r: integer("r"),
    h: integer("h"),
    singles: integer("singles"),
    doubles: integer("doubles"),
    triples: integer("triples"),
    hr: integer("hr"),
    bb: integer("bb"),
    // Hit-by-pitch. Treated as 0 when null. Counts toward OBP and Reached Base.
    hbp: integer("hbp"),
    k: integer("k"),
    // Subsets of k: swinging vs called. swingK + lookingK should equal k.
    swingK: integer("swing_k"),
    lookingK: integer("looking_k"),
    sb: integer("sb"),
    sac: integer("sac"),
    rbi: integer("rbi"),
    // New batting columns from the v2 scorebook template.
    pitchesSeen: integer("pitches_seen"),
    reachedBase: integer("reached_base"),
    fc: integer("fc"),         // fielder's choice
    roe: integer("roe"),       // reached on error
    summary: text("summary"),  // each AB separated by ";" — e.g. "1B; HR"
    comments: text("comments"),
    // Fielding stats — tagged with the position they occurred at.
    // position: "1"-"10" (1=P, 2=C, 3=1B, 4=2B, 5=3B, 6=SS, 7=LF, 8=CF, 9=RF,
    // 10=SF/short fielder), "EH" (extra hitter), or "UA" (unassigned error).
    position: varchar("position", { length: 10 }),
    // The position the player STARTED the game at (admin-entered). Distinct from
    // `position` above, which is the cached PRIMARY fielding position derived
    // from where they recorded the most chances. Same code set ("1"-"10"/"UA").
    startingPosition: varchar("starting_position", { length: 10 }),
    // Lineup spot for THIS game (1 = leadoff). Per-game only; entered during
    // manual/bulk entry. Used to sort a game's stat rows by batting order.
    battingOrder: integer("batting_order"),
    po: integer("po"),
    a: integer("a"),
    e: integer("e"),
    // Pitching (outs = innings*3 + thirds; "5.2" IP -> 17 outs)
    pitchingOuts: integer("pitching_outs"),
    pc: integer("pc"),
    pBb: integer("p_bb"),
    so: integer("so"),
    pH: integer("p_h"),
    pR: integer("p_r"),
    er: integer("er"),
    // 'manual' = hand-scored from scorebook; 'gamechanger' = imported from GC export.
    source: varchar("source", { length: 20 }).notNull().default("manual"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("bb_player_game_game_idx").on(t.gameId),
    index("bb_player_game_player_idx").on(t.playerId),
    uniqueIndex("bb_player_game_uniq").on(t.gameId, t.playerId, t.source),
  ]
);

// Per-position fielding detail. One row per player + game + position + source,
// so a player who rotates positions in a game can log PO/A/E at each spot while
// their hitting/pitching stays on the single bb_player_game row. The sum of a
// player's detail rows for a (game, source) equals the PO/A/E total cached on
// bb_player_game. When no detail rows exist for a (game, player, source), the
// "By Position" view falls back to the single (position, po, a, e) on
// bb_player_game. position: "1"-"10" (1=P..10=SF) or "UA" (unassigned).
export const bbPlayerFielding = pgTable(
  "bb_player_fielding",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    gameId: varchar("game_id").notNull().references(() => bbGames.id, { onDelete: "cascade" }),
    playerId: varchar("player_id").notNull().references(() => bbPlayers.id, { onDelete: "cascade" }),
    position: varchar("position", { length: 10 }).notNull(),
    po: integer("po"),
    a: integer("a"),
    e: integer("e"),
    source: varchar("source", { length: 20 }).notNull().default("manual"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("bb_player_fielding_game_idx").on(t.gameId),
    index("bb_player_fielding_player_idx").on(t.playerId),
    uniqueIndex("bb_player_fielding_uniq").on(t.gameId, t.playerId, t.position, t.source),
  ]
);

// Team-level fielding by position, NOT attributed to any player. Used when the
// admin knows PO/A/E occurred at a position but not which player was there. The
// "By Position" view COMBINES these team rows with the per-player fielding
// totals to show the team's complete defense at each position. One row per
// game + position + source. position: "1"-"10" or "UA". These rows never feed
// individual player stat lines (no player is attached).
export const bbTeamFielding = pgTable(
  "bb_team_fielding",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    gameId: varchar("game_id").notNull().references(() => bbGames.id, { onDelete: "cascade" }),
    position: varchar("position", { length: 10 }).notNull(),
    po: integer("po"),
    a: integer("a"),
    e: integer("e"),
    source: varchar("source", { length: 20 }).notNull().default("manual"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("bb_team_fielding_game_idx").on(t.gameId),
    uniqueIndex("bb_team_fielding_uniq").on(t.gameId, t.position, t.source),
  ]
);

// Speed/baserunning-IQ poll responses. Anyone with team-page access can submit
// once. If the submitted name matches the hard-coded coach roster, the row is
// flagged `is_coach = true` and the matched `coach_role` is stored; uniqueness
// is enforced per role. Otherwise it's a "Non-Coach" row, deduped by the
// lower-cased submitted name. `rankings` is a JSON map:
// { [playerId]: { speed: 1-5, brIQ: 1-5 } }. Partial unique indexes are created
// in raw SQL in `ensureTeamStatsSchema` (Drizzle can't express partial uniques
// cleanly here).
export const bbCoachPollResponses = pgTable(
  "bb_coach_poll_responses",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    teamId: varchar("team_id").notNull().references(() => bbTeams.id, { onDelete: "cascade" }),
    coachRole: varchar("coach_role", { length: 40 }),
    isCoach: boolean("is_coach").notNull().default(true),
    submittedName: text("submitted_name").notNull(),
    rankings: jsonb("rankings").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("bb_coach_poll_team_idx").on(t.teamId)]
);

// Grants a registered user (matched by email) admin access to a specific
// team page. The TSS admin (justin@twinseamsports.com) always has admin
// access regardless of this table — it covers everyone else.
export const bbTeamAdmins = pgTable(
  "bb_team_admins",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    teamId: varchar("team_id").notNull().references(() => bbTeams.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 200 }).notNull(),
    grantedByEmail: varchar("granted_by_email", { length: 200 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // Note: the case-insensitive unique index `bb_team_admins_team_email_uniq`
  // on `(team_id, lower(email))` is created by the SQL migration in
  // `ensureTeamStatsSchema` (Drizzle's `index()` builder can't express a
  // functional unique index, and declaring a non-unique sibling with the
  // same name here would silently win via `CREATE INDEX IF NOT EXISTS`).
  (t) => [index("bb_team_admins_team_idx").on(t.teamId)]
);

export type BbTeam = typeof bbTeams.$inferSelect;
export type BbPlayer = typeof bbPlayers.$inferSelect;
export type BbGame = typeof bbGames.$inferSelect;
export type BbPlayerGame = typeof bbPlayerGame.$inferSelect;
export type BbPlayerFielding = typeof bbPlayerFielding.$inferSelect;
export type BbTeamFielding = typeof bbTeamFielding.$inferSelect;
export type BbCoachPollResponse = typeof bbCoachPollResponses.$inferSelect;
export type BbTeamAdmin = typeof bbTeamAdmins.$inferSelect;

export const insertBbPlayerSchema = createInsertSchema(bbPlayers).omit({ id: true, createdAt: true });
export const insertBbGameSchema = createInsertSchema(bbGames).omit({ id: true, createdAt: true });
export const insertBbPlayerGameSchema = createInsertSchema(bbPlayerGame).omit({ id: true, updatedAt: true });
export const insertBbPlayerFieldingSchema = createInsertSchema(bbPlayerFielding).omit({ id: true, updatedAt: true });
