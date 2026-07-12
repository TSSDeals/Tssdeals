import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function applyEbayReferral(url?: string | null): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!/ebay\.(com|co\.uk|ca|de|fr|es|it|co\.jp|com\.au|in|com\.br|com\.mx)/i.test(parsed.hostname)) return url;
    parsed.searchParams.set("mkcid", "1");
    parsed.searchParams.set("mkrid", "711-53200-19255-0");
    parsed.searchParams.set("siteid", "0");
    parsed.searchParams.set("campid", "5339133080");
    parsed.searchParams.set("customid", "TSSDealseBay");
    parsed.searchParams.set("toolid", "10001");
    parsed.searchParams.set("mkevt", "1");
    return parsed.toString();
  } catch {
    return url;
  }
}
