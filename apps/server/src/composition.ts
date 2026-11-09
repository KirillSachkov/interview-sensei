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

import { agentRuntimeModule } from "@interview-sensei/core/agent-runtime";
import type { AgentRuntime, UserEnvironment } from "@interview-sensei/core/agent-runtime";
import {
  agentSessionsMigrations,
  agentSessionsModule,
} from "@interview-sensei/core/agent-sessions";
import { healthModule } from "@interview-sensei/core/health";
import { getBrief, mcpGatewayModule } from "@interview-sensei/core/mcp-gateway";
import type { SessionTool } from "@interview-sensei/core/mcp-gateway";
import type { SessionKind } from "@interview-sensei/core/session-kinds";
import { openStorage } from "@interview-sensei/core/storage";
import type { SliceMigrations, Storage } from "@interview-sensei/core/storage";
import type { Clock, Timer } from "@interview-sensei/core/time";
import type { Targets } from "@interview-sensei/core/targets";
import type { QuestionBank } from "@interview-sensei/core/question-bank";
import type { FastifyBaseLogger } from "fastify";

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
];

/**
 * The MCP tool set of each session kind. A slice exports its tools from its index.ts; add them to
 * the kinds that need them. It compiles only while every session kind has an entry.
 */
const sessionTools: Readonly<Record<SessionKind, readonly SessionTool[]>> = {
  "service-chat": [getBrief],
};

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
  /** Receives the failures of background work. */
  log: FastifyBaseLogger;
}

/**
 * Opens the storage on the data directory and composes every core feature on it. Rejects with
 * DataDirectoryInUseError when another server holds the data directory.
 */
export async function composeFeatures({
  clock,
  timer,
  dataDirectory,
  skillsDirectory,
  fakeAgent,
  userEnvironment,
  origin,
  log,
}: FeatureDependencies) {
  const storage = await openStorage({
    dataDirectory,
    clock,
    timer,
    migrations: sliceMigrations,
    onDumpFailed: (error) => {
      log.error({ err: error }, "The periodic database dump failed");
    },
  });
  const { runtime, mcp, sessions } = composeAgents(storage, {
    timer,
    dataDirectory,
    skillsDirectory,
    fakeAgent,
    userEnvironment,
    origin,
    log,
    clock,
  });
  const { questionBank, targets } = composeTargets(storage, clock, runtime);
  const modelTools = {
    getTarget: getTarget(targets),
    searchQuestions: searchQuestions(questionBank, targets),
  };
  const createDemo = demoCreator({ targets, questionBank, clock });
  return {
    storage,
    runtime,
    mcp,
    sessions,
    targets,
    questionBank,
    createDemo,
    modelTools,
    health: healthModule({ clock }),
  };
}

/** Targets and their Questions; a Target's agent is one of the agents that `runtime` offers. */
function composeTargets(storage: Storage, clock: Clock, runtime: AgentRuntime) {
  const questionBank = questionBankModule({ database: storage.database });
  const targets = targetsModule({
    database: storage.database,
    clock,
    topics: questionBank,
    agents: runtime,
  });
  return { questionBank, targets };
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

function composeAgents(
  storage: Storage,
  {
    timer,
    dataDirectory,
    skillsDirectory,
    fakeAgent,
    userEnvironment,
    origin,
    log,
    clock,
  }: FeatureDependencies,
) {
  const runtime = agentRuntimeModule({
    timer,
    dataDirectory,
    skillsDirectory,
    fakeAgent,
    userEnvironment,
    onWarning: (message) => {
      log.warn(message);
    },
  });
  const mcp = mcpGatewayModule({
    tools: sessionTools,
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
  return { runtime, mcp, sessions };
}

/** The composed services that the routes and the server lifecycle receive. */
export type Features = Awaited<ReturnType<typeof composeFeatures>>;

export { mcpGatewayModule } from "@interview-sensei/core/mcp-gateway";
