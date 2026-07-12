import type { Express } from "express";
import { db } from "./db";
import { smsAuthCodes } from "@shared/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";
import { toPublicUser } from "@shared/models/auth";
import twilio from "twilio";
import { checkRateLimit } from "./magic-link-auth";

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

async function sendSmsCode(phone: string, code: string): Promise<boolean> {
  const client = getTwilioClient();
  if (!client) {
    console.log(`[sms-auth] Twilio not configured. Code for ${phone}: ${code}`);
    return false;
  }
  const from = process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    console.log(`[sms-auth] No Twilio from number. Code for ${phone}: ${code}`);
    return false;
  }
  try {
    const msgOptions: any = { body: `Your TSSDeals sign-in code: ${code}. Expires in 15 min. Reply STOP to opt out.`, to: phone };
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      msgOptions.messagingServiceSid = from;
    } else {
      msgOptions.from = from;
    }
    await client.messages.create(msgOptions);
    console.log(`[sms-auth] Code sent to ${phone}`);
    return true;
  } catch (err) {
    console.error(`[sms-auth] Twilio error for ${phone}:`, err);
    return false;
  }
}

const RATE_LIMIT_MAX_SEND = 5;
const RATE_LIMIT_MAX_VERIFY = 10;

export function registerSmsAuthRoutes(app: Express): void {
  app.post("/api/auth/sms/send", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone || typeof phone !== "string") {
        return res.status(400).json({ message: "Phone number is required" });
      }
      const normalizedPhone = normalizePhone(phone.trim());
      if (normalizedPhone.length < 10) {
        return res.status(400).json({ message: "Invalid phone number" });
      }
      const ip = req.ip || "unknown";
      if (!checkRateLimit(`sms-send:${normalizedPhone}`, RATE_LIMIT_MAX_SEND) ||
          !checkRateLimit(`sms-send-ip:${ip}`, RATE_LIMIT_MAX_SEND * 2)) {
        return res.status(429).json({ message: "Too many requests. Please try again in a few minutes." });
      }

      const code = generateCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(smsAuthCodes).values({ phone: normalizedPhone, code, expiresAt });

      const smsSent = await sendSmsCode(normalizedPhone, code);
      const isDev = process.env.NODE_ENV !== "production";

      res.json({
        success: true,
        smsSent,
        message: smsSent
          ? "Check your phone for a verification code"
          : "Verification code generated",
        ...(isDev && !smsSent ? { code } : {}),
      });
    } catch (error) {
      console.error("[sms-auth] Error sending code:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  app.post("/api/auth/sms/verify", async (req: any, res) => {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) {
        return res.status(400).json({ message: "Phone and code are required" });
      }
      const normalizedPhone = normalizePhone(phone.trim());
      const ip = req.ip || "unknown";
      if (!checkRateLimit(`sms-verify:${normalizedPhone}`, RATE_LIMIT_MAX_VERIFY) ||
          !checkRateLimit(`sms-verify-ip:${ip}`, RATE_LIMIT_MAX_VERIFY * 2)) {
        return res.status(429).json({ message: "Too many attempts. Please try again in a few minutes." });
      }

      const [entry] = await db
        .select()
        .from(smsAuthCodes)
        .where(
          and(
            eq(smsAuthCodes.phone, normalizedPhone),
            eq(smsAuthCodes.code, String(code)),
            isNull(smsAuthCodes.usedAt),
            gt(smsAuthCodes.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (!entry) {
        return res.status(400).json({ message: "Invalid or expired code" });
      }

      await db
        .update(smsAuthCodes)
        .set({ usedAt: new Date() })
        .where(eq(smsAuthCodes.id, entry.id));

      const user = await authStorage.upsertUserByPhone(normalizedPhone);

      const sessionUser = { magicLink: true, userId: user.id, email: user.email, phone: user.phone };
      req.login(sessionUser, (err: any) => {
        if (err) {
          console.error("[sms-auth] Login error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.json({
          success: true,
          user: { ...toPublicUser(user), isAdmin: false },
        });
      });
    } catch (error) {
      console.error("[sms-auth] Error verifying code:", error);
      res.status(500).json({ message: "Failed to verify code" });
    }
  });
}
