export const PHASE0_MAINTENANCE_RULE_VERSION = "phase0-2026-07-21";

export const PHASE0_MAINTENANCE_COMMANDS = [
  "legacy-taxonomy-reclassification",
  "baseball-taxonomy-corrections",
  "source-corrections",
  "cj-url-rewrite",
  "ai-classification-deduplication",
  "deal-sub-filter-backfill",
  "deal-derived-field-backfill",
  "search-vector-backfill",
  "stale-deal-cleanup",
  "ebay-seller-seed",
  "discount-recalculation",
] as const;

export type Phase0MaintenanceCommand = (typeof PHASE0_MAINTENANCE_COMMANDS)[number];

export interface MaintenanceInvocation {
  command: Phase0MaintenanceCommand;
  dryRun: boolean;
  requestedBy: string;
  ruleVersion: string;
}

export function parseMaintenanceInvocation(args: readonly string[]): MaintenanceInvocation {
  const valueAfter = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const command = valueAfter("--command") as Phase0MaintenanceCommand | undefined;
  if (!command || !PHASE0_MAINTENANCE_COMMANDS.includes(command)) {
    throw new Error(`--command must be one of: ${PHASE0_MAINTENANCE_COMMANDS.join(", ")}`);
  }

  const execute = args.includes("--execute");
  const confirmation = valueAfter("--confirm");
  if (execute && confirmation !== command) {
    throw new Error(`Execution requires --confirm ${command}`);
  }

  const requestedBy = valueAfter("--requested-by")?.trim();
  if (execute && !requestedBy) {
    throw new Error("Execution requires --requested-by <admin identity>");
  }

  return {
    command,
    dryRun: !execute,
    requestedBy: requestedBy || "dry-run",
    ruleVersion: PHASE0_MAINTENANCE_RULE_VERSION,
  };
}
