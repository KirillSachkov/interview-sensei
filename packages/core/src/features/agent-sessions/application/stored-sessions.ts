// What AgentSessions read and fix in storage: the view of a session that is no longer live, with the
// chat of the sessions it continues, its token usage, and the sessions that were live when the server last stopped.
import type { SessionKind } from "../../../shared/session-kinds/index.ts";
import type { Clock } from "../../../shared/time/index.ts";
import type { SessionView } from "../domain/agent-session.ts";
import { isLive } from "../domain/agent-session.ts";
import type { SessionRepository } from "../domain/ports.ts";
import { sessionUsage } from "../domain/session-usage.ts";
import type { SessionUsage } from "../domain/session-usage.ts";
import { conversationOf, replay } from "../domain/session-view.ts";
import type { ConversationMessage } from "../domain/session-view.ts";
import type { LiveSession } from "./live-session.ts";

/**
 * The session's view: the live one, or the stored one replayed from its journal. A session that
 * continues another one starts with that one's chat, so the chat holds every session of the
 * conversation in order.
 */
export async function sessionView(
  live: ReadonlyMap<string, LiveSession>,
  repository: SessionRepository,
  sessionId: string,
): Promise<SessionView | undefined> {
  const session = live.get(sessionId);
  if (session !== undefined) {
    return session.view;
  }
  const stored = await repository.load(sessionId);
  if (stored === undefined) {
    return undefined;
  }
  const earlier =
    stored.continuesSessionId === undefined
      ? undefined
      : await sessionView(live, repository, stored.continuesSessionId);
  return replay(stored, await repository.journal(sessionId), earlier?.entries);
}

/** The session, live or stored; undefined for an unknown id. */
async function sessionOf(
  live: ReadonlyMap<string, LiveSession>,
  repository: SessionRepository,
  sessionId: string,
) {
  return live.get(sessionId)?.view ?? (await repository.load(sessionId));
}

/**
 * The Candidate's and the agent's messages of the sessions this one continues, in order; empty
 * when it continues none.
 */
export async function earlierMessages(
  live: ReadonlyMap<string, LiveSession>,
  repository: SessionRepository,
  sessionId: string,
): Promise<ConversationMessage[]> {
  const session = await sessionOf(live, repository, sessionId);
  const earlierId = session?.continuesSessionId;
  const earlier =
    earlierId === undefined ? undefined : await sessionView(live, repository, earlierId);
  return conversationOf(earlier?.entries ?? []);
}

/** The ids of the session and of the earlier sessions it continues, the latest first. */
export async function chainOf(
  live: ReadonlyMap<string, LiveSession>,
  repository: SessionRepository,
  sessionId: string,
): Promise<string[]> {
  const session = await sessionOf(live, repository, sessionId);
  if (session === undefined) {
    return [sessionId];
  }
  const earlier =
    session.continuesSessionId === undefined
      ? []
      : await chainOf(live, repository, session.continuesSessionId);
  return [sessionId, ...earlier];
}

/**
 * The last conversation of a kind for a Target: its newest session that no later session
 * continues, such as the Target setup after a restart (#85).
 */
export interface LastConversation {
  readonly sessionId: string;
  /** Whether the Candidate ended it, as with «Завершить», rather than the server or a failure. */
  readonly endedByCandidate: boolean;
  /** The Candidate's and the agent's messages of its chat, with those of the sessions it continues. */
  readonly messages: readonly ConversationMessage[];
}

/** The kind's last conversation for the Target; undefined when the Target has no such session. */
export async function lastConversation(
  live: ReadonlyMap<string, LiveSession>,
  repository: SessionRepository,
  { kind, targetId }: { kind: SessionKind; targetId: string },
): Promise<LastConversation | undefined> {
  const all = await repository.list();
  const sessions = all.filter((session) => session.kind === kind && session.targetId === targetId);
  const continued = new Set(sessions.map((session) => session.continuesSessionId));
  const last = sessions.find((session) => !continued.has(session.id));
  if (last === undefined) {
    return undefined;
  }
  const [journal, view] = await Promise.all([
    repository.journal(last.id),
    sessionView(live, repository, last.id),
  ]);
  return {
    sessionId: last.id,
    endedByCandidate: journal.some(
      ({ event }) => event.type === "session_ended" && event.by === "candidate",
    ),
    messages: conversationOf(view?.entries ?? []),
  };
}

/** Marks sessions that were live when the server last stopped as ended. */
export async function endInterrupted({
  repository,
  clock,
}: {
  repository: SessionRepository;
  clock: Clock;
}): Promise<void> {
  const sessions = await repository.list();
  const interrupted = sessions.filter((session) => isLive(session.status));
  await Promise.all(
    interrupted.map(async (session) =>
      repository.append({
        sessionId: session.id,
        event: { type: "session_ended" },
        status: "ended",
        recordedAt: clock.now(),
      }),
    ),
  );
}

/** The token usage in the session's journal, after the entries a live session is still writing. */
export async function usageOf(
  live: ReadonlyMap<string, LiveSession>,
  repository: SessionRepository,
  sessionId: string,
): Promise<SessionUsage | null> {
  await live.get(sessionId)?.written;
  return sessionUsage(await repository.journal(sessionId));
}
