import type { PermissionAnswer, PermissionRequest, SessionFailure } from "./session-event.ts";

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
  /** The session kind, such as `service-chat`; `shared/session-kinds` lists them. */
  readonly kind: string;
  /** The agent that runs the session, such as `fake`. */
  readonly agent: string;
  /** Absent for the skeleton service chat and existing sessions. */
  readonly targetId?: string | null;
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
  | { readonly id: string; readonly type: "turn_failed"; readonly message: string }
  /** The agent asks for permission; `answer` is null until the Candidate answers. */
  | {
      readonly id: string;
      readonly type: "permission_request";
      readonly requestId: string;
      /** The agent's description of the action, such as a command; null when it sent none. */
      readonly title: string | null;
      /** The agent's command or arguments, shortened; null when it sent no raw input. */
      readonly input: string | null;
      readonly options: PermissionRequest["options"];
      readonly answer: PermissionAnswer | null;
    };

/** An AgentSession with its chat: what the browser shows. */
export interface SessionView extends AgentSession {
  readonly entries: readonly ChatEntry[];
  readonly failure: SessionFailure | null;
}
