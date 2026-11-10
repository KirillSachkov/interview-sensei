import { request, sent } from "./http";

/** One line of the chat; the server folds the agent's events into these. */
export type ChatEntry =
  | { readonly id: string; readonly type: "candidate_message"; readonly text: string }
  | { readonly id: string; readonly type: "agent_message"; readonly text: string }
  | { readonly id: string; readonly type: "turn_interrupted"; readonly stopReason: string }
  | { readonly id: string; readonly type: "turn_failed"; readonly message: string }
  | PermissionEntry;

/** One answer the agent offers to its permission request; `name` is the agent's own text. */
interface PermissionOption {
  readonly optionId: string;
  readonly name: string;
  readonly kind: string;
}

/** The agent's permission request; `answer` is null while it waits for the Candidate. */
export interface PermissionEntry {
  readonly id: string;
  readonly type: "permission_request";
  readonly requestId: string;
  readonly title: string | null;
  /** The agent's whole command or arguments; null when it sent none. */
  readonly input: string | null;
  readonly options: readonly PermissionOption[];
  readonly answer:
    | { readonly outcome: "selected"; readonly optionId: string }
    | { readonly outcome: "cancelled" }
    | null;
}

type SessionStatus = "starting" | "idle" | "working" | "failed" | "ended";

type SessionFailure =
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
  /** `hidden` while the agent's text stays out of the chat, such as before the answer in a mock. */
  readonly agentText: "continues" | "new" | "hidden";
}

/** An AgentSession without its chat, from GET /api/sessions. */
export interface SessionSummary {
  readonly id: string;
  readonly kind: string;
  /** The Target of the session; absent for the agent check. */
  readonly targetId?: string | null;
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
  await sent(response);
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

/**
 * Opens the Target's setup chat: the running session, or a new one, which starts the onboarding
 * of a draft Target. Throws with the server's message when the Target's agent is unavailable.
 */
export async function openSetupSession(targetId: string): Promise<SessionView> {
  const body = await request(`/api/targets/${encodeURIComponent(targetId)}/setup-session`, {
    method: "POST",
  });
  if (!isSessionView(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** «Завершить»: ends the Target's running setup session; its draft of changes stays. */
export async function endSetupSession(targetId: string): Promise<void> {
  await request(`/api/targets/${encodeURIComponent(targetId)}/setup-session/end`, {
    method: "POST",
  });
}

/** The WebSocket address of the session's events, on the page's own host. */
export function sessionEventsUrl(sessionId: string): string {
  const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${globalThis.location.host}/api/sessions/${sessionId}/events`;
}
