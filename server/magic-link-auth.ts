import type { Express } from "express";
import { db } from "./db";
import { magicLinks } from "@shared/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { toPublicUser } from "@shared/models/auth";
import crypto from "crypto";
import sgMail from "@sendgrid/mail";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log(`[magic-link] SendGrid not configured. Code for ${email}: ${code}`);
    return false;
  }
  const from = process.env.EMAIL_FROM || "noreply@tssdeals.com";
  try {
    await sgMail.send({
      from: { name: "TSSDeals", email: from },
      to: email,
      subject: "Your TSSDeals sign-in code",
      text: `Your sign-in code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you didn't request this, you can ignore this email.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #ffffff;">
          <h2 style="color: #1a1a1a; margin-bottom: 8px;">TSSDeals</h2>
          <p style="color: #555; font-size: 15px;">Here is your sign-in code:</p>
          <div style="background: #f4f4f4; border-radius: 12px; padding: 28px; text-align: center; margin: 20px 0;">
            <span style="font-size: 40px; font-weight: bold; letter-spacing: 10px; color: #1a1a1a;">${code}</span>
          </div>
          <p style="color: #999; font-size: 12px;">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    console.log(`[magic-link] Verification email sent to ${email}`);
    return true;
  } catch (err) {
    console.error(`[magic-link] SendGrid error for ${email}:`, err);
    return false;
  }
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 5 * 60 * 1000;
const RATE_LIMIT_MAX_SEND = 5;
const RATE_LIMIT_MAX_VERIFY = 10;

export function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export function registerMagicLinkRoutes(app: Express): void {
  app.post("/api/auth/magic-link/send", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }
      const normalizedEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({ message: "Invalid email address" });
      }
      const ip = req.ip || "unknown";
      if (!checkRateLimit(`send:${normalizedEmail}`, RATE_LIMIT_MAX_SEND) ||
          !checkRateLimit(`send-ip:${ip}`, RATE_LIMIT_MAX_SEND * 2)) {
        return res.status(429).json({ message: "Too many requests. Please try again in a few minutes." });
      }

      const code = generateCode();
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(magicLinks).values({
        email: normalizedEmail,
        code,
        token,
        expiresAt,
      });

      const emailSent = await sendVerificationEmail(normalizedEmail, code);

      const isDev = process.env.NODE_ENV !== "production";
      res.json({
        success: true,
        emailSent,
        message: emailSent
          ? "Check your email for a verification code"
          : "Verification code generated",
        ...(isDev && !emailSent ? { code } : {}),
      });
    } catch (error) {
      console.error("[magic-link] Error sending code:", error);
      res.status(500).json({ message: "Failed to send verification code" });
    }
  });

  app.post("/api/auth/magic-link/verify", async (req: any, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ message: "Email and code are required" });
      }
      const normalizedEmail = email.trim().toLowerCase();
      const ip = req.ip || "unknown";
      if (!checkRateLimit(`verify:${normalizedEmail}`, RATE_LIMIT_MAX_VERIFY) ||
          !checkRateLimit(`verify-ip:${ip}`, RATE_LIMIT_MAX_VERIFY * 2)) {
        return res.status(429).json({ message: "Too many attempts. Please try again in a few minutes." });
      }

      const [link] = await db
        .select()
        .from(magicLinks)
        .where(
          and(
            eq(magicLinks.email, normalizedEmail),
            eq(magicLinks.code, String(code)),
            isNull(magicLinks.usedAt),
            gt(magicLinks.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (!link) {
        return res.status(400).json({ message: "Invalid or expired code" });
      }

      await db
        .update(magicLinks)
        .set({ usedAt: new Date() })
        .where(eq(magicLinks.id, link.id));

      const user = await authStorage.upsertUserByEmail(normalizedEmail);

      const sessionUser = { magicLink: true, userId: user.id, email: user.email };
      req.login(sessionUser, (err: any) => {
        if (err) {
          console.error("[magic-link] Login error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.json({
          success: true,
          user: { ...toPublicUser(user), isAdmin: user.email === "justin@twinseamsports.com" },
        });
      });
    } catch (error) {
      console.error("[magic-link] Error verifying code:", error);
      res.status(500).json({ message: "Failed to verify code" });
    }
  });

  // ---- Optional password login (works alongside passwordless magic links) ----
  app.post("/api/auth/password/login", async (req: any, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const normalizedEmail = String(email).trim().toLowerCase();
      const ip = req.ip || "unknown";
      if (!checkRateLimit(`pw-login:${normalizedEmail}`, RATE_LIMIT_MAX_VERIFY) ||
          !checkRateLimit(`pw-login-ip:${ip}`, RATE_LIMIT_MAX_VERIFY * 2)) {
        return res.status(429).json({ message: "Too many attempts. Please try again in a few minutes." });
      }
      const user = await authStorage.verifyPassword(normalizedEmail, String(password));
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const sessionUser = { magicLink: true, userId: user.id, email: user.email };
      req.login(sessionUser, (err: any) => {
        if (err) {
          console.error("[password-auth] Login error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.json({
          success: true,
          user: { ...toPublicUser(user), isAdmin: user.email === "justin@twinseamsports.com" },
        });
      });
    } catch (error) {
      console.error("[password-auth] Error logging in:", error);
      res.status(500).json({ message: "Failed to sign in" });
    }
  });

  // Whether the signed-in user has a password set (drives the Preferences UI).
  app.get("/api/auth/password/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.magicLink ? req.user.userId : req.user?.claims?.sub;
      const user = userId ? await authStorage.getUser(userId) : undefined;
      res.json({ hasPassword: Boolean(user?.passwordHash) });
    } catch (error) {
      console.error("[password-auth] Error fetching status:", error);
      res.status(500).json({ message: "Failed to fetch status" });
    }
  });

  // Set or change the signed-in user's password.
  app.post("/api/auth/password/set", isAuthenticated, async (req: any, res) => {
    try {
      const { password } = req.body;
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const userId = req.user?.magicLink ? req.user.userId : req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      await authStorage.setPassword(userId, password);
      res.json({ success: true });
    } catch (error) {
      console.error("[password-auth] Error setting password:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });
}
