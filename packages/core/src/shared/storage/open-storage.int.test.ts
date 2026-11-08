import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { pathToFileURL } from "node:url";

import { sql } from "drizzle-orm";
import { describe, expect, it, onTestFinished } from "vitest";

import { openStorage } from "./index.ts";
import type { SliceMigrations, Storage } from "./index.ts";

const fixtures = path.join(import.meta.dirname, "test-fixtures");
const notesV1: SliceMigrations = { schema: "notes", folder: path.join(fixtures, "notes-v1") };
const notesV2: SliceMigrations = { schema: "notes", folder: path.join(fixtures, "notes-v2") };
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

// Opens the storage in another Node process, which holds it until the test kills the process.
const holderScript = `
const { openStorage } = await import(${JSON.stringify(pathToFileURL(path.join(import.meta.dirname, "index.ts")).href)});
const { systemClock, systemTimer } = await import(${JSON.stringify(pathToFileURL(path.join(import.meta.dirname, "../time/index.ts")).href)});
await openStorage({ dataDirectory: process.argv[1], clock: systemClock, timer: systemTimer, migrations: [] });
console.log("ready");
setInterval(() => {}, 60_000);
`;

async function holdInAnotherProcess(dataDirectory: string) {
  const holder = spawn(
    process.execPath,
    ["--input-type=module", "-e", holderScript, dataDirectory],
    {
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
  const exited = once(holder, "exit");
  onTestFinished(async () => {
    if (holder.exitCode === null && holder.signalCode === null) {
      holder.kill("SIGKILL");
      await exited;
    }
  });
  const firstOutput: unknown[] = await once(holder.stdout, "data");
  expect(String(firstOutput[0])).toBe("ready\n");
  return {
    pid: holder.pid,
    /** Ends the process without any cleanup, as a crash or power loss would. */
    crash: async () => {
      holder.kill("SIGKILL");
      await exited;
    },
  };
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

  it("keeps the data after a restart and applies the migrations added since", async () => {
    const dataDirectory = await temporaryDirectory();
    const first = await open(dataDirectory, [notesV1]);
    await first.database.execute(sql`INSERT INTO notes.notes (text) VALUES ('goroutines')`);
    await first.close();

    const second = await open(dataDirectory, [notesV2]);

    const { rows } = await second.database.execute(sql`SELECT text, author FROM notes.notes`);
    expect(rows).toStrictEqual([{ text: "goroutines", author: "candidate" }]);
  });

  it("refuses a second start on the same data directory and keeps the first one working", async () => {
    const dataDirectory = await temporaryDirectory();
    const first = await open(dataDirectory);

    await expect(open(dataDirectory)).rejects.toThrow(
      `Каталог данных ${dataDirectory} уже занят другим запуском Interview Sensei (PID ${process.pid}). ` +
        "Остановите его или задайте другой каталог в переменной INTERVIEW_SENSEI_DATA_DIR.",
    );
    const { rows } = await first.database.execute(
      sql`SELECT count(*)::int AS count FROM notes.notes`,
    );
    expect(rows).toStrictEqual([{ count: 0 }]);
  });

  it("refuses to start while another process holds the data directory", async () => {
    const dataDirectory = await temporaryDirectory();
    const holder = await holdInAnotherProcess(dataDirectory);

    await expect(open(dataDirectory)).rejects.toThrow(`(PID ${holder.pid})`);
  });

  it("starts after the process that held the data directory crashed", async () => {
    const dataDirectory = await temporaryDirectory();
    const holder = await holdInAnotherProcess(dataDirectory);
    await holder.crash();

    const storage = await open(dataDirectory);

    const { rows } = await storage.database.execute(
      sql`SELECT count(*)::int AS count FROM notes.notes`,
    );
    expect(rows).toStrictEqual([{ count: 0 }]);
  });
});
