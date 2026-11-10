// The model and the reasoning level of an AgentSession (#111). An agent lists them as ACP config
// options of the type `select`: the model in the category `model`, the level in `thought_level`.
// The journal keeps each `config_option_update`, the agent's own or the launcher's, and the latest
// one counts. The level depends on the model: an agent leaves the option out for a model without
// levels, so an update without it clears the level.
import type { AgentUpdate, SessionEvent } from "./session-event.ts";

/** One select option: its current value and the values the agent offers, groups flattened. */
interface OptionChoice {
  readonly current: string;
  readonly values: readonly { readonly value: string; readonly name: string }[];
}

/** The model and the reasoning level of a session; null when the agent offers no such option. */
export interface AgentOptions {
  readonly model: OptionChoice | null;
  readonly effort: OptionChoice | null;
}

/** The ACP ids of the two options, which `session/set_config_option` takes; they differ by agent. */
export interface OptionIds {
  readonly model: string | null;
  readonly effort: string | null;
}

export const noOptions: AgentOptions = { model: null, effort: null };

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function valueOf(entry: unknown): OptionChoice["values"] {
  const value = field(entry, "value");
  const name = field(entry, "name");
  return typeof value === "string"
    ? [{ value, name: typeof name === "string" ? name : value }]
    : [];
}

/** The values of a select option; an entry with `options` is a group of values. */
function valuesOf(options: unknown): OptionChoice["values"] {
  return listOf(options).flatMap((entry) => {
    const grouped = field(entry, "options");
    return Array.isArray(grouped)
      ? listOf(grouped).flatMap((inner) => valueOf(inner))
      : valueOf(entry);
  });
}

/** The first select option of the category with its id, or null. */
function choiceOf(configOptions: unknown, category: "model" | "thought_level") {
  const option = listOf(configOptions).find(
    (candidate) =>
      field(candidate, "category") === category && field(candidate, "type") === "select",
  );
  const id = field(option, "id");
  const current = field(option, "currentValue");
  return typeof id === "string" && typeof current === "string"
    ? { id, choice: { current, values: valuesOf(field(option, "options")) } }
    : null;
}

/** The options and their ids in a `config_option_update`; null for another update. */
export function optionsUpdate(
  update: AgentUpdate,
): { readonly options: AgentOptions; readonly ids: OptionIds } | null {
  if (update.sessionUpdate !== "config_option_update") {
    return null;
  }
  const model = choiceOf(update.configOptions, "model");
  const effort = choiceOf(update.configOptions, "thought_level");
  return {
    options: { model: model?.choice ?? null, effort: effort?.choice ?? null },
    ids: { model: model?.id ?? null, effort: effort?.id ?? null },
  };
}

/** The session's options after the event: a `config_option_update` replaces them whole. */
export function optionsAfter(options: AgentOptions, event: SessionEvent): AgentOptions {
  return (
    (event.type === "agent_update" ? optionsUpdate(event.update)?.options : undefined) ?? options
  );
}
