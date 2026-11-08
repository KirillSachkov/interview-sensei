import path from "node:path";

import {
  acpLauncher,
  createAgentRuntime,
  localInstallation,
} from "@interview-sensei/core/agent-runtime";
import {
  createAgentSessions,
  drizzleSessionRepository,
} from "@interview-sensei/core/agent-sessions";
import type { Storage } from "@interview-sensei/core/storage";
import type { Clock, Timer } from "@interview-sensei/core/time";
import type { FastifyInstance } from "fastify";

import { mountMcpGateway } from "./mcp.ts";

/**
 * The agents and AgentSessions of this server, on its storage. Each session gets its own MCP
 * address on this server.
 */
export function composeAgentSessions(
  server: FastifyInstance,
  storage: Storage,
  {
    clock,
    timer,
    dataDirectory,
    fakeAgent,
  }: { clock: Clock; timer: Timer; dataDirectory: string; fakeAgent: boolean },
) {
  const runtime = createAgentRuntime({
    agents: fakeAgent ? ["fake"] : [],
    installation: localInstallation(),
    launch: acpLauncher({ timer }),
  });
  const sessions = createAgentSessions({
    repository: drizzleSessionRepository(storage.database),
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
