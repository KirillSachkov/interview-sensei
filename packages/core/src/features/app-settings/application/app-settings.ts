import type { OfferedAgents, SettingsRepository } from "../domain/ports.ts";
import type { AppSettings } from "../domain/settings.ts";

interface Dependencies {
  readonly repository: SettingsRepository;
  readonly agents: OfferedAgents;
}

/**
 * Stores the default agent, or null for the first available agent, and answers the settings;
 * `unknown_agent` for an agent the server does not offer. An unavailable agent stays.
 */
async function setDefaultAgent(
  { repository, agents }: Dependencies,
  agent: string | null,
): Promise<AppSettings | "unknown_agent"> {
  const offered = agent === null ? [] : await agents.listAgents();
  if (agent !== null && !offered.some((entry) => entry.agent === agent)) {
    return "unknown_agent";
  }
  await repository.setDefaultAgent(agent);
  return repository.get();
}

/** The application's settings: the default agent and «Наполнять в фоне». */
export function createAppSettings(dependencies: Dependencies) {
  const { repository } = dependencies;
  return {
    settings: repository.get,
    setDefaultAgent: async (agent: string | null) => setDefaultAgent(dependencies, agent),
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
