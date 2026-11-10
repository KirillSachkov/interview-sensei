// A part of composition.ts (`server-composes-features-in-one-module`): answer search, which reads the
// queue from the question bank, the Mock interviews and progress, waits for the Target's Inbox
// processing and runs its agent in an Agent session. Only composition.ts imports this module.
import { answerSearchModule } from "@interview-sensei/core/answer-search";
import type { AgentSessions } from "@interview-sensei/core/agent-sessions";
import type { Storage, StorageOptions } from "@interview-sensei/core/storage";

import type { AgentRuntime } from "./composition-agents.ts";
import type { composeTargets } from "./composition-targets.ts";

export {
  answerSearchMigrations,
  answerTools,
  maxSearchCount,
} from "@interview-sensei/core/answer-search";
export type { AnswerSearch, AnswerStartOutcome } from "@interview-sensei/core/answer-search";

type ModuleDependencies = Parameters<typeof answerSearchModule>[0];

interface AnswerSliceDependencies {
  readonly clock: StorageOptions["clock"];
  readonly timer: StorageOptions["timer"];
  readonly slices: ReturnType<typeof composeTargets>;
  readonly runtime: AgentRuntime;
  readonly sessions: AgentSessions;
  /** The interviews slice: which Questions were asked in a Mock interview. */
  readonly interviews: ModuleDependencies["attempts"];
  readonly progress: ModuleDependencies["progress"];
  readonly onError: (error: unknown) => void;
  readonly onBackgroundSkipped: ModuleDependencies["onBackgroundSkipped"];
}

/**
 * Answer search over the composed slices; it waits while the Target's Inbox processing runs, and
 * «Наполнять в фоне» of the app settings starts it by itself.
 */
export function composeAnswers(
  storage: Storage,
  {
    clock,
    timer,
    slices,
    runtime,
    sessions,
    interviews,
    progress,
    onError,
    onBackgroundSkipped,
  }: AnswerSliceDependencies,
) {
  const { inbox } = slices.sources;
  return answerSearchModule({
    database: storage.database,
    transaction: storage.transaction,
    clock,
    timer,
    targets: slices.targets,
    agents: runtime,
    questions: slices.questionBank,
    attempts: interviews,
    progress,
    inbox: {
      running: async (targetId) => {
        const state = await inbox.state(targetId);
        return state !== null && state.run !== null;
      },
    },
    sessions,
    settings: slices.appSettings,
    onError,
    onBackgroundSkipped,
  });
}
