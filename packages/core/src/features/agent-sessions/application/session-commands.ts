// The Candidate's commands to a live session besides prompts: stopping the turn, answering a
// permission request, and choosing the model and the reasoning level (#111).
import type { SessionView } from "../domain/agent-session.ts";
import type { LiveAgent, SessionRepository } from "../domain/ports.ts";
import { answerPermission, cancelPermissions } from "./live-session.ts";
import type { LiveSession } from "./live-session.ts";

type Live = ReadonlyMap<string, LiveSession>;

/** Asks the agent to stop the current turn; does nothing when no turn runs. */
export async function cancelTurn(live: Live, sessionId: string): Promise<void> {
  const session = live.get(sessionId);
  const agent = session?.agent ?? null;
  if (agent !== null && session?.turnActive === true) {
    // ACP: the client answers its waiting permission requests with `cancelled` on cancel.
    cancelPermissions(session);
    await agent.cancel();
  }
}

/** Passes the Candidate's choice to the agent's permission request; see `AgentSessions`. */
export async function answerRequest(
  live: Live,
  sessionId: string,
  { requestId, optionId }: { requestId: string; optionId: string },
): Promise<"accepted" | "not_found"> {
  const session = live.get(sessionId);
  if (
    session === undefined ||
    !answerPermission(session, requestId, { outcome: "selected", optionId })
  ) {
    return "not_found";
  }
  await session.written;
  return "accepted";
}

/** The Candidate's choice for a session; an absent field stays as it is. */
export interface OptionChange {
  readonly model?: string;
  readonly effort?: string;
}

/**
 * - the view: the agent took every value.
 * - `not_found`: no session has this id.
 * - `busy`: the session is not idle: its agent starts, works or is gone.
 * - `unknown_option`: the agent offers no such option, or not this value.
 */
export type OptionOutcome = SessionView | "not_found" | "busy" | "unknown_option";

/**
 * Sets one option when the agent offers the value now; false when it does not. It reads the
 * offered values after the journal's last write, so a level is checked against the model just set.
 */
async function setOne(
  session: LiveSession,
  agent: LiveAgent,
  { key, value }: { key: "model" | "effort"; value: string },
): Promise<boolean> {
  await session.written;
  const id = session.optionIds[key];
  const offered = session.view.options[key]?.values.some((entry) => entry.value === value);
  if (id === null || offered !== true) {
    return false;
  }
  await agent.setConfigOption(id, value);
  // The launcher reported the agent's new options before it resolved; wait for their write.
  await session.written;
  return true;
}

/**
 * Sets the model, then the level; false once the agent does not offer a value. No prompt starts
 * meanwhile: the session counts as in a turn, so a prompt is refused as busy, as during a prompt.
 */
async function setBoth(
  session: LiveSession,
  agent: LiveAgent,
  { model, effort }: OptionChange,
): Promise<boolean> {
  // Set before the first await, so a prompt in the meantime sees it.
  session.turnActive = true;
  try {
    if (model !== undefined && !(await setOne(session, agent, { key: "model", value: model }))) {
      return false;
    }
    return effort === undefined || (await setOne(session, agent, { key: "effort", value: effort }));
  } finally {
    session.turnActive = false;
    session.onIdle();
  }
}

/**
 * Sets the model, then the reasoning level, of an idle session: the levels depend on the model. A
 * refused level leaves the model that was just set. No prompt starts meanwhile.
 */
export async function setOptions(
  { live, repository }: { live: Live; repository: SessionRepository },
  sessionId: string,
  change: OptionChange,
): Promise<OptionOutcome> {
  const session = live.get(sessionId);
  if (session === undefined) {
    return (await repository.load(sessionId)) ? "busy" : "not_found";
  }
  const { agent } = session;
  if (agent === null || session.turnActive || session.view.status !== "idle") {
    return "busy";
  }
  return (await setBoth(session, agent, change)) ? session.view : "unknown_option";
}
