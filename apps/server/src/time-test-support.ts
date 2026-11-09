// A Clock and a Timer that the API tests move by hand, instead of fixing the time and never running
// a delayed task.
import type { Clock, Timer } from "@interview-sensei/core/time";

import { fixedTime } from "./chat-test-support.ts";

interface Pending {
  readonly delayMs: number;
  readonly task: () => void;
}

/** A Timer whose delayed tasks run only when the test runs them; repeated ticks never run. */
export function manualTimer() {
  const pending = new Set<Pending>();
  let scheduled = Promise.withResolvers<null>();
  const timer: Timer = {
    repeat: () => () => {},
    after: (delayMs, task) => {
      const entry = { delayMs, task };
      pending.add(entry);
      scheduled.resolve(null);
      scheduled = Promise.withResolvers<null>();
      return () => {
        pending.delete(entry);
      };
    },
  };
  /** Waits until a task with the delay is scheduled, then runs every such task once. */
  const run = async (delayMs: number): Promise<void> => {
    const due = [...pending].filter((entry) => entry.delayMs === delayMs);
    if (due.length === 0) {
      await scheduled.promise;
      return run(delayMs);
    }
    for (const entry of due) {
      pending.delete(entry);
      entry.task();
    }
    return undefined;
  };
  /** Whether a task with the delay waits to run. */
  const isPending = (delayMs: number) => [...pending].some((entry) => entry.delayMs === delayMs);
  return { timer, run, isPending };
}

/** A Clock at `fixedTime` until the test moves it. */
export function manualClock() {
  let now = new Date(fixedTime);
  const clock: Clock = { now: () => now };
  return {
    clock,
    /** Moves the clock to the ISO 8601 time. */
    set: (time: string) => {
      now = new Date(time);
    },
  };
}
