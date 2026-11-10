import type { SessionKind } from "../../../shared/session-kinds/index.ts";
import type { SessionView } from "../domain/agent-session.ts";
import { isLive } from "../domain/agent-session.ts";
import { end } from "./live-session.ts";
import type { LiveSession } from "./live-session.ts";

/**
 * A new session: its kind, its agent, its Target, the addition to the role of the kind's profile,
 * and the server's first prompt.
 */
export interface StartRequest {
  readonly kind: SessionKind;
  readonly agent: string;
  readonly targetId?: string | null;
  /** Goes after the role of the kind's profile in the agent's system prompt. */
  readonly roleAddition?: string;
  /** Sent to the agent once it starts, so it speaks first; the chat does not show it. */
  readonly opening?: string;
  /**
   * The earlier session, no longer live, that the new one continues with a new agent process,
   * such as a Mock interview after a pause. Its chat comes first in the new session's chat; the
   * agent gets none of it, so the caller tells the agent where the conversation stopped.
   */
  readonly continues?: string;
}

/** The kind and Target that have at most one live session. */
export interface OpenKey {
  readonly kind: SessionKind;
  readonly targetId: string;
}

/**
 * Describes the new session when the kind and Target have no live one; `continues` is the earlier
 * session it goes on with, as `StartRequest.continues`.
 */
type Prepare = () => Promise<Pick<StartRequest, "agent" | "opening" | "continues">>;

export type OpenSession = (
  key: OpenKey,
  prepare: Prepare,
) => Promise<{ session: SessionView; created: boolean }>;

interface OpenerDependencies {
  readonly live: ReadonlyMap<string, LiveSession>;
  readonly start: (request: StartRequest) => Promise<SessionView>;
}

async function openNow({ live, start }: OpenerDependencies, key: OpenKey, prepare: Prepare) {
  const running = [...live.values()].find(
    (session) =>
      session.view.kind === key.kind &&
      session.view.targetId === key.targetId &&
      isLive(session.view.status),
  );
  if (running !== undefined) {
    return { session: running.view, created: false };
  }
  const { agent, opening, continues } = await prepare();
  const request = {
    ...key,
    agent,
    ...(opening === undefined ? {} : { opening }),
    ...(continues === undefined ? {} : { continues }),
  };
  return { session: await start(request), created: true };
}

/** The live sessions of the Target; with `kind`, only those of that kind. */
function liveOf(
  live: ReadonlyMap<string, LiveSession>,
  targetId: string,
  kind?: SessionKind,
): LiveSession[] {
  return [...live.values()].filter(
    (session) =>
      session.view.targetId === targetId &&
      isLive(session.view.status) &&
      (kind === undefined || session.view.kind === kind),
  );
}

/** Whether a live session of the Target runs now, of any kind but `except`. */
export function runningFor(
  live: ReadonlyMap<string, LiveSession>,
  targetId: string,
  except?: SessionKind,
): boolean {
  return liveOf(live, targetId).some((session) => session.view.kind !== except);
}

/** Whether the session is live now: starting, waiting or working. */
export function liveNow(live: ReadonlyMap<string, LiveSession>, sessionId: string): boolean {
  const session = live.get(sessionId);
  return session !== undefined && isLive(session.view.status);
}

/** Stops at once, even in a turn, and ends every live session of the kind for the Target. */
export async function stopAll(
  live: ReadonlyMap<string, LiveSession>,
  targetId: string,
  kind: SessionKind,
): Promise<void> {
  await Promise.all(liveOf(live, targetId, kind).map(async (session) => end(session)));
}

/**
 * Ends the live session at once, even in a turn; false when the session is not live.
 * `byCandidate` when the Candidate ended it.
 */
export async function stopNow(
  live: ReadonlyMap<string, LiveSession>,
  sessionId: string,
  options: { readonly byCandidate?: boolean } = {},
): Promise<boolean> {
  const session = live.get(sessionId);
  if (session !== undefined) {
    await end(session, options);
  }
  return session !== undefined;
}

/** Settles after the previous open; its failure belongs to its own caller. */
async function settled(previous: Promise<unknown>): Promise<void> {
  try {
    await previous;
  } catch {
    // The previous caller got this error.
  }
}

/**
 * Opens the live session of a kind for a Target, or starts one. Opens of the same kind and Target
 * run one after another, so two quick opens never start two sessions.
 */
export function sessionOpener(dependencies: OpenerDependencies): OpenSession {
  const last = new Map<string, Promise<unknown>>();
  return async (key, prepare) => {
    const name = `${key.kind} ${key.targetId}`;
    const previous = last.get(name) ?? Promise.resolve();
    const opened = (async () => {
      await settled(previous);
      return openNow(dependencies, key, prepare);
    })();
    last.set(name, opened);
    try {
      return await opened;
    } finally {
      if (last.get(name) === opened) {
        last.delete(name);
      }
    }
  };
}
