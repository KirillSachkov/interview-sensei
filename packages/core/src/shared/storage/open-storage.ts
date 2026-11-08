import { mkdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Clock, Timer } from "../time/index.ts";

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
}

/** The open data directory. Only this process uses it until `close` resolves. */
export interface Storage {
  readonly database: Database;
  readonly close: () => Promise<void>;
}

export async function openStorage(options: StorageOptions): Promise<Storage> {
  await mkdir(options.dataDirectory, { recursive: true, mode: 0o700 });
  const client = await PGlite.create(path.join(options.dataDirectory, "database"));
  const database = drizzle({ client });
  // Slices migrate one at a time, in the order given, so a failure names the slice and stops the start.
  /* oxlint-disable eslint/no-await-in-loop -- sequential by design, see above */
  for (const slice of options.migrations) {
    await migrate(database, {
      migrationsFolder: slice.folder,
      migrationsSchema: slice.schema,
      migrationsTable: "__drizzle_migrations",
    });
  }
  /* oxlint-enable eslint/no-await-in-loop */
  return {
    database,
    close: async () => {
      await client.close();
    },
  };
}
