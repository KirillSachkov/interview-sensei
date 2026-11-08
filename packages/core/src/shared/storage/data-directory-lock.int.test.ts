import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sql } from "drizzle-orm";
import { describe, expect, it, onTestFinished } from "vitest";

import { openForTest, temporaryDirectory } from "./test-support.ts";

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

    await expect(openForTest(dataDirectory)).rejects.toThrow(
      `Каталог данных ${dataDirectory} уже занят другим запуском Interview Sensei (PID ${process.pid}). ` +
        "Остановите его или задайте другой каталог в переменной INTERVIEW_SENSEI_DATA_DIR.",
    );
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
});
