/** Read-only production compatibility preflight. Performs no DDL or DML. */
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { runStartupPreflight } from "../server/startup-preflight";

const report = await db.transaction(async (tx) => {
  await tx.execute(sql.raw("SET TRANSACTION READ ONLY"));
  return runStartupPreflight(tx);
});

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
