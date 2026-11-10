// What every part of Inbox processing shares: its dependencies and its background work.
import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { RunInTransaction, Transaction } from "../../../shared/storage/index.ts";
import type { Clock, Timer } from "../../../shared/time/index.ts";
import type { InboxRun } from "../domain/inbox.ts";
import type {
  DuplicateFilter,
  InboxAgents,
  InboxQuestions,
  InboxRepository,
  InboxSessions,
  SourceFiles,
  SourceRepository,
  SourceTargets,
  SourceTexts,
  TextExtractor,
} from "../domain/ports.ts";
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

/** Runs the work; its failure goes to onError. */
async function reported(context: InboxContext, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    context.dependencies.onError(error);
  }
}

/** Runs the work in the background until it settles; `pending` holds it meanwhile. */
export function inBackground(context: InboxContext, work: () => Promise<void>): void {
  const running = reported(context, work);
  context.pending.add(running);
  void (async () => {
    await running;
    context.pending.delete(running);
  })();
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
