import type { Clock } from "../../shared/time/index.ts";
import { checkHealth } from "./application/check-health.ts";
import type { HealthReport } from "./domain/health-report.ts";

export interface HealthModuleDependencies {
  readonly clock: Clock;
}

/** Reports the server's health at the time of each call. */
export function healthModule({ clock }: HealthModuleDependencies): () => HealthReport {
  return () => checkHealth(clock);
}
