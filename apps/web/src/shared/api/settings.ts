import { request } from "./request";

/** The application's settings from «Настройки». */
export interface AppSettings {
  /** The agent of Targets without their own; null means the first available agent. */
  readonly defaultAgent: string | null;
  /** «Наполнять в фоне»: answer search starts by itself after an Inbox processing and a mock. */
  readonly fillInBackground: boolean;
}

function isSettings(value: unknown): value is AppSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    "defaultAgent" in value &&
    (value.defaultAgent === null || typeof value.defaultAgent === "string") &&
    "fillInBackground" in value &&
    typeof value.fillInBackground === "boolean"
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
