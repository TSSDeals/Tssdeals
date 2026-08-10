import crypto from "node:crypto";

const DEFAULT_APPROVED_EMAILS = [
  "justin@twinseamsports.com",
  "jshirk1@gmail.com",
  "tssadmin@twinseamsports.com",
];

export const EMAIL_DEAL_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export function normalizeDealEmail(value: string): string {
  const bracketed = value.match(/<([^<>]+@[^<>]+)>/);
  const candidate = bracketed?.[1] ?? value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  return candidate.trim().toLowerCase();
}

export function approvedDealEmailSenders(envValue = process.env.DEAL_INBOX_EMAIL_SENDERS): Set<string> {
  const configured = envValue?.split(",").map(normalizeDealEmail).filter(Boolean);
  return new Set(configured?.length ? configured : DEFAULT_APPROVED_EMAILS);
}

export function validDealInboxToken(provided: unknown, expected = process.env.DEAL_INBOX_EMAIL_TOKEN): boolean {
  if (typeof provided !== "string" || !expected || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function selectDealEmailImage(files: Express.Multer.File[]): Express.Multer.File | null {
  return files.find((file) => EMAIL_DEAL_IMAGE_TYPES.has(file.mimetype.toLowerCase())) ?? null;
}

export function dealEmailMediaId(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 40);
}

export function stripEmailSignature(value: string): string {
  const signatureStart = /(?:\s*>?\s*)?(?:--\s*>?|best regards,?|kind regards,?|regards,?|sincerely,?|sent from my\b|justin shirk\b)/i;
  return value.split(signatureStart, 1)[0]
    .replace(/(?:\s*>\s*)+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
