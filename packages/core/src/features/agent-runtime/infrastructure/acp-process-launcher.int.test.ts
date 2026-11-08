// The ACP launcher against the fake agent as a real process. The fake agent's modes stand for an
// agent that never answers and one that ignores SIGTERM; the test passes time by hand.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import type { Timer } from "../../../shared/time/index.ts";
import { launchRecipe } from "../domain/agent.ts";
import type { LiveAgent } from "../domain/ports.ts";
import { acpLauncher, launchTimeoutMs, stopGraceMs } from "./acp-process-launcher.ts";
import { localInstallation } from "./installation.ts";

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "interview-sensei-launcher-"));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

/** A timer whose delayed tasks run only when the test fires them. */
function manualTimer() {
  const pending: { delayMs: number; task: () => void }[] = [];
  let scheduled = Promise.withResolvers<null>();
  const timer: Timer = {
    repeat: () => () => {},
    after: (delayMs, task) => {
      const entry = { delayMs, task };
      pending.push(entry);
      scheduled.resolve(null);
      scheduled = Promise.withResolvers<null>();
      return () => {
        const index = pending.indexOf(entry);
        if (index !== -1) {
          pending.splice(index, 1);
        }
      };
    },
  };
  /** Waits until a task with the delay is scheduled, then runs it. */
  const fire = async (delayMs: number): Promise<void> => {
    const entry = pending.find((candidate) => candidate.delayMs === delayMs);
    if (entry === undefined) {
      await scheduled.promise;
      return fire(delayMs);
    }
    pending.splice(pending.indexOf(entry), 1);
    entry.task();
  };
  return { timer, fire };
}

/** Starts the fake agent in the mode; `exits` collects the exits it reports by itself. */
async function startFake(mode: string, timer: Timer) {
  const recipe = launchRecipe("fake", localInstallation(), await temporaryDirectory());
  const exits: unknown[] = [];
  const launched = acpLauncher({ timer })(
    { ...recipe, env: { INTERVIEW_SENSEI_FAKE_AGENT_MODE: mode } },
    {
      onUpdate: () => {},
      onExit: (exit) => {
        exits.push(exit);
      },
    },
  );
  return { launched, exits };
}

/** Resolves with the rejection of the promise, so the test can pass time before it looks. */
async function errorOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("acp launcher", () => {
  it("fails the launch and kills an agent that never answers initialize", async () => {
    const { timer, fire } = manualTimer();
    const { launched, exits } = await startFake("silent", timer);
    const failure = errorOf(launched);

    await fire(launchTimeoutMs);
    await fire(stopGraceMs);

    await expect(failure).resolves.toMatch(/did not open a session/u);
    expect(exits).toStrictEqual([]);
  });

  it("kills an agent that ignores SIGTERM when the server stops it", async () => {
    const { timer, fire } = manualTimer();
    const { launched } = await startFake("ignore-sigterm", timer);
    const agent: LiveAgent = await launched;

    const stopped = agent.stop();
    await fire(stopGraceMs);

    await expect(stopped).resolves.toBeUndefined();
  });
});
