// Which agent runs a session of a Mock interview. A start and a Side thread's opening need their
// agent available. A continuation after a pause, of the Mock interview or of its Side thread (#83),
// goes on with the Mock interview's agent; when it is unavailable, the Candidate may go on with
// the Target's agent instead.
import type { InterviewsDependencies } from "./context.ts";

/** The agent cannot run now; `reason` says why, in Russian, when the runtime knows it. */
export interface AgentRefusal {
  readonly type: "agent_unavailable";
  readonly reason: string | null;
}

/** Why the agent cannot run now, or null when it can; a null reason when the server does not offer it. */
export async function agentRefusal(
  { agents }: Pick<InterviewsDependencies, "agents">,
  agent: string,
): Promise<AgentRefusal | null> {
  const listed = await agents.listAgents();
  const offered = listed.find((entry) => entry.agent === agent);
  if (offered === undefined) {
    return { type: "agent_unavailable", reason: null };
  }
  return offered.available ? null : { type: "agent_unavailable", reason: offered.reason };
}

/** The Candidate's «Продолжить», with the agent to go on with: the Mock interview's by default. */
export interface ContinuationRequest {
  /** The Mock interview's agent or the Target's agent. */
  readonly agent?: string;
}

/**
 * Why a continuation cannot go on with the agent:
 * - `invalid_agent`: it is neither the Mock interview's nor the Target's.
 * - `agent_unavailable`: it cannot run now; `targetAgent` is the Target's agent when it is another
 *   one and available: the Candidate may go on with it.
 */
export type ContinuationRefusal =
  | { readonly type: "invalid_agent" }
  | (AgentRefusal & { readonly agent: string; readonly targetAgent: string | null });

/** The Target's agent when it differs from the unavailable one and can run now; null otherwise. */
async function otherAgent(
  dependencies: InterviewsDependencies,
  { agent, targetAgent }: { agent: string; targetAgent: string | null },
): Promise<string | null> {
  if (targetAgent === null || targetAgent === agent) {
    return null;
  }
  return (await agentRefusal(dependencies, targetAgent)) === null ? targetAgent : null;
}

/** The agent a continuation goes on with once it can run, or the refusal. */
export async function continuingAgent(
  dependencies: InterviewsDependencies,
  { agent: own, targetId }: { agent: string; targetId: string },
  request: ContinuationRequest,
): Promise<string | ContinuationRefusal> {
  const target = await dependencies.targets.agent(targetId);
  const targetAgent = target?.agent ?? null;
  const agent = request.agent ?? own;
  if (agent !== own && agent !== targetAgent) {
    return { type: "invalid_agent" };
  }
  const refusal = await agentRefusal(dependencies, agent);
  return refusal === null
    ? agent
    : { ...refusal, agent, targetAgent: await otherAgent(dependencies, { agent, targetAgent }) };
}
