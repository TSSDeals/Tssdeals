import { z } from "zod";
import {
  insertPushSubscriptionSchema,
  insertUserPreferencesSchema,
  insertDealSchema,
  createSportInputSchema,
  createEquipmentTypeInputSchema,
  createEquipmentSubFilterInputSchema,
  createEbaySellerInputSchema,
  insertSourceInputSchema,
  autoIncludeRules,
  deals,
  ebaySellers,
  equipmentTypes,
  equipmentSubFilters,
  sources,
  sports,
  userPreferences,
} from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  meta: {
    config: {
      method: "GET" as const,
      path: "/api/meta/config" as const,
      responses: {
        200: z.object({
          scheduled: z.object({
            times: z.array(z.string()),
            timezone: z.literal("America/New_York"),
          }),
          featuredRules: z.object({
            ourStoreSourceId: z.string(),
            withinPercentPoints: z.number(),
            bonusScore: z.number(),
          }),
        }),
      },
    },
  },
  taxonomy: {
    sports: {
      list: {
        method: "GET" as const,
        path: "/api/sports" as const,
        responses: { 200: z.array(z.custom<typeof sports.$inferSelect>()) },
      },
      create: {
        method: "POST" as const,
        path: "/api/sports" as const,
        input: createSportInputSchema,
        responses: {
          201: z.custom<typeof sports.$inferSelect>(),
          400: errorSchemas.validation,
          401: errorSchemas.unauthorized,
        },
      },
    },
    equipmentTypes: {
      list: {
        method: "GET" as const,
        path: "/api/equipment-types" as const,
        input: z
          .object({
            sportId: z.string().optional(),
          })
          .optional(),
        responses: {
          200: z.array(z.custom<typeof equipmentTypes.$inferSelect>()),
        },
      },
      create: {
        method: "POST" as const,
        path: "/api/equipment-types" as const,
        input: createEquipmentTypeInputSchema,
        responses: {
          201: z.custom<typeof equipmentTypes.$inferSelect>(),
          400: errorSchemas.validation,
          401: errorSchemas.unauthorized,
        },
      },
    },
    subFilters: {
      list: {
        method: "GET" as const,
        path: "/api/sub-filters" as const,
        input: z
          .object({
            equipmentTypeId: z.string().optional(),
          })
          .optional(),
        responses: {
          200: z.array(z.custom<typeof equipmentSubFilters.$inferSelect>()),
        },
      },
      create: {
        method: "POST" as const,
        path: "/api/sub-filters" as const,
        input: createEquipmentSubFilterInputSchema,
        responses: {
          201: z.custom<typeof equipmentSubFilters.$inferSelect>(),
          400: errorSchemas.validation,
          401: errorSchemas.unauthorized,
        },
      },
      delete: {
        method: "DELETE" as const,
        path: "/api/sub-filters/:id" as const,
        responses: {
          204: z.void(),
          401: errorSchemas.unauthorized,
          404: errorSchemas.notFound,
        },
      },
    },
    sources: {
      list: {
        method: "GET" as const,
        path: "/api/sources" as const,
        responses: { 200: z.array(z.custom<typeof sources.$inferSelect>()) },
      },
      create: {
        method: "POST" as const,
        path: "/api/sources" as const,
        input: insertSourceInputSchema,
        responses: {
          201: z.custom<typeof sources.$inferSelect>(),
          400: errorSchemas.validation,
          401: errorSchemas.unauthorized,
        },
      },
    },
  },
  deals: {
    list: {
      method: "GET" as const,
      path: "/api/deals" as const,
      input: z
        .object({
          q: z.string().optional(),
          sportId: z.string().optional(),
          equipmentTypeId: z.string().optional(),
          equipmentTypeIds: z.string().optional(),
          subFilterId: z.string().optional(),
          ebaySeller: z.string().optional(),
          condition: z.enum(["new", "preowned", "all"]).optional(),
          minPercentOff: z.coerce.number().min(0).max(100).optional(),
          maxPrice: z.coerce.number().min(0).optional(),
          source: z.string().optional(),
          brand: z.string().optional(),
          currency: z.string().optional(),
          featured: z
            .union([z.literal("true"), z.literal("false"), z.boolean()])
            .transform((v) => v === true || v === "true")
            .optional(),
          priceDropOnly: z
            .union([z.literal("true"), z.literal("false"), z.boolean()])
            .transform((v) => v === true || v === "true")
            .optional(),
          limit: z.union([z.literal("all"), z.coerce.number().min(1).max(200)]).optional(),
          sortBy: z.enum(["newest", "oldest", "price-low", "price-high", "discount-high", "a-z", "z-a"]).optional(),
        })
        .optional(),
      responses: {
        200: z.array(z.custom<typeof deals.$inferSelect>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/deals/:id" as const,
      responses: {
        200: z.custom<typeof deals.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/deals" as const,
      input: insertDealSchema,
      responses: {
        201: z.custom<typeof deals.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/deals/:id" as const,
      input: insertDealSchema.partial(),
      responses: {
        200: z.custom<typeof deals.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/deals/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  preferences: {
    get: {
      method: "GET" as const,
      path: "/api/preferences" as const,
      responses: {
        200: z.custom<typeof userPreferences.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    upsert: {
      method: "PUT" as const,
      path: "/api/preferences" as const,
      input: insertUserPreferencesSchema,
      responses: {
        200: z.custom<typeof userPreferences.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
  push: {
    subscribe: {
      method: "POST" as const,
      path: "/api/push/subscribe" as const,
      input: insertPushSubscriptionSchema,
      responses: {
        201: z.object({ ok: z.literal(true) }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    unsubscribe: {
      method: "POST" as const,
      path: "/api/push/unsubscribe" as const,
      input: z
        .object({
          endpoint: z.string().url(),
        })
        .strict(),
      responses: {
        200: z.object({ ok: z.literal(true) }),
        401: errorSchemas.unauthorized,
      },
    },
    sendTest: {
      method: "POST" as const,
      path: "/api/push/test" as const,
      input: z
        .object({
          dealId: z.string().optional(),
        })
        .optional(),
      responses: {
        200: z.object({ ok: z.literal(true) }),
        401: errorSchemas.unauthorized,
      },
    },
  },
  autoIncludeRules: {
    list: {
      method: "GET" as const,
      path: "/api/auto-include-rules" as const,
      responses: { 200: z.array(z.custom<typeof autoIncludeRules.$inferSelect>()) },
    },
  },
  ebaySellers: {
    list: {
      method: "GET" as const,
      path: "/api/ebay-sellers" as const,
      responses: { 200: z.array(z.custom<typeof ebaySellers.$inferSelect>()) },
    },
    create: {
      method: "POST" as const,
      path: "/api/ebay-sellers" as const,
      input: createEbaySellerInputSchema,
      responses: {
        201: z.custom<typeof ebaySellers.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/ebay-sellers/:id" as const,
      responses: {
        204: z.void(),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
  },
  admin: {
    runAggregator: {
      method: "POST" as const,
      path: "/api/admin/run" as const,
      input: z
        .object({
          dryRun: z.coerce.boolean().optional(),
        })
        .optional(),
      responses: {
        200: z.object({
          ok: z.boolean(),
          message: z.string().optional(),
          totalCreated: z.number().optional(),
          totalUpdated: z.number().optional(),
          totalErrors: z.number().optional(),
          elapsedSeconds: z.string().optional(),
          breakdown: z.record(z.string(), z.object({
            created: z.number(),
            updated: z.number(),
            errors: z.number(),
          })).optional(),
        }),
        401: errorSchemas.unauthorized,
      },
    },
  },
};

export function buildUrl(
  path: string,
  params?: Record<string, string | number>
): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type DealsListResponse = z.infer<typeof api.deals.list.responses[200]>;
export type DealResponse = z.infer<typeof api.deals.get.responses[200]>;
export type DealsListInput = z.infer<typeof api.deals.list.input>;

export type PreferencesResponse = z.infer<typeof api.preferences.get.responses[200]>;
export type PreferencesUpsertInput = z.infer<typeof api.preferences.upsert.input>;

export type PushSubscribeInput = z.infer<typeof api.push.subscribe.input>;
