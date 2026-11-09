import type { SessionKind } from "../../../shared/session-kinds/index.ts";
import type { SessionView } from "../domain/agent-session.ts";
import { isLive } from "../domain/agent-session.ts";
import type { LiveSession } from "./live-session.ts";

/** A new session: its kind, its agent, its Target, and the application's first prompt. */
export interface StartRequest {
  readonly kind: SessionKind;
  readonly agent: string;
  readonly targetId?: string | null;
  /** Sent to the agent once it starts, so it speaks first; the chat does not show it. */
  readonly opening?: string;
}

/** The kind and Target that have at most one live session. */
interface OpenKey {
  readonly kind: SessionKind;
  readonly targetId: string;
}

/** Describes the new session when the kind and Target have no live one. */
type Prepare = () => Promise<{ agent: string; opening?: string }>;

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
  const { agent, opening } = await prepare();
  const request = { ...key, agent, ...(opening === undefined ? {} : { opening }) };
  return { session: await start(request), created: true };
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
