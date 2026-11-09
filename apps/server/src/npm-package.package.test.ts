// The npm package `interview-sensei` as the Candidate gets it: `npm pack` of the built package,
// an install from that file into an empty directory and a start of its command with the fake
// agent. `pnpm test:package` builds the package first; npm downloads the dependencies.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeAll, describe, expect, it, onTestFinished } from "vitest";

import { startCommand } from "./process-under-test.ts";

/** The Node that runs the tests runs npm and the command too, so CI can test Node 22. */
const searchPath = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`;

/** Runs npm in the directory and returns its standard output; throws when npm fails. */
async function npm(args: readonly string[], cwd: string): Promise<string> {
  const child = spawn("npm", args, {
    cwd,
    env: { ...process.env, PATH: searchPath },
    stdio: ["ignore", "pipe", "inherit"],
  });
  let stdout = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  await once(child, "exit");
  if (child.exitCode !== 0) {
    throw new Error(`npm ${args.join(" ")} exited with code ${String(child.exitCode)}`);
  }
  return stdout;
}

const builtPackage = path.join(import.meta.dirname, "..", "dist", "package");
const builtIndexHtml = path.join(builtPackage, "apps", "web", "dist", "web", "index.html");

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "interview-sensei-package-"));
}

/** Packs the built package and installs the file into an empty directory; returns that directory. */
async function installPackage(root: string): Promise<string> {
  const packed = path.join(root, "packed");
  const installation = path.join(root, "installation");
  await mkdir(packed);
  await mkdir(installation);
  const packOutput = await npm(["pack", "--pack-destination", packed], builtPackage);
  const tarball = path.join(packed, packOutput.trim().split("\n").at(-1) ?? "");
  await npm(["install", "--no-audit", "--no-fund", "--no-package-lock", tarball], installation);
  return installation;
}

let installation = "";
/** Runs the installed `interview-sensei` command with the fake agent, as npx runs it. */
async function startInstalled(args: readonly string[]) {
  const dataDirectory = path.join(await temporaryDirectory(), "data");
  onTestFinished(async () => {
    await rm(path.dirname(dataDirectory), { recursive: true, force: true });
  });
  const command = startCommand(
    path.join(installation, "node_modules", ".bin", "interview-sensei"),
    {
      args,
      cwd: installation,
      env: {
        PATH: searchPath,
        INTERVIEW_SENSEI_DATA_DIR: dataDirectory,
        INTERVIEW_SENSEI_FAKE_AGENT: "1",
        // The package serves its own web app and skills, not those of the repository.
        INTERVIEW_SENSEI_WEB_DIR: undefined,
        INTERVIEW_SENSEI_SKILLS_DIR: undefined,
        INTERVIEW_SENSEI_NO_BROWSER: undefined,
        SERVER_PORT: undefined,
      },
    },
  );
  const { groups } = await command.output(/Interview Sensei: (?<url>http:\/\/\S+\/)\n/u);
  if (groups?.url === undefined) {
    throw new Error("The command printed no URL");
  }
  return { command, url: groups.url, dataDirectory };
}

interface Entry {
  readonly type: string;
  readonly text: string;
}

function isEntry(value: unknown): value is Entry {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    (!("text" in value) || typeof value.text === "string")
  );
}

/** The entries of an idle session view in an event message; null for another message. */
function idleEntries(data: unknown): Entry[] | null {
  const message: unknown = typeof data === "string" ? JSON.parse(data) : null;
  if (typeof message !== "object" || message === null || !("session" in message)) {
    return null;
  }
  const { session } = message;
  if (typeof session !== "object" || session === null || !("status" in session)) {
    return null;
  }
  const entries = "entries" in session ? session.entries : null;
  return session.status === "idle" && Array.isArray(entries)
    ? entries.filter((entry) => isEntry(entry))
    : null;
}

/** Starts «Проверка агента» with the fake agent; returns the session id. */
async function startChat(url: string, origin: string): Promise<string> {
  const response = await fetch(new URL("api/sessions", url), {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ kind: "service-chat", agent: "fake" }),
  });
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string") {
    throw new Error(`The server started no session: ${JSON.stringify(body)}`);
  }
  return body.id;
}

/** Sends the prompt in a new «Проверка агента» and returns the fake agent's reply. */
async function replyTo(url: string, text: string): Promise<string> {
  const { origin } = new URL(url);
  const id = await startChat(url, origin);
  const socket = new WebSocket(new URL(`api/sessions/${id}/events`, url.replace("http", "ws")), {
    headers: { origin },
  });
  onTestFinished(() => {
    socket.close();
  });
  const reply = Promise.withResolvers<string>();
  let prompted = false;
  socket.addEventListener("message", (event) => {
    const entries = idleEntries(event.data);
    if (entries === null) {
      return;
    }
    const answer = entries.filter((entry) => entry.type === "agent_message");
    if (!prompted) {
      prompted = true;
      socket.send(JSON.stringify({ type: "prompt", text }));
    } else if (answer.length > 0) {
      reply.resolve(answer.map((entry) => entry.text).join(""));
    }
  });
  return reply.promise;
}

describe("npm package", () => {
  beforeAll(async () => {
    const root = await temporaryDirectory();
    installation = await installPackage(root);
    return async () => {
      await rm(root, { recursive: true, force: true });
    };
  }, 300_000);

  it("serves its built web app at the URL that the installed command prints", async () => {
    const { url } = await startInstalled(["--no-browser", "--port", "0"]);

    const response = await fetch(url);

    await expect(response.text()).resolves.toBe(await readFile(builtIndexHtml, "utf8"));
  });

  it("gives the fake agent the application's skill sensei-check from the package", async () => {
    const { url } = await startInstalled(["--no-browser", "--port", "0"]);

    await expect(replyTo(url, "/skills")).resolves.toBe('Skills: ["sensei-check"]');
  });

  it("keeps its data in the --data-dir directory and releases it on SIGTERM", async () => {
    const dataDirectory = path.join(await temporaryDirectory(), "flag-data");
    onTestFinished(async () => {
      await rm(path.dirname(dataDirectory), { recursive: true, force: true });
    });
    const { command } = await startInstalled([
      "--no-browser",
      "--port",
      "0",
      "--data-dir",
      dataDirectory,
    ]);

    const { code } = await command.stop();

    expect(code).toBe(0);
    await expect(readdir(dataDirectory)).resolves.toStrictEqual([
      "database",
      "database.dump.tar.gz",
    ]);
  });
});
