import { fastifyWebsocket } from "@fastify/websocket";
import { agentSessionsMigrations } from "@interview-sensei/core/agent-sessions";
import type { AgentSessions } from "@interview-sensei/core/agent-sessions";
import { checkHealth } from "@interview-sensei/core/health";
import { openStorage } from "@interview-sensei/core/storage";
import type { UserEnvironment } from "@interview-sensei/core/agent-runtime";
import type { SliceMigrations, Storage } from "@interview-sensei/core/storage";
import type { Clock, Timer } from "@interview-sensei/core/time";
import { fastify } from "fastify";
import type { FastifyInstance } from "fastify";

import { registerAgentSessionRoutes } from "./agent-session-routes.ts";
import { composeAgentSessions } from "./compose-agent-sessions.ts";
import { registerWebApp } from "./web-app.ts";

/**
 * The migrations of every core slice that stores data, applied at each start in this order. A
 * slice exports its SliceMigrations from its index.ts; add it here.
 */
const sliceMigrations: readonly SliceMigrations[] = [agentSessionsMigrations];

/** `info` logs every request; `warn` keeps only problems. */
export type LogLevel = "info" | "warn";

export interface ServerDependencies {
  clock: Clock;
  timer: Timer;
  /** The data directory this server owns; see resolveDataDirectory. */
  dataDirectory: string;
  /** The lowest level of the Fastify JSON logs; no logs when omitted, as in tests. */
  logLevel?: LogLevel;
  /**
   * Offers only the fake ACP agent, for tests and manual checks without a subscription. Tests
   * never start a real agent: they need subscriptions.
   */
  fakeAgent?: boolean;
  /**
   * The Candidate's home and env, where the server looks for Claude Code, Codex and OpenCode and
   * their logins. Without it the server offers no real agent.
   */
  userEnvironment?: UserEnvironment;
  /** The built web app to serve beside `/api`; `pnpm dev` serves the web app from Vite instead. */
  webDirectory?: string;
}

/** Ends sessions of the last run and registers the shutdown order and the WebSocket plugin. */
async function prepare(server: FastifyInstance, storage: Storage, sessions: AgentSessions) {
  // Agents stop and their sessions end before the final dump closes the database.
  server.addHook("onClose", async () => {
    try {
      await sessions.close();
    } finally {
      await storage.close();
    }
  });
  try {
    await sessions.endInterrupted();
    await server.register(fastifyWebsocket);
  } catch (error) {
    await storage.close();
    throw error;
  }
}

/**
 * Opens the data directory and builds the HTTP server without listening, so tests call it in
 * process. Closing the server stops the agents, then closes the storage: a final dump, then the
 * lock is released. Rejects with DataDirectoryInUseError when another server holds the data
 * directory.
 */
export async function buildServer({
  clock,
  timer,
  dataDirectory,
  logLevel,
  fakeAgent = false,
  userEnvironment,
  webDirectory,
}: ServerDependencies): Promise<FastifyInstance> {
  const server = fastify({ logger: logLevel === undefined ? false : { level: logLevel } });
  const storage = await openStorage({
    dataDirectory,
    clock,
    timer,
    migrations: sliceMigrations,
    onDumpFailed: (error) => {
      server.log.error({ err: error }, "The periodic database dump failed");
    },
  });
  const { runtime, sessions } = composeAgentSessions(server, storage, {
    clock,
    timer,
    dataDirectory,
    fakeAgent,
    userEnvironment,
  });
  await prepare(server, storage, sessions);
  server.get("/api/health", () => checkHealth(clock));
  registerAgentSessionRoutes(server, {
    runtime,
    sessions,
    onError: (error) => {
      server.log.error({ err: error }, "A session command from the browser failed");
    },
  });
  if (webDirectory !== undefined) {
    await registerWebApp(server, webDirectory);
  }
  return server;
}
