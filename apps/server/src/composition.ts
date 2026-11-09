// The only server module that imports core features (`server-composes-features-in-one-module`),
// with its parts composition-targets.ts and composition-agents.ts. Each feature gives one module
// factory that hides its infrastructure; this module calls each factory once and hands the routes
// finished services. Routes take the types they need from here.
import {
  interviewsMigrations,
  interviewsModule,
  interviewTools,
  sideThreadTools,
} from "@interview-sensei/core/interviews";
import { getProgress, progressModule } from "@interview-sensei/core/progress";
import { healthModule } from "@interview-sensei/core/health";
import { openStorage } from "@interview-sensei/core/storage";
import type { SliceMigrations, Storage } from "@interview-sensei/core/storage";
import type { Interviews } from "@interview-sensei/core/interviews";
import type { Progress } from "@interview-sensei/core/progress";

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
export { grades } from "@interview-sensei/core/interviews";
export type * from "@interview-sensei/core/interviews";

/**
 * The migrations of every core slice that stores data, applied at each start in this order. A
 * slice exports its SliceMigrations from its index.ts; add it here.
 */
const sliceMigrations: readonly SliceMigrations[] = [
  agentSessionsMigrations,
  ...targetSliceMigrations,
  interviewsMigrations,
];

/**
 * The services of the tools of the mock interview and the Side thread, and the AgentSessions that
 * the setup's `get_brief` reads the earlier conversation from; composeFeatures builds them after
 * the gateway.
 */
interface InterviewServices {
  interviews: Interviews;
  progress: Progress;
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
  const { getTarget, searchQuestions, listSources, getSource, setup } = targetTools(
    slices,
    async (sessionId) => built().sessions.earlierMessages(sessionId),
  );
  const sets: SessionToolSets = {
    "service-chat": [getBrief],
    "target-setup": setup,
    get "mock-interview"() {
      const { interviews, progress } = built();
      return [...interviewTools(interviews), getTarget, searchQuestions, getProgress(progress)];
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

export type FeatureDependencies = AgentDependencies;

/** Mock interviews and the progress of their Attempts; the interviews' brief reads progress back. */
function composeInterviews(
  storage: Storage,
  log: FeatureDependencies["log"],
  services: Omit<Parameters<typeof interviewsModule>[0], "database" | "onError" | "progress">,
) {
  const interviews: ReturnType<typeof interviewsModule> = interviewsModule({
    database: storage.database,
    ...services,
    progress: { focus: async (targetId) => progress.focus(targetId) },
    onError: (error) => log.error({ err: error }, "A mock interview failed in the background"),
  });
  const progress = progressModule({ plans: services.targets, attempts: interviews });
  return { interviews, progress };
}

/**
 * The Topic merges of a draft move the Attempts of `interviews`, which composeFeatures builds after
 * target-setup; it exists by the first application of a draft.
 */
function topicMerges(interviews: () => ReturnType<typeof interviewsModule>) {
  return {
    mergeTopic: async (...merge: Parameters<ReturnType<typeof interviewsModule>["mergeTopic"]>) =>
      interviews().mergeTopic(...merge),
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
    { clock, dataDirectory, attempts: topicMerges(() => interviews) },
    runtime,
  );
  const { targets, questionBank } = slices;
  const tools = sessionTools(slices);
  const { mcp, sessions } = composeSessions(storage, {
    ...dependencies,
    runtime,
    tools: tools.sets,
  });
  const { interviews, progress } = composeInterviews(storage, log, {
    clock,
    timer,
    targets,
    sessions,
    agents: runtime,
    questions: questionBank,
  });
  tools.bind({ interviews, progress, sessions });
  return {
    storage,
    runtime,
    mcp,
    sessions,
    ...slices,
    interviews,
    progress,
    /** Every slice that keeps data of a Target: deleting the Target erases it in each of them. */
    targetData: [interviews, questionBank, slices.targetSetup, slices.sources, sessions, targets],
    createDemo: demoCreator({ targets, questionBank, clock }),
    modelTools: tools.modelTools,
    health: healthModule({ clock }),
  };
}

/** The composed services that the routes and the server lifecycle receive. */
export type Features = Awaited<ReturnType<typeof composeFeatures>>;
