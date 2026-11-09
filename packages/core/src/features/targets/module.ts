import type { Database } from "../../shared/storage/index.ts";
import type { Clock } from "../../shared/time/index.ts";
import { createTargets } from "./application/targets.ts";
import type { TargetTopics } from "./domain/ports.ts";
import { drizzleTargetRepository } from "./infrastructure/drizzle-target-repository.ts";

export function targetsModule({
  database,
  clock,
  topics,
}: {
  database: Database;
  clock: Clock;
  topics: TargetTopics;
}) {
  return createTargets({ repository: drizzleTargetRepository(database), clock, topics });
}
