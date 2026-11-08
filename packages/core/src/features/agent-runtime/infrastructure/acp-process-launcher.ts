import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { Readable, Writable } from "node:stream";

import { client, ndJsonStream, PROTOCOL_VERSION, RequestError } from "@agentclientprotocol/sdk";
import type { ClientContext } from "@agentclientprotocol/sdk";

import type { LaunchRecipe } from "../domain/agent.ts";
import type {
  AcpLauncher,
  AgentExit,
  AgentUpdate,
  LiveAgent,
  TurnOutcome,
} from "../domain/ports.ts";

const clientInfo = { name: "interview-sensei", version: "0.0.0" };

type AgentProcess = ChildProcessByStdio<Writable, Readable, null>;

/** Spawns the agent; `exited` rejects only when the process could not start. */
function spawnAgent(recipe: LaunchRecipe): { child: AgentProcess; exited: Promise<AgentExit> } {
  const child = spawn(recipe.command, recipe.args, {
    cwd: recipe.cwd,
    env: { ...process.env, ...recipe.env },
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

async function stopProcess(child: AgentProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const closed = once(child, "close");
    child.kill("SIGTERM");
    await closed;
  }
}

/**
 * Connects to the agent as the ACP client and opens one session. The connection lives until
 * `stopped` resolves or the agent's output ends; in the second case `connection` rejects after
 * the last message from the agent was dispatched.
 */
function connect(
  child: AgentProcess,
  { cwd, onUpdate }: { cwd: string; onUpdate: (update: AgentUpdate) => void },
  stopped: Promise<unknown>,
) {
  const opened = Promise.withResolvers<{ agent: ClientContext; acpSessionId: string }>();
  const app = client({ name: clientInfo.name })
    .onNotification("session/update", ({ params }) => {
      // Called in arrival order; the receiver queues its writes itself.
      onUpdate(params.update);
    })
    .onRequest("*", ({ method }) => {
      // Permissions, files and terminals come with later tickets (#23, #24).
      throw RequestError.methodNotFound(method);
    });
  const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
  const connection = app.connectWith(stream, async (agent) => {
    await agent.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo,
    });
    const session = await agent.request("session/new", { cwd, mcpServers: [] });
    opened.resolve({ agent, acpSessionId: session.sessionId });
    await stopped;
  });
  return { opened: opened.promise, connection };
}

/** The server's stop of the agent: `stopping` ends the connection, then the process ends. */
function stopper(child: AgentProcess) {
  const stopping = Promise.withResolvers<null>();
  let requested = false;
  return {
    stopping: stopping.promise,
    stopRequested: () => requested,
    stop: async () => {
      requested = true;
      stopping.resolve(null);
      await stopProcess(child);
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

/**
 * Starts the agent process by the recipe, connects to it over stdio and opens one session. The
 * server owns the connection; the browser only sees what the server makes of it.
 */
export const launchAcpAgent: AcpLauncher = async (recipe, { onUpdate, onExit }) => {
  await mkdir(recipe.cwd, { recursive: true, mode: 0o700 });
  const { child, exited } = spawnAgent(recipe);
  const { stop, stopping, stopRequested } = stopper(child);
  const { opened, connection } = connect(child, { cwd: recipe.cwd, onUpdate }, stopping);
  void reportUnexpectedExit({ connection, exited, stopRequested, onExit });
  try {
    return liveAgent(
      await Promise.race([opened, failWhenClosed(connection), failWhenExited(exited)]),
      stop,
    );
  } catch (error) {
    await stop();
    throw error;
  }
};
