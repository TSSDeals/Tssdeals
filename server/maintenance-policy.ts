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

/**
 * Phase 0 may report these operations, but cannot execute them.  Moving a
 * command out of this list requires its own reviewed change with an approved
 * ruleset, per-record logging, a verified backup reference, and rollback.
 */
export const PHASE0_PREVIEW_ONLY_COMMANDS = new Set<Phase0MaintenanceCommand>([
  "legacy-taxonomy-reclassification",
  "baseball-taxonomy-corrections",
  "source-corrections",
  "cj-url-rewrite",
  "ai-classification-deduplication",
  "deal-sub-filter-backfill",
  "stale-deal-cleanup",
  "ebay-seller-seed",
]);

export function isPhase0PreviewOnly(command: Phase0MaintenanceCommand): boolean {
  return PHASE0_PREVIEW_ONLY_COMMANDS.has(command);
}

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
  if (execute && isPhase0PreviewOnly(command)) {
    throw new Error(
      `${command} is preview-only in Phase 0; execution requires a separately reviewed, rollback-capable maintenance change`,
    );
  }
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
