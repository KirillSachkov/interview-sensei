// A part of composition.ts (`server-composes-features-in-one-module`): the agents, their MCP
// addresses and their AgentSessions. Only composition.ts imports this module.
import { agentRuntimeModule } from "@interview-sensei/core/agent-runtime";
import type { UserEnvironment } from "@interview-sensei/core/agent-runtime";
import { agentSessionsModule } from "@interview-sensei/core/agent-sessions";
import { mcpGatewayModule } from "@interview-sensei/core/mcp-gateway";
import type { Storage } from "@interview-sensei/core/storage";
import type { Clock, Timer } from "@interview-sensei/core/time";

export type { AgentRuntime, UserEnvironment } from "@interview-sensei/core/agent-runtime";
export type { Clock, Timer } from "@interview-sensei/core/time";
export { opencodeLoginModule } from "@interview-sensei/core/agent-runtime";
export {
  agentSessionsMigrations,
  SessionsClosedError,
} from "@interview-sensei/core/agent-sessions";
export type { AgentSessions, SessionView } from "@interview-sensei/core/agent-sessions";
export { getBrief, mcpGatewayModule, mcpRoute } from "@interview-sensei/core/mcp-gateway";
export type { McpGateway } from "@interview-sensei/core/mcp-gateway";

/** The MCP tool set of each session kind, as the gateway takes it. */
export type SessionToolSets = Parameters<typeof mcpGatewayModule>[0]["tools"];

/** What the features write to the server's logger. */
export interface ServerLog {
  readonly info: (details: object, message: string) => void;
  readonly warn: (details: object | string, message?: string) => void;
  readonly error: (details: object, message: string) => void;
}

/** What the server gives the features; composition.ts names it FeatureDependencies. */
export interface AgentDependencies {
  clock: Clock;
  timer: Timer;
  /** The data directory this server owns; see resolveDataDirectory. */
  dataDirectory: string;
  /** The application's skills for the agents; see ServerDependencies. */
  skillsDirectory: string;
  /** Offers only the fake ACP agent; see ServerDependencies. */
  fakeAgent: boolean;
  /** The Candidate's home and env; see ServerDependencies. */
  userEnvironment: UserEnvironment | undefined;
  /** The server's own loopback origin for the MCP addresses; throws before it listens. */
  origin: () => string;
  /** Receives the failures of background work: the server's logger. */
  log: ServerLog;
}

/** The agents that the Candidate can run. */
export function composeRuntime(dependencies: AgentDependencies) {
  const { log } = dependencies;
  return agentRuntimeModule({ ...dependencies, onWarning: (message) => log.warn(message) });
}

/** The MCP addresses with the tool set of each kind, and the AgentSessions that use them. */
export function composeSessions(
  storage: Storage,
  {
    runtime,
    tools,
    clock,
    dataDirectory,
    origin,
    log,
  }: Pick<AgentDependencies, "clock" | "dataDirectory" | "origin" | "log"> & {
    runtime: ReturnType<typeof composeRuntime>;
    tools: SessionToolSets;
  },
) {
  const mcp = mcpGatewayModule({
    tools,
    origin,
    onError: (error) => log.warn({ err: error }, "An MCP request failed"),
  });
  const sessions = agentSessionsModule({
    database: storage.database,
    launcher: runtime,
    mcp,
    clock,
    dataDirectory,
    onError: (error) => log.error({ err: error }, "An agent session failed in the background"),
  });
  return { mcp, sessions };
}
