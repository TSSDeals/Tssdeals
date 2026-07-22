export type TaxonomyAuditFormat = "json" | "csv" | "markdown" | "bundle";

export interface TaxonomyAuditInvocation {
  format: TaxonomyAuditFormat;
  outputDir: string | null;
}
const FORBIDDEN_MUTATION_FLAGS = new Set([
  "--apply", "--execute", "--write-db", "--update", "--delete", "--merge", "--recategorize",
]);

export function parseTaxonomyAuditInvocation(args: string[]): TaxonomyAuditInvocation {
  let format: TaxonomyAuditFormat = "json";
  let outputDir: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (FORBIDDEN_MUTATION_FLAGS.has(arg)) {
      throw new Error(`${arg} is not supported: the Phase 1 taxonomy audit is read-only and has no apply mode`);
    }
    if (arg === "--format") {
      const value = args[++index] as TaxonomyAuditFormat | undefined;
      if (!value || !["json", "csv", "markdown", "bundle"].includes(value)) {
        throw new Error("--format must be json, csv, markdown, or bundle");
      }
      format = value;
      continue;
    }
    if (arg === "--output-dir") {
      outputDir = args[++index] ?? null;
      if (!outputDir) throw new Error("--output-dir requires a path");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (format === "bundle" && !outputDir) {
    throw new Error("--format bundle requires --output-dir so JSON, CSV, and Markdown have explicit destinations");
  }
  return { format, outputDir };
}
