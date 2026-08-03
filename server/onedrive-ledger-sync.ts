import crypto from "crypto";
import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { parseLedgerWorkbook, replaceLedger } from "./admin-operations";

const MICROSOFT_AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const ONEDRIVE_SCOPES = ["openid", "profile", "offline_access", "User.Read", "Files.Read"];
const DEFAULT_LEDGER_PATH = "Desktop/TSS Ledger_Copy.xlsx";
const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;

type FetchLike = typeof fetch;

type ConnectionRow = {
  user_id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: Date | string;
  scope: string | null;
  file_path: string;
  drive_item_id: string | null;
  etag: string | null;
  last_sync_at: Date | string | null;
  last_success_at: Date | string | null;
  last_error: string | null;
  last_row_count: number | null;
};

function requiredEnv(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function encryptionKey(): Buffer {
  const secret = requiredEnv("SESSION_SECRET");
  return crypto.createHash("sha256").update(`tssdeals-onedrive:${secret}`).digest();
}

export function encryptOneDriveToken(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptOneDriveToken(value: string): string {
  const [version, iv, tag, encrypted] = String(value).split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Stored OneDrive authorization is invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function normalizeOneDriveLedgerPath(value: unknown): string {
  const normalized = String(value ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return DEFAULT_LEDGER_PATH;
  if (normalized.includes("..")) throw new Error("Ledger path cannot contain parent-directory segments");
  if (!/\.xlsx?$/i.test(normalized)) throw new Error("Choose an Excel .xlsx or .xls ledger workbook");
  return normalized;
}

function encodeGraphPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function callbackUrl(req: any): string {
  const configured = String(process.env.ONEDRIVE_REDIRECT_URI ?? "").trim();
  if (configured) return configured;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  return `${protocol}://${req.get("host")}/api/admin/operations/onedrive/callback`;
}

function signedState(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 10 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", requiredEnv("SESSION_SECRET")).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyState(value: string): string {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("Microsoft authorization state is invalid");
  const expected = crypto.createHmac("sha256", requiredEnv("SESSION_SECRET")).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Microsoft authorization state did not match");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!parsed.userId || Number(parsed.expiresAt) < Date.now()) throw new Error("Microsoft authorization state expired");
  return String(parsed.userId);
}

export function buildMicrosoftAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(`${MICROSOFT_AUTHORITY}/authorize`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", ONEDRIVE_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

async function tokenRequest(params: URLSearchParams, fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl(`${MICROSOFT_AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || `Microsoft token request failed (${response.status})`);
  }
  return body;
}

async function connectionForUser(userId: string): Promise<ConnectionRow | null> {
  const result = await db.execute(sql`
    SELECT * FROM onedrive_ledger_connections WHERE user_id = ${userId} LIMIT 1
  `);
  return ((result as any).rows?.[0] as ConnectionRow | undefined) ?? null;
}

async function usableAccessToken(connection: ConnectionRow, fetchImpl: FetchLike = fetch): Promise<string> {
  if (new Date(connection.token_expires_at).getTime() > Date.now() + 120_000) {
    return decryptOneDriveToken(connection.access_token_ciphertext);
  }
  const params = new URLSearchParams({
    client_id: requiredEnv("ONEDRIVE_CLIENT_ID"),
    client_secret: requiredEnv("ONEDRIVE_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: decryptOneDriveToken(connection.refresh_token_ciphertext),
    scope: ONEDRIVE_SCOPES.join(" "),
  });
  const tokens = await tokenRequest(params, fetchImpl);
  const refreshToken = tokens.refresh_token || decryptOneDriveToken(connection.refresh_token_ciphertext);
  await db.execute(sql`
    UPDATE onedrive_ledger_connections
    SET access_token_ciphertext = ${encryptOneDriveToken(tokens.access_token)},
        refresh_token_ciphertext = ${encryptOneDriveToken(refreshToken)},
        token_expires_at = ${new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000)},
        scope = ${String(tokens.scope ?? connection.scope ?? "")}, updated_at = NOW()
    WHERE user_id = ${connection.user_id}
  `);
  return tokens.access_token;
}

async function graphJson(url: string, accessToken: string, fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(body?.error?.message || `OneDrive request failed (${response.status})`);
  return body;
}

export async function syncOneDriveLedger(userId: string, options: { force?: boolean; fetchImpl?: FetchLike } = {}) {
  const connection = await connectionForUser(userId);
  if (!connection) throw new Error("Connect Microsoft OneDrive first");
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const accessToken = await usableAccessToken(connection, fetchImpl);
    const filePath = normalizeOneDriveLedgerPath(connection.file_path);
    const metadata = await graphJson(
      `${GRAPH_ROOT}/me/drive/root:/${encodeGraphPath(filePath)}?$select=id,name,eTag,file,lastModifiedDateTime`,
      accessToken,
      fetchImpl,
    );
    if (!metadata.file) throw new Error("The selected OneDrive item is not a file");
    if (!options.force && connection.etag && metadata.eTag === connection.etag) {
      await db.execute(sql`
        UPDATE onedrive_ledger_connections SET last_sync_at = NOW(), last_error = NULL, updated_at = NOW()
        WHERE user_id = ${userId}
      `);
      return { changed: false, rows: Number(connection.last_row_count ?? 0), fileName: metadata.name };
    }
    const download = await fetchImpl(`${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(metadata.id)}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "follow",
    });
    if (!download.ok) throw new Error(`OneDrive workbook download failed (${download.status})`);
    const buffer = Buffer.from(await download.arrayBuffer());
    const entries = parseLedgerWorkbook(buffer);
    if (!entries.length) throw new Error("The OneDrive workbook did not contain readable ledger rows");
    const rows = await replaceLedger(String(metadata.name), entries, { exclusive: true });
    await db.execute(sql`
      UPDATE onedrive_ledger_connections
      SET drive_item_id = ${String(metadata.id)}, etag = ${String(metadata.eTag ?? "")},
          last_sync_at = NOW(), last_success_at = NOW(), last_error = NULL,
          last_row_count = ${rows}, updated_at = NOW()
      WHERE user_id = ${userId}
    `);
    return { changed: true, rows, fileName: metadata.name };
  } catch (error: any) {
    await db.execute(sql`
      UPDATE onedrive_ledger_connections
      SET last_sync_at = NOW(), last_error = ${String(error?.message ?? error)}, updated_at = NOW()
      WHERE user_id = ${userId}
    `).catch(() => undefined);
    throw error;
  }
}

function authedUserId(req: any): string {
  return String(req.user?.magicLink ? req.user.userId : req.user?.claims?.sub ?? "");
}

function publicStatus(connection: ConnectionRow | null) {
  return {
    configured: Boolean(process.env.ONEDRIVE_CLIENT_ID && process.env.ONEDRIVE_CLIENT_SECRET && process.env.SESSION_SECRET),
    connected: Boolean(connection),
    filePath: connection?.file_path ?? DEFAULT_LEDGER_PATH,
    lastSyncAt: connection?.last_sync_at ?? null,
    lastSuccessAt: connection?.last_success_at ?? null,
    lastError: connection?.last_error ?? null,
    rowCount: Number(connection?.last_row_count ?? 0),
    automaticIntervalMinutes: AUTO_SYNC_INTERVAL_MS / 60_000,
  };
}

let schedulerStarted = false;

export function registerOneDriveLedgerRoutes(app: Express, isAdmin: RequestHandler) {
  app.get("/api/admin/operations/onedrive/status", isAdmin, async (req: any, res) => {
    res.json(publicStatus(await connectionForUser(authedUserId(req))));
  });

  app.get("/api/admin/operations/onedrive/start", isAdmin, (req: any, res) => {
    const clientId = requiredEnv("ONEDRIVE_CLIENT_ID");
    res.redirect(buildMicrosoftAuthorizeUrl({
      clientId,
      redirectUri: callbackUrl(req),
      state: signedState(authedUserId(req)),
    }));
  });

  app.get("/api/admin/operations/onedrive/callback", isAdmin, async (req: any, res) => {
    try {
      if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
      const code = String(req.query.code ?? "");
      const userId = verifyState(String(req.query.state ?? ""));
      if (!code || userId !== authedUserId(req)) throw new Error("Microsoft authorization did not match the signed-in administrator");
      const redirectUri = callbackUrl(req);
      const tokens = await tokenRequest(new URLSearchParams({
        client_id: requiredEnv("ONEDRIVE_CLIENT_ID"),
        client_secret: requiredEnv("ONEDRIVE_CLIENT_SECRET"),
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: ONEDRIVE_SCOPES.join(" "),
      }));
      if (!tokens.refresh_token) throw new Error("Microsoft did not return offline access; reconnect and approve file access");
      await db.execute(sql`
        INSERT INTO onedrive_ledger_connections (
          user_id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scope, file_path
        ) VALUES (
          ${userId}, ${encryptOneDriveToken(tokens.access_token)}, ${encryptOneDriveToken(tokens.refresh_token)},
          ${new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000)}, ${String(tokens.scope ?? "")}, ${DEFAULT_LEDGER_PATH}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          access_token_ciphertext = EXCLUDED.access_token_ciphertext,
          refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
          token_expires_at = EXCLUDED.token_expires_at, scope = EXCLUDED.scope,
          last_error = NULL, updated_at = NOW()
      `);
      res.redirect("/app/admin/operations?tab=ledger&onedrive=connected");
    } catch (error: any) {
      res.redirect(`/app/admin/operations?tab=ledger&onedrive_error=${encodeURIComponent(error?.message ?? "Microsoft connection failed")}`);
    }
  });

  app.post("/api/admin/operations/onedrive/config", isAdmin, async (req: any, res) => {
    const userId = authedUserId(req);
    const filePath = normalizeOneDriveLedgerPath(req.body?.filePath);
    const result = await db.execute(sql`
      UPDATE onedrive_ledger_connections
      SET file_path = ${filePath}, drive_item_id = NULL, etag = NULL, last_error = NULL, updated_at = NOW()
      WHERE user_id = ${userId} RETURNING user_id
    `);
    if (!(result as any).rows?.length) return res.status(409).json({ message: "Connect Microsoft OneDrive first" });
    res.json({ ok: true, filePath });
  });

  app.post("/api/admin/operations/onedrive/sync", isAdmin, async (req: any, res) => {
    try {
      res.json(await syncOneDriveLedger(authedUserId(req), { force: req.body?.force === true }));
    } catch (error: any) {
      res.status(502).json({ message: error?.message ?? "OneDrive ledger sync failed" });
    }
  });

  app.post("/api/admin/operations/onedrive/disconnect", isAdmin, async (req: any, res) => {
    await db.execute(sql`DELETE FROM onedrive_ledger_connections WHERE user_id = ${authedUserId(req)}`);
    res.json({ ok: true });
  });

  if (!schedulerStarted && process.env.NODE_ENV !== "test") {
    schedulerStarted = true;
    const run = async () => {
      const result = await db.execute(sql`SELECT user_id FROM onedrive_ledger_connections`);
      for (const row of (result as any).rows ?? []) {
        await syncOneDriveLedger(String(row.user_id)).catch((error) => {
          console.error(`[onedrive-ledger] automatic sync failed: ${error?.message ?? error}`);
        });
      }
    };
    setTimeout(run, 60_000).unref();
    setInterval(run, AUTO_SYNC_INTERVAL_MS).unref();
  }
}
