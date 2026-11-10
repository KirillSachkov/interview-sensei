// The config options of the fake agent's sessions: the model and the reasoning level (#111), as
// the real agents offer them, beside the modes of `fake-agent-modes.ts`. The option `model`
// (category `model`) has `fake-small`, the default, and `fake-large`; the option `effort`
// (category `thought_level`) with `low` and `high` exists only while the model is `fake-large`,
// as a real agent leaves the level out for a model without one.
import { RequestError } from "@agentclientprotocol/sdk/unstable";

import { fakeAgentModes } from "./fake-agent-modes.ts";

const models = [
  { value: "fake-small", name: "Фейковая малая" },
  { value: "fake-large", name: "Фейковая большая" },
];
const levels = [
  { value: "low", name: "Низкий" },
  { value: "high", name: "Высокий" },
];
const defaultModel = "fake-small";
/** The only model with reasoning levels; it starts at the first one. */
const leveledModel = "fake-large";

interface Chosen {
  readonly model: string;
  /** Null while the model has no levels. */
  readonly effort: string | null;
}

function optionsOf({ model, effort }: Chosen) {
  const select = { type: "select" as const };
  return [
    {
      id: "model",
      name: "Model",
      category: "model",
      ...select,
      currentValue: model,
      options: models,
    },
    ...(effort === null
      ? []
      : [
          {
            id: "effort",
            name: "Effort",
            category: "thought_level",
            ...select,
            currentValue: effort,
            options: levels,
          },
        ]),
  ];
}

/** The choice after `session/set_config_option`; refuses an unknown option or value. */
function changed(
  current: Chosen,
  { configId, value }: { configId: string; value: unknown },
): Chosen {
  if (configId === "model" && models.some((model) => model.value === value)) {
    const model = String(value);
    const effort = model === leveledModel ? (current.effort ?? "low") : null;
    return { model, effort };
  }
  const offered = current.effort !== null && levels.some((level) => level.value === value);
  if (configId === "effort" && offered) {
    return { ...current, effort: String(value) };
  }
  throw RequestError.invalidParams({ configId, value });
}

interface OptionRequest {
  readonly sessionId: string;
  readonly configId: string;
  readonly value: unknown;
}

/** The modes, the model and the reasoning level of each session of the fake agent. */
export function fakeAgentConfig(agentMode: string | undefined) {
  const modes = fakeAgentModes(agentMode);
  const chosen = new Map<string, Chosen>();
  const chosenIn = (sessionId: string) =>
    chosen.get(sessionId) ?? { model: defaultModel, effort: null };
  const configOptions = (sessionId: string) => [
    ...modes.options(sessionId),
    ...optionsOf(chosenIn(sessionId)),
  ];
  return {
    mode: modes.current,
    /** «Модель: <model>, уровень: <level>», or «уровень: нет» for a model without levels. */
    describe(sessionId: string) {
      const { model, effort } = chosenIn(sessionId);
      return `Модель: ${model}, уровень: ${effort ?? "нет"}`;
    },
    /** Starts the session; returns its modes and config options for `session/new`. */
    start(sessionId: string) {
      const started = modes.start(sessionId);
      chosen.set(sessionId, chosenIn(sessionId));
      return { ...("modes" in started ? started : {}), configOptions: configOptions(sessionId) };
    },
    setMode(request: { sessionId: string; modeId: string }) {
      modes.set(request);
    },
    /** Sets the mode, the model or the level; returns the config options after the change. */
    setOption(request: OptionRequest) {
      if (request.configId === "mode") {
        modes.set(request);
      } else {
        chosen.set(request.sessionId, changed(chosenIn(request.sessionId), request));
      }
      return configOptions(request.sessionId);
    },
  };
}
