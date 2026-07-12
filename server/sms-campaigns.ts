import OpenAI from "openai";
import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import http from "http";
import https from "https";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- SSRF protection ----
// Reject URLs whose resolved IP falls in a private / loopback / link-local /
// CGNAT / metadata range so an admin-pasted link can't probe internal services.

// Expand any IPv6 textual form (incl. "::" compression and embedded IPv4) into
// its 8 numeric hextets. Returns null for malformed input.
function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0]; // strip zone id
  // Convert a trailing dotted-quad (e.g. ::ffff:127.0.0.1) into two hextets.
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const q = tail.split(".").map(Number);
    if (q.length !== 4 || q.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
    s = s.slice(0, lastColon + 1) +
      ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const back = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  let parts: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - back.length;
    if (missing < 0) return null;
    parts = [...head, ...Array(missing).fill("0"), ...back];
  } else {
    parts = head;
  }
  if (parts.length !== 8) return null;
  const hextets = parts.map((h) => parseInt(h || "0", 16));
  if (hextets.some((n) => isNaN(n) || n < 0 || n > 0xffff)) return null;
  return hextets;
}

function ipIsBlocked(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true; // this-network, RFC1918, loopback
    if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const h = expandIPv6(ip);
    if (!h) return true;
    if (h.every((x) => x === 0)) return true; // ::  unspecified
    if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1 loopback
    // IPv4-mapped ::ffff:a.b.c.d (any textual form) — re-check the embedded v4.
    if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff) {
      const v4 = `${h[6] >> 8}.${h[6] & 0xff}.${h[7] >> 8}.${h[7] & 0xff}`;
      return ipIsBlocked(v4);
    }
    if ((h[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((h[0] & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
    if ((h[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
    return false;
  }
  return true; // unknown format — block
}

// Resolve a hostname and ensure EVERY returned address is public. Returns one
// safe address to pin the connection to (prevents DNS-rebinding TOCTOU).
async function resolveSafe(hostname: string): Promise<{ address: string; family: number }> {
  // A bare IP literal still needs validation but no DNS lookup.
  if (net.isIP(hostname)) {
    if (ipIsBlocked(hostname)) throw new Error("Blocked network target");
    return { address: hostname, family: net.isIPv6(hostname) ? 6 : 4 };
  }
  const addrs = await dns.lookup(hostname, { all: true });
  if (addrs.length === 0) throw new Error("Could not resolve host");
  for (const { address } of addrs) {
    if (ipIsBlocked(address)) throw new Error("Blocked network target");
  }
  return { address: addrs[0].address, family: addrs[0].family };
}

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

type RawResponse = { status: number; location?: string; contentType: string; body: string };

// Single GET pinned to a pre-validated IP (so the kernel can't re-resolve the
// host to a private address after our check). Preserves Host header + TLS SNI.
async function safeHttpGet(rawUrl: string, signal: AbortSignal): Promise<RawResponse> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const { address } = await resolveSafe(parsed.hostname);
  const lib = parsed.protocol === "https:" ? https : http;
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;

  return new Promise<RawResponse>((resolve, reject) => {
    const req = lib.request(
      {
        host: address, // connect to the validated IP, not the hostname
        servername: parsed.hostname, // SNI so TLS still matches the cert
        port,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          Host: parsed.host, // preserve virtual host routing
          "User-Agent": "Mozilla/5.0 (compatible; TSSDealsBot/1.0; +https://tssdeals.com)",
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 12000,
      },
      (res) => {
        const status = res.statusCode || 0;
        const contentType = String(res.headers["content-type"] || "");
        if (status >= 300 && status < 400) {
          res.resume(); // drain
          const loc = res.headers.location;
          return resolve({ status, location: Array.isArray(loc) ? loc[0] : loc, contentType, body: "" });
        }
        if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
          res.resume();
          return resolve({ status, contentType, body: "" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let capped = false;
        const finish = () =>
          resolve({ status, contentType, body: Buffer.concat(chunks).subarray(0, MAX_PREVIEW_BYTES).toString("utf-8") });
        res.on("data", (c: Buffer) => {
          if (capped) return;
          size += c.length;
          if (size <= MAX_PREVIEW_BYTES) {
            chunks.push(c);
          } else {
            // Hit the cap — keep the partial HTML and stop reading (head holds OG tags).
            capped = true;
            chunks.push(c);
            res.destroy();
            finish();
          }
        });
        res.on("end", () => {
          if (!capped) finish();
        });
        res.on("error", (err) => {
          if (!capped) reject(err); // ignore the destroy()-triggered error after a cap
        });
      },
    );
    const onAbort = () => req.destroy(new Error("Request aborted"));
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    signal.addEventListener("abort", onAbort, { once: true });
    req.end();
  });
}

// SSRF-safe HTML fetch: re-validates and re-pins every redirect hop (max 4) so a
// public URL can't redirect into a private address.
async function safeFetch(url: string, signal: AbortSignal): Promise<RawResponse | null> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const res = await safeHttpGet(current, signal);
    if (res.status >= 300 && res.status < 400 && res.location) {
      current = new URL(res.location, current).toString();
      continue;
    }
    return res;
  }
  return null; // too many redirects
}

export type LinkPreview = {
  title: string | null;
  description: string | null;
  images: string[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function absolutize(url: string, base: string): string | null {
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  // Handles both attribute orderings: content-after-key and key-after-content.
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*${attr}=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1].trim());
  }
  return null;
}

// Fetch a retailer page and extract OpenGraph title/description/images for the
// landing page. Best-effort: returns whatever it can find without throwing.
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let html = "";
  try {
    // safeFetch returns content-type-filtered, size-capped HTML (or empty).
    const res = await safeFetch(url, controller.signal);
    if (res) html = res.body;
  } catch (err: any) {
    console.warn(`[sms-campaign] preview fetch blocked/failed: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!html) return { title: null, description: null, images: [] };

  const title =
    metaContent(html, "property", "og:title") ||
    metaContent(html, "name", "twitter:title") ||
    (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null);
  const description =
    metaContent(html, "property", "og:description") ||
    metaContent(html, "name", "twitter:description") ||
    metaContent(html, "name", "description");

  const images: string[] = [];
  const seen = new Set<string>();
  const ogImageRe = /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = ogImageRe.exec(html)) !== null) {
    const abs = absolutize(decodeEntities(m[1].trim()), url);
    if (abs && !seen.has(abs)) {
      seen.add(abs);
      images.push(abs);
    }
    if (images.length >= 6) break;
  }

  return { title: title ? decodeEntities(title) : null, description, images };
}

// Generate a short, punchy promotional blurb for the deal landing page.
// Falls back to the meta description if the AI call fails.
export async function generateWriteup(input: {
  url: string;
  title?: string | null;
  description?: string | null;
}): Promise<string> {
  const { url, title, description } = input;
  if (!process.env.OPENAI_API_KEY) {
    return description || "";
  }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You write short, energetic promotional blurbs for a sporting-goods deal aggregator (Twin Seam Sports / TSSDeals). " +
            "Write 2-3 sentences highlighting the value of the deal. Be concrete and benefit-focused, avoid hype words like 'amazing'. " +
            "Do not invent prices or specs that aren't given. Output plain text only, no markdown.",
        },
        {
          role: "user",
          content:
            `Write a short blurb for this deal.\nURL: ${url}\nTitle: ${title || "(unknown)"}\nDescription: ${description || "(none)"}`,
        },
      ],
      max_tokens: 180,
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content?.trim() || description || "";
  } catch (err: any) {
    console.error(`[sms-campaign] AI writeup error: ${err.message}`);
    return description || "";
  }
}

// 8-char URL-safe slug (no ambiguous chars) for the public short link.
export function generateSlug(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
