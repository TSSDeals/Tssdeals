import Twilio from "twilio";
import { log } from "./index";

let twilioClient: Twilio.Twilio | null = null;
let fromNumber: string | null = null;
let messagingServiceSid: string | null = null;
let configured = false;

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const PARALLEL_BATCH_SIZE = 10;

export function configureSms() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const msgSvcSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || (!phoneNumber && !msgSvcSid)) {
    log("SMS notifications not configured: missing Twilio credentials", "sms");
    return;
  }

  try {
    twilioClient = Twilio(accountSid, authToken);
    fromNumber = phoneNumber || null;
    messagingServiceSid = msgSvcSid || null;
    configured = true;
    log(`SMS notifications configured (${messagingServiceSid ? 'Messaging Service' : 'direct number'})`, "sms");
  } catch (err: any) {
    log(`SMS configuration failed: ${err.message}`, "sms");
  }
}

export function isSmsConfigured(): boolean {
  return configured;
}

export interface SmsPayload {
  to: string;
  body: string;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendSms(payload: SmsPayload): Promise<boolean> {
  if (!configured || !twilioClient) {
    log("SMS not configured, skipping send", "sms");
    return false;
  }

  const to = normalizePhone(payload.to);
  const msgParams: any = {
    body: payload.body,
    to,
  };

  if (messagingServiceSid) {
    msgParams.messagingServiceSid = messagingServiceSid;
  } else if (fromNumber) {
    msgParams.from = fromNumber;
  } else {
    log("SMS send failed: no from number or messaging service configured", "sms");
    return false;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await twilioClient.messages.create(msgParams);
      log(`SMS sent to ${to}: SID=${message.sid} (attempt ${attempt})`, "sms");
      return true;
    } catch (err: any) {
      const isRetryable = err.status >= 500 || err.code === 20429 || err.message?.includes("ETIMEDOUT");
      if (attempt < MAX_RETRIES && isRetryable) {
        log(`SMS send attempt ${attempt} failed to ${to}: ${err.message}. Retrying in ${RETRY_DELAY_MS}ms...`, "sms");
        await sleep(RETRY_DELAY_MS * attempt);
      } else {
        log(`SMS send failed to ${to} after ${attempt} attempt(s): ${err.message}`, "sms");
        return false;
      }
    }
  }
  return false;
}

export async function sendSmsBatch(payloads: SmsPayload[]): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < payloads.length; i += PARALLEL_BATCH_SIZE) {
    const batch = payloads.slice(i, i + PARALLEL_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((p) => sendSms(p))
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) sent++;
      else failed++;
    }
  }

  log(`SMS batch complete: ${sent} sent, ${failed} failed out of ${payloads.length}`, "sms");
  return { sent, failed };
}

// Sample #2 — sent on successful opt-in. Marketing opt-ins get the recurring
// deal-alert language; transactional-only opt-ins get non-marketing copy so the
// confirmation matches the consent the user actually gave (Twilio compliance).
const WELCOME_MESSAGE = `TSSDeals Alerts: You are subscribed to recurring promotional deal alerts from TSSDeals. Message frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to cancel.`;
const WELCOME_MESSAGE_TRANSACTIONAL = `TSSDeals Alerts: You are subscribed to price-drop, price-target, and account notifications from TSSDeals. Message frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to cancel.`;

export async function sendWelcomeSms(
  phoneNumber: string,
  opts?: { marketing?: boolean },
): Promise<boolean> {
  // Default to the marketing confirmation to preserve existing caller behavior;
  // only switch to the transactional copy when marketing is explicitly false.
  const body = opts && opts.marketing === false ? WELCOME_MESSAGE_TRANSACTIONAL : WELCOME_MESSAGE;
  return sendSms({ to: phoneNumber, body });
}

// Sample #1 — price drop on a tracked item
export async function sendPriceAlertSms(
  phoneNumber: string,
  dealTitle: string,
  currentPrice: string,
  percentOff: string | null,
  dealUrl: string,
): Promise<boolean> {
  const body = `TSSDeals: Price drop alert for your tracked item: ${dealTitle} now ${currentPrice}. View deal: ${dealUrl} Reply STOP to opt out. Reply HELP for help.`;
  return sendSms({ to: phoneNumber, body });
}

// Sample #5 — price target reached
export async function sendPriceTargetSms(
  phoneNumber: string,
  dealTitle: string,
  dealUrl: string,
): Promise<boolean> {
  const body = `TSSDeals: Your tracked item has hit your target price. View it now: ${dealUrl} Reply STOP to opt out. Reply HELP for help.`;
  return sendSms({ to: phoneNumber, body });
}

// Sample #4 — new deals in a sport category
export async function sendDealNotificationSms(
  phoneNumber: string,
  sportName: string,
  dealsUrl: string,
): Promise<boolean> {
  const body = `TSSDeals: New ${sportName} deals are available in your alerts. Shop now: ${dealsUrl} Reply STOP to opt out. Reply HELP for help.`;
  return sendSms({ to: phoneNumber, body });
}
