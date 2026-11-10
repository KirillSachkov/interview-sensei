// How an Inbox processing ends without the agent's report: «Остановить разбор», a failed agent, an
// agent that ended its turn without the report, a restart of the server, an agent that did not
// start or no readable material. The server closes the run with a partial Inbox report from what
// the agent wrote; the added Questions stay. moveSettled also serves the agent's own report.
import { randomUUID } from "node:crypto";

import type { Transaction } from "../../../shared/storage/index.ts";
import { partialReport } from "../domain/inbox.ts";
import type { InboxReport, InboxRun, RunEnding } from "../domain/inbox.ts";
import { watchSession } from "../../../shared/agent-watch/index.ts";
import { inBackground } from "./inbox-context.ts";
import type { InboxContext } from "./inbox-context.ts";

/** Moves the run's Sources: `ready` to «готов», `back` to the Inbox, in the open transaction. */
export async function moveSettled(
  { dependencies }: InboxContext,
  { targetId, ready, back }: { targetId: string; ready: string[]; back: string[] },
  opened: Transaction,
): Promise<void> {
  const moves = [
    { ids: ready, status: "ready", from: "processing" },
    { ids: back, status: "inbox", from: "processing" },
  ] as const;
  for (const move of moves) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one transaction runs one query at a time
    await dependencies.repository.setStatus(targetId, move, opened);
  }
}

/** Stores the partial report and moves the run's Sources by it, in the open transaction. */
async function storePartial(
  context: InboxContext,
  { run, reason }: { run: InboxRun; reason: RunEnding },
  opened: Transaction,
): Promise<InboxReport> {
  const { repository, inbox, clock } = context.dependencies;
  const createdAt = clock.now().toISOString();
  const { report, ready, back } = partialReport(run, await repository.list(run.targetId, opened), {
    id: randomUUID(),
    reason,
    createdAt,
  });
  await inbox.addReport(report, opened);
  await moveSettled(context, { targetId: run.targetId, ready, back }, opened);
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
  const report = await context.dependencies.transaction(async (opened) => {
    const current = await context.dependencies.inbox.runningRun(run.targetId, opened);
    return current?.id === run.id ? storePartial(context, { run: current, reason }, opened) : null;
  });
  if (report !== null) {
    context.dependencies.onRunFinished({
      targetId: run.targetId,
      mode: run.mode,
      interrupted: reason === "interrupted",
    });
  }
  return report;
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

/**
 * Closes the run with a partial report once its agent fails: its process exited or did not start.
 * When the agent's turn ends without the report and the agent stays idle, it closes the run the
 * same way after the wait of `watchSession` and ends the session. The agent's report finishes the
 * run first, so a close after it finds no running run and does nothing.
 */
export function watchAgent(context: InboxContext, run: InboxRun, sessionId: string): void {
  const { sessions } = context.dependencies;
  watchSession(context.dependencies, sessionId, (ending) => {
    inBackground(context, async () => {
      const report = await closeRun(context, run, ending);
      if (report !== null && ending === "agent_finished") {
        await sessions.end(sessionId);
      }
    });
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
