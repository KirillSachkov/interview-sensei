// The only server module that imports core features (`server-composes-features-in-one-module`).
// Each feature gives one module factory that hides its infrastructure; this module calls each
// factory once and hands the routes finished services. Routes take the types they need from here.
import { agentRuntimeModule } from "@interview-sensei/core/agent-runtime";
import type { UserEnvironment } from "@interview-sensei/core/agent-runtime";
import {
  agentSessionsMigrations,
  agentSessionsModule,
} from "@interview-sensei/core/agent-sessions";
import { checkHealth } from "@interview-sensei/core/health";
import { getBrief, mcpGatewayModule } from "@interview-sensei/core/mcp-gateway";
import type { SessionTool } from "@interview-sensei/core/mcp-gateway";
import type { SessionKind } from "@interview-sensei/core/session-kinds";
import { openStorage } from "@interview-sensei/core/storage";
import type { SliceMigrations } from "@interview-sensei/core/storage";
import type { Clock, Timer } from "@interview-sensei/core/time";
import type { FastifyBaseLogger } from "fastify";

export type { AgentRuntime, UserEnvironment } from "@interview-sensei/core/agent-runtime";
export { SessionsClosedError } from "@interview-sensei/core/agent-sessions";
export type { AgentSessions, SessionView } from "@interview-sensei/core/agent-sessions";
export { mcpRoute } from "@interview-sensei/core/mcp-gateway";
export type { McpGateway } from "@interview-sensei/core/mcp-gateway";

/**
 * The migrations of every core slice that stores data, applied at each start in this order. A
 * slice exports its SliceMigrations from its index.ts; add it here.
 */
const sliceMigrations: readonly SliceMigrations[] = [agentSessionsMigrations];

/**
 * The MCP tool set of each session kind. A slice exports its tools from its index.ts; add them to
 * the kinds that need them. It compiles only while every session kind has an entry.
 */
const sessionTools: Readonly<Record<SessionKind, readonly SessionTool[]>> = {
  "service-chat": [getBrief],
};

export interface FeatureDependencies {
  clock: Clock;
  timer: Timer;
  /** The data directory this server owns; see resolveDataDirectory. */
  dataDirectory: string;
  /** Offers only the fake ACP agent; see ServerDependencies. */
  fakeAgent: boolean;
  /** The Candidate's home and env; see ServerDependencies. */
  userEnvironment: UserEnvironment | undefined;
  /** The server's own loopback origin for the MCP addresses; throws before it listens. */
  origin: () => string;
  /** Receives the failures of background work. */
  log: FastifyBaseLogger;
}

/**
 * Opens the storage on the data directory and composes every core feature on it. Rejects with
 * DataDirectoryInUseError when another server holds the data directory.
 */
export async function composeFeatures({
  clock,
  timer,
  dataDirectory,
  fakeAgent,
  userEnvironment,
  origin,
  log,
}: FeatureDependencies) {
  const storage = await openStorage({
    dataDirectory,
    clock,
    timer,
    migrations: sliceMigrations,
    onDumpFailed: (error) => {
      log.error({ err: error }, "The periodic database dump failed");
    },
  });
  const runtime = agentRuntimeModule({ timer, dataDirectory, fakeAgent, userEnvironment });
  const mcp = mcpGatewayModule({
    tools: sessionTools,
    origin,
    onError: (error) => {
      log.warn({ err: error }, "An MCP request failed");
    },
  });
  const sessions = agentSessionsModule({
    database: storage.database,
    launcher: runtime,
    mcp,
    clock,
    dataDirectory,
    onError: (error) => {
      log.error({ err: error }, "An agent session failed in the background");
    },
  });
  return { storage, runtime, mcp, sessions, health: () => checkHealth(clock) };
}

/** The composed services that the routes and the server lifecycle receive. */
export type Features = Awaited<ReturnType<typeof composeFeatures>>;
