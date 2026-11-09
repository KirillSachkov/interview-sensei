import { once } from "node:events";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { startProcess } from "./process-under-test.ts";

const launchScript = path.join(import.meta.dirname, "launch.ts");
const indexHtml = "<!doctype html><title>Interview Sensei</title>";
const skillText = "---\nname: sensei-check\ndescription: The built app's skill.\n---\n";

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-launch-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** The parts of a built app: the web build and the skills beside it. */
interface BuiltApp {
  readonly webDirectory: string;
  readonly skillsDirectory: string;
}

/**
 * Runs the `interview-sensei` command without the system browser, by default on a free port and a
 * new data directory. The extra arguments and variables go over these defaults; an undefined
 * variable is removed.
 */
async function startLaunch(
  app: BuiltApp,
  {
    dataDirectory,
    args = [],
    env = {},
  }: { dataDirectory?: string; args?: readonly string[]; env?: NodeJS.ProcessEnv } = {},
) {
  return startProcess(launchScript, {
    args: ["--no-browser", ...args],
    env: {
      INTERVIEW_SENSEI_DATA_DIR: dataDirectory ?? (await temporaryDirectory()),
      INTERVIEW_SENSEI_FAKE_AGENT: "1",
      INTERVIEW_SENSEI_WEB_DIR: app.webDirectory,
      INTERVIEW_SENSEI_SKILLS_DIR: app.skillsDirectory,
      SERVER_PORT: "0",
      ...env,
    },
  });
}

/** Holds a loopback port until the test finishes, so the command cannot listen on it. */
async function occupyPort(port = 0): Promise<number> {
  const blocker = createServer();
  blocker.listen(port, "127.0.0.1");
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

/** Holds port 4310, the default, unless another program already holds it. */
async function occupyDefaultPort(): Promise<void> {
  try {
    await occupyPort(4310);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EADDRINUSE")) {
      throw error;
    }
  }
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

async function builtApp(): Promise<BuiltApp> {
  const root = await temporaryDirectory();
  const webDirectory = path.join(root, "web");
  const skillsDirectory = path.join(root, "skills");
  await mkdir(webDirectory);
  await writeFile(path.join(webDirectory, "index.html"), indexHtml);
  await mkdir(path.join(skillsDirectory, "sensei-check"), { recursive: true });
  await writeFile(path.join(skillsDirectory, "sensei-check", "SKILL.md"), skillText);
  return { webDirectory, skillsDirectory };
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
    const launch = await startLaunch({ ...(await builtApp()), webDirectory });

    const { code, stderr } = await launch.exit();

    expect(code).toBe(1);
    expect(stderr).toContain(`Веб-приложение не собрано: нет ${webDirectory}`);
    expect(stderr).toContain("Выполните pnpm build");
  });

  it("exits with code 1 and asks for pnpm build when the built app has no skills", async () => {
    const skillsDirectory = path.join(await temporaryDirectory(), "skills");
    const launch = await startLaunch({ ...(await builtApp()), skillsDirectory });

    const { code, stderr } = await launch.exit();

    expect(code).toBe(1);
    expect(stderr).toContain(`Skills приложения не собраны: нет ${skillsDirectory}`);
    expect(stderr).toContain("Выполните pnpm build");
  });

  it("gives the agent the skills beside the web build", async () => {
    const dataDirectory = path.join(await temporaryDirectory(), "data");
    const launch = await startLaunch(await builtApp(), { dataDirectory });

    await openLiveChat(await appUrl(launch));

    const copy = path.join(dataDirectory, "agents", "fake", "skills", "sensei-check");
    await expect(
      readFile(path.join(copy, ".agents", "skills", "sensei-check", "SKILL.md"), "utf8"),
    ).resolves.toBe(skillText);
  });

  it("prints only the URL of the served web app on stdout", async () => {
    const launch = await startLaunch(await builtApp());

    const [line] = await launch.output(/Interview Sensei: http:\/\/127\.0\.0\.1:\d+\/\n/u);

    const response = await fetch(line.slice("Interview Sensei: ".length).trim());
    await expect(response.text()).resolves.toBe(indexHtml);
    const { code, stdout } = await launch.stop();
    expect(code).toBe(0);
    // Info-level JSON logs would bury the URL line.
    expect(stdout).toBe(line);
  });

  it("ends live sessions and releases the data directory on SIGTERM with open browser connections", async () => {
    const app = await builtApp();
    const dataDirectory = path.join(await temporaryDirectory(), "data");
    const launch = await startLaunch(app, { dataDirectory });
    const sessionId = await openLiveChat(await appUrl(launch));

    const { code } = await launch.stop();

    expect(code).toBe(0);
    // `agents` holds the fake agent's copy of its session's skill.
    await expect(readdir(dataDirectory)).resolves.toStrictEqual([
      "agents",
      "database",
      "database.dump.tar.gz",
      "sessions",
    ]);
    const restarted = await appUrl(await startLaunch(app, { dataDirectory }));
    const view = await fetch(new URL(`api/sessions/${sessionId}`, restarted));
    await expect(view.json()).resolves.toMatchObject({ status: "ended" });
  });

  it("takes the next free port and prints its URL when the default port 4310 is taken", async () => {
    await occupyDefaultPort();
    const launch = await startLaunch(await builtApp(), {
      env: { SERVER_PORT: undefined },
    });

    const url = new URL(await appUrl(launch));

    expect(Number(url.port)).toBeGreaterThan(4310);
    expect(Number(url.port)).toBeLessThan(4320);
    const response = await fetch(url);
    await expect(response.text()).resolves.toBe(indexHtml);
  });

  it("exits with code 1 when the port of the --port flag is taken", async () => {
    const port = await occupyPort();
    const launch = await startLaunch(await builtApp(), {
      args: ["--port", String(port)],
      env: { SERVER_PORT: undefined },
    });

    const { code, stderr } = await launch.exit();

    expect(code).toBe(1);
    expect(stderr).toContain(`Порт ${port} на 127.0.0.1 занят`);
  });

  it("exits with code 1 when the port of SERVER_PORT is taken", async () => {
    const port = await occupyPort();
    const launch = await startLaunch(await builtApp(), {
      env: { SERVER_PORT: String(port) },
    });

    const { code, stderr } = await launch.exit();

    expect(code).toBe(1);
    expect(stderr).toContain(`Порт ${port} на 127.0.0.1 занят`);
  });

  it("keeps the data in the directory of the --data-dir flag over INTERVIEW_SENSEI_DATA_DIR", async () => {
    const flagDirectory = path.join(await temporaryDirectory(), "flag-data");
    const variableDirectory = path.join(await temporaryDirectory(), "variable-data");
    const launch = await startLaunch(await builtApp(), {
      dataDirectory: variableDirectory,
      args: ["--data-dir", flagDirectory],
    });
    await appUrl(launch);

    await launch.stop();

    await expect(readdir(flagDirectory)).resolves.toContain("database.dump.tar.gz");
    await expect(readdir(variableDirectory)).rejects.toThrow(/ENOENT/u);
  });

  it("exits with code 1 and names the flags for an unknown flag", async () => {
    const launch = await startLaunch(await builtApp(), { args: ["--prot", "4400"] });

    const { code, stderr } = await launch.exit();

    expect(code).toBe(1);
    expect(stderr).toContain("--prot");
    expect(stderr).toContain("--port");
  });
});
