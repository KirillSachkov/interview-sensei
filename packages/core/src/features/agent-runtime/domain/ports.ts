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

/** Receivers of the agent's event stream. */
export interface AgentListeners {
  /** Receives every `session/update` in the order the agent sent them. */
  readonly onUpdate: (update: AgentUpdate) => void;
  /** Called once when the process exits by itself, after the last update. */
  readonly onExit: (exit: AgentExit) => void;
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

/** Starts a process by the recipe and opens an ACP session in it. */
export type AcpLauncher = (recipe: LaunchRecipe, listeners: AgentListeners) => Promise<LiveAgent>;
