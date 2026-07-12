import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type DealsListInput } from "@shared/routes";

function parseWithLogging<T>(schema: { safeParse: (data: unknown) => any }, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data as T;
}

function toQueryString(input?: DealsListInput | null) {
  if (!input) return "";
  const params = new URLSearchParams();

  if (input.q) params.set("q", input.q);
  if (input.sportId) params.set("sportId", input.sportId);
  if (input.equipmentTypeId) params.set("equipmentTypeId", input.equipmentTypeId);
  if (input.equipmentTypeIds) params.set("equipmentTypeIds", input.equipmentTypeIds);
  if (input.subFilterId) params.set("subFilterId", input.subFilterId);
  if (input.ebaySeller) params.set("ebaySeller", input.ebaySeller);
  if (input.condition) params.set("condition", input.condition);
  if (typeof input.minPercentOff === "number") params.set("minPercentOff", String(input.minPercentOff));
  if (input.source) params.set("source", input.source);
  if (input.brand) params.set("brand", input.brand);
  if (input.currency) params.set("currency", input.currency);
  if (typeof input.featured === "boolean") params.set("featured", input.featured ? "true" : "false");
  if (typeof input.priceDropOnly === "boolean") params.set("priceDropOnly", input.priceDropOnly ? "true" : "false");
  if (input.limit === "all") params.set("limit", "all");
  else if (typeof input.limit === "number") params.set("limit", String(input.limit));
  if (input.maxPrice) params.set("maxPrice", String(input.maxPrice));
  if (input.sortBy) params.set("sortBy", input.sortBy);

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useDeals(input?: DealsListInput | null) {
  return useQuery({
    queryKey: [api.deals.list.path, input ?? {}],
    enabled: input !== null,
    queryFn: async () => {
      const validated = api.deals.list.input?.safeParse(input);
      if (api.deals.list.input && !validated?.success) {
        console.error("[Zod] deals.list input invalid:", validated.error.format());
        throw validated.error;
      }

      const res = await fetch(`${api.deals.list.path}${toQueryString(input)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deals");
      return parseWithLogging(api.deals.list.responses[200], await res.json(), "deals.list");
    },
  });
}

export function useDefaultFeed(opts?: { perSport?: number; sportIds?: string[] }) {
  const perSport = opts?.perSport ?? 10;
  const sportIds = opts?.sportIds;
  const params = new URLSearchParams();
  params.set("limit", String(perSport));
  if (sportIds !== undefined) params.set("sports", sportIds.join(","));
  const qs = params.toString();
  return useQuery({
    queryKey: ["/api/deals/default-feed", perSport, sportIds ?? "all"],
    queryFn: async () => {
      const res = await fetch(`/api/deals/default-feed?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch default feed");
      return res.json() as Promise<{ sportId: string; sportName: string; deals: any[] }[]>;
    },
    placeholderData: (prev) => prev,
  });
}

export function useDeal(id: string) {
  return useQuery({
    queryKey: [api.deals.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.deals.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch deal");
      return parseWithLogging(api.deals.get.responses[200], await res.json(), "deals.get");
    },
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: unknown) => {
      const validated = api.deals.create.input.parse(data);
      const res = await fetch(api.deals.create.path, {
        method: api.deals.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const err = parseWithLogging(api.deals.create.responses[400], await res.json(), "deals.create.400");
          throw new Error(err.message);
        }
        throw new Error("Failed to create deal");
      }
      return parseWithLogging(api.deals.create.responses[201], await res.json(), "deals.create.201");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.deals.list.path] });
    },
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; updates: unknown }) => {
      const validated = api.deals.update.input.parse(payload.updates);
      const url = buildUrl(api.deals.update.path, { id: payload.id });
      const res = await fetch(url, {
        method: api.deals.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const err = parseWithLogging(api.deals.update.responses[400], await res.json(), "deals.update.400");
          throw new Error(err.message);
        }
        if (res.status === 404) {
          const err = parseWithLogging(api.deals.update.responses[404], await res.json(), "deals.update.404");
          throw new Error(err.message);
        }
        throw new Error("Failed to update deal");
      }
      return parseWithLogging(api.deals.update.responses[200], await res.json(), "deals.update.200");
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [api.deals.list.path] });
      qc.invalidateQueries({ queryKey: [api.deals.get.path, variables.id] });
    },
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const url = buildUrl(api.deals.delete.path, { id });
      const res = await fetch(url, { method: api.deals.delete.method, credentials: "include" });

      if (!res.ok) {
        if (res.status === 404) {
          const err = parseWithLogging(api.deals.delete.responses[404], await res.json(), "deals.delete.404");
          throw new Error(err.message);
        }
        throw new Error("Failed to delete deal");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.deals.list.path] });
    },
  });
}
