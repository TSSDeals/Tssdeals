import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PushSubscribeInput } from "@shared/routes";

function parseWithLogging<T>(schema: { safeParse: (data: unknown) => any }, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data as T;
}

export function usePushSubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: PushSubscribeInput) => {
      const validated = api.push.subscribe.input.parse(data);
      const res = await fetch(api.push.subscribe.path, {
        method: api.push.subscribe.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const err = parseWithLogging(api.push.subscribe.responses[400], await res.json(), "push.subscribe.400");
          throw new Error(err.message);
        }
        if (res.status === 401) {
          const err = parseWithLogging(api.push.subscribe.responses[401], await res.json(), "push.subscribe.401");
          throw new Error(err.message);
        }
        throw new Error("Failed to subscribe");
      }

      return parseWithLogging(api.push.subscribe.responses[201], await res.json(), "push.subscribe.201");
    },
    onSuccess: () => {
      // preferences page often toggles pushEnabled; revalidate app state
      qc.invalidateQueries({ queryKey: [api.preferences.get.path] });
    },
  });
}

export function usePushUnsubscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (endpoint: string) => {
      const validated = api.push.unsubscribe.input.parse({ endpoint });
      const res = await fetch(api.push.unsubscribe.path, {
        method: api.push.unsubscribe.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          const err = parseWithLogging(api.push.unsubscribe.responses[401], await res.json(), "push.unsubscribe.401");
          throw new Error(err.message);
        }
        throw new Error("Failed to unsubscribe");
      }

      return parseWithLogging(api.push.unsubscribe.responses[200], await res.json(), "push.unsubscribe.200");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.preferences.get.path] });
    },
  });
}

export function usePushSendTest() {
  return useMutation({
    mutationFn: async (dealId?: string) => {
      const validated = api.push.sendTest.input?.parse(dealId ? { dealId } : undefined);
      const res = await fetch(api.push.sendTest.path, {
        method: api.push.sendTest.method,
        headers: { "Content-Type": "application/json" },
        body: validated ? JSON.stringify(validated) : undefined,
        credentials: "include",
      });

      if (!res.ok) {
        let body: any = {};
        try { body = await res.json(); } catch {}
        if (res.status === 401) throw new Error(body.message ?? "Unauthorized");
        if (res.status === 400) throw new Error(body.error ?? "No push subscription found — please subscribe first.");
        if (res.status === 503) throw new Error("Push notifications are not configured on the server.");
        throw new Error(body.error ?? body.message ?? "Failed to send test notification");
      }

      return parseWithLogging(api.push.sendTest.responses[200], await res.json(), "push.test.200");
    },
  });
}
