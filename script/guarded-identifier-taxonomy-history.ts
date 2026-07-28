import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../server/db";
import {
  approvedIdentifierTaxonomyChanges,
  type IdentifierTaxonomyReview,
} from "../server/identifier-taxonomy-history";

function valueAfter(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const packetPath = valueAfter("--packet");
const outputPath = resolve(valueAfter("--output") ?? "./identifier-taxonomy-history-preview.json");
const apply = process.argv.includes("--apply");
if (!packetPath) throw new Error("Provide --packet <taxonomy-audit.json>");

const audit = JSON.parse(await readFile(resolve(packetPath), "utf8")) as {
  reviewPacket: { likelySameProductConflicts: IdentifierTaxonomyReview[] };
};
const approved = approvedIdentifierTaxonomyChanges(
  audit.reviewPacket.likelySameProductConflicts,
);

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  const ids = approved.map((change) => change.dealId);
  const live = ids.length
    ? await client.query<{
        id: string;
        title: string;
        sport_id: string | null;
        equipment_type_id: string | null;
      }>(
        `SELECT id, title, sport_id, equipment_type_id
           FROM deals
          WHERE id = ANY($1::varchar[])`,
        [ids],
      )
    : { rows: [] };
  const liveById = new Map(live.rows.map((row) => [row.id, row]));
  const changes = approved.filter((change) => {
    const row = liveById.get(change.dealId);
    return !!row
      && row.title === change.title
      && row.sport_id === change.before.sportId
      && row.equipment_type_id === change.before.equipmentTypeId;
  });
  const log = {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "preview",
    approvedByRules: approved.length,
    changes,
  };
  await writeFile(outputPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");

  if (apply) {
    for (const change of changes) {
      const result = await client.query(
        `UPDATE deals
            SET sport_id = $5, equipment_type_id = $6
          WHERE id = $1
            AND title = $2
            AND sport_id IS NOT DISTINCT FROM $3
            AND equipment_type_id IS NOT DISTINCT FROM $4`,
        [
          change.dealId,
          change.title,
          change.before.sportId,
          change.before.equipmentTypeId,
          change.after.sportId,
          change.after.equipmentTypeId,
        ],
      );
      if (result.rowCount !== 1) {
        throw new Error(`Live guard failed for ${change.dealId}; transaction cancelled`);
      }
    }
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
  console.log(JSON.stringify({
    mode: apply ? "applied" : "preview",
    outputPath,
    approvedByRules: approved.length,
    changed: changes.length,
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
