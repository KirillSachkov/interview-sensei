// The model and the reasoning level of an ACP session (#111). The launcher reports the config
// options of `session/new` and of every `session/set_config_option` answer to `onUpdate` as the
// update `config_option_update`, the one an agent sends itself, so the session's journal holds
// them either way.
import { RequestError } from "@agentclientprotocol/sdk/unstable";
import type { ClientContext } from "@agentclientprotocol/sdk/unstable";

import { configChoice } from "../domain/agent-options.ts";
import type { OptionDefaults } from "../domain/agent-options.ts";
import type { AgentUpdate } from "../domain/ports.ts";

/** The ACP session whose options change, and the receiver of its updates. */
interface OptionContext {
  readonly agent: ClientContext;
  readonly sessionId: string;
  readonly onUpdate: (update: AgentUpdate) => void;
}

/** Reports the config options as a `config_option_update`; an agent without options reports none. */
export function reportOptions(
  onUpdate: OptionContext["onUpdate"],
  configOptions: readonly unknown[] | null | undefined,
): void {
  if (configOptions !== null && configOptions !== undefined) {
    onUpdate({ sessionUpdate: "config_option_update", configOptions });
  }
}

/** Sets one config option, reports the options the agent answers with and returns them. */
export async function setConfigOption(
  { agent, sessionId, onUpdate }: OptionContext,
  { configId, value }: { configId: string; value: string },
): Promise<readonly unknown[]> {
  const { configOptions } = await agent.request("session/set_config_option", {
    sessionId,
    configId,
    value,
  });
  reportOptions(onUpdate, configOptions);
  return configOptions;
}

/**
 * Sets the stored value of one option when the agent offers it now and it is not the current one.
 * A value that is no longer offered is skipped, and so is one the agent refuses: a default never
 * fails the start. Returns the config options after it.
 */
async function applyDefault(
  context: OptionContext,
  configOptions: readonly unknown[],
  { category, value }: { category: "model" | "thought_level"; value: string | null },
): Promise<readonly unknown[]> {
  const choice = configChoice(configOptions, category);
  const offered = choice?.values.some((entry) => entry.value === value) === true;
  if (value === null || choice === null || !offered || choice.current === value) {
    return configOptions;
  }
  try {
    return await setConfigOption(context, { configId: choice.id, value });
  } catch (error) {
    if (error instanceof RequestError) {
      return configOptions;
    }
    throw error;
  }
}

/**
 * Applies the Candidate's stored choice right after the mode is set: the model first, because the
 * levels depend on it, then the level among those the chosen model offers.
 */
export async function applyDefaults(
  context: OptionContext,
  configOptions: readonly unknown[] | null | undefined,
  { model, effort }: OptionDefaults,
): Promise<void> {
  const afterModel = await applyDefault(context, configOptions ?? [], {
    category: "model",
    value: model,
  });
  await applyDefault(context, afterModel, { category: "thought_level", value: effort });
}
