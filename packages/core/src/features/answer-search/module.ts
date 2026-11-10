import type { Database, RunInTransaction, Transaction } from "../../shared/storage/index.ts";
import type { Clock, Timer } from "../../shared/time/index.ts";
import { createAnswerSearch } from "./application/answer-search.ts";
import type {
  AnswerAgents,
  AnswerAttempts,
  AnswerInbox,
  AnswerProgress,
  AnswerQuestions,
  AnswerSessions,
  AnswerTargets,
} from "./domain/ports.ts";
import { drizzleAnswerRepository } from "./infrastructure/drizzle-answer-repository.ts";

/**
 * Answer search of each Target (spec #70): it finds reference answers on the web in the background.
 * It reads the queue from `questions`, `attempts` and `progress`, starts the agent through
 * `sessions` and writes the answers through `questions`.
 */
export function answerSearchModule({ database, ...dependencies }: AnswerSearchModuleDependencies) {
  return createAnswerSearch({ ...dependencies, repository: drizzleAnswerRepository(database) });
}

interface AnswerSearchModuleDependencies {
  database: Database;
  transaction: RunInTransaction;
  clock: Clock;
  /** Runs the wait after the agent's turn ends without the report. */
  timer: Timer;
  /** The targets slice. */
  targets: AnswerTargets;
  /** The agent-runtime slice. */
  agents: AnswerAgents;
  /** The question-bank slice. */
  questions: AnswerQuestions<Transaction>;
  /** The interviews slice: the Questions asked in a Mock interview. */
  attempts: AnswerAttempts;
  /** The progress slice: the Topic statuses. */
  progress: AnswerProgress;
  /** The sources slice: whether the Target's Inbox processing runs. */
  inbox: AnswerInbox;
  /** The agent-sessions slice. */
  sessions: AnswerSessions;
  /** Receives errors of background work. */
  onError: (error: unknown) => void;
}
