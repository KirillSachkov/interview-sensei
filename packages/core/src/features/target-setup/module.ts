import type { Database, RunInTransaction, Transaction } from "../../shared/storage/index.ts";
import type { Clock } from "../../shared/time/index.ts";
import { createTargetSetup } from "./application/target-setup.ts";
import type { SetupQuestions, SetupTargets, SetupTopics } from "./domain/ports.ts";
import { drizzleDraftRepository } from "./infrastructure/drizzle-draft-repository.ts";

/**
 * The draft of changes of each Target on the server's database. Applying a draft writes the Target
 * and its Preferences through `targets`, and its Topics and Questions through `topics`, in one
 * transaction of `transaction`.
 */
export function targetSetupModule({
  database,
  transaction,
  clock,
  targets,
  topics,
}: {
  database: Database;
  transaction: RunInTransaction;
  clock: Clock;
  /** The targets slice. */
  targets: SetupTargets<Transaction>;
  /** The question-bank slice. */
  topics: SetupTopics<Transaction> & SetupQuestions<Transaction>;
}) {
  return createTargetSetup({
    drafts: drizzleDraftRepository(database),
    targets,
    topics,
    transaction,
    clock,
  });
}
