import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import TopDealsPage from "./TopDeals";
import { MagicLinkProvider } from "@/components/MagicLinkDialog";

test("actual TopDeals route renders running-shoes title and empty state after a failed/empty request", () => {
  Object.defineProperty(globalThis, "React", { value: React, configurable: true });
  const navigatorMock = { userAgent: "", platform: "", maxTouchPoints: 0 };
  Object.defineProperty(globalThis, "navigator", { value: navigatorMock, configurable: true });
  Object.defineProperty(globalThis, "window", {
    value: {
      navigator: navigatorMock,
      location: { hostname: "tssdeals.com", href: "" },
      matchMedia: () => ({ matches: true }),
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: () => null, setItem: () => undefined },
    configurable: true,
  });

  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(["/api/auth/user"], null);
  client.setQueryData(["/api/deal-categories"], [{
    id: "running",
    slug: "running-shoes",
    name: "Top Running Shoe Deals",
    description: "Verified running footwear deals",
    isPredefined: true,
  }]);
  client.setQueryData(["/api/deal-categories", "running-shoes"], {
    category: null,
    deals: [],
  });
  client.setQueryData(["/api/popular-searches"], []);
  client.setQueryData(["/api/sources"], []);

  const locationHook = () =>
    ["/app/top-deals/running-shoes", () => undefined] as const;
  const html = renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        Router,
        { hook: locationHook },
        React.createElement(
          MagicLinkProvider,
          null,
          React.createElement(TopDealsPage),
        ),
      ),
    ),
  );

  assert.match(html, /Top Running Shoe Deals/);
  assert.match(html, /No verified deals right now/);
  assert.doesNotMatch(html, /Curated Categories/);
});
