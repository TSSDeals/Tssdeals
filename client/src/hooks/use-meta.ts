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

export function useMetaConfig() {
  return useQuery({
    queryKey: [api.meta.config.path],
    queryFn: async () => {
      const res = await fetch(api.meta.config.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load config");
      const json = await res.json();
      return parseWithLogging(api.meta.config.responses[200], json, "meta.config");
    },
  });
}
