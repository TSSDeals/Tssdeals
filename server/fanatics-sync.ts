import {
  listImpactCatalogs,
  getImpactCatalogItems,
  impactItemToDeal,
  isUsdImpactCatalog,
  isUsdImpactItem,
} from "./impact-api";
import { log } from "./index";
import type { IStorage } from "./storage";
import { classifyFanaticsItem } from "./fanatics-classification";

const FANATICS_SOURCE_ID = "fanatics";
const FANATICS_SOURCE_NAME = "Fanatics";

export async function syncFanaticsDeals(
  storage: IStorage,
): Promise<{ created: number; updated: number; errors: number }> {
  const accountSid = process.env.FANATICS_IMPACT_ACCOUNT_SID;
  const authToken = process.env.FANATICS_IMPACT_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    log("Fanatics sync skipped: credentials not configured", "deal-sync");
    return { created: 0, updated: 0, errors: 0 };
  }

  await storage.ensureSource(FANATICS_SOURCE_ID, FANATICS_SOURCE_NAME, "https://www.fanatics.com");

  const allEquipmentTypes = await storage.listEquipmentTypes();
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  try {
    const allCatalogs = await listImpactCatalogs(accountSid, authToken);
    const catalogs = allCatalogs.filter(isUsdImpactCatalog);
    log(
      `Fanatics: found ${allCatalogs.length} catalogs; syncing ${catalogs.length} USD catalogs`,
      "deal-sync",
    );

    for (const catalog of catalogs) {
      try {
        let page = 1;
        const maxPages = 50;

        while (page <= maxPages) {
          const { items, totalPages } = await getImpactCatalogItems(accountSid, authToken, catalog.Id, page);

          if (items.length === 0) break;

          const dealsToInsert = items
            .filter(isUsdImpactItem)
            .map((item) => {
              const { sportId, equipmentTypeId } = classifyFanaticsItem(item, allEquipmentTypes);

              const deal = impactItemToDeal(item, sportId, equipmentTypeId);
              if (deal) {
                deal.sourceId = FANATICS_SOURCE_ID;
              }
              return deal;
            })
            .filter((d): d is NonNullable<typeof d> => d !== null);

          if (dealsToInsert.length > 0) {
            const result = await storage.bulkUpsertDeals(dealsToInsert);
            totalCreated += result.created;
            totalUpdated += result.updated;
          }

          log(`Fanatics catalog "${catalog.Name}" page ${page}/${totalPages}: ${items.length} items`, "deal-sync");

          if (page >= totalPages) break;
          page++;
        }
      } catch (err: any) {
        log(`Fanatics sync error for catalog "${catalog.Name}": ${err.message}`, "deal-sync");
        totalErrors++;
      }
    }
  } catch (err: any) {
    log(`Fanatics sync error listing catalogs: ${err.message}`, "deal-sync");
    totalErrors++;
  }

  log(`Fanatics sync complete: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`, "deal-sync");
  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}
