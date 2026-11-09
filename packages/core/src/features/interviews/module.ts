import type { Database } from "../../shared/storage/index.ts";
import type { Clock } from "../../shared/time/index.ts";
import { createInterviews } from "./application/interviews.ts";
import type { Interviews } from "./application/interviews.ts";
import type {
  InterviewAgents,
  InterviewQuestions,
  InterviewSessions,
  InterviewTargets,
} from "./domain/ports.ts";
import { drizzleInterviewRepository } from "./infrastructure/drizzle-interview-repository.ts";

export interface InterviewsModuleDependencies {
  /** The server's database, migrated with interviewsMigrations. */
  readonly database: Database;
  readonly clock: Clock;
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

/** Mock interviews on the server's database. */
export function interviewsModule({
  database,
  ...dependencies
}: InterviewsModuleDependencies): Interviews {
  return createInterviews({ repository: drizzleInterviewRepository(database), ...dependencies });
}
