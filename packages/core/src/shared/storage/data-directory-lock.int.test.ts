import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sql } from "drizzle-orm";
import { describe, expect, it, onTestFinished } from "vitest";

import { DataDirectoryInUseError, lockDataDirectory } from "./data-directory-lock.ts";
import { manualTime, openForTest, temporaryDirectory } from "./test-support.ts";

function moduleUrl(relativePath: string): string {
  return JSON.stringify(pathToFileURL(path.join(import.meta.dirname, relativePath)).href);
}

// Opens the storage in another Node process, which holds it until the test kills the process.
const holderScript = `
const { openStorage } = await import(${moduleUrl("index.ts")});
const { systemClock, systemTimer } = await import(${moduleUrl("../time/index.ts")});
await openStorage({
  dataDirectory: process.argv[1],
  clock: systemClock,
  timer: systemTimer,
  migrations: [],
  onDumpFailed: console.error,
});
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
  const crash = async () => {
    holder.kill("SIGKILL");
    await exited;
  };
  onTestFinished(async () => {
    if (holder.exitCode === null && holder.signalCode === null) {
      await crash();
    }
  });
  const firstOutput: unknown[] = await once(holder.stdout, "data");
  expect(String(firstOutput[0])).toBe("ready\n");
  /** `crash` ends the process without any cleanup, as a crash or power loss would. */
  return { pid: holder.pid, crash };
}

/** The PID of a process that has already exited. */
async function deadPid(): Promise<number | undefined> {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await once(child, "exit");
  return child.pid;
}

async function countNotes(storage: Awaited<ReturnType<typeof openForTest>>) {
  const { rows } = await storage.database.execute(
    sql`SELECT count(*)::int AS count FROM notes.notes`,
  );
  return rows;
}

describe("data directory lock", () => {
  it("refuses a second start on the same data directory and keeps the first one working", async () => {
    const dataDirectory = await temporaryDirectory();
    const first = await openForTest(dataDirectory);

    const refusal = openForTest(dataDirectory);

    await expect(refusal).rejects.toBeInstanceOf(DataDirectoryInUseError);
    await expect(refusal).rejects.toThrow(`(PID ${process.pid})`);
    await expect(refusal).rejects.toThrow(path.join(dataDirectory, "server.lock"));
    await expect(countNotes(first)).resolves.toStrictEqual([{ count: 0 }]);
  });

  it("refuses a start while another process holds the data directory", async () => {
    const dataDirectory = await temporaryDirectory();
    const holder = await holdInAnotherProcess(dataDirectory);

    await expect(openForTest(dataDirectory)).rejects.toThrow(`(PID ${holder.pid})`);
  });

  it("lets a start take over after the process that held the data directory crashed", async () => {
    const dataDirectory = await temporaryDirectory();
    const holder = await holdInAnotherProcess(dataDirectory);
    await holder.crash();

    const storage = await openForTest(dataDirectory);

    await expect(countNotes(storage)).resolves.toStrictEqual([{ count: 0 }]);
  });

  it("lets exactly one of several concurrent starts take over a stale lock", async () => {
    const { clock } = manualTime();
    const stalePid = await deadPid();
    /* oxlint-disable eslint/no-await-in-loop -- each round needs a fresh stale lock */
    for (let round = 0; round < 50; round += 1) {
      const dataDirectory = await temporaryDirectory();
      await writeFile(
        path.join(dataDirectory, "server.lock"),
        JSON.stringify({ pid: stalePid, startedAt: "2026-01-01T00:00:00.000Z" }),
      );

      const starts = await Promise.allSettled(
        Array.from({ length: 8 }, async () => lockDataDirectory(dataDirectory, clock)),
      );

      const reasons = starts
        .filter((start): start is PromiseRejectedResult => start.status === "rejected")
        .map(({ reason }: { reason: unknown }) => reason);

      expect(reasons).toHaveLength(7);
      expect(reasons.every((reason) => reason instanceof DataDirectoryInUseError)).toBe(true);
    }
    /* oxlint-enable eslint/no-await-in-loop */
  });
});
