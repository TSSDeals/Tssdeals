import crypto from "node:crypto";
import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { promotionDetails } from "./promotion-intelligence";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const REQUIRED_EMAIL = "admin@tssdeals.com";

function required(name: string) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function key() {
  return crypto.createHash("sha256").update(`tssdeals-gmail-promotions:${required("SESSION_SECRET")}`).digest();
}

export function encryptGmailToken(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptGmailToken(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Stored Gmail authorization is invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function callbackUrl(req: any) {
  return String(process.env.GMAIL_REDIRECT_URI ?? "").trim()
    || `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}/api/admin/promotions/gmail/callback`;
}

function signedState(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 10 * 60_000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", required("SESSION_SECRET")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyState(value: string) {
  const [payload, signature] = value.split(".");
  const expected = crypto.createHmac("sha256", required("SESSION_SECRET")).update(payload || "").digest("base64url");
  if (!payload || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Google authorization state did not match");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!parsed.userId || Number(parsed.expiresAt) < Date.now()) throw new Error("Google authorization state expired");
  return String(parsed.userId);
}

export function buildGmailAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }) {
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("login_hint", REQUIRED_EMAIL);
  url.searchParams.set("state", input.state);
  return url.toString();
}

async function tokenRequest(params: URLSearchParams) {
  const response = await fetch(GOOGLE_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || `Google token request failed (${response.status})`);
  return body;
}

async function connection(userId: string) {
  const result = await db.execute(sql`SELECT * FROM gmail_promotion_connections WHERE user_id=${userId} LIMIT 1`);
  return (result as any).rows?.[0] ?? null;
}

async function accessToken(row: any) {
  if (new Date(row.token_expires_at).getTime() > Date.now() + 120_000) return decryptGmailToken(row.access_token_ciphertext);
  const tokens = await tokenRequest(new URLSearchParams({
    client_id: required("GMAIL_CLIENT_ID"), client_secret: required("GMAIL_CLIENT_SECRET"),
    refresh_token: decryptGmailToken(row.refresh_token_ciphertext), grant_type: "refresh_token",
  }));
  await db.execute(sql`UPDATE gmail_promotion_connections SET
    access_token_ciphertext=${encryptGmailToken(tokens.access_token)},
    token_expires_at=${new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000)}, updated_at=NOW()
    WHERE user_id=${row.user_id}`);
  return tokens.access_token;
}

function decode(value?: string) {
  return value ? Buffer.from(value, "base64url").toString("utf8") : "";
}

function messageText(payload: any): string {
  const own = /^text\/(?:plain|html)/i.test(payload?.mimeType || "") ? decode(payload?.body?.data) : "";
  return [own, ...(payload?.parts || []).map(messageText)].join(" ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
}

export function parseGmailPromotion(message: any) {
  const headers = Object.fromEntries((message?.payload?.headers || []).map((header: any) => [String(header.name).toLowerCase(), String(header.value)]));
  const from = headers.from || "";
  const email = from.match(/<([^<>]+@[^<>]+)>/)?.[1] || from.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
  const text = `${headers.subject || ""} ${messageText(message?.payload)}`.replace(/\s+/g, " ").trim();
  return {
    messageId: String(message.id), subject: headers.subject || "(No subject)", senderEmail: email.toLowerCase(),
    senderDomain: email.split("@")[1]?.toLowerCase() || null, senderName: from.replace(/<.*$/, "").replace(/^"|"$/g, "").trim() || null,
    receivedAt: headers.date ? new Date(headers.date) : new Date(Number(message.internalDate || Date.now())),
    text, ...promotionDetails(text),
  };
}

async function gmailJson(url: string, token: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(body?.error?.message || `Gmail request failed (${response.status})`);
  return body;
}

export async function syncGmailPromotions(userId: string) {
  const row = await connection(userId);
  if (!row) throw new Error("Connect the promotion Gmail inbox first");
  const token = await accessToken(row);
  const after = row.last_success_at
    ? Math.max(0, Math.floor(new Date(row.last_success_at).getTime() / 1000) - 300)
    : Math.floor(Date.now() / 1000) - 30 * 86400;
  const listing = await gmailJson(`${GMAIL_API}/users/me/messages?maxResults=100&q=${encodeURIComponent(`after:${after}`)}`, token);
  let count = 0;
  for (const item of listing.messages || []) {
    const message = await gmailJson(`${GMAIL_API}/users/me/messages/${encodeURIComponent(item.id)}?format=full`, token);
    const candidate = parseGmailPromotion(message);
    if (!candidate.code && !candidate.discountType && !candidate.landingUrl) continue;
    const source = candidate.senderDomain ? await db.execute(sql`
      SELECT id FROM sources WHERE lower(base_url) LIKE ${`%${candidate.senderDomain}%`} LIMIT 1
    `) : null;
    const sourceId = (source as any)?.rows?.[0]?.id ?? null;
    await db.execute(sql`
      INSERT INTO promotion_inbox_candidates (
        gmail_message_id, sender_email, sender_domain, sender_name, subject, received_at,
        code, description, discount_type, discount_value, landing_url, monitored_source_id, status, confidence, raw
      ) VALUES (
        ${candidate.messageId}, ${candidate.senderEmail || null}, ${candidate.senderDomain}, ${candidate.senderName},
        ${candidate.subject}, ${candidate.receivedAt}, ${candidate.code}, ${candidate.text.slice(0, 4000)},
        ${candidate.discountType}, ${candidate.discountValue}, ${candidate.landingUrl}, ${sourceId},
        'pending', ${sourceId && candidate.code ? "high" : "medium"}, ${JSON.stringify({ snippet: message.snippet })}::jsonb
      ) ON CONFLICT (gmail_message_id) DO NOTHING
    `);
    count++;
  }
  await db.execute(sql`UPDATE gmail_promotion_connections SET last_sync_at=NOW(), last_success_at=NOW(), last_error=NULL,
    last_message_count=${count}, updated_at=NOW() WHERE user_id=${userId}`);
  return { messagesExamined: (listing.messages || []).length, candidates: count };
}

function userId(req: any) { return String(req.user?.magicLink ? req.user.userId : req.user?.claims?.sub ?? ""); }

export function registerGmailPromotionRoutes(app: Express, isAdmin: RequestHandler) {
  app.get("/api/admin/promotions/gmail/status", isAdmin, async (req: any, res) => {
    const row = await connection(userId(req));
    res.json({ configured: Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.SESSION_SECRET),
      connected: Boolean(row), emailAddress: row?.email_address ?? REQUIRED_EMAIL, scope: row?.scope ?? null,
      lastSyncAt: row?.last_sync_at ?? null, lastSuccessAt: row?.last_success_at ?? null, lastError: row?.last_error ?? null,
      lastMessageCount: Number(row?.last_message_count ?? 0) });
  });
  app.get("/api/admin/promotions/gmail/start", isAdmin, (req: any, res) => res.redirect(buildGmailAuthorizeUrl({
    clientId: required("GMAIL_CLIENT_ID"), redirectUri: callbackUrl(req), state: signedState(userId(req)),
  })));
  app.get("/api/admin/promotions/gmail/callback", isAdmin, async (req: any, res) => {
    try {
      if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
      const owner = verifyState(String(req.query.state || ""));
      if (owner !== userId(req)) throw new Error("Google authorization did not match the signed-in administrator");
      const tokens = await tokenRequest(new URLSearchParams({
        client_id: required("GMAIL_CLIENT_ID"), client_secret: required("GMAIL_CLIENT_SECRET"), code: String(req.query.code || ""),
        redirect_uri: callbackUrl(req), grant_type: "authorization_code",
      }));
      const profile = await gmailJson(`${GMAIL_API}/users/me/profile`, tokens.access_token);
      if (String(profile.emailAddress).toLowerCase() !== REQUIRED_EMAIL) throw new Error(`Authorize ${REQUIRED_EMAIL}, not ${profile.emailAddress}`);
      if (!tokens.refresh_token) throw new Error("Google did not return offline access; reconnect and approve read-only Gmail access");
      await db.execute(sql`INSERT INTO gmail_promotion_connections (
        user_id,email_address,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,scope
      ) VALUES (${owner},${REQUIRED_EMAIL},${encryptGmailToken(tokens.access_token)},${encryptGmailToken(tokens.refresh_token)},
        ${new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000)},${String(tokens.scope || GMAIL_SCOPE)})
      ON CONFLICT(user_id) DO UPDATE SET email_address=EXCLUDED.email_address,access_token_ciphertext=EXCLUDED.access_token_ciphertext,
        refresh_token_ciphertext=EXCLUDED.refresh_token_ciphertext,token_expires_at=EXCLUDED.token_expires_at,scope=EXCLUDED.scope,last_error=NULL,updated_at=NOW()`);
      res.redirect("/app/admin?gmail_promotions=connected");
    } catch (error: any) { res.redirect(`/app/admin?gmail_promotions_error=${encodeURIComponent(error?.message || "Google connection failed")}`); }
  });
  app.post("/api/admin/promotions/gmail/sync", isAdmin, async (req: any, res) => {
    try { res.json(await syncGmailPromotions(userId(req))); }
    catch (error: any) { res.status(502).json({ message: error?.message || "Gmail promotion sync failed" }); }
  });
  app.post("/api/admin/promotions/gmail/disconnect", isAdmin, async (req: any, res) => {
    await db.execute(sql`DELETE FROM gmail_promotion_connections WHERE user_id=${userId(req)}`); res.json({ ok: true });
  });
  app.get("/api/admin/promotions/email-candidates", isAdmin, async (_req, res) => {
    const result = await db.execute(sql`SELECT * FROM promotion_inbox_candidates ORDER BY received_at DESC NULLS LAST LIMIT 500`);
    res.json((result as any).rows ?? []);
  });
}
