import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { buildServer } from "./server.ts";

const fixedTime = "2026-01-02T03:04:05.000Z";

async function startServer() {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "interview-sensei-server-"));
  const server = await buildServer({
    clock: { now: () => new Date(fixedTime) },
    // Periodic dumps are not under test here; the timer never ticks.
    timer: { repeat: () => () => {} },
    dataDirectory,
  });
  onTestFinished(async () => {
    await server.close();
    await rm(dataDirectory, { recursive: true, force: true });
  });
  return server;
}

describe("health check", () => {
  it("reports that the server is up at the time of the injected clock", async () => {
    const server = await startServer();

    const response = await server.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ status: "ok", checkedAt: fixedTime });
  });
});
