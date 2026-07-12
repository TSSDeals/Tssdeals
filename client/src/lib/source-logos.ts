export interface SourceLogoInfo {
  name: string;
  color: string;
  textLogo?: boolean;
}

const SOURCE_LOGO_MAP: Record<string, SourceLogoInfo> = {
  "ebay": { name: "eBay", color: "#e53238" },
  "dicks-sporting-goods": { name: "DICK'S", color: "#00703c" },
  "cj-dicks-sporting-goods": { name: "DICK'S", color: "#00703c" },
  "golf-galaxy": { name: "Golf Galaxy", color: "#003f72" },
  "cj-golf-galaxy": { name: "Golf Galaxy", color: "#003f72" },
  "fanatics": { name: "Fanatics", color: "#1a1a1a" },
  "twin-seam-sports": { name: "TSS", color: "#2563eb" },
  "baseball-resale": { name: "Baseball Resale", color: "#b91c1c" },
  "sidelineswap": { name: "SidelineSwap", color: "#ff6b35" },
  "nameofthegame": { name: "NOTG", color: "#7c3aed" },
};

const PARTIAL_MATCHES: Array<{ match: string; key: string }> = [
  { match: "ebay", key: "ebay" },
  { match: "dicks", key: "dicks-sporting-goods" },
  { match: "golf-galaxy", key: "golf-galaxy" },
  { match: "fanatics", key: "fanatics" },
  { match: "twin-seam", key: "twin-seam-sports" },
  { match: "baseball-resale", key: "baseball-resale" },
  { match: "sidelineswap", key: "sidelineswap" },
  { match: "nameofthegame", key: "nameofthegame" },
];

export function getSourceLogoInfo(sourceId: string): SourceLogoInfo | null {
  const id = sourceId.toLowerCase();
  if (SOURCE_LOGO_MAP[id]) return SOURCE_LOGO_MAP[id];
  for (const pm of PARTIAL_MATCHES) {
    if (id.includes(pm.match)) return SOURCE_LOGO_MAP[pm.key];
  }
  return null;
}

export const HAS_ICON: Record<string, boolean> = {
  "ebay": true,
  "dicks-sporting-goods": true,
  "cj-dicks-sporting-goods": true,
  "golf-galaxy": true,
  "cj-golf-galaxy": true,
};
