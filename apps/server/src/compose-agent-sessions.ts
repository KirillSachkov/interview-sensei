import path from "node:path";

import {
  acpLauncher,
  agentKinds,
  createAgentRuntime,
  inspectAgentHost,
} from "@interview-sensei/core/agent-runtime";
import type { AgentKind, UserEnvironment } from "@interview-sensei/core/agent-runtime";
import {
  createAgentSessions,
  drizzleSessionRepository,
} from "@interview-sensei/core/agent-sessions";
import type { Storage } from "@interview-sensei/core/storage";
import type { Clock, Timer } from "@interview-sensei/core/time";
import type { FastifyInstance } from "fastify";

import { mountMcpGateway } from "./mcp.ts";

/** Every agent kind but the fake one, which only tests and manual checks get. */
function isRealAgent(agent: AgentKind): agent is Exclude<AgentKind, "fake"> {
  return agent !== "fake";
}

/**
 * The agents and AgentSessions of this server, on its storage. Each session gets its own MCP
 * address on this server. With the fake agent the server offers only it, so tests never start a
 * real agent; otherwise it offers the real agents of the Candidate's environment, or none without
 * one.
 */
export function composeAgentSessions(
  server: FastifyInstance,
  storage: Storage,
  {
    clock,
    timer,
    dataDirectory,
    fakeAgent,
    userEnvironment,
  }: {
    clock: Clock;
    timer: Timer;
    dataDirectory: string;
    fakeAgent: boolean;
    userEnvironment: UserEnvironment | undefined;
  },
) {
  // The fake agent never needs the Candidate's home, so tests do not look into the real one.
  const environment = fakeAgent ? undefined : userEnvironment;
  const realAgents =
    environment === undefined ? [] : agentKinds.filter((agent) => isRealAgent(agent));
  const runtime = createAgentRuntime({
    agents: fakeAgent ? ["fake"] : realAgents,
    inspectHost: inspectAgentHost(environment ?? { home: dataDirectory, env: {} }),
    dataDirectory,
    // The fake agent needs none of the Candidate's variables.
    launch: acpLauncher({ timer, env: environment?.env ?? {} }),
  });
  const sessions = createAgentSessions({
    repository: drizzleSessionRepository(storage.database),
    // Compiles only while every session kind of agent-sessions has a launch recipe in the runtime.
    launcher: runtime,
    clock,
    mcp: mountMcpGateway(server),
    sessionsDirectory: path.join(dataDirectory, "sessions"),
    onError: (error) => {
      server.log.error({ err: error }, "An agent session failed in the background");
    },
  });
  return { runtime, sessions };
}
