import path from "node:path";

import { fastifyWebsocket } from "@fastify/websocket";
import {
  createAgentRuntime,
  launchAcpAgent,
  localInstallation,
} from "@interview-sensei/core/agent-runtime";
import {
  agentSessionsMigrations,
  createAgentSessions,
  drizzleSessionRepository,
} from "@interview-sensei/core/agent-sessions";
import type { AgentSessions } from "@interview-sensei/core/agent-sessions";
import { checkHealth } from "@interview-sensei/core/health";
import { openStorage } from "@interview-sensei/core/storage";
import type { SliceMigrations, Storage } from "@interview-sensei/core/storage";
import type { Clock, Timer } from "@interview-sensei/core/time";
import { fastify } from "fastify";
import type { FastifyInstance } from "fastify";

import { registerAgentSessionRoutes } from "./agent-session-routes.ts";

/**
 * The migrations of every core slice that stores data, applied at each start in this order. A
 * slice exports its SliceMigrations from its index.ts; add it here.
 */
const sliceMigrations: readonly SliceMigrations[] = [agentSessionsMigrations];

export interface ServerDependencies {
  clock: Clock;
  timer: Timer;
  /** The data directory this server owns; see resolveDataDirectory. */
  dataDirectory: string;
  /** Fastify request logging; off in tests. */
  logger?: boolean;
  /** Offers the fake ACP agent, for tests and manual checks without a subscription. */
  fakeAgent?: boolean;
}

/** The agents and AgentSessions of this server, on its storage. */
function composeAgentSessions(
  server: FastifyInstance,
  storage: Storage,
  {
    clock,
    dataDirectory,
    fakeAgent,
  }: Pick<ServerDependencies, "clock" | "dataDirectory" | "fakeAgent">,
) {
  const runtime = createAgentRuntime({
    agents: fakeAgent === true ? ["fake"] : [],
    installation: localInstallation(),
    launch: launchAcpAgent,
  });
  const sessions = createAgentSessions({
    repository: drizzleSessionRepository(storage.database),
    launcher: runtime,
    clock,
    sessionsDirectory: path.join(dataDirectory, "sessions"),
    onError: (error) => {
      server.log.error({ err: error }, "An agent session failed in the background");
    },
  });
  return { runtime, sessions };
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
  logger = false,
  fakeAgent = false,
}: ServerDependencies): Promise<FastifyInstance> {
  const server = fastify({ logger });
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
    dataDirectory,
    fakeAgent,
  });
  await prepare(server, storage, sessions);
  server.get("/api/health", () => checkHealth(clock));
  registerAgentSessionRoutes(server, { runtime, sessions });
  return server;
}
