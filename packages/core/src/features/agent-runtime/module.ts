import type { Timer } from "../../shared/time/index.ts";
import { createAgentRuntime } from "./application/agent-runtime.ts";
import type { AgentRuntime } from "./application/agent-runtime.ts";
import { agentKinds } from "./domain/agent.ts";
import type { AgentKind } from "./domain/agent.ts";
import { acpLauncher } from "./infrastructure/acp-process-launcher.ts";
import { inspectAgentHost } from "./infrastructure/installation.ts";
import { readOpencodeCredentials } from "./infrastructure/opencode-credentials.ts";
import type { UserEnvironment } from "./infrastructure/installation.ts";
import { skillDirectory } from "./infrastructure/skill-directory.ts";

export interface AgentRuntimeModuleDependencies {
  readonly timer: Timer;
  /** The data directory: the agents' own homes and configs live in it. */
  readonly dataDirectory: string;
  /**
   * The application's skills, the repository's `skills/`; each start copies the session's skill
   * into the data directory.
   */
  readonly skillsDirectory: string;
  /** Offers only the fake ACP agent, for tests and manual checks without a subscription. */
  readonly fakeAgent: boolean;
  /** The Candidate's home and env; without it the runtime offers no real agent. */
  readonly userEnvironment: UserEnvironment | undefined;
  /** Gets a problem the runtime works around, such as an unreadable OpenCode database; no secrets. */
  readonly onWarning: (message: string) => void;
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
  skillsDirectory,
  fakeAgent,
  userEnvironment,
  onWarning,
}: AgentRuntimeModuleDependencies): AgentRuntime {
  // The fake agent never needs the Candidate's home, so tests do not look into the real one.
  const environment = fakeAgent ? undefined : userEnvironment;
  const realAgents =
    environment === undefined ? [] : agentKinds.filter((agent) => isRealAgent(agent));
  return createAgentRuntime({
    agents: fakeAgent ? ["fake"] : realAgents,
    inspectHost: inspectAgentHost(environment ?? { home: dataDirectory, env: {} }, timer),
    readOpencodeCredentials: (database) => readOpencodeCredentials(database, onWarning),
    dataDirectory,
    readSkill: skillDirectory(skillsDirectory),
    // The fake agent needs none of the Candidate's variables.
    launch: acpLauncher({ timer, env: environment?.env ?? {} }),
  });
}
