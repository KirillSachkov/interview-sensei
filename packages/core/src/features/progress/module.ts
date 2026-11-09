import { createProgress } from "./application/progress.ts";
import type { Progress } from "./application/progress.ts";
import type { ProgressAttempts, ProgressPlans } from "./domain/ports.ts";

export interface ProgressModuleDependencies {
  /** The Target's Interview plan: the targets module. */
  readonly plans: ProgressPlans;
  /** The Attempts of the Target's Mock interviews: the interviews module. */
  readonly attempts: ProgressAttempts;
}

/** Progress of each Target; it computes from the Attempts and stores nothing. */
export function progressModule(dependencies: ProgressModuleDependencies): Progress {
  return createProgress(dependencies);
}
