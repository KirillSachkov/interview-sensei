import type { PermissionAnswer, PermissionRequest, SessionFailure } from "./session-event.ts";

/**
 * - `starting`: the agent process starts.
 * - `idle`: the agent waits for a prompt.
 * - `working`: the agent handles a prompt; the UI shows that it works.
 * - `failed`: the agent did not start or its process exited; the session takes no prompts.
 * - `ended`: the Candidate ended the session, or the server stopped the session's agent, at shutdown
 *   or when its work was done, such as a finished mock interview; the history stays readable.
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
  /**
   * The earlier session of the same conversation that this one continues with a new agent process,
   * such as a Mock interview after a pause; its chat comes first in this session's chat.
   */
  readonly continuesSessionId?: string;
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
      /** The agent's whole command or arguments; null when it sent no raw input. */
      readonly input: string | null;
      readonly options: PermissionRequest["options"];
      readonly answer: PermissionAnswer | null;
    };

/** An AgentSession with its chat: what the browser shows. */
export interface SessionView extends AgentSession {
  readonly entries: readonly ChatEntry[];
  readonly failure: SessionFailure | null;
  /**
   * Where the agent's next text chunk goes: `continues` the last agent message when the message ids
   * allow, starts a `new` one after a prompt or the end of a turn, or stays out of the chat while
   * `hidden`, over turns, until the server shows the text again or the session ends.
   */
  readonly agentText: "continues" | "new" | "hidden";
  /**
   * The index of the first chat entry of a Target setup's turn that the server's prompt started,
   * until the agent's first tool call in it; null otherwise. The agent's text before that call
   * narrates its first steps, often in English, and the chat leaves it out (#88).
   */
  readonly narrationFrom: number | null;
}
