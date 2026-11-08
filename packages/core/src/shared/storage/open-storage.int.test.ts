import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { describe, expect, it, onTestFinished } from "vitest";

import { openStorage } from "./index.ts";
import type { SliceMigrations, Storage } from "./index.ts";

const fixtures = path.join(import.meta.dirname, "test-fixtures");
const notesV1: SliceMigrations = { schema: "notes", folder: path.join(fixtures, "notes-v1") };
const tags: SliceMigrations = { schema: "tags", folder: path.join(fixtures, "tags-v1") };

const startTime = Date.parse("2026-01-02T03:04:05.000Z");

/** A clock that stands still until the test moves it. */
function manualClock() {
  let current = startTime;
  return {
    now: () => new Date(current),
    advance: (milliseconds: number) => {
      current += milliseconds;
    },
  };
}

/** A timer that ticks only when the test asks, so tests never sleep. */
function manualTimer() {
  const ticks: (() => Promise<void>)[] = [];
  return {
    every: (_intervalMs: number, tick: () => Promise<void>) => {
      ticks.push(tick);
      return () => {
        ticks.splice(ticks.indexOf(tick), 1);
      };
    },
    tick: async () => {
      await Promise.all(ticks.map(async (tick) => tick()));
    },
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-storage-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function open(
  dataDirectory: string,
  migrations: readonly SliceMigrations[] = [notesV1],
): Promise<Storage> {
  const storage = await openStorage({
    dataDirectory,
    clock: manualClock(),
    timer: manualTimer(),
    migrations,
  });
  onTestFinished(async () => {
    await storage.close();
  });
  return storage;
}

describe(openStorage, () => {
  it("creates the data directory on the first start", async () => {
    const parent = await temporaryDirectory();
    const dataDirectory = path.join(parent, "nested", "data");

    await open(dataDirectory);

    await expect(readdir(dataDirectory)).resolves.toContain("database");
  });

  it("applies the migrations of each slice in its own schema", async () => {
    const storage = await open(await temporaryDirectory(), [notesV1, tags]);

    const { rows } = await storage.database.execute<{ schema: string; table: string }>(
      sql`SELECT table_schema AS schema, table_name AS table FROM information_schema.tables
          WHERE table_schema IN ('notes', 'tags') ORDER BY 1, 2`,
    );

    expect(rows).toStrictEqual([
      { schema: "notes", table: "__drizzle_migrations" },
      { schema: "notes", table: "notes" },
      { schema: "tags", table: "__drizzle_migrations" },
      { schema: "tags", table: "tags" },
    ]);
  });
});
