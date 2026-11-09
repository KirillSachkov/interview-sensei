import type { Database, RunInTransaction, Transaction } from "../../shared/storage/index.ts";
import type { Clock } from "../../shared/time/index.ts";
import { createTargetSetup } from "./application/target-setup.ts";
import type { SetupAttempts, SetupQuestions, SetupTargets, SetupTopics } from "./domain/ports.ts";
import { drizzleDraftRepository } from "./infrastructure/drizzle-draft-repository.ts";

/**
 * The draft of changes of each Target on the server's database. Applying a draft writes the Target
 * and its Preferences through `targets`, its Topics and Questions through `topics`, and the Topics
 * of merged Topics' Attempts through `attempts`, in one transaction of `transaction`.
 */
export function targetSetupModule({
  database,
  transaction,
  clock,
  targets,
  topics,
  attempts,
}: {
  database: Database;
  transaction: RunInTransaction;
  clock: Clock;
  /** The targets slice. */
  targets: SetupTargets<Transaction>;
  /** The question-bank slice. */
  topics: SetupTopics<Transaction> & SetupQuestions<Transaction>;
  /** The interviews slice: a Topic merge moves the merged Topic's Attempts. */
  attempts: SetupAttempts<Transaction>;
}) {
  return createTargetSetup({
    drafts: drizzleDraftRepository(database),
    targets,
    topics,
    attempts,
    transaction,
    clock,
  });
}
