import type { Database, Transaction } from "../../shared/storage/index.ts";
import type { Clock } from "../../shared/time/index.ts";
import { createTargets } from "./application/targets.ts";
import type { TargetAgents, TargetTopics } from "./domain/ports.ts";
import { drizzleTargetRepository } from "./infrastructure/drizzle-target-repository.ts";

export function targetsModule({
  database,
  clock,
  topics,
  agents,
}: {
  database: Database;
  clock: Clock;
  topics: TargetTopics<Transaction>;
  /** The agents the server offers: the Target's agent is one of them. */
  agents: TargetAgents;
}) {
  return createTargets({ repository: drizzleTargetRepository(database), clock, topics, agents });
}
