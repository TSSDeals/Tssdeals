import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../server/db";
import {
  planGuardedTaxonomyBackfill,
  type BackfillChange,
  type BackfillProposal,
  type BackfillSnapshot,
} from "../server/taxonomy-backfill";

function valueAfter(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const packetPath = valueAfter("--packet");
const rollbackPath = valueAfter("--rollback");
const outputPath = resolve(valueAfter("--output") ?? "./taxonomy-backfill-preview.json");
const apply = process.argv.includes("--apply");

if (!!packetPath === !!rollbackPath) {
  throw new Error("Provide exactly one of --packet <audit-json> or --rollback <backfill-log>");
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

  if (rollbackPath) {
    const log = JSON.parse(await readFile(resolve(rollbackPath), "utf8")) as {
      changes: BackfillChange[];
    };
    if (!apply) {
      console.log(JSON.stringify({ mode: "rollback-preview", changes: log.changes }, null, 2));
      await client.query("ROLLBACK");
    } else {
      for (const change of log.changes) {
        const result = await client.query(
          `UPDATE deals
             SET sport_id = $1, equipment_type_id = $2
           WHERE id = $3
             AND sport_id IS NOT DISTINCT FROM $4
             AND equipment_type_id IS NOT DISTINCT FROM $5`,
          [
            change.before.sportId,
            change.before.equipmentTypeId,
            change.id,
            change.after.sportId,
            change.after.equipmentTypeId,
          ],
        );
        if (result.rowCount !== 1) {
          throw new Error(`Rollback guard failed for ${change.id}; transaction cancelled`);
        }
      }
      await client.query("COMMIT");
      console.log(JSON.stringify({ mode: "rollback-applied", restored: log.changes.length }, null, 2));
    }
  } else {
    const absolutePacket = resolve(packetPath!);
    const packetBytes = await readFile(absolutePacket);
    const audit = JSON.parse(packetBytes.toString("utf8")) as {
      reviewPacket: { proposedCorrections: BackfillProposal[] };
    };
    const proposals = audit.reviewPacket.proposedCorrections;
    const ids = proposals
      .filter((proposal) => proposal.confidence === "high" && !proposal.humanApprovalRequired)
      .map((proposal) => proposal.dealId);
    const rows = ids.length
      ? await client.query<{
          id: string;
          title: string;
          sport_id: string | null;
          equipment_type_id: string | null;
          sub_filter_id: string | null;
          joined_sub_filter_count: string;
        }>(
          `SELECT d.id, d.title, d.sport_id, d.equipment_type_id, d.sub_filter_id,
                  COUNT(dsf.sub_filter_id)::text AS joined_sub_filter_count
             FROM deals d
             LEFT JOIN deal_sub_filters dsf ON dsf.deal_id = d.id
            WHERE d.id = ANY($1::varchar[])
            GROUP BY d.id, d.title, d.sport_id, d.equipment_type_id, d.sub_filter_id`,
          [ids],
        )
      : { rows: [] };
    const snapshots: BackfillSnapshot[] = rows.rows.map((row) => ({
      id: row.id,
      title: row.title,
      sportId: row.sport_id,
      equipmentTypeId: row.equipment_type_id,
      subFilterId: row.sub_filter_id,
      joinedSubFilterCount: Number(row.joined_sub_filter_count),
    }));
    const plan = planGuardedTaxonomyBackfill(proposals, snapshots);
    const log = {
      version: 1,
      generatedAt: new Date().toISOString(),
      packetPath: absolutePacket,
      packetSha256: createHash("sha256").update(packetBytes).digest("hex"),
      mode: apply ? "apply" : "preview",
      ...plan,
    };
    await writeFile(outputPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(JSON.stringify({
        mode: "preview",
        outputPath,
        eligible: plan.changes.length,
        skipped: plan.skipped.length,
      }, null, 2));
    } else {
      for (const change of plan.changes) {
        const result = await client.query(
          `UPDATE deals
             SET sport_id = $1, equipment_type_id = $2
           WHERE id = $3
             AND sport_id IS NOT DISTINCT FROM $4
             AND equipment_type_id IS NOT DISTINCT FROM $5
             AND sub_filter_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM deal_sub_filters dsf WHERE dsf.deal_id = deals.id
             )`,
          [
            change.after.sportId,
            change.after.equipmentTypeId,
            change.id,
            change.before.sportId,
            change.before.equipmentTypeId,
          ],
        );
        if (result.rowCount !== 1) {
          throw new Error(`Apply guard failed for ${change.id}; transaction cancelled`);
        }
      }
      await client.query("COMMIT");
      console.log(JSON.stringify({
        mode: "applied",
        outputPath,
        changed: plan.changes.length,
        skipped: plan.skipped.length,
      }, null, 2));
    }
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
