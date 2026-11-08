import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

const mainScript = path.join(import.meta.dirname, "main.ts");

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-main-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** Runs the server's entry point as `node src/main.ts` on a free port and the given data directory. */
function runServer(dataDirectory: string) {
  const child = spawn(process.execPath, [mainScript], {
    env: { ...process.env, INTERVIEW_SENSEI_DATA_DIR: dataDirectory, SERVER_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  return {
    pid: child.pid,
    listening: async () => {
      while (!stdout.includes("Server listening")) {
        if (child.exitCode !== null) {
          throw new Error(`The server exited with code ${child.exitCode}: ${stderr}`);
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- waits for the next output chunk
        await Promise.race([once(child.stdout, "data"), exited]);
      }
    },
    stop: async () => {
      child.kill("SIGTERM");
      await exited;
      return child.exitCode;
    },
    exit: async () => {
      await exited;
      return { code: child.exitCode, stderr };
    },
  };
}

describe("server process", () => {
  it("creates the data directory and leaves a dump without the lock when it stops", async () => {
    const dataDirectory = path.join(await temporaryDirectory(), "data");
    const server = runServer(dataDirectory);
    await server.listening();

    await expect(server.stop()).resolves.toBe(0);

    await expect(readdir(dataDirectory)).resolves.toStrictEqual([
      "database",
      "database.dump.tar.gz",
    ]);
  });

  it("refuses a second server on the same data directory with a clear message", async () => {
    const dataDirectory = await temporaryDirectory();
    const first = runServer(dataDirectory);
    await first.listening();

    const second = runServer(dataDirectory);

    await expect(second.exit()).resolves.toStrictEqual({
      code: 1,
      stderr:
        `Каталог данных ${dataDirectory} уже занят другим запуском Interview Sensei (PID ${first.pid}). ` +
        "Остановите его или задайте другой каталог в переменной INTERVIEW_SENSEI_DATA_DIR.\n",
    });
  });
});
