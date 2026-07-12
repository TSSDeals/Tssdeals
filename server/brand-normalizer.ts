/**
 * Brand normalization utility.
 * Ensures brand names are stored consistently across all retailer sources.
 *
 * Canonical form is the "correct" marketing capitalization for each brand.
 * The alias map keys are lowercased versions of known variants.
 */

const BRAND_CANONICAL: Record<string, string> = {
  // Wilson family
  "wilson": "Wilson",
  "wilson sporting goods": "Wilson",
  "wilson sports": "Wilson",
  "wilson sporting goods co": "Wilson",

  // Rawlings
  "rawlings": "Rawlings",
  "rawlings sporting goods": "Rawlings",

  // Nike
  "nike": "Nike",
  "nike inc": "Nike",
  "nike, inc.": "Nike",

  // Adidas
  "adidas": "Adidas",
  "adidas originals": "Adidas",

  // Under Armour
  "under armour": "Under Armour",
  "underarmour": "Under Armour",
  "under armor": "Under Armour",

  // Louisville Slugger
  "louisville slugger": "Louisville Slugger",
  "louisville sluggers": "Louisville Slugger",

  // DeMarini
  "demarini": "DeMarini",
  "de marini": "DeMarini",

  // Easton
  "easton": "Easton",
  "easton sports": "Easton",
  "easton baseball": "Easton",

  // Marucci
  "marucci": "Marucci",
  "marucci sports": "Marucci",
  "marucci sports llc": "Marucci",

  // Mizuno
  "mizuno": "Mizuno",
  "mizuno usa": "Mizuno",
  "mizuno corporation": "Mizuno",

  // Titleist
  "titleist": "Titleist",

  // TaylorMade
  "taylormade": "TaylorMade",
  "taylor made": "TaylorMade",
  "taylormade golf": "TaylorMade",

  // Callaway
  "callaway": "Callaway",
  "callaway golf": "Callaway",
  "callaway golf company": "Callaway",

  // Ping
  "ping": "Ping",
  "ping golf": "Ping",

  // Cleveland Golf
  "cleveland": "Cleveland",
  "cleveland golf": "Cleveland",
  "cleveland/srixon": "Cleveland",

  // Cobra
  "cobra": "Cobra",
  "cobra golf": "Cobra",
  "cobra puma golf": "Cobra",

  // Srixon
  "srixon": "Srixon",

  // Yonex
  "yonex": "Yonex",

  // Bauer
  "bauer": "Bauer",
  "bauer hockey": "Bauer",
  "bauer performance sports": "Bauer",

  // CCM
  "ccm": "CCM",
  "ccm hockey": "CCM",

  // Riddell
  "riddell": "Riddell",
  "riddell sports": "Riddell",

  // Schutt
  "schutt": "Schutt",
  "schutt sports": "Schutt",

  // Xenith
  "xenith": "Xenith",

  // Champro
  "champro": "Champro",
  "champro sports": "Champro",

  // New Balance
  "new balance": "New Balance",
  "newbalance": "New Balance",
  "new balance athletics": "New Balance",

  // New Era
  "new era": "New Era",
  "new era cap": "New Era",
  "new era cap company": "New Era",

  // EvoShield
  "evoshield": "EvoShield",
  "evo shield": "EvoShield",

  // Puma
  "puma": "Puma",
  "puma se": "Puma",
  "puma golf": "Puma",

  // Reebok
  "reebok": "Reebok",
  "reebok international": "Reebok",

  // Victus
  "victus": "Victus",
  "victus sports": "Victus",

  // G-Form
  "g-form": "G-Form",
  "g form": "G-Form",
  "gform": "G-Form",

  // Rip It
  "rip it": "Rip It",
  "rip-it": "Rip It",
  "ripit": "Rip It",

  // Nokona
  "nokona": "Nokona",
  "nokona athletic goods": "Nokona",

  // STX
  "stx": "STX",
  "stx lacrosse": "STX",

  // Maverik
  "maverik": "Maverik",
  "maverik lacrosse": "Maverik",

  // Miken
  "miken": "Miken",

  // Worth
  "worth": "Worth",
  "worth sports": "Worth",

  // Warstic
  "warstic": "Warstic",

  // Chandler
  "chandler": "Chandler",
  "chandler bats": "Chandler",

  // Hoka
  "hoka": "Hoka",
  "hoka one one": "Hoka",
  "hoka oneone": "Hoka",

  // Franklin
  "franklin": "Franklin",
  "franklin sports": "Franklin",

  // Bruce Bolt
  "bruce bolt": "Bruce Bolt",

  // Force3
  "force3": "Force3",
  "force 3": "Force3",

  // Diamond
  "diamond": "Diamond",
  "diamond sports": "Diamond",

  // Shoeless Joe
  "shoeless joe": "Shoeless Joe",
  "shoeless joe gloves": "Shoeless Joe",

  // Nathan Sports
  "nathan": "Nathan Sports",
  "nathan sports": "Nathan Sports",

  // Columbia
  "columbia": "Columbia",
  "columbia sportswear": "Columbia",

  // Fanatics
  "fanatics": "Fanatics",
  "fanatics authentic": "Fanatics Authentic",

  // Outerstuff
  "outerstuff": "Outerstuff",

  // Lifeline
  "lifeline": "Lifeline",
  "lifeline fitness": "Lifeline",
  "lifeline usa": "Lifeline",

  // StringKing
  "stringking": "StringKing",
  "string king": "StringKing",
};

/**
 * Normalize a brand name to its canonical form.
 *
 * 1. Look up the lowercase variant in the alias map
 * 2. If found, return the canonical form
 * 3. Otherwise apply simple title-case to the original (preserving all-caps acronyms like CCM, STX)
 */
export function normalizeBrand(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const key = trimmed.toLowerCase();

  if (BRAND_CANONICAL[key]) {
    return BRAND_CANONICAL[key];
  }

  // Preserve all-caps short strings as-is (likely acronyms like "STX", "CCM", "MLB")
  if (trimmed.length <= 5 && trimmed === trimmed.toUpperCase() && /^[A-Z]+$/.test(trimmed)) {
    return trimmed;
  }

  // Title-case multi-word brands that aren't in the alias map
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
