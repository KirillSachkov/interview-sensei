// What every part of Inbox processing shares: its dependencies and its background work.
import {
  endAfterTurn as endSessionAfterTurn,
  inBackground as runInBackground,
} from "../../../shared/background-work/index.ts";
import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { RunInTransaction, Transaction } from "../../../shared/storage/index.ts";
import type { Clock, Timer } from "../../../shared/time/index.ts";
import type { InboxRun, InboxRunFinished, InboxRunStarted } from "../domain/inbox.ts";
import type {
  DuplicateFilter,
  InboxAgents,
  InboxQuestions,
  InboxRepository,
  InboxSessions,
  SourceRepository,
  SourceTargets,
  SourceTexts,
  TextExtractor,
} from "../domain/ports.ts";
import type { SourceFiles } from "../domain/source-files.ts";
import type { SourceTranscription } from "../domain/transcription-port.ts";

export interface InboxDependencies {
  readonly repository: SourceRepository<Transaction>;
  readonly inbox: InboxRepository<Transaction>;
  readonly files: SourceFiles;
  readonly texts: SourceTexts;
  readonly extractor: TextExtractor;
  /** Recognizes the speech of video and audio files. */
  readonly transcription: SourceTranscription;
  readonly targets: SourceTargets<Transaction>;
  readonly agents: InboxAgents;
  readonly questions: InboxQuestions<Transaction>;
  readonly duplicates: DuplicateFilter;
  readonly sessions: InboxSessions;
  /** The question bank, the plan and the run change in one transaction. */
  readonly transaction: RunInTransaction;
  readonly clock: Clock;
  /** Runs the wait after the agent's turn ends without the report. */
  readonly timer: Timer;
  /** Receives errors of background work. */
  readonly onError: (error: unknown) => void;
  /**
   * Hears that a run of the Target started, once it is stored: it takes over the Target's running
   * answer search.
   */
  readonly onRunStarted: (started: InboxRunStarted) => void;
  /**
   * Hears that a run of the Target ended, by the agent's report or early, once its transaction is
   * committed; a waiting answer search begins then.
   */
  readonly onRunFinished: (finished: InboxRunFinished) => void;
}

export interface InboxContext {
  readonly dependencies: InboxDependencies;
  /** The background work of started runs: reading the texts and starting the agent. */
  readonly pending: Set<Promise<void>>;
  /**
   * The cancel of each run that reads its texts, by run id: «Остановить разбор» and the server's
   * close stop a running transcription with it.
   */
  readonly reading: Map<string, AbortController>;
}

/**
 * Cancels every running reading, then waits for the background work of started runs; the server
 * calls it before it closes.
 */
export async function settle(context: InboxContext): Promise<void> {
  for (const controller of context.reading.values()) {
    controller.abort();
  }
  await Promise.allSettled(context.pending);
}

/** Cancels the reading of the run's texts, such as its transcription; nothing without one. */
export function cancelReading(context: InboxContext, runId: string): void {
  context.reading.get(runId)?.abort();
}

/** Runs the work in the background until it settles; `pending` holds it meanwhile. */
export function inBackground(context: InboxContext, work: () => Promise<void>): void {
  runInBackground({ pending: context.pending, onError: context.dependencies.onError }, work);
}

/** Ends the agent's session after its current turn; nothing waits for the end. */
export function endAfterTurn(context: InboxContext, sessionId: string): void {
  const { sessions, onError } = context.dependencies;
  endSessionAfterTurn({ sessions, onError }, sessionId);
}

/** The Target of the tool's session; a session without one has nothing to process. */
export function sessionTarget(session: ToolSession): string {
  if (session.targetId === undefined || session.targetId === null) {
    throw new Error("This session has no Target");
  }
  return session.targetId;
}

/**
 * The running Inbox processing of the session's Target. Once the run knows its session, only that
 * session's agent works on it.
 */
export async function runOf(
  { dependencies }: InboxContext,
  session: ToolSession,
  transaction?: Transaction,
) {
  const targetId = sessionTarget(session);
  const run = await dependencies.inbox.runningRun(targetId, transaction);
  if (run === undefined || (run.sessionId !== null && run.sessionId !== session.sessionId)) {
    throw new Error("This session's Target has no running Inbox processing");
  }
  return { targetId, run };
}

/** A recheck changes nothing: it only proposes Questions to hide. */
export function refuseInRecheck(run: InboxRun): void {
  if (run.mode === "recheck") {
    throw new Error("A recheck changes nothing: list the Questions to hide in write_inbox_report");
  }
}
