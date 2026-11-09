import type { Database, Transaction } from "../../shared/storage/index.ts";
import type { Clock, Timer } from "../../shared/time/index.ts";
import { createInterviews } from "./application/interviews.ts";
import type { Interviews } from "./application/interviews.ts";
import type {
  InterviewAgents,
  InterviewErasure,
  InterviewProgress,
  InterviewQuestions,
  InterviewSessions,
  InterviewTargets,
} from "./domain/ports.ts";
import { drizzleInterviewRepository } from "./infrastructure/drizzle-interview-repository.ts";

export interface InterviewsModuleDependencies {
  /** The server's database, migrated with interviewsMigrations. */
  readonly database: Database;
  readonly clock: Clock;
  /** Runs the reminder before the time limit, the end of the limit and the wait for `finish_interview`. */
  readonly timer: Timer;
  /** The Topics to work on first for the brief: the progress module. */
  readonly progress: InterviewProgress;
  /** The Target's plan and agent: the targets module. */
  readonly targets: InterviewTargets;
  /** Whether the Target's agent can run now: the agent-runtime module. */
  readonly agents: InterviewAgents;
  /** The Target's Questions: the question-bank module. */
  readonly questions: InterviewQuestions;
  /** The interviewer's AgentSession: the agent-sessions module. */
  readonly sessions: InterviewSessions;
  /** Receives errors of background work. */
  readonly onError: (error: unknown) => void;
}

/**
 * Mock interviews on the server's database. Deleting a Target erases its Mock interviews with
 * `eraseTarget`.
 */
export function interviewsModule({
  database,
  ...dependencies
}: InterviewsModuleDependencies): Interviews & InterviewErasure<Transaction> {
  const repository = drizzleInterviewRepository(database);
  return {
    ...createInterviews({ repository, ...dependencies }),
    eraseTarget: async (targetId, transaction) => repository.eraseTarget(targetId, transaction),
  };
}
