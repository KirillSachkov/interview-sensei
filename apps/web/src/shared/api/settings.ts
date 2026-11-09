import { request } from "./request";

/** The application's settings from «Настройки». */
export interface AppSettings {
  /** The agent of Targets without their own; null means the first available agent. */
  readonly defaultAgent: string | null;
}

function isSettings(value: unknown): value is AppSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    "defaultAgent" in value &&
    (value.defaultAgent === null || typeof value.defaultAgent === "string")
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
