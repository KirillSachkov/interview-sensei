// What every part of Inbox processing shares: its dependencies and its background work.
import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { RunInTransaction, Transaction } from "../../../shared/storage/index.ts";
import type { Clock } from "../../../shared/time/index.ts";
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

export interface InboxDependencies {
  readonly repository: SourceRepository<Transaction>;
  readonly inbox: InboxRepository<Transaction>;
  readonly files: SourceFiles;
  readonly texts: SourceTexts;
  readonly extractor: TextExtractor;
  readonly targets: SourceTargets<Transaction>;
  readonly agents: InboxAgents;
  readonly questions: InboxQuestions<Transaction>;
  readonly duplicates: DuplicateFilter;
  readonly sessions: InboxSessions;
  /** The question bank, the plan and the run change in one transaction. */
  readonly transaction: RunInTransaction;
  readonly clock: Clock;
  /** Receives errors of background work. */
  readonly onError: (error: unknown) => void;
}

export interface InboxContext {
  readonly dependencies: InboxDependencies;
  /** The background work of started runs: reading the texts and starting the agent. */
  readonly pending: Set<Promise<void>>;
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
