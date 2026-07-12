import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

function parseWithLogging<T>(schema: { safeParse: (data: unknown) => any }, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data as T;
}

export function useRunAggregator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dryRun?: boolean) => {
      const validated = api.admin.runAggregator.input?.parse(dryRun !== undefined ? { dryRun } : undefined);
      const res = await fetch(api.admin.runAggregator.path, {
        method: api.admin.runAggregator.method,
        headers: { "Content-Type": "application/json" },
        body: validated ? JSON.stringify(validated) : undefined,
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          const err = parseWithLogging(api.admin.runAggregator.responses[401], await res.json(), "admin.run.401");
          throw new Error(err.message);
        }
        throw new Error("Failed to run aggregator");
      }

      return parseWithLogging(api.admin.runAggregator.responses[200], await res.json(), "admin.run.200");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.deals.list.path] });
    },
  });
}
