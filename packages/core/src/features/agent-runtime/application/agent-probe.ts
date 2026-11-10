// The model and the reasoning levels an agent offers, read without an AgentSession (#111), for
// «Настройки». The probe starts the agent, opens an ACP session without an MCP server, sends no
// prompt, so it spends no subscription, and stops the agent. The answers stay in memory for the
// life of the server: an agent's models change only with its version or its login.
import type { AgentHost, AgentKind } from "../domain/agent.ts";
import type { AgentOptions } from "../domain/agent-options.ts";

/** Whether the server offers the agent and it can run on this machine now. */
export type HostOutcome =
  | { readonly type: "available"; readonly agent: AgentKind; readonly host: AgentHost }
  | { readonly type: "not_offered" }
  | { readonly type: "unavailable"; readonly reason: string };

/**
 * - `options`: what the agent offers, after choosing the asked model when the agent offers it.
 * - `not_offered`: the server does not offer the agent.
 * - `unavailable`: the agent cannot run now; `reason` says why and what to do, in Russian.
 * - `failed`: the agent did not start or did not open a session; `message` is the error's.
 */
export type ProbeOutcome =
  | { readonly type: "options"; readonly options: AgentOptions }
  | Exclude<HostOutcome, { type: "available" }>
  | { readonly type: "failed"; readonly message: string };

export interface ProbeRequest {
  /** The model whose reasoning levels to read; null for the agent's own default model. */
  readonly model: string | null;
  /** Forgets the agent's stored answers first, such as after a new login. */
  readonly refresh: boolean;
}

interface ProbeDependencies {
  readonly findHost: (agent: string) => Promise<HostOutcome>;
  /** Starts the agent, reads its options with the model chosen and stops it. */
  readonly read: (
    found: { agent: AgentKind; host: AgentHost },
    model: string | null,
  ) => Promise<AgentOptions>;
}

/** The readings of one agent by model, the empty string for its own default model. */
type Readings = Map<string, Promise<AgentOptions>>;

/** The outcome of a reading; a failed one leaves the readings, so the next request reads again. */
async function outcomeOf(
  readings: Readings,
  { key, reading }: { key: string; reading: Promise<AgentOptions> },
): Promise<ProbeOutcome> {
  try {
    return { type: "options", options: await reading };
  } catch (error) {
    if (readings.get(key) === reading) {
      readings.delete(key);
    }
    return { type: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}

/** Reads an agent's options once per agent and model; a failed reading is not kept. */
export function optionProbe({ findHost, read }: ProbeDependencies) {
  const answers = new Map<AgentKind, Readings>();
  return async (requested: string, { model, refresh }: ProbeRequest): Promise<ProbeOutcome> => {
    const found = await findHost(requested);
    if (found.type !== "available") {
      return found;
    }
    const kept = refresh ? undefined : answers.get(found.agent);
    const readings: Readings = kept ?? new Map();
    answers.set(found.agent, readings);
    const key = model ?? "";
    const reading = readings.get(key) ?? read(found, model);
    readings.set(key, reading);
    return outcomeOf(readings, { key, reading });
  };
}
