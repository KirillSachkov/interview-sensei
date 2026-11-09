// The mode a new ACP session starts in. The launcher sets the recipe's mode right after
// `session/new`, by whichever of the two ACP ways the agent offers it.
import type { ClientContext, NewSessionResponse } from "@agentclientprotocol/sdk/unstable";

/** The config option of the category `mode` when it offers the mode, or null. */
function modeOption(session: NewSessionResponse, mode: string) {
  const option = session.configOptions?.find(
    (candidate) => candidate.category === "mode" && candidate.type === "select",
  );
  if (option?.type !== "select") {
    return null;
  }
  const values = option.options.flatMap((entry) =>
    "group" in entry ? entry.options.map((grouped) => grouped.value) : [entry.value],
  );
  return values.includes(mode) ? option : null;
}

/**
 * Sets the recipe's mode, so the Candidate's own mode never applies; for OpenCode the mode is the
 * recipe's own agent. The adapters and OpenCode 1.15 list modes in `modes`; OpenCode 1.17 and
 * later offer them only as the config option `mode`. An agent that does not offer the mode either
 * way does not start.
 */
export async function setMode(
  agent: ClientContext,
  { session, mode }: { session: NewSessionResponse; mode: string | null },
): Promise<void> {
  if (mode === null) {
    return;
  }
  const { sessionId } = session;
  if (session.modes?.availableModes.some((available) => available.id === mode) === true) {
    await agent.request("session/set_mode", { sessionId, modeId: mode });
    return;
  }
  const option = modeOption(session, mode);
  if (option === null) {
    throw new Error(`The agent does not offer the mode ${mode}`);
  }
  await agent.request("session/set_config_option", { sessionId, configId: option.id, value: mode });
}
