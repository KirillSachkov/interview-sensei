import type { Database } from "../../shared/storage/index.ts";
import type { Clock } from "../../shared/time/index.ts";
import { createSources } from "./application/sources.ts";
import type { SourceTargets } from "./domain/ports.ts";
import { drizzleSourceRepository } from "./infrastructure/drizzle-source-repository.ts";
import { sourceFileStore } from "./infrastructure/file-store.ts";

/**
 * The Sources of each Target: rows on the server's database and files under `targets/` in the
 * data directory. A Source belongs to a Target that `targets` knows.
 */
export function sourcesModule({
  database,
  dataDirectory,
  clock,
  targets,
}: {
  database: Database;
  /** The data directory this server owns. */
  dataDirectory: string;
  clock: Clock;
  /** The targets slice. */
  targets: SourceTargets;
}) {
  return createSources({
    repository: drizzleSourceRepository(database),
    files: sourceFileStore(dataDirectory),
    targets,
    clock,
  });
}
