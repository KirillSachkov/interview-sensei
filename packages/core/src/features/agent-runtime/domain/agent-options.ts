// The model and the reasoning level an agent offers (#111). All three agents list them as ACP
// config options of the type `select`: the model in the category `model`, the level in
// `thought_level`. The ids differ by agent (`model`; `effort` or `reasoning_effort`), so the
// server finds an option by its category. The level depends on the model: an agent leaves the
// option out for a model without levels.

/** One select option: its current value and the values the agent offers, groups flattened. */
interface OptionChoice {
  readonly current: string;
  readonly values: readonly { readonly value: string; readonly name: string }[];
}

/** The model and the reasoning level of an agent; null when the agent offers no such option. */
export interface AgentOptions {
  readonly model: OptionChoice | null;
  readonly effort: OptionChoice | null;
}

/** The Candidate's stored choice for an agent; null leaves the agent's own default. */
export interface OptionDefaults {
  readonly model: string | null;
  readonly effort: string | null;
}

/** An option with the id that `session/set_config_option` takes. */
interface ConfigChoice extends OptionChoice {
  readonly id: string;
}

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

/** The first select option of the category among ACP `configOptions`, or null. */
export function configChoice(
  configOptions: unknown,
  category: "model" | "thought_level",
): ConfigChoice | null {
  const option = listOf(configOptions).find(
    (candidate) =>
      field(candidate, "category") === category && field(candidate, "type") === "select",
  );
  const id = field(option, "id");
  const current = field(option, "currentValue");
  return typeof id === "string" && typeof current === "string"
    ? { id, current, values: valuesOf(field(option, "options")) }
    : null;
}

function withoutId(choice: ConfigChoice | null): OptionChoice | null {
  return choice === null ? null : { current: choice.current, values: choice.values };
}

/** The model and the reasoning level among ACP `configOptions`. */
export function agentOptions(configOptions: unknown): AgentOptions {
  return {
    model: withoutId(configChoice(configOptions, "model")),
    effort: withoutId(configChoice(configOptions, "thought_level")),
  };
}
