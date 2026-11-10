import { path, request } from "./http";

/** The Candidate's default model and reasoning level of one agent; null means the agent's own. */
export interface AgentModelChoice {
  readonly model: string | null;
  readonly effort: string | null;
}

/** The application's settings from «Настройки». */
export interface AppSettings {
  /** The agent of Targets without their own; null means the first available agent. */
  readonly defaultAgent: string | null;
  /** «Наполнять в фоне»: answer search starts by itself after an Inbox processing and a mock. */
  readonly fillInBackground: boolean;
  /** The default model and reasoning level by agent; only agents with a stored choice. */
  readonly agentModels: Readonly<Record<string, AgentModelChoice>>;
}

function isSettings(value: unknown): value is AppSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    "defaultAgent" in value &&
    (value.defaultAgent === null || typeof value.defaultAgent === "string") &&
    "fillInBackground" in value &&
    typeof value.fillInBackground === "boolean" &&
    "agentModels" in value &&
    typeof value.agentModels === "object" &&
    value.agentModels !== null
  );
}

export async function fetchSettings(): Promise<AppSettings> {
  const body = await request("/api/settings");
  if (!isSettings(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** Stores the default agent; null returns Targets to the first available agent. */
export async function chooseDefaultAgent(agent: string | null): Promise<AppSettings> {
  const body = await request("/api/settings/default-agent", { method: "PUT", body: { agent } });
  if (!isSettings(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** Turns «Наполнять в фоне» on or off. */
export async function setFillInBackground(enabled: boolean): Promise<AppSettings> {
  const body = await request("/api/settings/fill-in-background", {
    method: "PUT",
    body: { enabled },
  });
  if (!isSettings(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** Stores the agent's default model and reasoning level; null returns to the agent's own. */
export async function setAgentModel(agent: string, choice: AgentModelChoice): Promise<AppSettings> {
  const body = await request(`/api/settings/agent-models/${path(agent)}`, {
    method: "PUT",
    body: choice,
  });
  if (!isSettings(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}
