// The refusal of «Продолжить» because of the agent (#83), for a paused Mock interview and for a
// Side thread alike: the server explains why and offers the Target's agent when it can run.
import { isObject } from "./http";

/**
 * The agent of the Mock interview cannot go on; the message says why in Russian. `targetAgent` is
 * the Target's agent the Candidate may go on with, or null.
 */
export class AgentUnavailableError extends Error {
  readonly targetAgent: string | null;

  constructor(message: string, targetAgent: string | null) {
    super(message);
    this.name = "AgentUnavailableError";
    this.targetAgent = targetAgent;
  }
}

/** Throws AgentUnavailableError for the 409 `agent_unavailable` of «Продолжить». */
export async function throwIfAgentUnavailable(response: Response): Promise<void> {
  if (response.status !== 409) {
    return;
  }
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  if (isObject(body) && body.error === "agent_unavailable" && typeof body.message === "string") {
    throw new AgentUnavailableError(
      body.message,
      typeof body.targetAgent === "string" ? body.targetAgent : null,
    );
  }
}
