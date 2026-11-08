// Unit tests of how AgentSessions closes while a session starts (#24): no agent may outlive the
// server, and nothing may write after close. The repository, launcher and MCP addresses are
// in-memory stand-ins for the ports; the test decides when each step finishes.
import { describe, expect, it } from "vitest";

import { createAgentSessions, SessionsClosedError } from "./application/agent-sessions.ts";
import type { AgentSessions } from "./application/agent-sessions.ts";
import type { AgentSession, SessionStatus } from "./domain/agent-session.ts";
import type { AgentLauncher, LiveAgent, SessionRepository } from "./domain/ports.ts";
import type { RecordedEvent } from "./domain/session-event.ts";

const createdAt = new Date("2026-01-02T03:04:05.000Z");

/** The storage under the repository; a call after `closed` rejects, as on closed PGlite. */
interface Storage {
  closed: boolean;
  readonly sessions: Map<string, AgentSession>;
  readonly journals: Map<string, RecordedEvent[]>;
}

function assertOpen(storage: Storage): void {
  if (storage.closed) {
    throw new Error("The storage is closed");
  }
}

/** A repository in memory; `created` gates `create`. */
function memoryRepository(created: Promise<null> = Promise.resolve(null)) {
  const storage: Storage = { closed: false, sessions: new Map(), journals: new Map() };
  const { sessions, journals } = storage;
  const repository: SessionRepository = {
    create: async ({ kind, agent }) => {
      await created;
      assertOpen(storage);
      const id = `session-${sessions.size + 1}`;
      const session: AgentSession = {
        id,
        kind,
        agent,
        status: "starting",
        createdAt: createdAt.toISOString(),
      };
      sessions.set(id, session);
      journals.set(id, []);
      return session;
    },
    append: ({ sessionId, event, status }) => {
      assertOpen(storage);
      const journal = journals.get(sessionId) ?? [];
      const recorded = { id: journal.length + 1, event };
      journal.push(recorded);
      const session = sessions.get(sessionId);
      if (session !== undefined) {
        sessions.set(sessionId, { ...session, status });
      }
      return Promise.resolve(recorded);
    },
    load: (sessionId) => Promise.resolve(sessions.get(sessionId)),
    list: () => Promise.resolve([...sessions.values()]),
    journal: (sessionId) => Promise.resolve(journals.get(sessionId) ?? []),
  };
  const statuses = (): SessionStatus[] => [...sessions.values()].map((session) => session.status);
  return { repository, storage, statuses };
}

/** A launcher whose agents the test counts; `started` gates each start. */
function countingLauncher(started: Promise<null> = Promise.resolve(null)) {
  const counts = { started: 0, stopped: 0 };
  const agent: LiveAgent = {
    acpSessionId: "acp-1",
    prompt: () => Promise.resolve({ type: "ended", stopReason: "end_turn" }),
    cancel: async () => {},
    stop: () => {
      counts.stopped += 1;
      return Promise.resolve();
    },
  };
  const launcher: AgentLauncher = {
    start: async () => {
      await started;
      counts.started += 1;
      return agent;
    },
  };
  return { launcher, counts };
}

function sessionsOn(repository: SessionRepository, launcher: AgentLauncher) {
  const errors: unknown[] = [];
  const sessions = createAgentSessions({
    repository,
    launcher,
    clock: { now: () => createdAt },
    mcp: {
      open: () => ({ name: "interview-sensei-1a2b", url: "http://127.0.0.1:4310/mcp/token" }),
      close: async () => {},
    },
    sessionsDirectory: "/home/candidate/.interview-sensei/sessions",
    onError: (error) => {
      errors.push(error);
    },
  });
  return { sessions, errors };
}

/** Closes the sessions, then the storage, as the server does on shutdown. */
async function shutDown(sessions: AgentSessions, storage: Storage): Promise<void> {
  await sessions.close();
  storage.closed = true;
}

const request = { kind: "service-chat", agent: "fake" } as const;

describe("closing agent sessions", () => {
  it("refuses a new session once close has begun", async () => {
    const { repository, storage, statuses } = memoryRepository();
    const { launcher, counts } = countingLauncher();
    const { sessions } = sessionsOn(repository, launcher);

    const closing = shutDown(sessions, storage);

    await expect(sessions.start(request)).rejects.toThrow(SessionsClosedError);
    await closing;
    expect(statuses()).toStrictEqual([]);
    expect(counts.started).toBe(0);
  });

  it("ends a session that was being created when close began, without starting its agent", async () => {
    const created = Promise.withResolvers<null>();
    const { repository, storage, statuses } = memoryRepository(created.promise);
    const { launcher, counts } = countingLauncher();
    const { sessions, errors } = sessionsOn(repository, launcher);

    const starting = sessions.start(request);
    const closing = shutDown(sessions, storage);
    created.resolve(null);

    await expect(starting).rejects.toThrow(SessionsClosedError);
    await closing;
    expect({ statuses: statuses(), started: counts.started, errors }).toStrictEqual({
      statuses: ["ended"],
      started: 0,
      errors: [],
    });
  });

  it("stops an agent that was starting when close began and ends its session", async () => {
    const started = Promise.withResolvers<null>();
    const { repository, storage, statuses } = memoryRepository();
    const { launcher, counts } = countingLauncher(started.promise);
    const { sessions, errors } = sessionsOn(repository, launcher);

    await sessions.start(request);
    const closing = shutDown(sessions, storage);
    started.resolve(null);
    await closing;

    expect({ ...counts, statuses: statuses(), errors }).toStrictEqual({
      started: 1,
      stopped: 1,
      statuses: ["ended"],
      errors: [],
    });
  });
});
