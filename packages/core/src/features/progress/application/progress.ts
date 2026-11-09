import type { TargetProgress, TopicChange, TopicProgress } from "../domain/progress.ts";
import { interviewChanges, targetProgress } from "../domain/progress.ts";
import type { ProgressAttempts, ProgressPlans } from "../domain/ports.ts";

export interface Progress {
  /** The Topic status of every Topic of the plan and the Readiness; undefined for an unknown Target. */
  readonly target: (targetId: string) => Promise<TargetProgress | undefined>;
  /** The Topics «подтянуть в первую очередь»; none for an unknown Target. */
  readonly focus: (targetId: string) => Promise<readonly TopicProgress[]>;
  /** The Topic status changes of the Mock interview for its summary Debrief. */
  readonly interviewChanges: (
    targetId: string,
    interviewId: string,
  ) => Promise<readonly TopicChange[]>;
}

/** Progress computes from the Attempts on each call and stores nothing. */
export function createProgress({
  plans,
  attempts,
}: {
  plans: ProgressPlans;
  attempts: ProgressAttempts;
}): Progress {
  const target = async (targetId: string) => {
    const [plan, recorded] = await Promise.all([
      plans.get(targetId),
      attempts.topicAttempts(targetId),
    ]);
    return plan === undefined ? undefined : targetProgress(plan, recorded);
  };
  return {
    target,
    focus: async (targetId) => {
      const found = await target(targetId);
      return found?.focus ?? [];
    },
    interviewChanges: async (targetId, interviewId) => {
      const [plan, recorded] = await Promise.all([
        plans.get(targetId),
        attempts.topicAttempts(targetId),
      ]);
      return interviewChanges(plan ?? { sections: [] }, recorded, interviewId);
    },
  };
}
