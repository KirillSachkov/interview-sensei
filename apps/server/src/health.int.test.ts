import { describe, expect, it, onTestFinished } from "vitest";

import { buildServer } from "./server.ts";

const fixedTime = "2026-01-02T03:04:05.000Z";

function startServer() {
  const server = buildServer({ clock: { now: () => new Date(fixedTime) } });
  onTestFinished(async () => {
    await server.close();
  });
  return server;
}

describe("health check", () => {
  it("reports that the server is up at the time of the injected clock", async () => {
    const server = startServer();

    const response = await server.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ status: "ok", checkedAt: fixedTime });
  });
});
