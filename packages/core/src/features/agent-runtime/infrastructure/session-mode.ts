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

/** Sets the mode as the config option `mode`; resolves with the config options after it. */
async function setModeOption(
  agent: ClientContext,
  { session, mode }: { session: NewSessionResponse; mode: string },
): Promise<NewSessionResponse["configOptions"]> {
  const configId = modeOption(session, mode)?.id;
  if (configId === undefined) {
    throw new Error(`The agent does not offer the mode ${mode}`);
  }
  const { sessionId } = session;
  const changed = await agent.request("session/set_config_option", {
    sessionId,
    configId,
    value: mode,
  });
  return changed.configOptions;
}

/**
 * Sets the recipe's mode, so the Candidate's own mode never applies; for OpenCode the mode is the
 * recipe's own agent. The adapters and OpenCode 1.15 list modes in `modes`. OpenCode 1.17 and
 * later list them only in `configOptions`, as the option `mode`; they still accept
 * `session/set_mode`, but the server sets the mode the way the agent listed it. An agent that
 * lists the mode neither way does not start. Resolves with the session's config options after it.
 */
export async function setMode(
  agent: ClientContext,
  { session, mode }: { session: NewSessionResponse; mode: string | null },
): Promise<NewSessionResponse["configOptions"]> {
  if (mode === null) {
    return session.configOptions;
  }
  if (session.modes?.availableModes.some((available) => available.id === mode) !== true) {
    return setModeOption(agent, { session, mode });
  }
  await agent.request("session/set_mode", { sessionId: session.sessionId, modeId: mode });
  return session.configOptions;
}
