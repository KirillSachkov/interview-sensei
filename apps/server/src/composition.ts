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
import type { interviewsModule } from "@interview-sensei/core/interviews";
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
 * The services that composeFeatures builds after the Target slices and the gateway, which call
 * them: the Mock interviews, progress, answer search and the AgentSessions.
 */
interface LaterServices {
  readonly interviews: ReturnType<typeof interviewsModule>;
  readonly progress: Progress;
  readonly answers: AnswerSearch;
  readonly sessions: AgentSessions;
}

/** The services built later; it throws before composeFeatures binds them. */
type Later = () => LaterServices;

/**
 * The services built later: `get` gives them once `bind` has, and throws before, so a call during
 * the composition fails with a clear message instead of reaching an unset variable.
 */
function laterServices() {
  let services: LaterServices | null = null;
  return {
    get: (): LaterServices => {
      if (services === null) {
        throw new Error("A service was called before the server composed its features");
      }
      return services;
    },
    bind: (ready: LaterServices) => {
      services = ready;
    },
  };
}

/**
 * The MCP tool set of each session kind. A slice exports its tools from its index.ts; add them to
 * the kinds that need them. It compiles only while every session kind has an entry. The gateway
 * reads a set when a session starts; the sets of the mock interview, the Side thread and the answer
 * search take their services from `later`, which composeFeatures binds after the gateway.
 */
function sessionTools(slices: ReturnType<typeof composeTargets>, later: Later) {
  const { getTarget, searchQuestions, listSources, getSource, setup, inbox } = targetTools(
    slices,
    async (sessionId) => later().sessions.earlierMessages(sessionId),
  );
  const sets: SessionToolSets = {
    "service-chat": [getBrief],
    "target-setup": setup,
    "inbox-processing": inbox,
    get "mock-interview"() {
      const { interviews, progress } = later();
      return [...interviewTools(interviews), getTarget, searchQuestions, getProgress(progress)];
    },
    get "answer-search"() {
      return answerTools(later().answers);
    },
    get "side-thread"() {
      const { interviews, progress } = later();
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
 * sources slice and binds in `later` before the first start.
 */
function inboxSessions(later: Later) {
  const sessions = () => later().sessions;
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
 * Questions have Attempts. composeFeatures builds it after these slices and binds it in `later`.
 */
function topicMerges(later: Later) {
  return {
    mergeTopic: async (...merge: Parameters<ReturnType<typeof interviewsModule>["mergeTopic"]>) =>
      later().interviews.mergeTopic(...merge),
    attempted: async (targetId: string, questionIds: readonly string[]) =>
      later().interviews.attempted(targetId, questionIds),
  };
}

/**
 * What the Target slices take from the server; `later` gives the services built after them.
 */
function targetDependencies(
  { clock, timer, dataDirectory, log, transcription }: FeatureDependencies,
  later: Later,
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
    attempts: topicMerges(later),
    sessions: inboxSessions(later),
    onError: (error: unknown) =>
      log.error({ err: error }, "An Inbox processing failed in the background"),
    onInboxStarted: ({ targetId }: { targetId: string }) => {
      later().answers.inboxStarted(targetId);
    },
    onInboxFinished: (end: Parameters<AnswerSearch["inboxFinished"]>[0]) => {
      later().answers.inboxFinished(end);
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
  const later = laterServices();
  const slices = composeTargets(storage, targetDependencies(dependencies, later.get), runtime);
  const tools = sessionTools(slices, later.get);
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
  later.bind({ interviews, progress, answers, sessions });
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
    targetData: [
      interviews,
      slices.questionBank,
      slices.targetSetup,
      slices.sources,
      answers,
      sessions,
      slices.targets,
    ],
    createDemo: demoCreator({ ...slices, clock }),
    modelTools: tools.modelTools,
    health: healthModule({ clock }),
  };
}

/** The composed services that the routes and the server lifecycle receive. */
export type Features = Awaited<ReturnType<typeof composeFeatures>>;
