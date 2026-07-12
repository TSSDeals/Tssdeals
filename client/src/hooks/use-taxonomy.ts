import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

function parseWithLogging<T>(schema: { safeParse: (data: unknown) => any }, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data as T;
}

export function useSports() {
  return useQuery({
    queryKey: [api.taxonomy.sports.list.path],
    queryFn: async () => {
      const res = await fetch(api.taxonomy.sports.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sports");
      return parseWithLogging(api.taxonomy.sports.list.responses[200], await res.json(), "taxonomy.sports.list");
    },
  });
}

export function useEquipmentTypes(sportId?: string) {
  return useQuery({
    queryKey: [api.taxonomy.equipmentTypes.list.path, { sportId: sportId ?? null }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sportId) params.set("sportId", sportId);
      const url = params.toString()
        ? `${api.taxonomy.equipmentTypes.list.path}?${params.toString()}`
        : api.taxonomy.equipmentTypes.list.path;

      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch equipment types");
      return parseWithLogging(
        api.taxonomy.equipmentTypes.list.responses[200],
        await res.json(),
        "taxonomy.equipmentTypes.list"
      );
    },
  });
}

export function useSubFilters(equipmentTypeId?: string) {
  return useQuery({
    queryKey: [api.taxonomy.subFilters.list.path, { equipmentTypeId: equipmentTypeId ?? null }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (equipmentTypeId) params.set("equipmentTypeId", equipmentTypeId);
      const url = params.toString()
        ? `${api.taxonomy.subFilters.list.path}?${params.toString()}`
        : api.taxonomy.subFilters.list.path;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sub-filters");
      return parseWithLogging(
        api.taxonomy.subFilters.list.responses[200],
        await res.json(),
        "taxonomy.subFilters.list"
      );
    },
    enabled: !!equipmentTypeId,
  });
}

export function useSources() {
  return useQuery({
    queryKey: [api.taxonomy.sources.list.path],
    queryFn: async () => {
      const res = await fetch(api.taxonomy.sources.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sources");
      return parseWithLogging(api.taxonomy.sources.list.responses[200], await res.json(), "taxonomy.sources.list");
    },
  });
}

export function useEbaySellers() {
  return useQuery({
    queryKey: [api.ebaySellers.list.path],
    queryFn: async () => {
      const res = await fetch(api.ebaySellers.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch eBay sellers");
      return parseWithLogging(
        api.ebaySellers.list.responses[200],
        await res.json(),
        "ebaySellers.list"
      );
    },
  });
}
