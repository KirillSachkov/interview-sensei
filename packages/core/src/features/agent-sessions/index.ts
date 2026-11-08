import path from "node:path";

import type { SliceMigrations } from "../../shared/storage/index.ts";

export { createAgentSessions } from "./application/agent-sessions.ts";
export type { AgentSessions, PromptOutcome } from "./application/agent-sessions.ts";
export { sessionKinds } from "./domain/agent-session.ts";
export type { AgentSession, SessionKind, SessionView } from "./domain/agent-session.ts";
export type { AgentLauncher } from "./domain/ports.ts";
export { drizzleSessionRepository } from "./infrastructure/drizzle-session-repository.ts";

/** The drizzle-kit migrations of the `agent_sessions` schema. */
export const agentSessionsMigrations: SliceMigrations = {
  schema: "agent_sessions",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};
