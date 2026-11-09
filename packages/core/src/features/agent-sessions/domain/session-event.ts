/**
 * One `session/update` from the agent as ACP sends it. The journal keeps it whole; the session view
 * reads only the fields it knows.
 */
export interface AgentUpdate {
  readonly sessionUpdate: string;
  readonly [field: string]: unknown;
}

/** ACP `session/request_permission` without the session id; the journal keeps the tool call whole. */
export interface PermissionRequest {
  readonly toolCall: { readonly toolCallId: string; readonly [field: string]: unknown };
  readonly options: readonly {
    readonly optionId: string;
    readonly name: string;
    readonly kind: string;
  }[];
}

/** The answer to a permission request; `cancelled` when the turn or the session ended first. */
export type PermissionAnswer =
  { readonly outcome: "selected"; readonly optionId: string } | { readonly outcome: "cancelled" };

/** Why an AgentSession can no longer take prompts. */
export type SessionFailure =
  | {
      readonly reason: "agent_exited";
      readonly exitCode: number | null;
      readonly signal: string | null;
    }
  | { readonly reason: "agent_not_started"; readonly message: string };

/**
 * One entry of an AgentSession's event journal. The journal is the source of the session view:
 * the UI and the history after a restart replay it, not the agent's own log.
 */
export type SessionEvent =
  | { readonly type: "session_started"; readonly acpSessionId: string }
  /**
   * A prompt to the agent: the Candidate's message, or with `origin: "app"` the application's own
   * prompt, such as the one that starts the onboarding. The chat shows only the Candidate's.
   */
  | { readonly type: "prompt_sent"; readonly text: string; readonly origin?: "app" }
  | { readonly type: "agent_update"; readonly update: AgentUpdate }
  | { readonly type: "turn_ended"; readonly stopReason: string }
  /** The agent answered the prompt with an error and still runs; the session takes prompts. */
  | { readonly type: "turn_failed"; readonly message: string }
  /** The agent asks the Candidate for permission, such as to run a command. */
  | ({ readonly type: "permission_requested"; readonly requestId: string } & PermissionRequest)
  | {
      readonly type: "permission_answered";
      readonly requestId: string;
      readonly answer: PermissionAnswer;
    }
  | { readonly type: "session_failed"; readonly failure: SessionFailure }
  /** The server stopped while the session was live; its agent process is gone. */
  | { readonly type: "session_ended" };

/** A journal entry with the id the journal gave it; ids grow in recording order. */
export interface RecordedEvent {
  readonly id: number;
  readonly event: SessionEvent;
}
