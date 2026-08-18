import type { Deal } from "@shared/schema";
import type { IStorage } from "./storage";
import { rankTopDeals } from "./top-deals-ranking";

const DIGEST_STATE_KEY = "owner_deal_digest_state_v1";
const PRICE_FLOOR_CENTS = 8_500;
const CATEGORY_LIMIT = 20;
const MIN_VERIFIED_SAVINGS_PERCENT = 10;
const MIN_VERIFIED_PRICE_DROP_PERCENT = 5;
const MIN_HISTORICAL_LOW_DAYS = 30;
const FIELDING_EXCLUSIONS = /\b(?:batting\s+gloves?|sliding\s+mitts?|golf|winter|work|training\s+(?:gloves?|mitts?)|glove\s+(?:care|oil|conditioner|lace|repair)|signed|autograph|memorabilia|TSSDeals\s+(?:morning|afternoon|AM|PM|high-value|picks))\b/i;
const FIELDING_EVIDENCE = /\b(?:baseball|softball|fastpitch|fielding|infield|outfield|pitcher|catcher|first[ -]?base)\b.*\b(?:gloves?|mitts?)\b|\b(?:a2k|a2000|pro preferred|heart of the hide|marucci cypress)\b/i;
const BAT_EXCLUSIONS = /\b(?:softball|fastpitch|slowpitch|batting gloves?|helmet|bat (?:bag|rack|grip|tape|weight|cover)|signed|autograph|memorabilia)\b/i;
const BAT_EVIDENCE = /\b(?:baseball bat|bbcor|usssa|usa baseball|wood bat|maple bat|youth bat)\b/i;
type GlovePriceTarget = { label: string; maxExclusiveCents: number; matches: (text: string) => boolean };
const NEW_GLOVE_PRICE_TARGETS: GlovePriceTarget[] = [
  { label: "Wilson A2K under $260", maxExclusiveCents: 26_000, matches: (text) => /\bwilson\b[\s\S]*\ba2k\b|\ba2k\b[\s\S]*\bwilson\b/i.test(text) },
  { label: "Wilson A2000 under $200", maxExclusiveCents: 20_000, matches: (text) => /\bwilson\b[\s\S]*\ba2000\b|\ba2000\b[\s\S]*\bwilson\b/i.test(text) },
  { label: "Rawlings HOH under $215", maxExclusiveCents: 21_500, matches: (text) => /\brawlings\b[\s\S]*(?:heart\s+of\s+the\s+hide|\bhoh\b)|(?:heart\s+of\s+the\s+hide|\bhoh\b)[\s\S]*\brawlings\b/i.test(text) },
  { label: "Mizuno Pro Select under $200", maxExclusiveCents: 20_000, matches: (text) => /\bmizuno\b[\s\S]*\bpro\s+select\b|\bpro\s+select\b[\s\S]*\bmizuno\b/i.test(text) },
  { label: "Mizuno Pro under $250", maxExclusiveCents: 25_000, matches: (text) => /\bmizuno\b[\s\S]*\bpro\b|\bpro\b[\s\S]*\bmizuno\b/i.test(text) },
  { label: "Marucci Capitol under $160", maxExclusiveCents: 16_000, matches: (text) => /\bmarucci\b[\s\S]*\bcapitol\b|\bcapitol\b[\s\S]*\bmarucci\b/i.test(text) },
  { label: "Marucci Cypress under $140", maxExclusiveCents: 14_000, matches: (text) => /\bmarucci\b[\s\S]*\bcypress\b|\bcypress\b[\s\S]*\bmarucci\b/i.test(text) },
];
const NEW_FASTPITCH_GLOVE_PRICE_TARGETS: GlovePriceTarget[] = [
  { label: "Wilson A2000 fastpitch under $240", maxExclusiveCents: 24_000, matches: (text) => /\bwilson\b[\s\S]*\ba2000\b|\ba2000\b[\s\S]*\bwilson\b/i.test(text) },
  { label: "Rawlings HOH fastpitch under $240", maxExclusiveCents: 24_000, matches: (text) => /\brawlings\b[\s\S]*(?:heart\s+of\s+the\s+hide|\bhoh\b)|(?:heart\s+of\s+the\s+hide|\bhoh\b)[\s\S]*\brawlings\b/i.test(text) },
  { label: "Mizuno Pro Select fastpitch under $230", maxExclusiveCents: 23_000, matches: (text) => /\bmizuno\b[\s\S]*\bpro\s+select\b|\bpro\s+select\b[\s\S]*\bmizuno\b/i.test(text) },
  { label: "Easton Professional Collection fastpitch under $220", maxExclusiveCents: 22_000, matches: (text) => /\beaston\b[\s\S]*\b(?:professional|pro)\s+collection\b/i.test(text) },
  { label: "Rawlings Liberty Advanced under $190", maxExclusiveCents: 19_000, matches: (text) => /\brawlings\b[\s\S]*\bliberty\s+advanced\b|\bliberty\s+advanced\b[\s\S]*\brawlings\b/i.test(text) },
  { label: "Mizuno Prime Elite under $180", maxExclusiveCents: 18_000, matches: (text) => /\bmizuno\b[\s\S]*\bprime\s+elite(?:\s+x)?\b/i.test(text) },
  { label: "Wilson A1000 fastpitch under $150", maxExclusiveCents: 15_000, matches: (text) => /\bwilson\b[\s\S]*\ba1000\b|\ba1000\b[\s\S]*\bwilson\b/i.test(text) },
  { label: "Marucci Ascension fastpitch under $160", maxExclusiveCents: 16_000, matches: (text) => /\bmarucci\b[\s\S]*\bascension\b|\bascension\b[\s\S]*\bmarucci\b/i.test(text) },
  { label: "Marucci Palmetto fastpitch under $140", maxExclusiveCents: 14_000, matches: (text) => /\bmarucci\b[\s\S]*\bpalmetto\b|\bpalmetto\b[\s\S]*\bmarucci\b/i.test(text) },
];

export type DigestSlot = "10am" | "2pm";
type DigestCategory = { name: string; path: string; deals: Deal[] };
type DigestState = Record<string, { email?: boolean; sms?: boolean }>;

function easternDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function dueDigestSlots(now = new Date()): DigestSlot[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const clock = hour * 60 + minute;
  const due: DigestSlot[] = [];
  if (clock >= 10 * 60 + 10) due.push("10am");
  if (clock >= 14 * 60 + 10) due.push("2pm");
  return due;
}

export async function catchUpOwnerDealDigests(storage: IStorage, now = new Date()) {
  const results = [];
  for (const slot of dueDigestSlots(now)) results.push({ slot, ...(await sendOwnerDealDigest(storage, slot, now)) });
  return results;
}

export function selectDigestDeals(pool: Deal[]): DigestCategory[] {
  const current = pool.filter((deal) => deal.priceCents > PRICE_FLOOR_CENTS && deal.availabilityStatus === "active");
  const baseballGloves = current.filter((deal) =>
    !FIELDING_EXCLUSIONS.test(deal.title) &&
    (deal.equipmentTypeId === "bb-gloves" || FIELDING_EVIDENCE.test(deal.title)) &&
    !/\bfast[ -]?pitch\b/i.test(deal.title));
  const fastpitchGloves = current.filter((deal) =>
    !FIELDING_EXCLUSIONS.test(deal.title) &&
    !/\bslow[ -]?pitch\b/i.test(deal.title) &&
    /\bfast[ -]?pitch|softball\b/i.test(deal.title) &&
    (/(?:gloves?|mitts?)/i.test(deal.title) || deal.equipmentTypeId === "fp-gloves"));
  const baseballBats = current.filter((deal) =>
    !BAT_EXCLUSIONS.test(deal.title) &&
    (deal.equipmentTypeId === "bb-bats" || BAT_EVIDENCE.test(deal.title)));

  const verifiedSavingsPercent = (deal: Deal) => {
    if (!deal.msrpVerified) return 0;
    const reference = Math.max(Number(deal.manufacturerMsrpCents ?? 0), Number(deal.msrpCents ?? 0));
    if (reference <= deal.priceCents) return 0;
    return ((reference - deal.priceCents) / reference) * 100;
  };
  const historicalLowDays = (deal: Deal) =>
    deal.isLow365d ? 365 : deal.isLow180d ? 180 : deal.isLow90d ? 90 : deal.isLow60d ? 60 : deal.isLow30d ? 30 : 0;
  const digestWorthy = (deal: Deal) =>
    verifiedSavingsPercent(deal) >= MIN_VERIFIED_SAVINGS_PERCENT
    || (
      deal.hasPriceDrop
      && Boolean(deal.lastPriceConfirmedAt)
      && Number(deal.priceDropPercent ?? 0) >= MIN_VERIFIED_PRICE_DROP_PERCENT
    )
    || historicalLowDays(deal) >= MIN_HISTORICAL_LOW_DAYS;

  const priceTarget = (deal: Deal, targets: GlovePriceTarget[]) => {
    const condition = String(deal.condition ?? "").toLowerCase();
    const title = `${deal.title} ${String((deal as Deal & { brand?: string | null }).brand ?? "")}`;
    if (condition !== "new" || /\b(?:used|pre[ -]?owned|open box|demo)\b/i.test(title)) return null;
    return targets.find((target) =>
      deal.priceCents < target.maxExclusiveCents && target.matches(title)) ?? null;
  };

  const ranked = (deals: Deal[], category: { name: string; slug: string; sportId: string; equipmentTypeId: string }) =>
    rankTopDeals(deals, { category, limit: Math.max(CATEGORY_LIMIT * 4, 12) })
      .filter(digestWorthy)
      .slice(0, CATEGORY_LIMIT);
  const rankedGloves = () => {
    const targets = baseballGloves
      .map((deal) => ({ deal, target: priceTarget(deal, NEW_GLOVE_PRICE_TARGETS) }))
      .filter((entry): entry is { deal: Deal; target: GlovePriceTarget } => Boolean(entry.target))
      .sort((a, b) =>
        (a.deal.priceCents / a.target.maxExclusiveCents) - (b.deal.priceCents / b.target.maxExclusiveCents)
        || a.deal.priceCents - b.deal.priceCents);
    const standard = ranked(baseballGloves, { name: "Baseball fielding gloves", slug: "baseball-softball-gloves", sportId: "baseball", equipmentTypeId: "bb-gloves" });
    const selected: Deal[] = [];
    const seen = new Set<string>();
    for (const deal of [...targets.map((entry) => entry.deal), ...standard]) {
      if (seen.has(deal.id)) continue;
      seen.add(deal.id);
      selected.push(deal);
      if (selected.length >= CATEGORY_LIMIT) break;
    }
    return selected;
  };
  const rankedFastpitchGloves = () => {
    const targets = fastpitchGloves
      .map((deal) => ({ deal, target: priceTarget(deal, NEW_FASTPITCH_GLOVE_PRICE_TARGETS) }))
      .filter((entry): entry is { deal: Deal; target: GlovePriceTarget } => Boolean(entry.target))
      .sort((a, b) =>
        (a.deal.priceCents / a.target.maxExclusiveCents) - (b.deal.priceCents / b.target.maxExclusiveCents)
        || a.deal.priceCents - b.deal.priceCents);
    const standard = ranked(fastpitchGloves, { name: "Fastpitch fielding gloves", slug: "fastpitch-fielding-gloves", sportId: "fastpitch-softball", equipmentTypeId: "fp-gloves" });
    const selected: Deal[] = [];
    const seen = new Set<string>();
    const familyCounts = new Map<string, number>();
    for (const entry of targets) {
      const count = familyCounts.get(entry.target.label) ?? 0;
      if (count >= 2 || seen.has(entry.deal.id)) continue;
      familyCounts.set(entry.target.label, count + 1);
      seen.add(entry.deal.id);
      selected.push(entry.deal);
    }
    for (const deal of standard) {
      if (seen.has(deal.id)) continue;
      seen.add(deal.id);
      selected.push(deal);
      if (selected.length >= CATEGORY_LIMIT) break;
    }
    return selected.slice(0, CATEGORY_LIMIT);
  };
  return [
    { name: "Baseball gloves", path: "/app/top-deals/baseball-softball-gloves", deals: rankedGloves() },
    { name: "Fastpitch gloves", path: "/app/deals?sport=fastpitch-softball&equipment=fp-gloves", deals: rankedFastpitchGloves() },
    { name: "Baseball bats", path: "/app/top-deals/baseball-bats", deals: ranked(baseballBats, { name: "Baseball bats", slug: "baseball-bats", sportId: "baseball", equipmentTypeId: "bb-bats" }) },
  ];
}

export async function loadDigestPool(storage: Pick<IStorage, "listDeals">): Promise<Deal[]> {
  const cohorts = await Promise.all([
    storage.listDeals({ sportId: "baseball", equipmentTypeId: "bb-gloves", limit: "all" }),
    storage.listDeals({ sportId: "fastpitch-softball", equipmentTypeId: "fp-gloves", limit: "all" }),
    storage.listDeals({ sportId: "baseball", equipmentTypeId: "bb-bats", limit: "all" }),
    storage.listDeals({ q: "baseball glove", limit: "all" }),
    storage.listDeals({ q: "fastpitch glove", limit: "all" }),
    storage.listDeals({ q: "softball glove", limit: "all" }),
    storage.listDeals({ q: "baseball bat", limit: "all" }),
  ]);
  const byId = new Map<string, Deal>();
  for (const deal of cohorts.flat()) byId.set(deal.id, deal);
  return [...byId.values()];
}

function money(deal: Deal): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: deal.currency || "USD", maximumFractionDigits: 2 }).format(deal.priceCents / 100);
}

function htmlDigest(categories: DigestCategory[], slot: DigestSlot): string {
  const sections = categories.filter((c) => c.deals.length).map((category) => `
    <h2 style="color:#172033">${category.name}</h2>
    ${category.deals.map((deal) => `<p><strong>${deal.title}</strong><br>${money(deal)} · ${deal.sourceId}<br><a href="${deal.url}">View deal</a></p>`).join("")}
    <p><a href="https://www.tssdeals.com${category.path}">See all ${category.name.toLowerCase()}</a></p>`).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h1>TSSDeals ${slot === "10am" ? "morning" : "afternoon"} picks</h1><p>Screened deals over $85 with verified savings, a confirmed price drop, or a 30+ day historical low.</p>${sections}</div>`;
}

export function formatSmsDigest(categories: DigestCategory[], slot: DigestSlot): string {
  const counts = categories.filter((c) => c.deals.length).map((category) =>
    `${category.name}: ${category.deals.length}`);
  return `TSSDeals ${slot === "10am" ? "AM" : "PM"} picks (> $85)\n${counts.join(" · ")}\nSee every qualifying deal: https://www.tssdeals.com/app/todays-picks\nReply STOP to opt out.`;
}

function parseState(raw: string | null): DigestState {
  try { return raw ? JSON.parse(raw) as DigestState : {}; } catch { return {}; }
}

export async function sendOwnerDealDigest(storage: IStorage, slot: DigestSlot, now = new Date()) {
  const key = `${easternDate(now)}:${slot}`;
  const state = parseState(await storage.getAppSetting(DIGEST_STATE_KEY));
  const previous = state[key] ?? {};
  const categories = selectDigestDeals(await loadDigestPool(storage));
  if (!categories.some((category) => category.deals.length)) return { skipped: "no-deals", email: false, sms: false };

  let email = previous.email === true;
  let sms = previous.sms === true;
  const emailTo = process.env.DEAL_DIGEST_EMAIL_TO || "tssadmin@twinseamsports.com";
  if (!email && process.env.SENDGRID_API_KEY && emailTo) {
    try {
      const { default: sgMail } = await import("@sendgrid/mail");
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      await sgMail.send({
        to: emailTo,
        from: { name: "TSSDeals", email: process.env.EMAIL_FROM || "noreply@tssdeals.com" },
        subject: `TSSDeals ${slot === "10am" ? "morning" : "afternoon"} high-value picks`,
        text: formatSmsDigest(categories, slot),
        html: htmlDigest(categories, slot),
      });
      email = true;
      state[key] = { ...previous, email, sms };
      await storage.setAppSetting(DIGEST_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("[deal-digest] Email delivery failed; SMS will still be attempted.", error);
    }
  }

  const phones = (process.env.DEAL_DIGEST_SMS_TO || "").split(",").map((phone) => phone.trim()).filter(Boolean);
  const smsNotifications = phones.length ? await import("./sms-notifications") : null;
  if (!sms && smsNotifications?.isSmsConfigured() && phones.length) {
    try {
      const results = await Promise.all(phones.map((to) => smsNotifications.sendSms({ to, body: formatSmsDigest(categories, slot) })));
      sms = results.every(Boolean);
      state[key] = { ...previous, email, sms };
      await storage.setAppSetting(DIGEST_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("[deal-digest] SMS delivery failed; email status was preserved.", error);
    }
  }
  return { email, sms, categories: categories.map((category) => ({ name: category.name, count: category.deals.length })) };
}
