// The only server module that imports core features (`server-composes-features-in-one-module`).
// Each feature gives one module factory that hides its infrastructure; this module calls each
// factory once and hands the routes finished services. Routes take the types they need from here.
import {
  questionBankModule,
  questionBankMigrations,
  searchQuestions,
  demoBank,
  demoTarget,
} from "@interview-sensei/core/question-bank";
import { targetsModule, targetsMigrations, getTarget } from "@interview-sensei/core/targets";
import {
  interviewsMigrations,
  interviewsModule,
  interviewTools,
} from "@interview-sensei/core/interviews";
import type { Interviews } from "@interview-sensei/core/interviews";

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
import type { FastifyBaseLogger } from "fastify";

export type { AgentRuntime, UserEnvironment } from "@interview-sensei/core/agent-runtime";
export { SessionsClosedError } from "@interview-sensei/core/agent-sessions";
export { UnknownAgentError } from "@interview-sensei/core/targets";
export type { AgentSessions, SessionView } from "@interview-sensei/core/agent-sessions";
export { mcpRoute } from "@interview-sensei/core/mcp-gateway";
export type { McpGateway } from "@interview-sensei/core/mcp-gateway";
export type { InterviewView, StartRequest } from "@interview-sensei/core/interviews";

/**
 * The migrations of every core slice that stores data, applied at each start in this order. A
 * slice exports its SliceMigrations from its index.ts; add it here.
 */
const sliceMigrations: readonly SliceMigrations[] = [
  agentSessionsMigrations,
  questionBankMigrations,
  targetsMigrations,
  interviewsMigrations,
];

/** The MCP tool set of each session kind, as the gateway takes it. */
type SessionToolSets = Parameters<typeof mcpGatewayModule>[0]["tools"];

/** The services whose MCP tools the session kinds use; composeFeatures builds them after the gateway. */
interface ToolServices {
  interviews: Interviews;
  targets: Targets;
  questionBank: QuestionBank;
}

/**
 * The MCP tool set of each session kind. A slice exports its tools from its index.ts; add them to
 * the kinds that need them. It compiles only while every session kind has an entry. The gateway
 * reads a set when a session starts; `bind` gives the sets the services once composeFeatures has
 * built them, after the gateway.
 */
function sessionTools() {
  let services: ToolServices | null = null;
  const built = () => {
    if (services === null) {
      throw new Error("A session started before the server composed its features");
    }
    return services;
  };
  const sets: SessionToolSets = {
    "service-chat": [getBrief],
    get "mock-interview"() {
      const { interviews, targets, questionBank } = built();
      return [
        ...interviewTools(interviews),
        getTarget(targets),
        searchQuestions(questionBank, targets),
      ];
    },
  };
  return {
    sets,
    bind: (ready: ToolServices) => {
      services = ready;
    },
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
  const tools = sessionTools();
  const { runtime, mcp, sessions } = composeAgents(
    storage,
    { timer, dataDirectory, skillsDirectory, fakeAgent, userEnvironment, origin, log, clock },
    tools.sets,
  );
  const { questionBank, targets } = composeTargets(storage, clock, runtime);
  const services = { clock, timer, targets, sessions, agents: runtime, questions: questionBank };
  const interviews = composeInterviews(storage, log, services);
  tools.bind({ interviews, targets, questionBank });
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
    interviews,
    createDemo,
    modelTools,
    health: healthModule({ clock }),
  };
}

/** Mock interviews: the Target's agent is the interviewer in an AgentSession. */
function composeInterviews(
  storage: Storage,
  log: FastifyBaseLogger,
  services: Omit<Parameters<typeof interviewsModule>[0], "database" | "onError">,
) {
  return interviewsModule({
    database: storage.database,
    ...services,
    onError: (error) => {
      log.error({ err: error }, "A mock interview failed in the background");
    },
  });
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

async function createDemoTarget({ targets, questionBank, clock }: DemoDependencies) {
  const targetId = crypto.randomUUID();
  const { topics, questions, topicIdOf } = demoBank(targetId, clock.now().toISOString());
  await questionBank.seed(topics, questions);
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
      topicIds: section.topicKeys.map((key) => topicIdOf(key)),
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
  tools: SessionToolSets,
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
  return { runtime, mcp, sessions };
}

/** The composed services that the routes and the server lifecycle receive. */
export type Features = Awaited<ReturnType<typeof composeFeatures>>;

export { mcpGatewayModule } from "@interview-sensei/core/mcp-gateway";
