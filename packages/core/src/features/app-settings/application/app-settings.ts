import type { OfferedAgents, SettingsRepository } from "../domain/ports.ts";
import type { AgentModel, AppSettings } from "../domain/settings.ts";

interface Dependencies {
  readonly repository: SettingsRepository;
  readonly agents: OfferedAgents;
}

/** Whether the server offers the agent. */
async function offers({ agents }: Dependencies, agent: string): Promise<boolean> {
  const offered = await agents.listAgents();
  return offered.some((entry) => entry.agent === agent);
}

/**
 * Stores the default agent, or null for the first available agent, and answers the settings;
 * `unknown_agent` for an agent the server does not offer. An unavailable agent stays.
 */
async function setDefaultAgent(
  dependencies: Dependencies,
  agent: string | null,
): Promise<AppSettings | "unknown_agent"> {
  if (agent !== null && !(await offers(dependencies, agent))) {
    return "unknown_agent";
  }
  await dependencies.repository.setDefaultAgent(agent);
  return dependencies.repository.get();
}

/**
 * Stores the model and the reasoning level of an agent (#111) and answers the settings;
 * `unknown_agent` for an agent the server does not offer. The values are not checked here: a
 * session start skips a value its agent no longer offers.
 */
async function setAgentModel(
  dependencies: Dependencies,
  agent: string,
  choice: AgentModel,
): Promise<AppSettings | "unknown_agent"> {
  if (!(await offers(dependencies, agent))) {
    return "unknown_agent";
  }
  await dependencies.repository.setAgentModel(agent, choice);
  return dependencies.repository.get();
}

/** The application's settings: the default agent, «Наполнять в фоне» and the agents' models. */
export function createAppSettings(dependencies: Dependencies) {
  const { repository } = dependencies;
  return {
    settings: repository.get,
    setDefaultAgent: async (agent: string | null) => setDefaultAgent(dependencies, agent),
    setAgentModel: async (agent: string, choice: AgentModel) =>
      setAgentModel(dependencies, agent, choice),
    /** The stored model and reasoning level of the agent; both null without a stored choice. */
    agentModel: async (agent: string): Promise<AgentModel> => {
      const settings = await repository.get();
      return settings.agentModels[agent] ?? { model: null, effort: null };
    },
    /** «Наполнять в фоне» on or off; answers the settings. */
    setFillInBackground: async (enabled: boolean) => {
      await repository.setFillInBackground(enabled);
      return repository.get();
    },
    /** Whether an answer search starts by itself after an Inbox processing and a Mock interview. */
    fillInBackground: async () => {
      const settings = await repository.get();
      return settings.fillInBackground;
    },
    /** The default agent of Targets without their own; null without the setting. */
    defaultAgent: async () => {
      const settings = await repository.get();
      return settings.defaultAgent;
    },
  };
}
export type AppSettingsService = ReturnType<typeof createAppSettings>;
