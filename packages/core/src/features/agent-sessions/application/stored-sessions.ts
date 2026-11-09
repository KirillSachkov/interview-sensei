// What AgentSessions read and fix in storage: the view of a session that is no longer live, with the
// chat of the sessions it continues, and the sessions that were live when the server last stopped.
import type { Clock } from "../../../shared/time/index.ts";
import type { SessionView } from "../domain/agent-session.ts";
import { isLive } from "../domain/agent-session.ts";
import type { SessionRepository } from "../domain/ports.ts";
import { replay } from "../domain/session-view.ts";
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
