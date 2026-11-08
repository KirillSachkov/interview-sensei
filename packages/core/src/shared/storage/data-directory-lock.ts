import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Clock } from "../time/index.ts";
import { dataDirectoryVariable } from "./data-directory.ts";

/** Another running process already uses the data directory. */
export class DataDirectoryInUseError extends Error {
  override readonly name = "DataDirectoryInUseError";

  constructor(dataDirectory: string, lockFile: string, holderPid: number | undefined) {
    const holder = holderPid === undefined ? "" : ` (PID ${holderPid})`;
    super(
      `Каталог данных ${dataDirectory} уже занят другим запуском Interview Sensei${holder}. ` +
        `Остановите его или задайте другой каталог в переменной ${dataDirectoryVariable}. ` +
        `Если Interview Sensei не запущен, удалите файл ${lockFile}.`,
    );
  }
}

function isErrnoException(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function isRunning(pid: number): boolean {
  try {
    // Signal 0 checks that the process exists without affecting it.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return !isErrnoException(error, "ESRCH");
  }
}

/** The PID in the lock file, or undefined when the file is missing, empty or damaged. */
async function readHolderPid(lockFile: string): Promise<number | undefined> {
  try {
    const holder: unknown = JSON.parse(await readFile(lockFile, "utf8"));
    return typeof holder === "object" &&
      holder !== null &&
      "pid" in holder &&
      typeof holder.pid === "number" &&
      Number.isInteger(holder.pid)
      ? holder.pid
      : undefined;
  } catch {
    return undefined;
  }
}

/** Creates the lock file unless it exists; the `wx` flag lets only one process create it. */
async function tryCreate(lockFile: string, content: string): Promise<boolean> {
  try {
    await writeFile(lockFile, content, { flag: "wx" });
    return true;
  } catch (error) {
    if (isErrnoException(error, "EEXIST")) {
      return false;
    }
    throw error;
  }
}

/** Replaces the lock if its process no longer runs; the caller holds the takeover file. */
async function replaceStaleLock(dataDirectory: string, lockFile: string, content: string) {
  const holderPid = await readHolderPid(lockFile);
  // A damaged lock may belong to a process that is writing it right now, so it is not stale.
  if (holderPid === undefined || isRunning(holderPid)) {
    throw new DataDirectoryInUseError(dataDirectory, lockFile, holderPid);
  }
  await rm(lockFile, { force: true });
  if (!(await tryCreate(lockFile, content))) {
    // A new start created the lock after the stale one was removed.
    throw new DataDirectoryInUseError(dataDirectory, lockFile, await readHolderPid(lockFile));
  }
}

/**
 * Takes over a lock whose process no longer runs. Several starts may find the same stale lock, so
 * only the start that creates the takeover file may replace it. That start reads the lock again:
 * another start may have replaced it already.
 */
async function takeOverStaleLock(dataDirectory: string, lockFile: string, content: string) {
  const takeoverFile = `${lockFile}.takeover`;
  if (!(await tryCreate(takeoverFile, content))) {
    throw new DataDirectoryInUseError(
      dataDirectory,
      takeoverFile,
      await readHolderPid(takeoverFile),
    );
  }
  try {
    await replaceStaleLock(dataDirectory, lockFile, content);
  } finally {
    await rm(takeoverFile, { force: true });
  }
}

/**
 * Makes this process the only user of the data directory (ADR-0002): PGlite does not lock its
 * files, and two processes on one database corrupt it. The lock file names the holder's PID. A
 * lock whose process no longer runs is left from a crash, and the next start takes it over.
 * Returns the function that releases the lock.
 */
export async function lockDataDirectory(
  dataDirectory: string,
  clock: Clock,
): Promise<() => Promise<void>> {
  const lockFile = path.join(dataDirectory, "server.lock");
  const content = JSON.stringify({ pid: process.pid, startedAt: clock.now().toISOString() });
  if (!(await tryCreate(lockFile, content))) {
    await takeOverStaleLock(dataDirectory, lockFile, content);
  }
  return async () => {
    // Remove only our own lock: after a takeover the file may name another process.
    if ((await readFile(lockFile, "utf8").catch(() => "")) === content) {
      await rm(lockFile, { force: true });
    }
  };
}
