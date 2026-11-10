import { path, request } from "./http";

/**
 * One agent from GET /api/agents and whether the Candidate can choose it now; `reason` says in
 * Russian why not and what to do.
 */
export type AgentAvailability =
  | { readonly agent: string; readonly available: true }
  | { readonly agent: string; readonly available: false; readonly reason: string };

function isAvailability(item: unknown): item is AgentAvailability {
  if (typeof item !== "object" || item === null || !("agent" in item) || !("available" in item)) {
    return false;
  }
  if (typeof item.agent !== "string") {
    return false;
  }
  return (
    item.available === true ||
    (item.available === false && "reason" in item && typeof item.reason === "string")
  );
}

/** Asks the server which agents it offers. */
export async function fetchAgents(): Promise<AgentAvailability[]> {
  const response = await fetch("/api/agents");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body) || !body.every((item: unknown) => isAvailability(item))) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** One choice of the agent, the model or the reasoning level: the current value and the offered ones. */
export interface OptionChoice {
  readonly current: string;
  readonly values: readonly { readonly value: string; readonly name: string }[];
}

/** What the agent lets the Candidate choose; null for a choice it does not offer. */
export interface AgentOptions {
  readonly model: OptionChoice | null;
  readonly effort: OptionChoice | null;
}

function isChoice(value: unknown): value is OptionChoice | null {
  return (
    value === null ||
    (typeof value === "object" &&
      "current" in value &&
      typeof value.current === "string" &&
      "values" in value &&
      Array.isArray(value.values))
  );
}

export function isAgentOptions(value: unknown): value is AgentOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    "model" in value &&
    isChoice(value.model) &&
    "effort" in value &&
    isChoice(value.effort)
  );
}

/**
 * The models and reasoning levels the agent offers, read from the agent without a prompt; with
 * `model`, the levels of that model. `refresh` asks the agent again instead of the server's cache.
 */
export async function fetchAgentOptions(
  agent: string,
  { model, refresh = false }: { model?: string | null; refresh?: boolean } = {},
): Promise<AgentOptions> {
  const query = new URLSearchParams();
  if (model !== undefined && model !== null) {
    query.set("model", model);
  }
  if (refresh) {
    query.set("refresh", "1");
  }
  const suffix = query.size === 0 ? "" : `?${query.toString()}`;
  const body = await request(`/api/agents/${path(agent)}/options${suffix}`);
  if (!isAgentOptions(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}
