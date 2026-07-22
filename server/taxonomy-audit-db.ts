import { gt, sql } from "drizzle-orm";
import {
  deals,
  equipmentSubFilters,
  equipmentTypes,
  sources,
  sports,
} from "../shared/schema";
import { db } from "./db";
import { buildTaxonomyAuditReport, type AuditDealRow, type TaxonomyAuditReport } from "./taxonomy-audit";

const PAGE_SIZE = 2_000;

/**
 * Takes one repeatable, read-only snapshot and audits every deal. PostgreSQL
 * itself rejects writes even if a future code change accidentally adds one.
 */
export async function runDatabaseWideReadOnlyTaxonomyAudit(): Promise<TaxonomyAuditReport> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"));

    const [sportRows, equipmentRows, subFilterRows, sourceRows] = await Promise.all([
      tx.select({ id: sports.id, name: sports.name, userCreated: sports.userCreated }).from(sports),
      tx.select({
        id: equipmentTypes.id,
        name: equipmentTypes.name,
        sportId: equipmentTypes.sportId,
        userCreated: equipmentTypes.userCreated,
      }).from(equipmentTypes),
      tx.select({
        id: equipmentSubFilters.id,
        name: equipmentSubFilters.name,
        equipmentTypeId: equipmentSubFilters.equipmentTypeId,
      }).from(equipmentSubFilters),
      tx.select({ id: sources.id, name: sources.name, category: sources.category }).from(sources),
    ]);

    const dealRows: AuditDealRow[] = [];
    let cursor = "";
    while (true) {
      const page = await tx
        .select({
          id: deals.id,
          sourceId: deals.sourceId,
          title: deals.title,
          brand: deals.brand,
          sportId: deals.sportId,
          equipmentTypeId: deals.equipmentTypeId,
          subFilterId: deals.subFilterId,
          subFilterIds: sql<string[]>`COALESCE((
            SELECT array_agg(dsf.sub_filter_id ORDER BY dsf.sub_filter_id)
            FROM deal_sub_filters dsf WHERE dsf.deal_id = ${deals.id}
          ), ARRAY[]::text[])`,
          dropWeight: deals.dropWeight,
          sizeNumber: deals.sizeNumber,
          classificationSource: deals.classificationSource,
          classificationConfidence: deals.classificationConfidence,
          raw: deals.raw,
        })
        .from(deals)
        .where(gt(deals.id, cursor))
        .orderBy(deals.id)
        .limit(PAGE_SIZE);
      dealRows.push(...page as AuditDealRow[]);
      if (page.length < PAGE_SIZE) break;
      cursor = page[page.length - 1].id;
    }

    return buildTaxonomyAuditReport({
      sports: sportRows,
      equipmentTypes: equipmentRows,
      subFilters: subFilterRows,
      sources: sourceRows,
      deals: dealRows,
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
