import type { LaunchRecipe } from "./agent.ts";

/** One ACP `session/update`, passed on whole. */
export interface AgentUpdate {
  readonly sessionUpdate: string;
  readonly [field: string]: unknown;
}

/** How the agent process ended without a request from the server. */
export interface AgentExit {
  readonly exitCode: number | null;
  readonly signal: string | null;
}

/** Our MCP server for the session, passed to the agent in `session/new` as `type: "http"`. */
export interface McpServerAddress {
  readonly name: string;
  readonly url: string;
}

/**
 * The ACP tool call of a permission request or a `tool_call` update. `_meta` and `rawInput` hold
 * the adapter's structural fields; `title` is display text only.
 */
export interface ToolCallFields {
  readonly toolCallId: string;
  readonly [field: string]: unknown;
}

/** One answer the agent offers, such as allow once or reject. */
export interface PermissionOption {
  readonly optionId: string;
  readonly name: string;
  /** `allow_once`, `allow_always`, `reject_once` or `reject_always`. */
  readonly kind: string;
}

/** ACP `session/request_permission` without the session id. */
export interface PermissionRequest {
  readonly toolCall: ToolCallFields;
  readonly options: readonly PermissionOption[];
}

/** The answer to a permission request; `cancelled` when the turn was cancelled. */
export type PermissionAnswer =
  { readonly outcome: "selected"; readonly optionId: string } | { readonly outcome: "cancelled" };

/** Receivers of the agent's event stream. */
export interface AgentListeners {
  /** Receives every `session/update` in the order the agent sent them. */
  readonly onUpdate: (update: AgentUpdate) => void;
  /** Called once when the process exits by itself, after the last update. */
  readonly onExit: (exit: AgentExit) => void;
  /** Answers a permission request that the server does not answer by itself. */
  readonly onPermission: (request: PermissionRequest) => Promise<PermissionAnswer>;
}

/** What the session needs besides the recipe: our MCP server and the receivers. */
export interface SessionRequest extends AgentListeners {
  readonly mcpServer: McpServerAddress;
}

/**
 * How a turn ended: with an ACP stop reason, or with the JSON-RPC error the agent answered the
 * prompt with while it kept running.
 */
export type TurnOutcome =
  | { readonly type: "ended"; readonly stopReason: string }
  | { readonly type: "failed"; readonly message: string };

/** A started agent process with one ACP session. */
export interface LiveAgent {
  readonly acpSessionId: string;
  /** Resolves with the outcome when the turn ends; rejects when the process exits. */
  readonly prompt: (text: string) => Promise<TurnOutcome>;
  /** Sends `session/cancel`; the pending prompt then resolves with `cancelled`. */
  readonly cancel: () => Promise<void>;
  /** Stops the process; `onExit` is not called for this stop. */
  readonly stop: () => Promise<void>;
}

/** Starts a process by the recipe and opens an ACP session with our MCP server in it. */
export type AcpLauncher = (recipe: LaunchRecipe, session: SessionRequest) => Promise<LiveAgent>;
