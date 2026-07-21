import { MigrationExecutionError } from "./migration-runner";

export type StartupPhase = "starting" | "ready" | "failed";

export interface StartupSnapshot {
  phase: StartupPhase;
  migrationId?: string;
  error?: string;
}

export interface StartupReadiness {
  get(): StartupSnapshot;
  markReady(): void;
  markFailed(error: unknown): StartupSnapshot;
}

export function createStartupReadiness(): StartupReadiness {
  let snapshot: StartupSnapshot = { phase: "starting" };
  return {
    get: () => ({ ...snapshot }),
    markReady: () => { snapshot = { phase: "ready" }; },
    markFailed(error) {
      const migrationId = error instanceof MigrationExecutionError ? error.migrationId : undefined;
      const detail = error instanceof Error ? error.message : String(error);
      snapshot = { phase: "failed", migrationId, error: detail };
      return { ...snapshot };
    },
  };
}

export async function bootstrapApplication(options: {
  readiness: StartupReadiness;
  migrate(): Promise<void>;
  initialize(): Promise<void>;
  logFailure(message: string, error: unknown): void;
  terminate(exitCode: number): Promise<void>;
}): Promise<boolean> {
  try {
    await options.migrate();
    await options.initialize();
    options.readiness.markReady();
    return true;
  } catch (error) {
    const failed = options.readiness.markFailed(error);
    const migration = failed.migrationId ? ` migration=${failed.migrationId}` : "";
    options.logFailure(`[startup] failed${migration}: ${failed.error}`, error);
    await options.terminate(1);
    return false;
  }
}
