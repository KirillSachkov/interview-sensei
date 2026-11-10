// How the server follows the agent of a background session, such as Inbox processing or answer
// search: a failed agent ends its run at once, and an agent that stays idle after its turn without
// the report ends it after a wait.
import type { Timer } from "../time/index.ts";

/**
 * How long the server waits after the agent's turn ends without the report. A test's API drives a
 * `[manual]` fake agent with further prompts in this time; a real agent gets no prompt after the
 * opening one, as a background session has no chat.
 */
const idleWaitMs = 2 * 60 * 1000;

const noWait = () => {};

/** Why the agent's run ends: its process failed, or it stayed idle without the report. */
export type AgentEnding = "agent_failed" | "agent_finished";

/** The agent-sessions slice as the watch reads it. */
interface WatchedSessions {
  /** Calls the listener after each change of a live session; returns the unsubscribe. */
  readonly subscribe: (
    sessionId: string,
    listener: (view: { readonly status: string }) => void,
  ) => () => void;
  readonly view: (sessionId: string) => Promise<{ readonly status: string } | undefined>;
}

interface WatchDependencies {
  readonly sessions: WatchedSessions;
  readonly timer: Timer;
  readonly onError: (error: unknown) => void;
}

/**
 * Follows the session and calls `onEnd` once: at once when the agent fails, or when it has stayed
 * idle for `idleWaitMs`; a new turn cancels the wait. The status at the start counts the same, so
 * an agent that failed or ended its turn before the watch began is not missed.
 */
export function watchSession(
  { sessions, timer, onError }: WatchDependencies,
  sessionId: string,
  onEnd: (ending: AgentEnding) => void,
): void {
  let cancelWait = noWait;
  let changed = false;
  let ended = false;
  const end = (ending: AgentEnding) => {
    if (!ended) {
      ended = true;
      cancelWait();
      unsubscribe();
      onEnd(ending);
    }
  };
  const follow = (status: string) => {
    cancelWait();
    if (status === "failed") {
      end("agent_failed");
    } else if (status === "idle" && !ended) {
      cancelWait = timer.after(idleWaitMs, () => {
        end("agent_finished");
      });
    }
  };
  const unsubscribe = sessions.subscribe(sessionId, (view) => {
    changed = true;
    follow(view.status);
  });
  void (async () => {
    try {
      const view = await sessions.view(sessionId);
      // A change after the subscription is newer than this view.
      if (view !== undefined && !changed) {
        follow(view.status);
      }
    } catch (error) {
      onError(error);
    }
  })();
}
