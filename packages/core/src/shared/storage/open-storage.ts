import { mkdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Clock, Timer } from "../time/index.ts";
import { lockDataDirectory } from "./data-directory-lock.ts";
import { scheduleDumps } from "./database-dumps.ts";

/** The application database. Each slice queries only the tables of its own Postgres schema. */
export type Database = PgliteDatabase;

/**
 * The migrations of one slice: drizzle-kit output in `folder`, applied in the Postgres `schema`
 * that the slice owns. The history table `__drizzle_migrations` lives in the same schema.
 */
export interface SliceMigrations {
  readonly schema: string;
  readonly folder: string;
}

export interface StorageOptions {
  readonly dataDirectory: string;
  readonly clock: Clock;
  readonly timer: Timer;
  readonly migrations: readonly SliceMigrations[];
  /** Receives the error of a periodic dump; the storage keeps working and tries again later. */
  readonly onDumpFailed: (error: unknown) => void;
}

/**
 * The open data directory. Only this process uses it until `close` resolves. `close` writes the
 * final dump, closes the database and releases the lock; a second call waits for the first.
 */
export interface Storage {
  readonly database: Database;
  readonly close: () => Promise<void>;
}

async function migrateSlices(database: Database, migrations: readonly SliceMigrations[]) {
  // Slices migrate one at a time, in the order given, so a failure names the slice and stops the start.
  /* oxlint-disable eslint/no-await-in-loop -- sequential by design, see above */
  for (const slice of migrations) {
    await migrate(database, {
      migrationsFolder: slice.folder,
      migrationsSchema: slice.schema,
      migrationsTable: "__drizzle_migrations",
    });
  }
  /* oxlint-enable eslint/no-await-in-loop */
}

/** Opens and migrates the database; on a failure, closes it and releases the lock. */
async function openMigratedClient(
  options: StorageOptions,
  unlock: () => Promise<void>,
): Promise<PGlite> {
  try {
    const client = await PGlite.create(path.join(options.dataDirectory, "database"));
    try {
      await migrateSlices(drizzle({ client }), options.migrations);
      return client;
    } catch (error) {
      await client.close();
      throw error;
    }
  } catch (error) {
    await unlock();
    throw error;
  }
}

/**
 * Opens the data directory for this process: creates it on the first start, takes its lock,
 * opens PGlite, applies the migrations of every slice and schedules dumps. Rejects with DataDirectoryInUseError
 * when another running process holds the directory.
 */
export async function openStorage(options: StorageOptions): Promise<Storage> {
  await mkdir(options.dataDirectory, { recursive: true, mode: 0o700 });
  const unlock = await lockDataDirectory(options.dataDirectory, options.clock);
  const client = await openMigratedClient(options, unlock);
  const stopDumps = scheduleDumps({ ...options, client });
  const shutDown = async () => {
    try {
      await stopDumps();
    } finally {
      await client.close();
      await unlock();
    }
  };
  let closing: Promise<void> | undefined = undefined;
  return {
    database: drizzle({ client }),
    // Both the server's shutdown and its entry point may close the storage; it closes once.
    close: async () => {
      closing ??= shutDown();
      await closing;
    },
  };
}
