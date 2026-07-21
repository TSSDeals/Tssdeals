/**
 * Database-wide Phase 1 taxonomy audit. This command has no mutation mode.
 *
 * JSON to stdout:
 *   npm run audit:taxonomy
 *
 * JSON + CSV + Markdown files:
 *   npm run audit:taxonomy -- --format bundle --output-dir ./taxonomy-audit-output
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../server/db";
import { parseTaxonomyAuditInvocation } from "../server/taxonomy-audit-cli";
import { runDatabaseWideReadOnlyTaxonomyAudit } from "../server/taxonomy-audit-db";
import { taxonomyAuditCorrectionsCsv, taxonomyAuditMarkdown } from "../server/taxonomy-audit";

const invocation = parseTaxonomyAuditInvocation(process.argv.slice(2));

try {
  const report = await runDatabaseWideReadOnlyTaxonomyAudit();
  const outputs = {
    json: `${JSON.stringify(report, null, 2)}\n`,
    csv: taxonomyAuditCorrectionsCsv(report),
    markdown: taxonomyAuditMarkdown(report),
  };

  if (invocation.outputDir) {
    const directory = resolve(invocation.outputDir);
    await mkdir(directory, { recursive: true });
    const formats: Array<"json" | "csv" | "markdown"> = invocation.format === "bundle"
      ? ["json", "csv", "markdown"]
      : [invocation.format];
    const filenames = {
      json: "taxonomy-audit.json",
      csv: "taxonomy-corrections.csv",
      markdown: "taxonomy-audit-summary.md",
    } as const;
    for (const format of formats) {
      await writeFile(resolve(directory, filenames[format]), outputs[format], "utf8");
    }
    console.log(JSON.stringify({
      mode: "read-only",
      outputDirectory: directory,
      formats,
      summary: report.summary,
    }, null, 2));
  } else {
    process.stdout.write(outputs[invocation.format]);
  }
} finally {
  await pool.end();
}
