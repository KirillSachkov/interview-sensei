import type { SessionFailure } from "./session-event.ts";

/** The kinds of AgentSession. The skeleton has one: the service chat. */
export const sessionKinds = ["service-chat"] as const;
export type SessionKind = (typeof sessionKinds)[number];

/**
 * - `starting`: the agent process starts.
 * - `idle`: the agent waits for a prompt.
 * - `working`: the agent handles a prompt; the UI shows that it works.
 * - `failed`: the agent did not start or its process exited; the session takes no prompts.
 * - `ended`: the server stopped while the session was live; the history stays readable.
 */
export type SessionStatus = "starting" | "idle" | "working" | "failed" | "ended";

/** A session that still has, or waits for, a live agent process. */
export function isLive(status: SessionStatus): boolean {
  return status === "starting" || status === "idle" || status === "working";
}

/** The stored AgentSession without its journal. */
export interface AgentSession {
  readonly id: string;
  readonly kind: SessionKind;
  /** The agent that runs the session, such as `fake`. */
  readonly agent: string;
  readonly status: SessionStatus;
  /** ISO 8601. */
  readonly createdAt: string;
}

/** One line of the chat that the Candidate sees. */
export type ChatEntry =
  | { readonly id: string; readonly type: "candidate_message"; readonly text: string }
  | {
      readonly id: string;
      readonly type: "agent_message";
      readonly text: string;
      /** ACP `messageId` when the agent sends one; chunks with the same id form one message. */
      readonly messageId: string | null;
    }
  /** The turn ended before the agent finished, for example because the Candidate stopped it. */
  | { readonly id: string; readonly type: "turn_interrupted"; readonly stopReason: string }
  /** The agent answered the prompt with an error; the message is the agent's own. */
  | { readonly id: string; readonly type: "turn_failed"; readonly message: string };

/** An AgentSession with its chat: what the browser shows. */
export interface SessionView extends AgentSession {
  readonly entries: readonly ChatEntry[];
  readonly failure: SessionFailure | null;
}
