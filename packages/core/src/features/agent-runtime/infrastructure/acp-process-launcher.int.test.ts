// The ACP launcher against the fake agent as a real process. The fake agent's modes stand for an
// agent that never answers and one that ignores SIGTERM; the test passes time by hand. The
// recipe's files and links go to a temporary data directory; a temporary file stands for the
// Candidate's login.
import { mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import type { Timer } from "../../../shared/time/index.ts";
import { launchRecipe } from "../domain/launch-recipe.ts";
import type { LaunchRecipe } from "../domain/launch-recipe.ts";
import type { AgentUpdate, LiveAgent } from "../domain/ports.ts";
import { acpLauncher, launchTimeoutMs, stopGraceMs } from "./acp-process-launcher.ts";
import { inspectAgentHost } from "./installation.ts";

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-launcher-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** A timer whose delayed tasks run only when the test fires them. */
function manualTimer() {
  const pending: { delayMs: number; task: () => void }[] = [];
  let scheduled = Promise.withResolvers<null>();
  const timer: Timer = {
    repeat: () => () => {},
    after: (delayMs, task) => {
      const entry = { delayMs, task };
      pending.push(entry);
      scheduled.resolve(null);
      scheduled = Promise.withResolvers<null>();
      return () => {
        const index = pending.indexOf(entry);
        if (index !== -1) {
          pending.splice(index, 1);
        }
      };
    },
  };
  /** Waits until a task with the delay is scheduled, then runs it. */
  const fire = async (delayMs: number): Promise<void> => {
    const entry = pending.find((candidate) => candidate.delayMs === delayMs);
    if (entry === undefined) {
      await scheduled.promise;
      return fire(delayMs);
    }
    pending.splice(pending.indexOf(entry), 1);
    entry.task();
  };
  return { timer, fire };
}

/** A timer that never runs a task: these tests do not time out. */
const idleTimer: Timer = { repeat: () => () => {}, after: () => () => {} };

/** The fake agent's recipe in a fresh temporary data directory. */
async function fakeRecipe(): Promise<LaunchRecipe> {
  const dataDirectory = await temporaryDirectory();
  return launchRecipe({
    agent: "fake",
    sessionKind: "service-chat",
    host: await inspectAgentHost({ home: dataDirectory, env: {} })(),
    dataDirectory,
    sessionDirectory: path.join(dataDirectory, "sessions", "1"),
  });
}

/**
 * Starts the agent by the recipe with `env` as the Candidate's environment; `exits` collects the
 * exits it reports by itself.
 */
function launch(recipe: LaunchRecipe, timer: Timer, env: Record<string, string> = {}) {
  const exits: unknown[] = [];
  const updates: AgentUpdate[] = [];
  const launched = acpLauncher({ timer, env })(recipe, {
    // These tests never call the MCP server or answer a permission request.
    mcpServer: { name: "interview-sensei", url: "http://127.0.0.1:9/mcp/unused" },
    onUpdate: (update) => {
      updates.push(update);
    },
    onPermission: () => Promise.resolve({ outcome: "cancelled" }),
    onExit: (exit) => {
      exits.push(exit);
    },
  });
  return { launched, exits, updates };
}

/** Starts the fake agent in the mode; `exits` collects the exits it reports by itself. */
async function startFake(mode: string, timer: Timer) {
  const recipe = await fakeRecipe();
  return launch({ ...recipe, env: { INTERVIEW_SENSEI_FAKE_AGENT_MODE: mode } }, timer);
}

/** The fake recipe, an agent home in its data directory and a file that stands for the login. */
async function agentHome(loginContent: string) {
  const recipe = await fakeRecipe();
  const login = path.join(await temporaryDirectory(), "auth.json");
  await writeFile(login, loginContent);
  return { recipe, home: path.join(recipe.cwd, "..", "..", "agents", "fake"), login };
}

/** Starts the agent by the recipe; it stops when the test finishes. */
async function startPrepared(recipe: LaunchRecipe): Promise<void> {
  const { launched } = launch(recipe, idleTimer);
  const agent = await launched;
  onTestFinished(async () => agent.stop());
}

/** The agent's text reply to the prompt; the agent stops when the test finishes. */
async function replyTo(agent: LiveAgent, updates: AgentUpdate[], text: string): Promise<string> {
  onTestFinished(async () => agent.stop());
  updates.length = 0;
  await agent.prompt(text);
  return updates
    .map((update) => {
      const { content } = update;
      return typeof content === "object" && content !== null && "text" in content
        ? String(content.text)
        : "";
    })
    .join("");
}

/** Resolves with the rejection of the promise, so the test can pass time before it looks. */
async function errorOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("acp launcher", () => {
  it("fails the launch and kills an agent that never answers initialize", async () => {
    const { timer, fire } = manualTimer();
    const { launched, exits } = await startFake("silent", timer);
    const failure = errorOf(launched);

    await fire(launchTimeoutMs);
    await fire(stopGraceMs);

    await expect(failure).resolves.toMatch(/did not open a session/u);
    expect(exits).toStrictEqual([]);
  });

  it("kills an agent that ignores SIGTERM when the server stops it", async () => {
    const { timer, fire } = manualTimer();
    const { launched } = await startFake("ignore-sigterm", timer);
    const agent: LiveAgent = await launched;

    const stopped = agent.stop();
    await fire(stopGraceMs);

    await expect(stopped).resolves.toBeUndefined();
  });

  it("sets the recipe's permission mode right after session/new instead of the Candidate's", async () => {
    const { launched, updates } = launch({ ...(await fakeRecipe()), mode: "default" }, idleTimer);

    await expect(replyTo(await launched, updates, "/mode")).resolves.toBe("Режим: default");
  });

  it("refuses to start an agent that does not offer the recipe's permission mode", async () => {
    const { launched } = launch({ ...(await fakeRecipe()), mode: "bypass-everything" }, idleTimer);

    await expect(launched).rejects.toThrow(/does not offer the permission mode bypass-everything/u);
  });

  it("passes the recipe's _meta to session/new", async () => {
    const sessionMeta = { claudeCode: { options: { settingSources: [] } } };
    const { launched, updates } = launch({ ...(await fakeRecipe()), sessionMeta }, idleTimer);

    await expect(replyTo(await launched, updates, "/meta")).resolves.toBe(
      `_meta: ${JSON.stringify(sessionMeta)}`,
    );
  });

  it("writes the recipe's files and links the Candidate's login before the start", async () => {
    const { recipe, home, login } = await agentHome("token");

    await startPrepared({
      ...recipe,
      directories: [home, ...recipe.directories],
      files: [{ path: path.join(home, "config.toml"), content: "enabled = false\n" }],
      symlinks: [{ path: path.join(home, "auth.json"), target: login }],
    });

    await expect(readFile(path.join(home, "config.toml"), "utf8")).resolves.toBe(
      "enabled = false\n",
    );
    await expect(readlink(path.join(home, "auth.json"))).resolves.toBe(login);
    await expect(readFile(login, "utf8")).resolves.toBe("token");
  });

  it("refuses to start when a recipe directory is a link to the Candidate's directory", async () => {
    const { recipe, home, login } = await agentHome("token");
    const userDirectory = await temporaryDirectory();
    await writeFile(path.join(userDirectory, "config.toml"), "the Candidate's own config");
    await writeFile(path.join(userDirectory, "auth.json"), "the Candidate's own login");
    await mkdir(path.dirname(home), { recursive: true });
    await symlink(userDirectory, home);

    const { launched } = launch(
      {
        ...recipe,
        directories: [home, ...recipe.directories],
        files: [{ path: path.join(home, "config.toml"), content: "ours" }],
        symlinks: [{ path: path.join(home, "auth.json"), target: login }],
      },
      idleTimer,
    );

    await expect(launched).rejects.toThrow(/link/u);
    await expect(readFile(path.join(userDirectory, "config.toml"), "utf8")).resolves.toBe(
      "the Candidate's own config",
    );
    await expect(readFile(path.join(userDirectory, "auth.json"), "utf8")).resolves.toBe(
      "the Candidate's own login",
    );
  });

  it("gives the agent the Candidate's environment without variables that defeat isolation", async () => {
    const candidate = {
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "sk-ant-candidate",
      OPENCODE_CONFIG: "/home/candidate/opencode.json",
      OPENCODE_CONFIG_DIR: "/home/candidate/.opencode",
      CLAUDE_CONFIG_DIR: "/home/candidate/.claude-work",
      CODEX_HOME: "/home/candidate/.codex",
      INTERVIEW_SENSEI_DATA_DIR: "/home/candidate/.interview-sensei",
    };
    const { launched, updates } = launch(await fakeRecipe(), idleTimer, candidate);

    const reply = await replyTo(await launched, updates, "/env");
    const names: unknown = JSON.parse(reply.replace(/^env: /u, ""));

    expect(names).toStrictEqual(
      expect.arrayContaining(["PATH", "ANTHROPIC_API_KEY", "CLAUDE_CONFIG_DIR"]),
    );
    for (const name of [
      "OPENCODE_CONFIG",
      "OPENCODE_CONFIG_DIR",
      "CODEX_HOME",
      "INTERVIEW_SENSEI_DATA_DIR",
    ]) {
      expect(names).not.toContain(name);
    }
  });
});
