import type { ProgressPlan, TopicAttempt } from "./progress.ts";

/** The targets slice supplies the Target's Interview plan; undefined for an unknown Target. */
export interface ProgressPlans {
  readonly get: (targetId: string) => Promise<ProgressPlan | undefined>;
}

/**
 * The interviews slice supplies the Attempts of every ended Mock interview of the Target, from the
 * earliest to the latest, each with its Grade after the latest Dispute.
 */
export interface ProgressAttempts {
  readonly topicAttempts: (targetId: string) => Promise<readonly TopicAttempt[]>;
}
