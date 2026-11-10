// How an answer search ends without the agent's report: «Остановить», a failed agent, an agent
// that ended its turn without the report, a restart of the server or an agent that did not start.
// The server closes the run with a partial report; the answers the agent wrote stay.
import { randomUUID } from "node:crypto";

import { watchSession } from "../../../shared/agent-watch/index.ts";
import { answerReport } from "../domain/answer-run.ts";
import type { AnswerReport, AnswerRun, RunEnding } from "../domain/answer-run.ts";
import { inBackground } from "./answer-context.ts";
import type { AnswerContext } from "./answer-context.ts";

/**
 * Closes the run with a partial report while it still waits or runs. Null when the run is no longer
 * active, such as after the agent's own report.
 */
export async function closeRun(
  { dependencies }: AnswerContext,
  run: AnswerRun,
  reason: RunEnding,
): Promise<AnswerReport | null> {
  const { repository, clock, transaction } = dependencies;
  return transaction(async (opened) => {
    const current = await repository.activeRun(run.targetId, opened);
    if (current?.id !== run.id) {
      return null;
    }
    const createdAt = clock.now().toISOString();
    const report = answerReport(current, { reason }, { id: randomUUID(), createdAt });
    await repository.addReport(report, opened);
    await repository.finishRun(run.id, createdAt, opened);
    return report;
  });
}

/**
 * - `stopped`: the run is closed with the partial `report` and its agent stopped.
 * - `not_running`: the Target has no answer search that waits or runs.
 */
export type StopOutcome =
  | { readonly type: "stopped"; readonly report: AnswerReport }
  | { readonly type: "target_not_found" | "not_running" };

/**
 * «Остановить»: closes the run with a partial report, then stops its agent at once, even in a turn.
 * A tool call the agent makes meanwhile finds no running answer search.
 */
export async function stop(context: AnswerContext, targetId: string): Promise<StopOutcome> {
  const { targets, repository, sessions } = context.dependencies;
  if ((await targets.get(targetId)) === undefined) {
    return { type: "target_not_found" };
  }
  const run = await repository.activeRun(targetId);
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
 * Closes the run with a partial report once its agent fails, or once it stays idle after a turn
 * without the report; then it also ends the session. The agent's report finishes the run first, so
 * a close after it does nothing.
 */
export function watchAgent(context: AnswerContext, run: AnswerRun, sessionId: string): void {
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

/**
 * An Inbox processing of the Target started: one background work of the agent per Target, and the
 * Inbox processing goes first. A running answer search closes with a partial report, its found
 * answers stay, and its agent stops at once; a waiting one keeps waiting for the processing's end.
 */
export async function inboxStarted(context: AnswerContext, targetId: string): Promise<void> {
  const run = await context.dependencies.repository.activeRun(targetId);
  if (run?.status !== "running") {
    return;
  }
  const report = await closeRun(context, run, "inbox_started");
  // The report knows the session the run had at its close, even one given during this call.
  if (report?.sessionId !== null && report?.sessionId !== undefined) {
    await context.dependencies.sessions.stop(report.sessionId);
  }
}

/**
 * Closes the runs that waited or ran when the server last stopped with partial reports. Call it at
 * start, before the Inbox processing closes its own runs: their end would begin a waiting run.
 */
export async function endInterrupted(context: AnswerContext): Promise<void> {
  const active = await context.dependencies.repository.allActive();
  for (const run of active) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- PGlite runs one transaction at a time
    await closeRun(context, run, "interrupted");
  }
}
