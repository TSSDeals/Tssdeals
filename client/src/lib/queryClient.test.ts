import assert from "node:assert/strict";
import test from "node:test";
import { apiRequest, readSafeErrorMessage } from "./queryClient";

test("Cloudflare HTML timeout responses become a concise safe message", async () => {
  const html = "<!DOCTYPE html><html><head><title>524 timeout</title></head><body>cloudflare details</body></html>";
  const message = await readSafeErrorMessage(new Response(html, {
    status: 524,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  }));

  assert.match(message, /could not complete the request in time/i);
  assert.doesNotMatch(message, /<!doctype|<html|cloudflare details/i);
  assert.ok(message.length < 200);
});

test("JSON API messages remain actionable without exposing an HTML body", async () => {
  const message = await readSafeErrorMessage(new Response(JSON.stringify({
    message: "eBay Browse quota is exhausted. No additional requests were attempted.",
  }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  }));

  assert.equal(message, "eBay Browse quota is exhausted. No additional requests were attempted.");
});

test("apiRequest never puts raw proxy HTML in the thrown error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    "<html><body><h1>Web server is returning an unknown error</h1></body></html>",
    { status: 502, headers: { "Content-Type": "text/html" } },
  );

  try {
    await assert.rejects(
      apiRequest("POST", "/api/ebay/public-sync", {}),
      (error: unknown) =>
        error instanceof Error &&
        /check its status/i.test(error.message) &&
        !/<html/i.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
