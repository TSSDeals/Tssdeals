import cron from "node-cron";
import { log } from "./index";
import type { IStorage } from "./storage";
import {
  getValidEbayUserToken,
  fetchEbaySalesOrders,
  salesOrdersToCsv,
  fetchEbayPurchases,
  purchasesToCsv,
} from "./ebay-reports";

function getYesterdayET(): string {
  const now = new Date();
  const etString = now.toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const etDate = new Date(etString);
  etDate.setDate(etDate.getDate() - 1);
  return etDate.toISOString().split("T")[0];
}

async function generateReportsForUser(userId: string, storage: IStorage) {
  const reportDate = getYesterdayET();
  log(`Generating daily eBay reports for user ${userId}, date ${reportDate}`, "scheduler");

  try {
    const accessToken = await getValidEbayUserToken(userId, storage);

    const salesOrders = await fetchEbaySalesOrders(accessToken, reportDate, reportDate);
    const salesCsv = salesOrdersToCsv(salesOrders);
    await storage.saveScheduledReport(userId, "sales", reportDate, salesCsv, salesOrders.length);
    log(`Sales report saved: ${salesOrders.length} orders for ${reportDate}`, "scheduler");
  } catch (err: any) {
    log(`Sales report error for user ${userId}: ${err.message}`, "scheduler");
    await storage.saveScheduledReport(userId, "sales", reportDate, "", 0, err.message);
  }

  try {
    const accessToken = await getValidEbayUserToken(userId, storage);

    const purchases = await fetchEbayPurchases(accessToken, reportDate, reportDate);
    const purchasesCsv = purchasesToCsv(purchases);
    await storage.saveScheduledReport(userId, "purchases", reportDate, purchasesCsv, purchases.length);
    log(`Purchases report saved: ${purchases.length} orders for ${reportDate}`, "scheduler");
  } catch (err: any) {
    log(`Purchases report error for user ${userId}: ${err.message}`, "scheduler");
    await storage.saveScheduledReport(userId, "purchases", reportDate, "", 0, err.message);
  }
}

export function startReportScheduler(storage: IStorage) {
  cron.schedule(
    "0 7 * * *",
    async () => {
      log("Starting daily eBay report generation (7am ET)", "scheduler");
      try {
        const tokens = await storage.listAllEbayOauthTokens();
        if (tokens.length === 0) {
          log("No connected eBay accounts, skipping report generation", "scheduler");
          return;
        }

        for (const token of tokens) {
          await generateReportsForUser(token.userId, storage);
        }

        log(`Daily report generation complete for ${tokens.length} user(s)`, "scheduler");
      } catch (err: any) {
        log(`Report scheduler error: ${err.message}`, "scheduler");
      }
    },
    {
      timezone: "America/New_York",
    }
  );

  log("Report scheduler started: daily at 7:00 AM ET", "scheduler");
}
