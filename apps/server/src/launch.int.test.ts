import { once } from "node:events";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { startProcess } from "./process-under-test.ts";

const launchScript = path.join(import.meta.dirname, "launch.ts");
const indexHtml = "<!doctype html><title>Interview Sensei</title>";

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-launch-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** Runs the `interview-sensei` command on a free port without the system browser. */
async function startLaunch(webDirectory: string, dataDirectory?: string) {
  return startProcess(launchScript, {
    args: ["--no-browser"],
    env: {
      INTERVIEW_SENSEI_DATA_DIR: dataDirectory ?? (await temporaryDirectory()),
      INTERVIEW_SENSEI_FAKE_AGENT: "1",
      INTERVIEW_SENSEI_WEB_DIR: webDirectory,
      SERVER_PORT: "0",
    },
  });
}

async function appUrl(launch: ReturnType<typeof startProcess>): Promise<string> {
  const { groups } = await launch.output(/Interview Sensei: (?<url>http:\/\/\S+\/)\n/u);
  if (groups?.url === undefined) {
    throw new Error("The command printed no URL");
  }
  return groups.url;
}

async function startChat(url: string): Promise<string> {
  const response = await fetch(new URL("api/sessions", url), {
    method: "POST",
    // The page of the served app; the server refuses other origins.
    headers: { "content-type": "application/json", origin: new URL(url).origin },
    body: JSON.stringify({ kind: "service-chat", agent: "fake" }),
  });
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string") {
    throw new Error(`The server started no session: ${JSON.stringify(body)}`);
  }
  return body.id;
}

/** The session's event socket, as the browser keeps it open until the server closes it. */
function openEvents(url: string, sessionId: string): WebSocket {
  const socket = new WebSocket(
    new URL(`api/sessions/${sessionId}/events`, url.replace("http", "ws")),
    { headers: { origin: new URL(url).origin } },
  );
  onTestFinished(() => {
    socket.close();
  });
  return socket;
}

/** A browser also keeps a spare connection that has sent no request yet. */
async function openSpareConnection(url: string): Promise<void> {
  const spare = connect(Number(new URL(url).port), "127.0.0.1");
  onTestFinished(() => {
    spare.destroy();
  });
  await once(spare, "connect");
}

/** Resolves when the socket sends a session view with the status `idle`. */
async function waitUntilIdle(socket: WebSocket): Promise<void> {
  const idle = Promise.withResolvers<null>();
  socket.addEventListener("message", (event) => {
    const message: unknown = typeof event.data === "string" ? JSON.parse(event.data) : null;
    if (
      typeof message === "object" &&
      message !== null &&
      "session" in message &&
      typeof message.session === "object" &&
      message.session !== null &&
      "status" in message.session &&
      message.session.status === "idle"
    ) {
      idle.resolve(null);
    }
  });
  await idle.promise;
}

async function builtWebApp(): Promise<string> {
  const webDirectory = await temporaryDirectory();
  await writeFile(path.join(webDirectory, "index.html"), indexHtml);
  return webDirectory;
}

/**
 * Opens a chat as the browser does: its event socket stays open, a spare connection waits, and the
 * agent is idle.
 */
async function openLiveChat(url: string): Promise<string> {
  const sessionId = await startChat(url);
  await waitUntilIdle(openEvents(url, sessionId));
  await openSpareConnection(url);
  return sessionId;
}

describe("interview-sensei command", () => {
  it("exits with code 1 and asks for pnpm build when the web app is not built", async () => {
    const webDirectory = path.join(await temporaryDirectory(), "dist");
    const launch = await startLaunch(webDirectory);

    const { code, stderr } = await launch.exit();

    expect(code).toBe(1);
    expect(stderr).toContain(`Веб-приложение не собрано: нет ${webDirectory}`);
    expect(stderr).toContain("Выполните pnpm build");
  });

  it("prints only the URL of the served web app on stdout", async () => {
    const launch = await startLaunch(await builtWebApp());

    const [line] = await launch.output(/Interview Sensei: http:\/\/127\.0\.0\.1:\d+\/\n/u);

    const response = await fetch(line.slice("Interview Sensei: ".length).trim());
    await expect(response.text()).resolves.toBe(indexHtml);
    const { code, stdout } = await launch.stop();
    expect(code).toBe(0);
    // Info-level JSON logs would bury the URL line.
    expect(stdout).toBe(line);
  });

  it("ends live sessions and releases the data directory on SIGTERM with open browser connections", async () => {
    const webDirectory = await builtWebApp();
    const dataDirectory = path.join(await temporaryDirectory(), "data");
    const launch = await startLaunch(webDirectory, dataDirectory);
    const sessionId = await openLiveChat(await appUrl(launch));

    const { code } = await launch.stop();

    expect(code).toBe(0);
    await expect(readdir(dataDirectory)).resolves.toStrictEqual([
      "database",
      "database.dump.tar.gz",
      "sessions",
    ]);
    const restarted = await appUrl(await startLaunch(webDirectory, dataDirectory));
    const view = await fetch(new URL(`api/sessions/${sessionId}`, restarted));
    await expect(view.json()).resolves.toMatchObject({ status: "ended" });
  });
});
