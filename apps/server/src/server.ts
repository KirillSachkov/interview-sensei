import { checkHealth } from "@interview-sensei/core/health";
import { openStorage } from "@interview-sensei/core/storage";
import type { SliceMigrations } from "@interview-sensei/core/storage";
import type { Clock, Timer } from "@interview-sensei/core/time";
import { fastify } from "fastify";
import type { FastifyInstance } from "fastify";

/**
 * The migrations of every core slice that stores data, applied at each start in this order. A
 * slice exports its SliceMigrations from its index.ts; add it here.
 */
const sliceMigrations: readonly SliceMigrations[] = [];

export interface ServerDependencies {
  clock: Clock;
  timer: Timer;
  /** The data directory this server owns; see resolveDataDirectory. */
  dataDirectory: string;
  /** Fastify request logging; off in tests. */
  logger?: boolean;
}

/**
 * Opens the data directory and builds the HTTP server without listening, so tests call it in
 * process. Closing the server closes the storage: a final dump, then the lock is released.
 * Rejects with DataDirectoryInUseError when another server holds the data directory.
 */
export async function buildServer({
  clock,
  timer,
  dataDirectory,
  logger = false,
}: ServerDependencies): Promise<FastifyInstance> {
  const server = fastify({ logger });
  const storage = await openStorage({
    dataDirectory,
    clock,
    timer,
    migrations: sliceMigrations,
    onDumpFailed: (error) => {
      server.log.error({ err: error }, "The periodic database dump failed");
    },
  });
  server.addHook("onClose", storage.close);
  server.get("/api/health", () => checkHealth(clock));
  return server;
}
