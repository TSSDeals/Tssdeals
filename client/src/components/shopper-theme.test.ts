import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const componentDirectory = fileURLToPath(new URL(".", import.meta.url));
const clientDirectory = fileURLToPath(new URL("..", import.meta.url));
const themeSource = readFileSync(`${clientDirectory}/index.css`, "utf8");
const shopperSources = [
  "AppShell.tsx",
  "DealsSearchHero.tsx",
  "DealCard.tsx",
].map((file) => readFileSync(`${componentDirectory}/${file}`, "utf8"));
shopperSources.push(
  readFileSync(fileURLToPath(new URL("../pages/Landing.tsx", import.meta.url)), "utf8"),
  readFileSync(fileURLToPath(new URL("../pages/Deals.tsx", import.meta.url)), "utf8"),
  readFileSync(fileURLToPath(new URL("../pages/TopDeals.tsx", import.meta.url)), "utf8"),
);

test("shopper theme exposes the approved blue-grey token contract", () => {
  assert.match(themeSource, /--brand-navy:\s*218 53% 21%/);
  assert.match(themeSource, /--brand-steel:\s*210 30% 46%/);
  assert.match(themeSource, /--brand-surface:\s*214 45% 96%/);
  assert.match(themeSource, /--primary:\s*213 64% 38%/);
  assert.match(themeSource, /--ring:\s*213 64% 38%/);
  assert.match(themeSource, /--sidebar-primary:\s*213 64% 38%/);
  assert.match(themeSource, /\.dark[\s\S]*--primary:\s*211 76% 62%/);
  assert.doesNotMatch(themeSource, /--primary:\s*174\b/);
  assert.doesNotMatch(themeSource, /--accent:\s*22\b/);
});

test("main shopper surfaces do not use legacy teal as a primary action color", () => {
  const combinedSource = shopperSources.join("\n");
  assert.doesNotMatch(
    combinedSource,
    /(?:bg|text|border|from|to|ring|shadow)-teal-(?:[1-9]00|50)\b/,
  );
  assert.doesNotMatch(
    combinedSource,
    /(?:bg|from|to)-emerald-(?:500|600|700)\b[^"\n]*(?:button|cta|primary)/i,
  );
});

test("semantic success and savings colors remain available", () => {
  const dealCardSource = shopperSources[2];
  assert.match(dealCardSource, /text-green-600/);
  assert.match(dealCardSource, /deal-low-365d[\s\S]*emerald|emerald[\s\S]*deal-low-365d/);
});
