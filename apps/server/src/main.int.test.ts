import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { startProcess } from "./process-under-test.ts";

const mainScript = path.join(import.meta.dirname, "main.ts");

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-main-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** Holds a loopback port until the test finishes, so a server cannot listen on it. */
async function occupiedPort(): Promise<number> {
  const blocker = createServer();
  blocker.listen(0, "127.0.0.1");
  await once(blocker, "listening");
  onTestFinished(async () => {
    blocker.close();
    await once(blocker, "close");
  });
  const address = blocker.address();
  if (address === null || typeof address === "string") {
    throw new Error("The blocker listens on no TCP port");
  }
  return address.port;
}

/** Runs the server's entry point as `node src/main.ts` on the data directory, by default on a free port. */
function startMain(dataDirectory: string, port = 0, env: NodeJS.ProcessEnv = {}) {
  const main = startProcess(mainScript, {
    env: { INTERVIEW_SENSEI_DATA_DIR: dataDirectory, SERVER_PORT: String(port), ...env },
  });
  return { ...main, listening: () => main.output(/Server listening/u) };
}

describe("server process", () => {
  it("creates the data directory and leaves a dump without the lock when it stops", async () => {
    const dataDirectory = path.join(await temporaryDirectory(), "data");
    const server = startMain(dataDirectory);
    await server.listening();

    await expect(server.stop()).resolves.toMatchObject({ code: 0 });

    await expect(readdir(dataDirectory)).resolves.toStrictEqual([
      "database",
      "database.dump.tar.gz",
    ]);
  });

  it("refuses a second server on the same data directory with a clear message", async () => {
    const dataDirectory = await temporaryDirectory();
    const first = startMain(dataDirectory);
    await first.listening();

    const second = startMain(dataDirectory);

    const { code, stderr } = await second.exit();

    expect(code).toBe(1);
    expect(stderr).toContain(`Каталог данных ${dataDirectory} уже занят`);
    expect(stderr).toContain(`(PID ${first.pid})`);
  });

  it("closes the data directory and exits with code 1 when the port is taken", async () => {
    const dataDirectory = await temporaryDirectory();
    const port = await occupiedPort();
    const server = startMain(dataDirectory, port);

    const { code, stderr } = await server.exit();

    expect(code).toBe(1);
    expect(stderr).toContain(`Порт ${port} на 127.0.0.1 занят`);
    await expect(readdir(dataDirectory)).resolves.toStrictEqual([
      "database",
      "database.dump.tar.gz",
    ]);
  });

  it.each(["0.0.0.0", "::", "192.168.1.10"])(
    "refuses to listen on the non-loopback host %s and exits with code 1",
    async (host) => {
      const dataDirectory = path.join(await temporaryDirectory(), "data");
      const server = startMain(dataDirectory, 0, { SERVER_HOST: host });

      const { code, stderr } = await server.exit();

      expect(code).toBe(1);
      expect(stderr).toContain(`SERVER_HOST=${host} не loopback-адрес`);
      // The check runs before the server opens the data directory.
      await expect(readdir(dataDirectory)).rejects.toThrow(/ENOENT/u);
    },
  );
});
