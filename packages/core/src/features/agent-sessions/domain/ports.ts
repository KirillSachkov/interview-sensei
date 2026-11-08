import type { AgentSession, SessionKind, SessionStatus } from "./agent-session.ts";
import type { AgentUpdate, RecordedEvent, SessionEvent } from "./session-event.ts";

/** Stores AgentSessions and their event journals. */
export interface SessionRepository {
  readonly create: (session: {
    kind: SessionKind;
    agent: string;
    createdAt: Date;
  }) => Promise<AgentSession>;
  /** Appends the event and stores the status after it, in one transaction. */
  readonly append: (entry: {
    sessionId: string;
    event: SessionEvent;
    status: SessionStatus;
    recordedAt: Date;
  }) => Promise<RecordedEvent>;
  readonly load: (sessionId: string) => Promise<AgentSession | undefined>;
  /** Every session, the newest first. */
  readonly list: () => Promise<readonly AgentSession[]>;
  readonly journal: (sessionId: string) => Promise<readonly RecordedEvent[]>;
}

/** How the agent process ended without a request from the server. */
interface AgentExit {
  readonly exitCode: number | null;
  readonly signal: string | null;
}

/** How a turn ended: with an ACP stop reason, or with an error answer of the running agent. */
type TurnOutcome =
  | { readonly type: "ended"; readonly stopReason: string }
  | { readonly type: "failed"; readonly message: string };

/** A started agent with one ACP session. */
export interface LiveAgent {
  readonly acpSessionId: string;
  /** Resolves with the outcome when the turn ends; rejects when the process exits. */
  readonly prompt: (text: string) => Promise<TurnOutcome>;
  /** Asks the agent to end the current turn; the pending prompt resolves with `cancelled`. */
  readonly cancel: () => Promise<void>;
  /** Stops the agent process; `onExit` is not called for this stop. */
  readonly stop: () => Promise<void>;
}

/** Starts agents; the agent-runtime slice implements it and the server passes it in. */
export interface AgentLauncher {
  readonly start: (request: {
    agent: string;
    /** The session directory inside the data directory, the agent's `cwd`. */
    workingDirectory: string;
    /** Receives every `session/update` in the order the agent sent them. */
    onUpdate: (update: AgentUpdate) => void;
    /** Called once when the process exits by itself, after the last update. */
    onExit: (exit: AgentExit) => void;
  }) => Promise<LiveAgent>;
}
