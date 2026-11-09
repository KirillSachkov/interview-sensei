import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { Readable, Writable } from "node:stream";

// The unstable entry types the ACP `systemPrompt` of `session/new`, which the adapters accept.
import {
  client,
  ndJsonStream,
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk/unstable";
import type {
  ClientContext,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
} from "@agentclientprotocol/sdk/unstable";

import type { Timer } from "../../../shared/time/index.ts";
import { agentEnvironment } from "../domain/launch-recipe.ts";
import type { LaunchRecipe } from "../domain/launch-recipe.ts";
import type {
  AcpLauncher,
  AgentExit,
  LiveAgent,
  SessionRequest,
  TurnOutcome,
} from "../domain/ports.ts";
import { prepareRecipe } from "./prepare-recipe.ts";

const clientInfo = { name: "interview-sensei", version: "0.0.0" };

/** How long the agent may take to answer `initialize` and `session/new`. */
export const launchTimeoutMs = 60_000;
/** How long a stopped agent may take to exit after SIGTERM; then it gets SIGKILL. */
export const stopGraceMs = 5000;

type AgentProcess = ChildProcessByStdio<Writable, Readable, null>;

type Environment = Readonly<Record<string, string | undefined>>;

/** Spawns the agent; `exited` rejects only when the process could not start. */
function spawnAgent(
  recipe: LaunchRecipe,
  env: Environment,
): { child: AgentProcess; exited: Promise<AgentExit> } {
  const child = spawn(recipe.command, recipe.args, {
    cwd: recipe.cwd,
    env: agentEnvironment(env, recipe.env),
    // The agent's own diagnostics go to the server's log output.
    stdio: ["pipe", "pipe", "inherit"],
  });
  const exit = Promise.withResolvers<AgentExit>();
  child.once("error", exit.reject);
  child.once("close", (exitCode, signal) => {
    exit.resolve({ exitCode, signal });
  });
  return { child, exited: exit.promise };
}

async function stopProcess(child: AgentProcess, timer: Timer): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const closed = once(child, "close");
    child.kill("SIGTERM");
    const cancelKill = timer.after(stopGraceMs, () => {
      child.kill("SIGKILL");
    });
    try {
      await closed;
    } finally {
      cancelKill();
    }
  }
}

/**
 * Sets the recipe's mode, so the Candidate's own mode never applies; for OpenCode the mode is the
 * recipe's own agent. An agent that does not offer the mode does not start.
 */
async function setMode(
  agent: ClientContext,
  { session, mode }: { session: NewSessionResponse; mode: string | null },
): Promise<void> {
  if (mode === null) {
    return;
  }
  const offered = session.modes?.availableModes.some((available) => available.id === mode);
  if (offered !== true) {
    throw new Error(`The agent does not offer the mode ${mode}`);
  }
  await agent.request("session/set_mode", { sessionId: session.sessionId, modeId: mode });
}

/**
 * The role and the skill directories of the recipe in `session/new`. The role and the skill must
 * reach the agent, so an agent without the capabilities for them does not start.
 */
function profileFields(
  { systemPrompt, additionalDirectories }: LaunchRecipe,
  { agentCapabilities }: InitializeResponse,
): Pick<NewSessionRequest, "systemPrompt" | "additionalDirectories"> {
  const capabilities = agentCapabilities?.sessionCapabilities;
  if (systemPrompt !== null && (capabilities?.systemPrompt ?? null) === null) {
    throw new Error("The agent does not accept a system prompt");
  }
  if (additionalDirectories.length > 0 && (capabilities?.additionalDirectories ?? null) === null) {
    throw new Error("The agent does not accept additional directories");
  }
  return {
    ...(systemPrompt === null
      ? {}
      : { systemPrompt: { mode: "append", content: [{ type: "text", text: systemPrompt }] } }),
    ...(additionalDirectories.length === 0
      ? {}
      : { additionalDirectories: [...additionalDirectories] }),
  };
}

/** Opens the session with our MCP server; an agent without MCP over HTTP cannot have it. */
async function openAcpSession(
  agent: ClientContext,
  { recipe, mcpServer }: { recipe: LaunchRecipe; mcpServer: SessionRequest["mcpServer"] },
): Promise<string> {
  const initialized: InitializeResponse = await agent.request("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo,
  });
  if (initialized.agentCapabilities?.mcpCapabilities?.http !== true) {
    throw new Error("The agent does not support MCP over HTTP");
  }
  const session = await agent.request("session/new", {
    cwd: recipe.cwd,
    mcpServers: [{ type: "http", name: mcpServer.name, url: mcpServer.url, headers: [] }],
    ...profileFields(recipe, initialized),
    ...(recipe.sessionMeta === null ? {} : { _meta: { ...recipe.sessionMeta } }),
  });
  await setMode(agent, { session, mode: recipe.mode });
  return session.sessionId;
}

/**
 * Connects to the agent as the ACP client and opens one session. The connection lives until
 * `stopped` resolves or the agent's output ends; in the second case `connection` rejects after
 * the last message from the agent was dispatched.
 */
function connect(
  child: AgentProcess,
  { recipe, session }: { recipe: LaunchRecipe; session: SessionRequest },
  stopped: Promise<unknown>,
) {
  const opened = Promise.withResolvers<{ agent: ClientContext; acpSessionId: string }>();
  const app = client({ name: clientInfo.name })
    .onNotification("session/update", ({ params }) => {
      // Called in arrival order; the receiver queues its writes itself.
      session.onUpdate(params.update);
    })
    .onRequest("session/request_permission", async ({ params: { toolCall, options } }) => ({
      outcome: await session.onPermission({ toolCall, options }),
    }))
    .onRequest("*", ({ method }) => {
      // Files and terminals come with a later ticket (#24).
      throw RequestError.methodNotFound(method);
    });
  const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
  const connection = app.connectWith(stream, async (agent) => {
    const acpSessionId = await openAcpSession(agent, { recipe, mcpServer: session.mcpServer });
    opened.resolve({ agent, acpSessionId });
    await stopped;
  });
  return { opened: opened.promise, connection };
}

/** The server's stop of the agent: `stopping` ends the connection, then the process ends. */
function stopper(child: AgentProcess, timer: Timer) {
  const stopping = Promise.withResolvers<null>();
  let requested = false;
  return {
    stopping: stopping.promise,
    stopRequested: () => requested,
    stop: async () => {
      requested = true;
      stopping.resolve(null);
      await stopProcess(child, timer);
    },
  };
}

/** Calls `onExit` when the agent ends by itself, after its connection dispatched the last message. */
async function reportUnexpectedExit({
  connection,
  exited,
  stopRequested,
  onExit,
}: {
  connection: Promise<void>;
  exited: Promise<AgentExit>;
  /** Whether the server stopped the agent; that stop is not reported. */
  stopRequested: () => boolean;
  onExit: (exit: AgentExit) => void;
}): Promise<void> {
  const [, exit] = await Promise.allSettled([connection, exited]);
  if (!stopRequested() && exit.status === "fulfilled") {
    onExit(exit.value);
  }
}

async function failWhenClosed(connection: Promise<void>): Promise<never> {
  await connection;
  throw new Error("The agent closed the connection before the session opened");
}

/** Rejects when the agent has not opened the session in time; the returned function cancels it. */
function failAfterTimeout(timer: Timer): { timedOut: Promise<never>; cancel: () => void } {
  const timeout = Promise.withResolvers<never>();
  const cancel = timer.after(launchTimeoutMs, () => {
    timeout.reject(new Error(`The agent did not open a session in ${launchTimeoutMs / 1000} s`));
  });
  return { timedOut: timeout.promise, cancel };
}

async function failWhenExited(exited: Promise<AgentExit>): Promise<never> {
  const { exitCode, signal } = await exited;
  throw new Error(`The agent exited before the session opened: ${exitCode ?? signal}`);
}

/** A JSON-RPC error answer fails the turn; a closed connection rejects, as the process is gone. */
async function promptTurn(
  agent: ClientContext,
  acpSessionId: string,
  text: string,
): Promise<TurnOutcome> {
  try {
    const { stopReason } = await agent.request("session/prompt", {
      sessionId: acpSessionId,
      prompt: [{ type: "text", text }],
    });
    return { type: "ended", stopReason };
  } catch (error) {
    if (error instanceof RequestError) {
      return { type: "failed", message: error.message };
    }
    throw error;
  }
}

function liveAgent(
  { agent, acpSessionId }: { agent: ClientContext; acpSessionId: string },
  stop: () => Promise<void>,
): LiveAgent {
  return {
    acpSessionId,
    prompt: async (text) => promptTurn(agent, acpSessionId, text),
    cancel: async () => agent.notify("session/cancel", { sessionId: acpSessionId }),
    stop,
  };
}

/** Waits until the agent opens the session; stops the process when it fails or takes too long. */
async function openSession(
  { opened, connection, exited }: ReturnType<typeof connect> & { exited: Promise<AgentExit> },
  { stop, timer }: { stop: () => Promise<void>; timer: Timer },
): Promise<LiveAgent> {
  const { timedOut, cancel } = failAfterTimeout(timer);
  try {
    return liveAgent(
      await Promise.race([opened, failWhenClosed(connection), failWhenExited(exited), timedOut]),
      stop,
    );
  } catch (error) {
    await stop();
    throw error;
  } finally {
    cancel();
  }
}

/**
 * Prepares the recipe's files, starts the agent process by it, connects to it over stdio and
 * opens one session. The server owns the connection; the browser only sees what the server makes
 * of it. The timer bounds the launch and the wait for the process after SIGTERM. `env` is the
 * Candidate's environment; the agent gets it filtered, with the recipe's variables over it.
 */
export function acpLauncher({ timer, env }: { timer: Timer; env: Environment }): AcpLauncher {
  return async (recipe, session) => {
    await prepareRecipe(recipe);
    const { child, exited } = spawnAgent(recipe, env);
    const { stop, stopping, stopRequested } = stopper(child, timer);
    const { opened, connection } = connect(child, { recipe, session }, stopping);
    void reportUnexpectedExit({ connection, exited, stopRequested, onExit: session.onExit });
    return openSession({ opened, connection, exited }, { stop, timer });
  };
}
