// A part of composition.ts (`server-composes-features-in-one-module`): Mock interviews with their
// progress, and answer search, which reads both. They run on Agent sessions, so composeFeatures
// composes them after the gateway.
import { interviewsModule } from "@interview-sensei/core/interviews";
import { progressModule } from "@interview-sensei/core/progress";
import type { Storage } from "@interview-sensei/core/storage";

import { composeAnswers } from "./composition-answers.ts";
import type { AnswerSearch } from "./composition-answers.ts";
import type { AgentDependencies, AgentSessions, composeRuntime } from "./composition-agents.ts";
import type { composeTargets } from "./composition-targets.ts";

/** Mock interviews and the progress of their Attempts; the interviews' brief reads progress back. */
function composeInterviews(
  storage: Storage,
  log: AgentDependencies["log"],
  services: Omit<Parameters<typeof interviewsModule>[0], "database" | "onError" | "progress">,
) {
  const interviews: ReturnType<typeof interviewsModule> = interviewsModule({
    database: storage.database,
    ...services,
    progress: {
      focus: async (targetId) => progress.focus(targetId),
      topicStatuses: async (targetId) => {
        const found = await progress.target(targetId);
        return found?.topics ?? [];
      },
    },
    onError: (error) => log.error({ err: error }, "A mock interview failed in the background"),
  });
  const progress = progressModule({ plans: services.targets, attempts: interviews });
  return { interviews, progress };
}

/** After the gateway: Mock interviews with their progress, and answer search, which reads both. */
export function composeSessionWork(
  storage: Storage,
  { clock, timer, log }: Pick<AgentDependencies, "clock" | "timer" | "log">,
  {
    slices,
    runtime,
    sessions,
  }: {
    slices: ReturnType<typeof composeTargets>;
    runtime: ReturnType<typeof composeRuntime>;
    sessions: AgentSessions;
  },
) {
  const { interviews, progress } = composeInterviews(storage, log, {
    clock,
    timer,
    targets: slices.targets,
    sessions,
    agents: runtime,
    questions: slices.questionBank,
    referenceChecks: slices.questionBank,
    transaction: storage.transaction,
    // «Наполнять в фоне»: answer search is built below and exists by the first finished mock.
    onFinished: ({ targetId }) => {
      answers.interviewFinished(targetId);
    },
  });
  const answers: AnswerSearch = composeAnswers(storage, {
    clock,
    timer,
    slices,
    runtime,
    sessions,
    interviews,
    progress,
    onError: (error) => log.error({ err: error }, "An answer search failed in the background"),
    onBackgroundSkipped: (skipped) =>
      log.info(skipped, "«Наполнять в фоне» started no answer search"),
  });
  return { interviews, progress, answers };
}
