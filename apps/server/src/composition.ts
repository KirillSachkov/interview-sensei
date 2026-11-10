// The only server module that imports core features (`server-composes-features-in-one-module`),
// with its parts composition-targets.ts, composition-agents.ts, composition-answers.ts and
// composition-work.ts. Each feature gives one module factory that hides its
// infrastructure; this module calls each factory once and hands the routes finished services.
// Routes take the types they need from here.
import {
  interviewsMigrations,
  interviewTools,
  sideThreadTools,
} from "@interview-sensei/core/interviews";
import { getProgress } from "@interview-sensei/core/progress";
import { healthModule } from "@interview-sensei/core/health";
import { openStorage } from "@interview-sensei/core/storage";
import { transcriptionModule } from "@interview-sensei/core/transcription";
import type { TranscriptionComponents } from "@interview-sensei/core/transcription";
import type { SliceMigrations } from "@interview-sensei/core/storage";
import type { Interviews, interviewsModule } from "@interview-sensei/core/interviews";
import type { Progress } from "@interview-sensei/core/progress";

import { answerSearchMigrations, answerTools } from "./composition-answers.ts";
import type { AnswerSearch } from "./composition-answers.ts";
import { composeSessionWork } from "./composition-work.ts";
import {
  agentSessionsMigrations,
  composeRuntime,
  composeSessions,
  getBrief,
} from "./composition-agents.ts";
import type { AgentDependencies, AgentSessions, SessionToolSets } from "./composition-agents.ts";
import {
  composeTargets,
  demoCreator,
  targetSliceMigrations,
  targetTools,
} from "./composition-targets.ts";

export type { AgentRuntime, UserEnvironment } from "./composition-agents.ts";
export { opencodeLoginModule } from "./composition-agents.ts";
export { SessionsClosedError } from "./composition-agents.ts";
export type { AgentSessions, SessionView } from "./composition-agents.ts";
export { mcpGatewayModule, mcpRoute } from "./composition-agents.ts";
export type { McpGateway } from "./composition-agents.ts";
export { UnknownAgentError } from "./composition-targets.ts";
export type { InboxStartOutcome } from "@interview-sensei/core/sources";
export type { AnswerStartOutcome } from "./composition-answers.ts";
export { maxSearchCount } from "./composition-answers.ts";
export { grades } from "@interview-sensei/core/interviews";
export { modelIds, TranscriptionError } from "@interview-sensei/core/transcription";
export type * from "@interview-sensei/core/transcription";
export type * from "@interview-sensei/core/interviews";

/**
 * The migrations of every core slice that stores data, applied at each start in this order. A
 * slice exports its SliceMigrations from its index.ts; add it here.
 */
const sliceMigrations: readonly SliceMigrations[] = [
  agentSessionsMigrations,
  ...targetSliceMigrations,
  interviewsMigrations,
  answerSearchMigrations,
];

/**
 * The services of the tools of the mock interview, the Side thread and the answer search, and the
 * AgentSessions that the setup's `get_brief` reads the earlier conversation from; composeFeatures
 * builds them after the gateway.
 */
interface InterviewServices {
  interviews: Interviews;
  progress: Progress;
  answers: AnswerSearch;
  sessions: Pick<AgentSessions, "earlierMessages">;
}

/**
 * The MCP tool set of each session kind. A slice exports its tools from its index.ts; add them to
 * the kinds that need them. It compiles only while every session kind has an entry. The gateway
 * reads a set when a session starts; `bind` gives the sets of the mock interview and the Side
 * thread their services once composeFeatures has built them, after the gateway.
 */
function sessionTools(slices: ReturnType<typeof composeTargets>) {
  let services: InterviewServices | null = null;
  const built = () => {
    if (services === null) {
      throw new Error("A session started before the server composed its features");
    }
    return services;
  };
  const { getTarget, searchQuestions, listSources, getSource, setup, inbox } = targetTools(
    slices,
    async (sessionId) => built().sessions.earlierMessages(sessionId),
  );
  const sets: SessionToolSets = {
    "service-chat": [getBrief],
    "target-setup": setup,
    "inbox-processing": inbox,
    get "mock-interview"() {
      const { interviews, progress } = built();
      return [...interviewTools(interviews), getTarget, searchQuestions, getProgress(progress)];
    },
    get "answer-search"() {
      return answerTools(built().answers);
    },
    get "side-thread"() {
      const { interviews, progress } = built();
      return [
        ...sideThreadTools(interviews),
        getTarget,
        searchQuestions,
        listSources,
        getSource,
        getProgress(progress),
      ];
    },
  };
  return {
    sets,
    bind: (ready: InterviewServices) => {
      services = ready;
    },
    /** The reading tools that the model tests call directly. */
    modelTools: { getTarget, searchQuestions },
  };
}

export interface FeatureDependencies extends AgentDependencies {
  /** Stand-ins for the components of speech recognition in tests; the real ones by default. */
  transcription?: TranscriptionComponents | undefined;
}

/**
 * Inbox processing starts its agent through `sessions`, which composeFeatures builds after the
 * sources slice; it exists by the first start.
 */
function inboxSessions(sessions: () => AgentSessions) {
  return {
    start: async (request: Parameters<AgentSessions["start"]>[0]) => sessions().start(request),
    end: async (sessionId: string) => sessions().end(sessionId),
    stop: async (sessionId: string) => sessions().stop(sessionId),
    subscribe: (...subscription: Parameters<AgentSessions["subscribe"]>) =>
      sessions().subscribe(...subscription),
    view: async (sessionId: string) => sessions().view(sessionId),
  };
}

/**
 * The Topic merges of a draft move the Attempts of `interviews`, and the question bank asks it which
 * Questions have Attempts. composeFeatures builds it after these slices; it exists by the first call.
 */
function topicMerges(interviews: () => ReturnType<typeof interviewsModule>) {
  return {
    mergeTopic: async (...merge: Parameters<ReturnType<typeof interviewsModule>["mergeTopic"]>) =>
      interviews().mergeTopic(...merge),
    attempted: async (targetId: string, questionIds: readonly string[]) =>
      interviews().attempted(targetId, questionIds),
  };
}

/**
 * What the Target slices take from the server; `interviews` and `sessions` are built after them and
 * exist by the first call.
 */
function targetDependencies(
  { clock, timer, dataDirectory, log, transcription }: FeatureDependencies,
  later: {
    interviews: () => ReturnType<typeof interviewsModule>;
    sessions: () => AgentSessions;
    answers: () => AnswerSearch;
  },
) {
  return {
    clock,
    timer,
    dataDirectory,
    transcription: transcriptionModule({
      dataDirectory,
      components: transcription,
      onError: (error) => log.error({ err: error }, "A download of speech recognition failed"),
    }),
    attempts: topicMerges(later.interviews),
    sessions: inboxSessions(later.sessions),
    onError: (error: unknown) =>
      log.error({ err: error }, "An Inbox processing failed in the background"),
    onInboxStarted: ({ targetId }: { targetId: string }) => {
      later.answers().inboxStarted(targetId);
    },
    onInboxFinished: (end: Parameters<AnswerSearch["inboxFinished"]>[0]) => {
      later.answers().inboxFinished(end);
    },
  };
}

/**
 * Opens the storage on the data directory and composes every core feature on it. Rejects with
 * DataDirectoryInUseError when another server holds the data directory.
 */
export async function composeFeatures(dependencies: FeatureDependencies) {
  const { clock, timer, dataDirectory, log } = dependencies;
  const storage = await openStorage({
    dataDirectory,
    clock,
    timer,
    migrations: sliceMigrations,
    onDumpFailed: (error) => log.error({ err: error }, "The periodic database dump failed"),
  });
  const runtime = composeRuntime(dependencies);
  const slices = composeTargets(
    storage,
    targetDependencies(dependencies, {
      interviews: () => interviews,
      sessions: () => sessions,
      answers: () => answers,
    }),
    runtime,
  );
  const { targets, questionBank, targetSetup, sources } = slices;
  const tools = sessionTools(slices);
  const { mcp, sessions } = composeSessions(storage, {
    ...dependencies,
    runtime,
    tools: tools.sets,
  });
  const { interviews, progress, answers } = composeSessionWork(storage, dependencies, {
    slices,
    runtime,
    sessions,
  });
  tools.bind({ interviews, progress, answers, sessions });
  return {
    storage,
    runtime,
    mcp,
    sessions,
    ...slices,
    interviews,
    progress,
    answers,
    /** Every slice that keeps data of a Target: deleting the Target erases it in each of them. */
    targetData: [interviews, questionBank, targetSetup, sources, answers, sessions, targets],
    createDemo: demoCreator({ targets, questionBank, clock }),
    modelTools: tools.modelTools,
    health: healthModule({ clock }),
  };
}

/** The composed services that the routes and the server lifecycle receive. */
export type Features = Awaited<ReturnType<typeof composeFeatures>>;
