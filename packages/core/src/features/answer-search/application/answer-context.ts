// What every part of answer search shares: its dependencies and its background work.
import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { RunInTransaction, Transaction } from "../../../shared/storage/index.ts";
import type { Clock, Timer } from "../../../shared/time/index.ts";
import type {
  AnswerAgents,
  AnswerAttempts,
  AnswerInbox,
  AnswerProgress,
  AnswerQuestions,
  AnswerRepository,
  AnswerSessions,
  AnswerSettings,
  AnswerTargets,
} from "../domain/ports.ts";

export interface AnswerDependencies {
  readonly repository: AnswerRepository<Transaction>;
  readonly targets: AnswerTargets;
  readonly agents: AnswerAgents;
  readonly questions: AnswerQuestions<Transaction>;
  readonly attempts: AnswerAttempts;
  readonly progress: AnswerProgress;
  readonly inbox: AnswerInbox;
  readonly sessions: AnswerSessions;
  readonly settings: AnswerSettings;
  /** A reference answer and the run's record of it change in one transaction. */
  readonly transaction: RunInTransaction;
  readonly clock: Clock;
  /** Runs the wait after the agent's turn ends without the report. */
  readonly timer: Timer;
  /** Receives errors of background work. */
  readonly onError: (error: unknown) => void;
  /** Hears that a start by «Наполнять в фоне» did not happen, and why. */
  readonly onBackgroundSkipped: (skipped: {
    readonly targetId: string;
    readonly reason: string;
  }) => void;
}

export interface AnswerContext {
  readonly dependencies: AnswerDependencies;
  /** The background work of started runs: starting the agent and closing a run. */
  readonly pending: Set<Promise<void>>;
}

/** Runs the work in the background until it settles; its failure goes to onError. */
export function inBackground(context: AnswerContext, work: () => Promise<void>): void {
  const running = (async () => {
    try {
      await work();
    } catch (error) {
      context.dependencies.onError(error);
    }
  })();
  context.pending.add(running);
  void (async () => {
    await running;
    context.pending.delete(running);
  })();
}

/** The Target of the tool's session; a session without one has nothing to fill. */
function sessionTarget(session: ToolSession): string {
  if (session.targetId === undefined || session.targetId === null) {
    throw new Error("This session has no Target");
  }
  return session.targetId;
}

/**
 * The running answer search of the session's Target. Once the run knows its session, only that
 * session's agent works on it.
 */
export async function runOf(
  { dependencies }: AnswerContext,
  session: ToolSession,
  transaction?: Transaction,
) {
  const targetId = sessionTarget(session);
  const run = await dependencies.repository.activeRun(targetId, transaction);
  if (
    run?.status !== "running" ||
    (run.sessionId !== null && run.sessionId !== session.sessionId)
  ) {
    throw new Error("This session's Target has no running answer search");
  }
  return { targetId, run };
}
