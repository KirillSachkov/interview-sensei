import type { AgentAvailability, AgentKind, Installation } from "../domain/agent.ts";
import { isAgentKind, launchRecipe } from "../domain/agent.ts";
import type { AcpLauncher, AgentListeners, LiveAgent } from "../domain/ports.ts";

export interface AgentRuntimeDependencies {
  /** The agents this server offers; the fake agent only when the server enables it. */
  readonly agents: readonly AgentKind[];
  readonly installation: Installation;
  readonly launch: AcpLauncher;
}

/** Checks which agents are available, starts them through ACP and passes on their events. */
export interface AgentRuntime {
  readonly listAgents: () => readonly AgentAvailability[];
  readonly start: (
    request: AgentListeners & { agent: string; workingDirectory: string },
  ) => Promise<LiveAgent>;
}

export function createAgentRuntime({
  agents,
  installation,
  launch,
}: AgentRuntimeDependencies): AgentRuntime {
  return {
    listAgents: () => agents.map((agent) => ({ agent, available: true })),
    start: async ({ agent, workingDirectory, onUpdate, onExit }) => {
      if (!isAgentKind(agent) || !agents.includes(agent)) {
        throw new Error(`The agent ${agent} is not available`);
      }
      return launch(launchRecipe(agent, installation, workingDirectory), { onUpdate, onExit });
    },
  };
}
