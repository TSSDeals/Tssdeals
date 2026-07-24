import { QueryClient, QueryFunction } from "@tanstack/react-query";

const HTML_RESPONSE_PATTERN = /<(?:!doctype|html|head|body)\b/i;

export async function readSafeErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
  const fallback = res.statusText || "Request failed";

  if (contentType.includes("application/json")) {
    try {
      const body = await res.clone().json() as { message?: unknown; error?: unknown };
      const candidate = typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : null;
      if (candidate?.trim()) return candidate.trim().slice(0, 300);
    } catch {
      // Fall through to the bounded text/proxy-safe handling below.
    }
  }

  const text = (await res.text()).replace(/\s+/g, " ").trim();
  if (
    res.status === 524 ||
    res.status === 502 ||
    res.status === 503 ||
    res.status === 504 ||
    HTML_RESPONSE_PATTERN.test(text)
  ) {
    return "The server could not complete the request in time. The operation may still be running; check its status before trying again.";
  }
  if (res.status === 429) {
    return "The service is temporarily rate-limited. No additional requests were attempted; try again later.";
  }
  return (text || fallback).slice(0, 300);
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    throw new Error(await readSafeErrorMessage(res));
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
