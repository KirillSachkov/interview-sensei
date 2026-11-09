import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { buildServer } from "./server.ts";

const indexHtml = '<!doctype html><script type="module" src="/assets/app.js"></script>';
const appScript = "console.log('Interview Sensei');";

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-web-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** A built web app as `vite build` lays it out: index.html and hashed assets. */
async function builtWebApp(): Promise<string> {
  const webDirectory = await temporaryDirectory();
  await mkdir(path.join(webDirectory, "assets"));
  await writeFile(path.join(webDirectory, "index.html"), indexHtml);
  await writeFile(path.join(webDirectory, "assets", "app.js"), appScript);
  return webDirectory;
}

async function startServer(webDirectory: string) {
  const server = await buildServer({
    clock: { now: () => new Date("2026-01-02T03:04:05.000Z") },
    // Periodic dumps are not under test here; the timer never ticks.
    timer: { repeat: () => () => {}, after: () => () => {} },
    dataDirectory: await temporaryDirectory(),
    webDirectory,
  });
  onTestFinished(async () => {
    await server.close();
  });
  return server;
}

describe("built web app", () => {
  it("serves the web app's index page at the root", async () => {
    const server = await startServer(await builtWebApp());

    const response = await server.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toBe(indexHtml);
  });

  it("serves the web app's assets", async () => {
    const server = await startServer(await builtWebApp());

    const response = await server.inject({ method: "GET", url: "/assets/app.js" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("javascript");
    expect(response.body).toBe(appScript);
  });

  it("serves the index page for a page route, so the web router handles it", async () => {
    const server = await startServer(await builtWebApp());

    const response = await server.inject({ method: "GET", url: "/some/page" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(indexHtml);
  });

  it("keeps the API answering beside the web app", async () => {
    const server = await startServer(await builtWebApp());

    const response = await server.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ status: "ok", checkedAt: "2026-01-02T03:04:05.000Z" });
  });

  it("answers an unknown API path with 404 instead of the index page", async () => {
    const server = await startServer(await builtWebApp());

    const response = await server.inject({ method: "GET", url: "/api/unknown" });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("answers 404 for a missing asset instead of the index page", async () => {
    const server = await startServer(await builtWebApp());

    const response = await server.inject({ method: "GET", url: "/assets/missing.js" });

    expect(response.statusCode).toBe(404);
  });
});
