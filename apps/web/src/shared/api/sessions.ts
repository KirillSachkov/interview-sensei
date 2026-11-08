/** One line of the chat; the server folds the agent's events into these. */
export type ChatEntry =
  | { readonly id: string; readonly type: "candidate_message"; readonly text: string }
  | { readonly id: string; readonly type: "agent_message"; readonly text: string }
  | { readonly id: string; readonly type: "turn_interrupted"; readonly stopReason: string };

export type SessionStatus = "starting" | "idle" | "working" | "failed" | "ended";

export type SessionFailure =
  | {
      readonly reason: "agent_exited";
      readonly exitCode: number | null;
      readonly signal: string | null;
    }
  | { readonly reason: "agent_not_started"; readonly message: string };

/** An AgentSession as the server shows it: status, chat and failure. */
export interface SessionView {
  readonly id: string;
  readonly kind: string;
  readonly agent: string;
  readonly status: SessionStatus;
  readonly createdAt: string;
  readonly entries: readonly ChatEntry[];
  readonly failure: SessionFailure | null;
}

/** An AgentSession without its chat, from GET /api/sessions. */
export interface SessionSummary {
  readonly id: string;
  readonly kind: string;
  readonly agent: string;
  readonly status: SessionStatus;
  readonly createdAt: string;
}

function isSummary(value: unknown): value is SessionSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "status" in value &&
    typeof value.status === "string"
  );
}

/** The server builds the view; the web app checks only that it got one. */
export function isSessionView(value: unknown): value is SessionView {
  return isSummary(value) && "entries" in value && Array.isArray(value.entries);
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/** Every session, the newest first. */
export async function fetchSessions(): Promise<SessionSummary[]> {
  const body = await readJson(await fetch("/api/sessions"));
  if (!Array.isArray(body) || !body.every((item: unknown) => isSummary(item))) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** Creates a service chat with the agent; the server starts the agent in the background. */
export async function startServiceChat(agent: string): Promise<SessionView> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "service-chat", agent }),
  });
  const body = await readJson(response);
  if (!isSessionView(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** The WebSocket address of the session's events, on the page's own host. */
export function sessionEventsUrl(sessionId: string): string {
  const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${globalThis.location.host}/api/sessions/${sessionId}/events`;
}
