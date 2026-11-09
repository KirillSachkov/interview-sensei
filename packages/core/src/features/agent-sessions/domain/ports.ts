import type { AgentSession, SessionStatus } from "./agent-session.ts";
import type {
  AgentUpdate,
  PermissionAnswer,
  PermissionRequest,
  RecordedEvent,
  SessionEvent,
} from "./session-event.ts";

/** Stores AgentSessions and their event journals. */
export interface SessionRepository {
  readonly create: (session: {
    kind: string;
    agent: string;
    targetId?: string | null;
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

/**
 * Erases the sessions of a Target with their journals. `Transaction` is the storage's open
 * transaction, opaque to the domain: deleting a Target erases the data of every slice in it.
 */
export interface SessionErasure<Transaction> {
  /** Resolves with the ids of the erased sessions. */
  readonly eraseTarget: (targetId: string, transaction: Transaction) => Promise<readonly string[]>;
}

/** The working directories of the sessions, one per session in the data directory. */
export interface SessionDirectories {
  readonly remove: (sessionIds: readonly string[]) => Promise<void>;
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

/** Our MCP server of one session. */
interface McpServerAddress {
  readonly name: string;
  readonly url: string;
}

/** Gives each session its own MCP address; the mcp-gateway slice implements it. */
export interface McpAddresses {
  /** Opens the address with the tool set of the session kind; throws when it cannot. */
  readonly open: (session: {
    sessionId: string;
    kind: string;
    targetId?: string | null;
  }) => McpServerAddress;
  /** Closes the address when the session's agent is gone. */
  readonly close: (sessionId: string) => Promise<void>;
}

/** Starts agents; the agent-runtime slice implements it and the server passes it in. */
export interface AgentLauncher {
  readonly start: (request: {
    agent: string;
    /** The session kind; the launcher picks the agent's permission mode by it. */
    kind: string;
    /** The session directory inside the data directory, the agent's `cwd`. */
    workingDirectory: string;
    /** The session's own MCP server, passed to the agent in `session/new`. */
    mcpServer: McpServerAddress;
    /** Answers a permission request that the launcher does not answer by itself. */
    onPermission: (request: PermissionRequest) => Promise<PermissionAnswer>;
    /** Receives every `session/update` in the order the agent sent them. */
    onUpdate: (update: AgentUpdate) => void;
    /** Called once when the process exits by itself, after the last update. */
    onExit: (exit: AgentExit) => void;
  }) => Promise<LiveAgent>;
}
