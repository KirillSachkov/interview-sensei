import { open, rename } from "node:fs/promises";
import path from "node:path";

import type { PGlite } from "@electric-sql/pglite";

import type { Clock, Timer } from "../time/index.ts";

/** The dump in the data directory: the PGlite data directory as a gzip-compressed tar archive. */
const dumpFileName = "database.dump.tar.gz";

/** PGlite runs without fsync (ADR-0002), so a dump this old at most limits the loss after a crash. */
const dumpPeriodMs = 5 * 60_000;

/** How often the timer asks whether a dump is due; the injected clock decides. */
const checkIntervalMs = 60_000;

/** Writes the directory's entries to the disk, so a crash does not undo a rename in it. */
async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeDump(client: PGlite, dataDirectory: string): Promise<void> {
  const dump = await client.dumpDataDir("gzip");
  const target = path.join(dataDirectory, dumpFileName);
  const partial = `${target}.partial`;
  const file = await open(partial, "w");
  try {
    await file.writeFile(new Uint8Array(await dump.arrayBuffer()));
    // The dump must reach the disk before it replaces the previous one.
    await file.sync();
  } finally {
    await file.close();
  }
  // A rename replaces the previous dump at once, so a crash never leaves half a dump in its place.
  await rename(partial, target);
  await syncDirectory(dataDirectory);
}

export interface DumpSchedule {
  readonly client: PGlite;
  readonly dataDirectory: string;
  readonly clock: Clock;
  readonly timer: Timer;
  readonly onDumpFailed: (error: unknown) => void;
}

/**
 * Dumps the database once the dump period has passed since the start or the last dump. Returns
 * the function that stops the schedule and writes the final dump before the database closes.
 */
export function scheduleDumps(schedule: DumpSchedule): () => Promise<void> {
  const { client, dataDirectory, clock } = schedule;
  let lastDumpAt = clock.now().getTime();
  let running: Promise<void> | undefined = undefined;
  const dump = async () => {
    running = writeDump(client, dataDirectory);
    try {
      await running;
    } finally {
      running = undefined;
    }
  };
  const stopTicks = schedule.timer.repeat(checkIntervalMs, async () => {
    const now = clock.now().getTime();
    if (running !== undefined || now - lastDumpAt < dumpPeriodMs) {
      return;
    }
    lastDumpAt = now;
    try {
      await dump();
    } catch (error) {
      schedule.onDumpFailed(error);
    }
  });
  return async () => {
    stopTicks();
    // The final dump must not overlap a periodic one.
    if (running !== undefined) {
      try {
        await running;
      } catch {
        // onDumpFailed has already received this error.
      }
    }
    await dump();
  };
}
