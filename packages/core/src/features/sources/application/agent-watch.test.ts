import { describe, expect, it, vi } from "vitest";

import type { Timer } from "../../../shared/time/index.ts";
import { watchSession } from "./agent-watch.ts";
import type { AgentEnding } from "./agent-watch.ts";

const idleWaitMs = 2 * 60 * 1000;

/** A session whose status the test sets, and a timer whose tasks the test runs by hand. */
function watched(initial: string) {
  let listener: ((view: { status: string }) => void) | null = null;
  const tasks: { delayMs: number; task: () => void }[] = [];
  const timer: Timer = {
    repeat: () => () => {},
    after: (delayMs, task) => {
      const entry = { delayMs, task };
      tasks.push(entry);
      return () => {
        tasks.splice(tasks.indexOf(entry), 1);
      };
    },
  };
  const sessions = {
    subscribe: (_sessionId: string, next: (view: { status: string }) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    view: () => Promise.resolve<{ status: string } | undefined>({ status: initial }),
  };
  const endings: AgentEnding[] = [];
  watchSession({ sessions, timer, onError: () => {} }, "session", (ending) => {
    endings.push(ending);
  });
  return {
    endings,
    change: (status: string) => listener?.({ status }),
    fireWait: () => {
      for (const { task } of tasks.filter(({ delayMs }) => delayMs === idleWaitMs)) {
        task();
      }
    },
  };
}

describe(watchSession, () => {
  it("ends with agent_failed at once when the agent fails", () => {
    const session = watched("working");

    session.change("failed");

    expect(session.endings).toStrictEqual(["agent_failed"]);
  });

  it("ends with agent_finished once the agent stays idle after its turn for the wait", () => {
    const session = watched("working");
    session.change("idle");

    session.fireWait();

    expect(session.endings).toStrictEqual(["agent_finished"]);
  });

  it("cancels the wait when the agent works again", () => {
    const session = watched("working");
    session.change("idle");
    session.change("working");

    session.fireWait();

    expect(session.endings).toStrictEqual([]);
  });

  it("waits the same way for an agent that was already idle before the watch began", async () => {
    const session = watched("idle");
    await vi.waitFor(() => {
      session.fireWait();
      expect(session.endings).toStrictEqual(["agent_finished"]);
    });
  });

  it("ends with agent_failed for an agent that had failed before the watch began", async () => {
    const session = watched("failed");

    await vi.waitFor(() => {
      expect(session.endings).toStrictEqual(["agent_failed"]);
    });
  });
});
