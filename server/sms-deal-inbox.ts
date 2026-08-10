import type { InsertDeal } from "@shared/schema";
import { classifyDeterministicProduct } from "./deterministic-product-classifier";
import { fetchLinkPreview } from "./sms-campaigns";

const DEFAULT_APPROVED_SENDERS = ["+18659193419", "+18654688946"];
const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;

export function normalizeSmsPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return value.trim();
}

export function approvedDealSmsSenders(envValue = process.env.DEAL_INBOX_SMS_SENDERS): Set<string> {
  const configured = envValue?.split(",").map(normalizeSmsPhone).filter(Boolean);
  return new Set(configured?.length ? configured : DEFAULT_APPROVED_SENDERS);
}

export function extractDealUrls(body: string): string[] {
  const urls = body.match(URL_PATTERN) ?? [];
  return Array.from(new Set(urls.map((url) => url.replace(/[),.;!?]+$/g, ""))));
}

function sourceForUrl(rawUrl: string) {
  const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  const known: Record<string, { sourceId: string; sourceName: string }> = {
    "a.co": { sourceId: "amazon", sourceName: "Amazon" },
    "amazon.com": { sourceId: "amazon", sourceName: "Amazon" },
    "ebay.com": { sourceId: "ebay", sourceName: "eBay" },
    "baselinesports.us": { sourceId: "baseline-sports", sourceName: "Baseline Sports" },
    "twinseamsports.com": { sourceId: "twin-seam-sports", sourceName: "Twin Seam Sports" },
    "ballgloveblueprint.com": { sourceId: "ball-glove-blueprint", sourceName: "Ball Glove Blueprint" },
  };
  const match = Object.entries(known).find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (match) return { ...match[1], baseUrl: `https://${match[0]}` };
  const clean = hostname.replace(/\.(com|net|org|co|io|us)$/i, "").replace(/[^a-z0-9]+/g, "-");
  return { sourceId: `manual-${clean}`, sourceName: hostname, baseUrl: `https://${hostname}` };
}

export type SmsDealHints = {
  title: string | null;
  priceCents: number | null;
  imageUrl?: string | null;
  submittedVia?: "sms-deal-inbox" | "email-deal-inbox";
};

const TWILIO_MESSAGE_SID = /^SM[a-f0-9]{32}$/i;
const TWILIO_MEDIA_SID = /^ME[a-f0-9]{32}$/i;

export function twilioMediaProxyPath(mediaUrl: string | null | undefined): string | null {
  if (!mediaUrl) return null;
  try {
    const parsed = new URL(mediaUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== "api.twilio.com") return null;
    const match = parsed.pathname.match(/\/Messages\/(SM[a-f0-9]{32})\/Media\/(ME[a-f0-9]{32})(?:\/|$)/i);
    if (!match || !TWILIO_MESSAGE_SID.test(match[1]) || !TWILIO_MEDIA_SID.test(match[2])) return null;
    return `/api/sms-deal-media/${match[1]}/${match[2]}`;
  } catch {
    return null;
  }
}

export function parseSmsDealHints(body: string): SmsDealHints {
  const withoutUrls = body.replace(URL_PATTERN, " ");
  const priceMatch = withoutUrls.match(/(?:\$|usd\s*)(\d{1,6}(?:\.\d{1,2})?)/i);
  const priceCents = priceMatch ? Math.round(Number(priceMatch[1]) * 100) : null;
  const title = withoutUrls
    .replace(/(?:\$|usd\s*)\d{1,6}(?:\.\d{1,2})?/gi, " ")
    .replace(/\b(?:add|deal)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || null, priceCents: priceCents && priceCents > 0 ? priceCents : null };
}

function twimlSafe(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function smsDealReply(message: string): string {
  return `<Response><Message>${twimlSafe(message)}</Message></Response>`;
}

export type DealInboxDependencies = {
  ensureSource: (id: string, name: string, baseUrl: string) => Promise<unknown>;
  upsert: (deals: InsertDeal[], label: string) => Promise<{ created: number; updated: number }>;
  getPreview?: typeof fetchLinkPreview;
};

export async function processSmsDealUrl(url: string, dependencies: DealInboxDependencies, hints?: SmsDealHints) {
  const preview = await (dependencies.getPreview ?? fetchLinkPreview)(url);
  const title = hints?.title ?? preview.title;
  const priceCents = hints?.priceCents ?? preview.priceCents;
  if (!title || !priceCents) {
    return {
      ok: false as const,
      message: "That site hid its product details. Send again as: $29.99 Product name https://product-link",
    };
  }
  const source = sourceForUrl(url);
  const submittedVia = hints?.submittedVia ?? "sms-deal-inbox";
  const classification = classifyDeterministicProduct(`${title} ${preview.description ?? ""}`);
  await dependencies.ensureSource(source.sourceId, source.sourceName, source.baseUrl);

  const deal: InsertDeal = {
    sourceId: source.sourceId,
    title,
    brand: null,
    url,
    imageUrl: hints?.imageUrl ?? preview.images[0] ?? null,
    sportId: classification?.sportId ?? null,
    equipmentTypeId: classification?.equipmentTypeId ?? null,
    condition: /\b(?:used|preowned|pre-owned)\b/i.test(`${preview.title} ${preview.description ?? ""}`) ? "preowned" : "new",
    currency: preview.currency ?? "USD",
    msrpCents: null,
    priceCents,
    percentOff: null,
    isBuyItNow: true,
    isFeatured: true,
    autoIncluded: true,
    classificationSource: classification ? "rules" : null,
    classificationConfidence: classification ? "high" : null,
    raw: {
      submittedVia,
      submittedAt: new Date().toISOString(),
      originalUrl: url,
      submittedImageUrl: hints?.imageUrl ?? null,
    },
  };
  const result = await dependencies.upsert([deal], submittedVia);
  const price = new Intl.NumberFormat("en-US", { style: "currency", currency: deal.currency }).format(deal.priceCents / 100);
  return {
    ok: true as const,
    message: `${result.created ? "Added" : "Updated"}: ${deal.title.slice(0, 90)} — ${price}`,
  };
}
