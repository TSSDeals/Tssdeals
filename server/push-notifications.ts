import webpush from "web-push";
import { log } from "./index";
import { pool } from "./db";

let configured = false;
let vapidPublicKey: string | null = null;

async function loadKeysFromDb(): Promise<{ publicKey: string; privateKey: string } | null> {
  try {
    const pubResult = await pool.query("SELECT value FROM app_settings WHERE key = 'vapid_public_key'");
    const privResult = await pool.query("SELECT value FROM app_settings WHERE key = 'vapid_private_key'");
    if (pubResult.rows.length > 0 && privResult.rows.length > 0) {
      return { publicKey: pubResult.rows[0].value, privateKey: privResult.rows[0].value };
    }
  } catch (err: any) {
    log(`Failed to load VAPID keys from database: ${err.message}`, "push");
  }
  return null;
}

async function saveKeysToDb(publicKey: string, privateKey: string): Promise<void> {
  try {
    await pool.query(
      "INSERT INTO app_settings (key, value) VALUES ('vapid_public_key', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [publicKey]
    );
    await pool.query(
      "INSERT INTO app_settings (key, value) VALUES ('vapid_private_key', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [privateKey]
    );
    log("VAPID keys saved to database for persistence", "push");
  } catch (err: any) {
    log(`Failed to save VAPID keys to database: ${err.message}`, "push");
  }
}

export async function configurePush() {
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@twinseamdeals.com";

  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey) publicKey = publicKey.replace(/=+$/, "").trim();
  if (privateKey) privateKey = privateKey.replace(/=+$/, "").trim();

  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      vapidPublicKey = publicKey;
      configured = true;
      log("Push notifications configured with env VAPID keys", "push");
      return;
    } catch (err: any) {
      log(`Env VAPID keys invalid (${err.message}), checking database...`, "push");
    }
  }

  const dbKeys = await loadKeysFromDb();
  if (dbKeys) {
    try {
      webpush.setVapidDetails(subject, dbKeys.publicKey, dbKeys.privateKey);
      vapidPublicKey = dbKeys.publicKey;
      configured = true;
      log("Push notifications configured with database VAPID keys", "push");
      return;
    } catch (err: any) {
      log(`Database VAPID keys invalid (${err.message}), generating new...`, "push");
    }
  }

  const keys = webpush.generateVAPIDKeys();
  try {
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    vapidPublicKey = keys.publicKey;
    configured = true;
    await saveKeysToDb(keys.publicKey, keys.privateKey);
    log("Push notifications configured with auto-generated VAPID keys", "push");
  } catch (err: any) {
    log(`Push notifications disabled: ${err.message}`, "push");
  }
}

export function isPushConfigured(): boolean {
  return configured;
}

export function getVapidPublicKey(): string | null {
  return vapidPublicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

export async function sendPushToSubscription(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<boolean> {
  if (!configured) return false;

  const pushSub = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  try {
    await webpush.sendNotification(pushSub, JSON.stringify(payload));
    return true;
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      log(`Push subscription expired/invalid: ${sub.endpoint.slice(0, 60)}...`, "push");
    } else {
      log(`Push send error (${err.statusCode}): ${err.message}`, "push");
    }
    return false;
  }
}

export async function sendPushToUser(
  subs: { endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number; expired: string[] }> {
  if (!configured || subs.length === 0) {
    return { sent: 0, failed: 0, expired: [] };
  }

  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  for (const sub of subs) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSub, JSON.stringify(payload));
      sent++;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        expired.push(sub.endpoint);
      }
      failed++;
    }
  }

  return { sent, failed, expired };
}
