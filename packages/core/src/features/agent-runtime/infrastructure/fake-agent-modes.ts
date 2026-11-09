// The permission modes of the fake agent's sessions: listed in `modes` and set with
// `session/set_mode`, or, in the mode `mode-config-option`, offered only as the config option
// `mode` and set with `session/set_config_option`, as OpenCode 2.x offers its agents.
import { RequestError } from "@agentclientprotocol/sdk/unstable";

/** The permission modes of a session; the first is the Candidate's own, as an adapter reads it. */
const availableModes = [
  { id: "candidate-mode", name: "Режим кандидата" },
  { id: "default", name: "Default" },
  { id: "read-only", name: "Read only" },
];

/** A new session starts in the mode of the Candidate's own settings. */
const candidateMode = "candidate-mode";

/** The modes as the one config option `mode`, with the current mode as its value. */
function modeConfigOptions(currentValue: string) {
  return [
    {
      id: "mode",
      name: "Session Mode",
      category: "mode",
      type: "select" as const,
      currentValue,
      options: availableModes.map(({ id, name }) => ({ value: id, name })),
    },
  ];
}

/** The value that `session/set_config_option` sets for the option `mode`, or null for another option. */
function optionValue({ configId, value }: { readonly configId: string; readonly value: unknown }) {
  return configId === "mode" ? value : null;
}

type ModeRequest =
  | { readonly sessionId: string; readonly modeId: string }
  | { readonly sessionId: string; readonly configId: string; readonly value: unknown };

/** The current mode of each session, for the fake agent of the `agentMode`. */
export function fakeAgentModes(agentMode: string | undefined) {
  const asOptions = agentMode === "mode-config-option";
  const current = new Map<string, string>();
  return {
    current: (sessionId: string) => current.get(sessionId),
    /** Starts the session in the Candidate's mode; returns the modes for `session/new`. */
    start(sessionId: string) {
      current.set(sessionId, candidateMode);
      return asOptions
        ? { configOptions: modeConfigOptions(candidateMode) }
        : { modes: { currentModeId: candidateMode, availableModes } };
    },
    /** Sets the mode only the agent's own way; returns the config options after the change. */
    set(request: ModeRequest) {
      const viaOption = "configId" in request;
      if (asOptions !== viaOption) {
        throw RequestError.methodNotFound(
          viaOption ? "session/set_config_option" : "session/set_mode",
        );
      }
      const mode = "modeId" in request ? request.modeId : optionValue(request);
      const known = availableModes.some((available) => available.id === mode);
      if (typeof mode !== "string" || !known || !current.has(request.sessionId)) {
        throw RequestError.invalidParams({ mode });
      }
      current.set(request.sessionId, mode);
      return modeConfigOptions(mode);
    },
  };
}
