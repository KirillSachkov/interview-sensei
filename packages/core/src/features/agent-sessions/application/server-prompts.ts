// What the server, rather than the Candidate, asks of a live session: its prompts, such as the
// template messages of a mock interview, wait in the session's queue for the agent's current
// turn, and so does the end of the session. The Candidate's prompts never queue: they are refused
// while the agent works.
import type { LiveAgent, SessionRepository } from "../domain/ports.ts";
import { record, runTurn } from "./live-session.ts";
import type { LiveSession, QueuedItem } from "./live-session.ts";

/** How a queued item went: it ran, the session ended first, or no session has the id. */
export type QueueOutcome = "accepted" | "closed" | "not_found";

/** The live sessions of the server and how to end one. */
export interface QueueContext {
  readonly live: ReadonlyMap<string, LiveSession>;
  readonly repository: SessionRepository;
  /** Stops the session's agent and marks the session as ended. */
  readonly endSession: (session: LiveSession) => Promise<void>;
}

/** The first queued item once the agent waits for a prompt; otherwise nothing leaves the queue. */
function nextReady(session: LiveSession) {
  const { agent } = session;
  if (agent === null || session.turnActive || session.view.status !== "idle") {
    return null;
  }
  const item = session.queued.shift();
  return item === undefined ? null : { item, agent };
}

/**
 * Runs the first queued item once the agent waits for a prompt: a server prompt becomes the next
 * turn, an end stops the agent. The start of the agent and the end of each turn call it again.
 */
export async function drain(context: QueueContext, session: LiveSession): Promise<void> {
  const ready = nextReady(session);
  if (ready === null) {
    return;
  }
  const { item, agent } = ready;
  // Set before the first await: nothing else leaves the queue, and a Candidate's prompt in the
  // meantime sees the turn.
  session.turnActive = true;
  await (item.type === "end" ? context.endSession(session) : prompt(session, agent, item));
  item.settle("accepted");
}

/** Starts the turn of a server prompt; `turnActive` is already set. */
async function prompt(
  session: LiveSession,
  agent: LiveAgent,
  { text, showAgentText }: { text: string; showAgentText: boolean },
): Promise<void> {
  // Shown only now: the text of the turn before this prompt stays hidden.
  if (showAgentText && session.view.agentText === "hidden") {
    await record(session, { type: "agent_text_shown" });
  }
  await record(session, { type: "prompt_sent", text, origin: "server" });
  void runTurn(session, agent, text);
}

/** Puts the item into the session's queue; resolves when it ran or the session ended first. */
export async function enqueue(
  context: QueueContext,
  sessionId: string,
  item: (settle: (outcome: "accepted" | "closed") => void) => QueuedItem,
): Promise<QueueOutcome> {
  const session = context.live.get(sessionId);
  if (session === undefined) {
    return (await context.repository.load(sessionId)) ? "closed" : "not_found";
  }
  const settled = Promise.withResolvers<QueueOutcome>();
  session.queued.push(item(settled.resolve));
  void drain(context, session);
  return settled.promise;
}

/** Queues the server's prompt; see `AgentSessions.queuePrompt`. */
export async function queuePrompt(
  context: QueueContext,
  sessionId: string,
  { text, showAgentText = false }: { text: string; showAgentText: boolean | undefined },
): Promise<QueueOutcome> {
  return enqueue(context, sessionId, (settle) => ({ type: "prompt", text, showAgentText, settle }));
}

/** Keeps the agent's text out of the chat until a server prompt shows it; nothing for a session not live. */
export async function hideAgentText(context: QueueContext, sessionId: string): Promise<void> {
  const session = context.live.get(sessionId);
  if (session !== undefined) {
    await record(session, { type: "agent_text_hidden" });
  }
}
