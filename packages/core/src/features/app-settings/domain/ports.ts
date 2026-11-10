import type { AppSettings } from "./settings.ts";

/** Stores the one row of the application's settings. */
export interface SettingsRepository {
  /** The stored settings; the defaults before the first change. */
  readonly get: () => Promise<AppSettings>;
  readonly setDefaultAgent: (agent: string | null) => Promise<void>;
  readonly setFillInBackground: (enabled: boolean) => Promise<void>;
}

/** The agent-runtime slice supplies the agents the server offers. */
export interface OfferedAgents {
  readonly listAgents: () => Promise<readonly { readonly agent: string }[]>;
}
