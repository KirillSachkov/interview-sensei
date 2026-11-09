// The only server module that imports core features (`server-composes-features-in-one-module`).
// Each feature gives one module factory that hides its infrastructure; this module calls each
// factory once and hands the routes finished services. Routes take the types they need from here.
import {
  questionBankModule,
  questionBankMigrations,
  searchQuestions,
  demoTarget,
  demoQuestions,
} from "@interview-sensei/core/question-bank";
import { targetsModule, targetsMigrations, getTarget } from "@interview-sensei/core/targets";
import {
  draftTools,
  setupBrief,
  targetSetupMigrations,
  targetSetupModule,
} from "@interview-sensei/core/target-setup";
import { sourceTools, sourcesMigrations, sourcesModule } from "@interview-sensei/core/sources";

import { agentRuntimeModule } from "@interview-sensei/core/agent-runtime";
import type { AgentRuntime, UserEnvironment } from "@interview-sensei/core/agent-runtime";
import {
  agentSessionsMigrations,
  agentSessionsModule,
} from "@interview-sensei/core/agent-sessions";
import { healthModule } from "@interview-sensei/core/health";
import { getBrief, mcpGatewayModule } from "@interview-sensei/core/mcp-gateway";
import { openStorage } from "@interview-sensei/core/storage";
import type { SliceMigrations, Storage } from "@interview-sensei/core/storage";
import type { Clock, Timer } from "@interview-sensei/core/time";
import type { Targets } from "@interview-sensei/core/targets";
import type { QuestionBank } from "@interview-sensei/core/question-bank";

export type { AgentRuntime, UserEnvironment } from "@interview-sensei/core/agent-runtime";
export { SessionsClosedError } from "@interview-sensei/core/agent-sessions";
export { UnknownAgentError } from "@interview-sensei/core/targets";
export type { AgentSessions, SessionView } from "@interview-sensei/core/agent-sessions";
export { mcpRoute } from "@interview-sensei/core/mcp-gateway";
export type { McpGateway } from "@interview-sensei/core/mcp-gateway";

/**
 * The migrations of every core slice that stores data, applied at each start in this order. A
 * slice exports its SliceMigrations from its index.ts; add it here.
 */
const sliceMigrations: readonly SliceMigrations[] = [
  agentSessionsMigrations,
  questionBankMigrations,
  targetsMigrations,
  targetSetupMigrations,
  sourcesMigrations,
];

type Slices = ReturnType<typeof composeTargets> & { sources: ReturnType<typeof sourcesModule> };
/**
 * The MCP tool set of each session kind. A slice exports its tools from its index.ts; add them to
 * the kinds that need them. It compiles only while every session kind has an entry.
 */
function sessionTools({ targets, questionBank, targetSetup, sources }: Slices) {
  return {
    "service-chat": [getBrief],
    "target-setup": [
      setupBrief(targetSetup),
      getTarget(targets),
      searchQuestions(questionBank, targets),
      ...draftTools(targetSetup),
      ...sourceTools(sources),
    ],
  };
}

export interface FeatureDependencies {
  clock: Clock;
  timer: Timer;
  /** The data directory this server owns; see resolveDataDirectory. */
  dataDirectory: string;
  /** The application's skills for the agents; see ServerDependencies. */
  skillsDirectory: string;
  /** Offers only the fake ACP agent; see ServerDependencies. */
  fakeAgent: boolean;
  /** The Candidate's home and env; see ServerDependencies. */
  userEnvironment: UserEnvironment | undefined;
  /** The server's own loopback origin for the MCP addresses; throws before it listens. */
  origin: () => string;
  /** Receives the failures of background work: the server's logger. */
  log: {
    readonly warn: (details: object | string, message?: string) => void;
    readonly error: (details: object, message: string) => void;
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
    onDumpFailed: (error) => {
      log.error({ err: error }, "The periodic database dump failed");
    },
  });
  const runtime = agentRuntimeModule({
    ...dependencies,
    onWarning: (message) => {
      log.warn(message);
    },
  });
  const slices = composeTargets(storage, clock, runtime);
  const { targets, questionBank } = slices;
  const sources = sourcesModule({ database: storage.database, dataDirectory, clock, targets });
  const tools = sessionTools({ ...slices, sources });
  const { mcp, sessions } = composeSessions(storage, { ...dependencies, runtime, tools });
  const modelTools = {
    getTarget: getTarget(targets),
    searchQuestions: searchQuestions(questionBank, targets),
  };
  return {
    storage,
    runtime,
    mcp,
    sessions,
    ...slices,
    sources,
    createDemo: demoCreator({ targets, questionBank, clock }),
    modelTools,
    health: healthModule({ clock }),
  };
}

/**
 * Targets, their Questions and the drafts of their changes; a Target's agent is one of the agents
 * that `runtime` offers.
 */
function composeTargets(storage: Storage, clock: Clock, runtime: AgentRuntime) {
  const questionBank = questionBankModule({ database: storage.database });
  const targets = targetsModule({
    database: storage.database,
    clock,
    topics: questionBank,
    agents: runtime,
  });
  const targetSetup = targetSetupModule({
    database: storage.database,
    transaction: storage.transaction,
    clock,
    targets,
    topics: questionBank,
  });
  return { questionBank, targets, targetSetup };
}

interface DemoDependencies {
  targets: Targets;
  questionBank: QuestionBank;
  clock: Clock;
}

function demoTopics(targetId: string) {
  return demoTarget.topics.map((topic) => ({
    id: crypto.randomUUID(),
    targetId,
    name: topic.name,
    key: topic.key,
  }));
}
function demoTopicId(topics: ReturnType<typeof demoTopics>, key: string) {
  const topic = topics.find((entry) => entry.key === key);
  if (topic === undefined) {
    throw new Error(`Unknown demo Topic: ${key}`);
  }
  return topic.id;
}
function questionsForDemo(topics: ReturnType<typeof demoTopics>, targetId: string, clock: Clock) {
  return demoQuestions.map((question) => {
    const common = {
      id: crypto.randomUUID(),
      targetId,
      topicId: demoTopicId(topics, question.topicKey),
      text: question.text,
      level: demoTarget.level,
      sourceIds: [],
      unconfirmed: false,
      hidden: false,
      rating: null,
      createdAt: clock.now().toISOString(),
    };
    return question.format === "open"
      ? Object.assign(common, {
          format: "open" as const,
          options: [] as const,
          correctOptionIds: [] as const,
        })
      : Object.assign(common, {
          format: "quiz" as const,
          options: question.options,
          correctOptionIds: question.correctOptionIds,
        });
  });
}
async function createDemoTarget({ targets, questionBank, clock }: DemoDependencies) {
  const targetId = crypto.randomUUID();
  const topics = demoTopics(targetId);
  await questionBank.seed(topics, questionsForDemo(topics, targetId, clock));
  // Publish the Target only after its Question bank is ready.
  return targets.create({
    id: targetId,
    name: demoTarget.name,
    level: demoTarget.level,
    status: "active",
    demo: true,
    sections: demoTarget.sections.map((section, position) => ({
      id: crypto.randomUUID(),
      position,
      name: section.name,
      kind: section.kind,
      gradingCriteria: section.gradingCriteria,
      enabled: true,
      topicIds: section.topicKeys.map((key) => demoTopicId(topics, key)),
    })),
  });
}
async function existingDemo(targets: Targets) {
  const existing = await targets.activeDemo();
  if (existing === undefined) {
    return null;
  }
  const target = await targets.get(existing.id);
  if (target === undefined) {
    throw new Error("The demo Target disappeared");
  }
  return target;
}
function demoCreator(dependencies: DemoDependencies) {
  let creating: Promise<Awaited<ReturnType<typeof createDemoTarget>>> | null = null;
  return async () => {
    const target = await existingDemo(dependencies.targets);
    if (target !== null) {
      return { target, created: false };
    }
    if (creating !== null) {
      return { target: await creating, created: false };
    }
    creating = createDemoTarget(dependencies);
    try {
      return { target: await creating, created: true };
    } finally {
      creating = null;
    }
  };
}

/** The MCP addresses with the tool set of each kind, and the AgentSessions that use them. */
function composeSessions(
  storage: Storage,
  {
    runtime,
    tools,
    clock,
    dataDirectory,
    origin,
    log,
  }: Pick<FeatureDependencies, "clock" | "dataDirectory" | "origin" | "log"> & {
    runtime: AgentRuntime;
    tools: ReturnType<typeof sessionTools>;
  },
) {
  const mcp = mcpGatewayModule({
    tools,
    origin,
    onError: (error) => {
      log.warn({ err: error }, "An MCP request failed");
    },
  });
  const sessions = agentSessionsModule({
    database: storage.database,
    launcher: runtime,
    mcp,
    clock,
    dataDirectory,
    onError: (error) => {
      log.error({ err: error }, "An agent session failed in the background");
    },
  });
  return { mcp, sessions };
}

/** The composed services that the routes and the server lifecycle receive. */
export type Features = Awaited<ReturnType<typeof composeFeatures>>;

export { mcpGatewayModule } from "@interview-sensei/core/mcp-gateway";
