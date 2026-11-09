import type { Timer } from "../../shared/time/index.ts";
import { createAgentRuntime } from "./application/agent-runtime.ts";
import type { AgentRuntime } from "./application/agent-runtime.ts";
import { agentKinds } from "./domain/agent.ts";
import type { AgentKind } from "./domain/agent.ts";
import { acpLauncher } from "./infrastructure/acp-process-launcher.ts";
import { inspectAgentHost } from "./infrastructure/installation.ts";
import type { UserEnvironment } from "./infrastructure/installation.ts";

export interface AgentRuntimeModuleDependencies {
  readonly timer: Timer;
  /** The data directory: the agents' own homes and configs live in it. */
  readonly dataDirectory: string;
  /** Offers only the fake ACP agent, for tests and manual checks without a subscription. */
  readonly fakeAgent: boolean;
  /** The Candidate's home and env; without it the runtime offers no real agent. */
  readonly userEnvironment: UserEnvironment | undefined;
}

/** Every agent kind but the fake one, which only tests and manual checks get. */
function isRealAgent(agent: AgentKind): agent is Exclude<AgentKind, "fake"> {
  return agent !== "fake";
}

/**
 * The agents of this server, started as ACP processes. With the fake agent the runtime offers only
 * it, so tests never start a real agent; otherwise it offers the real agents of the Candidate's
 * environment, or none without one.
 */
export function agentRuntimeModule({
  timer,
  dataDirectory,
  fakeAgent,
  userEnvironment,
}: AgentRuntimeModuleDependencies): AgentRuntime {
  // The fake agent never needs the Candidate's home, so tests do not look into the real one.
  const environment = fakeAgent ? undefined : userEnvironment;
  const realAgents =
    environment === undefined ? [] : agentKinds.filter((agent) => isRealAgent(agent));
  return createAgentRuntime({
    agents: fakeAgent ? ["fake"] : realAgents,
    inspectHost: inspectAgentHost(environment ?? { home: dataDirectory, env: {} }),
    dataDirectory,
    // The fake agent needs none of the Candidate's variables.
    launch: acpLauncher({ timer, env: environment?.env ?? {} }),
  });
}
