import path from "node:path";

import type { Database, Transaction } from "../../shared/storage/index.ts";
import type { Clock } from "../../shared/time/index.ts";
import { createAgentSessions } from "./application/agent-sessions.ts";
import type { AgentSessions } from "./application/agent-sessions.ts";
import type { AgentLauncher, McpAddresses, SessionErasure } from "./domain/ports.ts";
import { drizzleSessionRepository } from "./infrastructure/drizzle-session-repository.ts";

export interface AgentSessionsModuleDependencies {
  /** The server's database, migrated with agentSessionsMigrations. */
  readonly database: Database;
  /** Starts agents: the agent-runtime module. */
  readonly launcher: AgentLauncher;
  /** Gives each session its MCP address: the mcp-gateway module. */
  readonly mcp: McpAddresses;
  readonly clock: Clock;
  /** The data directory; each session works in its own directory under `sessions/` in it. */
  readonly dataDirectory: string;
  /** Receives errors of background work, such as a failed journal write. */
  readonly onError: (error: unknown) => void;
}

/**
 * AgentSessions on the server's database, with a journal of each session's events. Deleting a
 * Target erases its sessions with `eraseTarget`.
 */
export function agentSessionsModule({
  database,
  launcher,
  mcp,
  clock,
  dataDirectory,
  onError,
}: AgentSessionsModuleDependencies): AgentSessions & SessionErasure<Transaction> {
  const repository = drizzleSessionRepository(database);
  const sessions = createAgentSessions({
    repository,
    launcher,
    clock,
    mcp,
    sessionsDirectory: path.join(dataDirectory, "sessions"),
    onError,
  });
  return { ...sessions, eraseTarget: repository.eraseTarget };
}
