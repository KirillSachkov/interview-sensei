// How an Inbox processing ends without the agent's report: «Остановить разбор», a failed agent, a
// restart of the server, an agent that did not start or no readable material. The server closes
// the run with a partial Inbox report from what the agent wrote; the added Questions stay.
import { randomUUID } from "node:crypto";

import type { Transaction } from "../../../shared/storage/index.ts";
import { partialReport } from "../domain/inbox.ts";
import type { InboxReport, InboxRun, RunEnding } from "../domain/inbox.ts";
import { inBackground } from "./inbox-context.ts";
import type { InboxContext } from "./inbox-context.ts";

/** Stores the partial report and moves the run's Sources by it, in the open transaction. */
async function storePartial(
  { dependencies }: InboxContext,
  { run, reason }: { run: InboxRun; reason: RunEnding },
  opened: Transaction,
): Promise<InboxReport> {
  const { repository, inbox, clock } = dependencies;
  const createdAt = clock.now().toISOString();
  const { report, ready, back } = partialReport(run, await repository.list(run.targetId, opened), {
    id: randomUUID(),
    reason,
    createdAt,
  });
  await inbox.addReport(report, opened);
  const moves = [
    { ids: ready, status: "ready", from: "processing" },
    { ids: back, status: "inbox", from: "processing" },
  ] as const;
  for (const move of moves) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one transaction runs one query at a time
    await repository.setStatus(run.targetId, move, opened);
  }
  await inbox.finishRun(run.id, createdAt, opened);
  return report;
}

/**
 * Closes the run with a partial Inbox report while it still runs: the Sources whose every part the
 * agent read become «готов», the other ones «разбирается» go back to the Inbox. Null when the run
 * no longer runs, such as after the agent's own report.
 */
export async function closeRun(
  context: InboxContext,
  run: InboxRun,
  reason: RunEnding,
): Promise<InboxReport | null> {
  return context.dependencies.transaction(async (opened) => {
    const current = await context.dependencies.inbox.runningRun(run.targetId, opened);
    return current?.id === run.id ? storePartial(context, { run: current, reason }, opened) : null;
  });
}

/**
 * - `stopped`: the run is closed with the partial `report` and its agent stopped.
 * - `not_running`: the Target has no running Inbox processing.
 */
export type StopOutcome =
  | { readonly type: "stopped"; readonly report: InboxReport }
  | { readonly type: "target_not_found" | "not_running" };

/**
 * «Остановить разбор»: closes the run with a partial report, then stops its agent at once, even in a
 * turn. A tool call the agent makes meanwhile finds no running processing.
 */
export async function stop(context: InboxContext, targetId: string): Promise<StopOutcome> {
  const { targets, inbox, sessions } = context.dependencies;
  if ((await targets.get(targetId)) === undefined) {
    return { type: "target_not_found" };
  }
  const run = await inbox.runningRun(targetId);
  const report = run === undefined ? null : await closeRun(context, run, "stopped");
  if (run === undefined || report === null) {
    return { type: "not_running" };
  }
  if (run.sessionId !== null) {
    await sessions.stop(run.sessionId);
  }
  return { type: "stopped", report };
}

/** Closes the run with a partial report once its agent fails: its process exited or did not start. */
export function watchAgent(context: InboxContext, run: InboxRun, sessionId: string): void {
  const { sessions } = context.dependencies;
  const fail = () => {
    inBackground(context, async () => {
      await closeRun(context, run, "agent_failed");
    });
  };
  const unsubscribe = sessions.subscribe(sessionId, (view) => {
    if (view.status === "failed") {
      unsubscribe();
      fail();
    }
  });
  // The agent may have failed before the subscription.
  inBackground(context, async () => {
    const view = await sessions.view(sessionId);
    if (view?.status === "failed") {
      fail();
    }
  });
}

/** Closes the runs that ran when the server last stopped with partial reports. Call it at start. */
export async function endInterrupted(context: InboxContext): Promise<void> {
  const running = await context.dependencies.inbox.allRunning();
  for (const run of running) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- PGlite runs one transaction at a time
    await closeRun(context, run, "interrupted");
  }
}
