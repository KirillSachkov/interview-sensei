import type { Clock } from "../../../shared/time/index.ts";
import type { HealthReport } from "../domain/health-report.ts";
import { healthyAt } from "../domain/health-report.ts";

export function checkHealth(clock: Clock): HealthReport {
  return healthyAt(clock.now());
}
