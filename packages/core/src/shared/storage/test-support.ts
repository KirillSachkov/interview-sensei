// Helpers of the storage integration tests: fixture slices, manual time and a temporary data
// directory that the test removes when it finishes.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, onTestFinished } from "vitest";

import type { Clock, Timer } from "../time/index.ts";
import { openStorage } from "./index.ts";
import type { SliceMigrations, Storage } from "./index.ts";

const fixtures = path.join(import.meta.dirname, "test-fixtures");

/** A slice that owns the table `notes.notes (id, text)`. */
export const notesV1: SliceMigrations = {
  schema: "notes",
  folder: path.join(fixtures, "notes-v1"),
};

/** The notes slice after an update that adds the column `author` with the default 'candidate'. */
export const notesV2: SliceMigrations = {
  schema: "notes",
  folder: path.join(fixtures, "notes-v2"),
};

/** A second slice that owns the table `tags.tags (name)`. */
export const tags: SliceMigrations = { schema: "tags", folder: path.join(fixtures, "tags-v1") };

/** A clock that stands still and a timer that ticks only when the test passes time. */
export function manualTime() {
  let current = Date.parse("2026-01-02T03:04:05.000Z");
  const ticks: (() => Promise<void>)[] = [];
  const clock: Clock = { now: () => new Date(current) };
  const timer: Timer = {
    repeat: (_intervalMs, tick) => {
      ticks.push(tick);
      return () => {
        ticks.splice(ticks.indexOf(tick), 1);
      };
    },
  };
  return {
    clock,
    timer,
    /** Moves the clock forward and runs the timer's ticks to the end. */
    pass: async (milliseconds: number) => {
      current += milliseconds;
      await Promise.all(ticks.map(async (tick) => tick()));
    },
  };
}

export async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-storage-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** Opens the storage with the notes slice by default and closes it when the test finishes. */
export async function openForTest(
  dataDirectory: string,
  {
    migrations = [notesV1],
    time = manualTime(),
  }: Readonly<{
    migrations?: readonly SliceMigrations[];
    time?: ReturnType<typeof manualTime>;
  }> = {},
): Promise<Storage> {
  const storage = await openStorage({
    dataDirectory,
    clock: time.clock,
    timer: time.timer,
    migrations,
    onDumpFailed: (error) => {
      expect.fail(`The dump failed: ${String(error)}`);
    },
  });
  onTestFinished(async () => {
    await storage.close();
  });
  return storage;
}
