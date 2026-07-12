import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

function parseWithLogging<T>(schema: { safeParse: (data: unknown) => any }, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data as T;
}

export function usePreferences() {
  return useQuery({
    queryKey: [api.preferences.get.path],
    queryFn: async () => {
      const res = await fetch(api.preferences.get.path, { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch preferences");
      return parseWithLogging(api.preferences.get.responses[200], await res.json(), "preferences.get");
    },
    retry: false,
  });
}

export function useUpsertPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: unknown) => {
      const validated = api.preferences.upsert.input.parse(data);
      const res = await fetch(api.preferences.upsert.path, {
        method: api.preferences.upsert.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const err = parseWithLogging(api.preferences.upsert.responses[400], await res.json(), "preferences.upsert.400");
          throw new Error(err.message);
        }
        if (res.status === 401) {
          const err = parseWithLogging(api.preferences.upsert.responses[401], await res.json(), "preferences.upsert.401");
          throw new Error(err.message);
        }
        throw new Error("Failed to save preferences");
      }

      return parseWithLogging(api.preferences.upsert.responses[200], await res.json(), "preferences.upsert.200");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.preferences.get.path] });
    },
  });
}
