import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { SessionStatus } from "../domain/agent-session.ts";
import type { SessionEvent } from "../domain/session-event.ts";

/** The Postgres schema that the agent-sessions slice owns. */
export const agentSessionsSchema = pgSchema("agent_sessions");

/** One AgentSession: its kind, agent, ACP session id and status. */
export const sessions = agentSessionsSchema.table("sessions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  kind: text("kind").notNull(),
  agent: text("agent").notNull(),
  targetId: uuid("target_id"),
  acpSessionId: text("acp_session_id"),
  status: text("status").$type<SessionStatus>().notNull(),
  /** The earlier session that this one continues, such as a Mock interview after a pause. */
  continuesSessionId: uuid("continues_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
});

/** The event journal of every AgentSession, in the order the server recorded the events. */
export const events = agentSessionsSchema.table(
  "events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    event: jsonb("event").$type<SessionEvent>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("events_session_id_idx").on(table.sessionId, table.id)],
);
