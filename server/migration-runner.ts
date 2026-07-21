export interface VersionedMigration<Context> {
  /** Immutable, ordered identifier. Never reuse an identifier for new code. */
  id: string;
  /** Source-controlled checksum; changing an applied migration is forbidden. */
  checksum: string;
  kind: "structural" | "approved-seed";
  description: string;
  up(context: Context): Promise<void>;
}

export interface MigrationLedger<Context> {
  ensure(): Promise<void>;
  has(id: string): Promise<boolean>;
  applyOnce(migration: VersionedMigration<Context>, context: Context): Promise<boolean>;
}

export interface MigrationRunResult {
  applied: string[];
  skipped: string[];
}

export class MigrationExecutionError extends Error {
  readonly migrationId: string;

  constructor(migrationId: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Migration ${migrationId} failed: ${detail}`, { cause });
    this.name = "MigrationExecutionError";
    this.migrationId = migrationId;
  }
}

export async function runVersionedMigrations<Context>(
  ledger: MigrationLedger<Context>,
  migrations: readonly VersionedMigration<Context>[],
  context: Context,
): Promise<MigrationRunResult> {
  await ledger.ensure();
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    try {
      if (await ledger.has(migration.id)) {
        skipped.push(migration.id);
        continue;
      }

      if (await ledger.applyOnce(migration, context)) applied.push(migration.id);
      else skipped.push(migration.id);
    } catch (error) {
      if (error instanceof MigrationExecutionError) throw error;
      throw new MigrationExecutionError(migration.id, error);
    }
  }

  return { applied, skipped };
}
