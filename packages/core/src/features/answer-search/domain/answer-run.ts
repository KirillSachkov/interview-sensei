// One answer search of a Target and its report. A Target has at most one answer search that waits
// or runs: it waits while the Target's Inbox processing runs, and runs once that ends.
import type { SearchOrigin } from "./answer-search.ts";

/**
 * - `waiting`: the Target's Inbox processing runs; the search starts when it ends.
 * - `running`: the agent works on the queue.
 * - `finished`: the report is written.
 */
export type RunStatus = "waiting" | "running" | "finished";

/** A reference answer the agent wrote in this run. */
export interface SavedAnswer {
  readonly questionId: string;
  readonly origin: SearchOrigin;
}

export interface AnswerRun {
  readonly id: string;
  readonly targetId: string;
  /** The agent's session; null until the agent starts. */
  readonly sessionId: string | null;
  readonly status: RunStatus;
  /** How many Questions the Candidate chose to fill. */
  readonly requested: number;
  /** The run's Questions in the order of the queue, at most `requested`; empty while waiting. */
  readonly queueIds: readonly string[];
  /** The Questions of the queue the agent has taken with next_questions_without_answer. */
  readonly handedIds: readonly string[];
  readonly saved: readonly SavedAnswer[];
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

/**
 * Why an answer search ended without the agent's report: «Остановить», a failed agent, an agent
 * that stayed idle without the report, a restart of the server, an agent that did not start, or a
 * queue that was empty once the waiting search began.
 */
export type RunEnding =
  | "stopped"
  | "agent_failed"
  | "agent_finished"
  | "interrupted"
  | "agent_not_started"
  | "nothing_left";

/** A Question the run could not fill, with the agent's reason when it gave one. */
export interface FailedQuestion {
  readonly questionId: string;
  readonly reason: string | null;
}

export interface AnswerReport {
  readonly id: string;
  readonly targetId: string;
  readonly runId: string;
  /** The agent's session, whose journal holds its token usage; null when it never started. */
  readonly sessionId: string | null;
  /** The number of Questions in the run's queue. */
  readonly total: number;
  readonly filled: readonly SavedAnswer[];
  readonly failed: readonly FailedQuestion[];
  /** The agent's summary, or the server's when the run ended without the agent's report. */
  readonly summary: string;
  /** The run ended without the agent's report. */
  readonly partial: boolean;
  readonly createdAt: string;
}

/** The server's summary of a run that ended without the agent's report. */
const endingSummaries: Readonly<Record<RunEnding, string>> = {
  stopped: "Наполнение остановлено.",
  agent_failed: "Агент упал, наполнение остановлено.",
  agent_finished: "Агент закончил работу без отчёта.",
  interrupted: "Приложение перезапустилось, наполнение остановлено.",
  agent_not_started: "Агент не запустился.",
  nothing_left: "Вопросов без опорного ответа не осталось.",
};

/**
 * The report of the run: the answers it wrote and the Questions the agent took but did not fill,
 * with the agent's reasons. Without the agent's part, the report is partial and the server writes
 * its summary from the ending.
 */
export function answerReport(
  run: AnswerRun,
  ending:
    | { readonly summary: string; readonly failed: readonly FailedQuestion[] }
    | { readonly reason: RunEnding },
  { id, createdAt }: { id: string; createdAt: string },
): AnswerReport {
  const filled = new Set(run.saved.map((answer) => answer.questionId));
  const reasons = new Map(
    "failed" in ending ? ending.failed.map((entry) => [entry.questionId, entry.reason]) : [],
  );
  const failed = run.queueIds
    .filter(
      (questionId) =>
        !filled.has(questionId) && (run.handedIds.includes(questionId) || reasons.has(questionId)),
    )
    .map((questionId) => ({ questionId, reason: reasons.get(questionId) ?? null }));
  return {
    id,
    targetId: run.targetId,
    runId: run.id,
    sessionId: run.sessionId,
    total: run.queueIds.length,
    filled: run.saved,
    failed,
    summary: "reason" in ending ? endingSummaries[ending.reason] : ending.summary,
    partial: "reason" in ending,
    createdAt,
  };
}

/** The run with the answer it wrote in place of an earlier answer to the same Question. */
export function withSaved(run: AnswerRun, answer: SavedAnswer): readonly SavedAnswer[] {
  return [...run.saved.filter((entry) => entry.questionId !== answer.questionId), answer];
}

/** The first message of the answer search's agent; the fake agent knows its first sentence. */
export function answerOpening({
  name,
  language,
  total,
}: {
  name: string;
  language: string;
  total: number;
}): string {
  return [
    "Answer search has started.",
    `Fill reference answers for up to ${total} Questions of the Target «${name}».`,
    "Take them with next_questions_without_answer, write each with save_reference_answer and finish with write_answer_report.",
    `Write the answers and the report in this language: ${language}.`,
  ].join(" ");
}
