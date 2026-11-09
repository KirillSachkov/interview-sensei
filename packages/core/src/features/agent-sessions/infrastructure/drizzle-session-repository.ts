import { asc, desc, eq } from "drizzle-orm";

import type { Database } from "../../../shared/storage/index.ts";
import type { AgentSession } from "../domain/agent-session.ts";
import type { SessionRepository } from "../domain/ports.ts";
import type { RecordedEvent } from "../domain/session-event.ts";
import { events, sessions } from "./schema.ts";

type Entry = Parameters<SessionRepository["append"]>[0];

function toSession(row: typeof sessions.$inferSelect): AgentSession {
  return {
    id: row.id,
    kind: row.kind,
    agent: row.agent,
    ...(row.targetId === null ? {} : { targetId: row.targetId }),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

async function create(
  database: Database,
  { kind, agent, targetId, createdAt }: Parameters<SessionRepository["create"]>[0],
): Promise<AgentSession> {
  const [row] = await database
    .insert(sessions)
    .values({
      kind,
      agent,
      ...(targetId === undefined ? {} : { targetId }),
      status: "starting",
      createdAt,
    })
    .returning();
  if (row === undefined) {
    throw new Error("The new session row was not returned");
  }
  return toSession(row);
}

async function append(
  database: Database,
  { sessionId, event, status, recordedAt }: Entry,
): Promise<RecordedEvent> {
  return database.transaction(async (transaction) => {
    const [row] = await transaction
      .insert(events)
      .values({ sessionId, event, recordedAt })
      .returning({ id: events.id });
    if (row === undefined) {
      throw new Error("The new event row was not returned");
    }
    const acpSessionId =
      event.type === "session_started" ? { acpSessionId: event.acpSessionId } : {};
    await transaction
      .update(sessions)
      .set({ status, ...acpSessionId })
      .where(eq(sessions.id, sessionId));
    return { id: row.id, event };
  });
}

async function load(database: Database, sessionId: string): Promise<AgentSession | undefined> {
  const [row] = await database.select().from(sessions).where(eq(sessions.id, sessionId));
  return row === undefined ? undefined : toSession(row);
}

async function list(database: Database): Promise<readonly AgentSession[]> {
  const rows = await database.select().from(sessions).orderBy(desc(sessions.createdAt));
  return rows.map((row) => toSession(row));
}

async function journal(database: Database, sessionId: string): Promise<readonly RecordedEvent[]> {
  return database
    .select({ id: events.id, event: events.event })
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .orderBy(asc(events.id));
}

/** Sessions and journals in the `agent_sessions` Postgres schema. */
export function drizzleSessionRepository(database: Database): SessionRepository {
  return {
    create: async (session) => create(database, session),
    append: async (entry) => append(database, entry),
    load: async (sessionId) => load(database, sessionId),
    list: async () => list(database),
    journal: async (sessionId) => journal(database, sessionId),
  };
}
