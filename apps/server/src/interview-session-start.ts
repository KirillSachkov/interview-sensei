// What the routes that start an agent session of a Mock interview share: the start goes through
// the archive guard of its Target, and a continuation (#83) explains an unavailable agent and
// offers the Target's agent, for the Mock interview and for its Side thread alike.
import type { FastifyReply } from "fastify";

import type { ArchiveGuard } from "./archive-guard.ts";
import { SessionsClosedError } from "./composition.ts";
import type { ContinuationRefusal, ContinuationRequest, Features } from "./composition.ts";

type Dependencies = Pick<Features, "interviews"> & { readonly archiveGuard: ArchiveGuard };

/** Why no session started: the server stops, or the Target is in the archive. */
export type StartRefusal =
  { readonly type: "server_closing" } | { readonly type: "target_archived" };

/**
 * Starts a session of the Mock interview as a new agent session of its Target: an archived Target
 * refuses it, as it refuses its setup session and a Mock interview, and a stopping server too.
 * `notFound` for an unknown Mock interview.
 */
export async function startForInterview<Outcome extends { readonly type: string }>(
  { interviews, archiveGuard }: Dependencies,
  interviewId: string,
  { start, notFound }: { start: () => Promise<Outcome>; notFound: Outcome },
): Promise<Outcome | StartRefusal> {
  const interview = await interviews.view(interviewId);
  if (interview === undefined) {
    return notFound;
  }
  try {
    const outcome = await archiveGuard.startSession(interview.targetId, start);
    return outcome === "target_archived" ? { type: "target_archived" } : outcome;
  } catch (error) {
    if (error instanceof SessionsClosedError) {
      return { type: "server_closing" };
    }
    throw error;
  }
}

/** The body `{}` or `{ agent }` of «Продолжить»; undefined for another one. */
export function continuationRequestOf(body: unknown): ContinuationRequest | undefined {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== "object") {
    return undefined;
  }
  const keys = Object.keys(body);
  const agent: unknown = Reflect.get(body, "agent");
  if (keys.length === 0) {
    return {};
  }
  return keys.length === 1 && typeof agent === "string" ? { agent } : undefined;
}

type AgentOutcome = ContinuationRefusal;

/** What goes on: «мок» or «ветку», as the Russian messages say. */
type Subject = "мок" | "ветку";

/** Why the Mock interview's agent cannot go on, and what the Candidate can do. */
function unavailableMessage(
  { reason, targetAgent }: Extract<AgentOutcome, { type: "agent_unavailable" }>,
  subject: Subject,
): string {
  const why =
    reason === null ? "Агент мока больше не доступен." : `Агент мока недоступен. ${reason}`;
  return targetAgent === null
    ? `${why} Агент цели тоже недоступен: выберите агента в меню «Агент» в верхней панели.`
    : `${why} Можно продолжить ${subject} с агентом цели.`;
}

/**
 * The refusal of «Продолжить» because of the agent: 400 `invalid_agent`, or 409
 * `agent_unavailable` with `agent`, `reason` and `targetAgent`, the Target's agent the Candidate may
 * go on with, or null.
 */
export function refuseAgent(reply: FastifyReply, outcome: AgentOutcome, subject: Subject) {
  if (outcome.type === "invalid_agent") {
    return reply.code(400).send({
      error: outcome.type,
      message: `Продолжить ${subject} можно только агентом мока или агентом цели.`,
    });
  }
  const { agent, reason, targetAgent } = outcome;
  return reply.code(409).send({
    error: outcome.type,
    agent,
    reason,
    targetAgent,
    message: unavailableMessage(outcome, subject),
  });
}
