// What AgentSessions reads of a session: its view and its token usage, from the live session or
// from the stored journal.
import type { SessionView } from "../domain/agent-session.ts";
import type { SessionRepository } from "../domain/ports.ts";
import type { SessionUsage } from "../domain/session-usage.ts";
import { sessionUsage } from "../domain/session-usage.ts";
import { replay } from "../domain/session-view.ts";
import type { LiveSession } from "./live-session.ts";

interface Reads {
  readonly live: ReadonlyMap<string, LiveSession>;
  readonly dependencies: { readonly repository: SessionRepository };
}

/** The live session's view, or the stored session's replayed journal. */
export async function view(
  { dependencies, live }: Reads,
  sessionId: string,
): Promise<SessionView | undefined> {
  const session = live.get(sessionId);
  if (session !== undefined) {
    return session.view;
  }
  const { repository } = dependencies;
  const stored = await repository.load(sessionId);
  return stored === undefined ? undefined : replay(stored, await repository.journal(sessionId));
}

/** The usage in the journal, after the entries a live session is still writing. */
export async function usageOf(
  { live, dependencies }: Reads,
  sessionId: string,
): Promise<SessionUsage | null> {
  await live.get(sessionId)?.written;
  return sessionUsage(await dependencies.repository.journal(sessionId));
}
