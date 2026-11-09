import { randomUUID } from "node:crypto";

import type { Clock } from "../../../shared/time/index.ts";
import type { AgentSession, SessionView } from "../domain/agent-session.ts";
import { isLive } from "../domain/agent-session.ts";
import type { AgentLauncher, LiveAgent, McpAddresses, SessionRepository } from "../domain/ports.ts";
import type { PermissionAnswer, PermissionRequest, SessionEvent } from "../domain/session-event.ts";
import { applyEvent, emptyView, statusAfter } from "../domain/session-view.ts";

/** Receives the session view after each journal entry. */
export type SessionListener = (view: SessionView) => void;

export interface LiveSessionDependencies {
  readonly repository: SessionRepository;
  readonly clock: Clock;
  readonly mcp: McpAddresses;
  /** Receives errors of background work, such as a failed journal write. */
  readonly onError: (error: unknown) => void;
}

/** A session whose agent process belongs to this server. */
export interface LiveSession {
  view: SessionView;
  agent: LiveAgent | null;
  turnActive: boolean;
  /** Permission requests that wait for the Candidate, by request id. */
  readonly permissions: Map<string, PendingPermission>;
  /** Settles when the agent started or failed to start. */
  started: Promise<void>;
  /** The last journal write; writes run one after another and never reject. */
  written: Promise<void>;
  readonly listeners: Set<SessionListener>;
  /** The server's prompts and the end that wait for the agent, the first one first. */
  readonly queued: QueuedItem[];
  /** The server's notes that go before the next prompt, the Candidate's or the server's. */
  readonly notes: string[];
  readonly dependencies: LiveSessionDependencies;
  /** Called after the write that ends or fails the session: nothing changes it any more. */
  readonly onFinished: () => void;
  /** Called when the agent starts and after each turn: the queue may go on. */
  readonly onIdle: () => void;
}

/** What waits in the queue for the agent; `settle` reports how it went. */
export type QueuedItem =
  | {
      readonly type: "prompt";
      readonly text: string;
      /** Shows the agent's hidden text again from this prompt on. */
      readonly showAgentText: boolean;
      readonly settle: (outcome: "accepted" | "closed") => void;
    }
  | { readonly type: "end"; readonly settle: (outcome: "accepted" | "closed") => void };

interface PendingPermission {
  readonly optionIds: readonly string[];
  readonly resolve: (answer: PermissionAnswer) => void;
}

export function liveSession(
  session: AgentSession,
  dependencies: LiveSessionDependencies,
  { onFinished, onIdle }: { onFinished: () => void; onIdle: () => void },
): LiveSession {
  return {
    view: emptyView(session),
    agent: null,
    turnActive: false,
    permissions: new Map(),
    started: Promise.resolve(),
    written: Promise.resolve(),
    listeners: new Set(),
    queued: [],
    notes: [],
    dependencies,
    onFinished,
    onIdle,
  };
}

async function write(session: LiveSession, event: SessionEvent): Promise<void> {
  const { repository, clock } = session.dependencies;
  const status = statusAfter(session.view.status, event);
  const recorded = await repository.append({
    sessionId: session.view.id,
    event,
    status,
    recordedAt: clock.now(),
  });
  session.view = applyEvent(session.view, recorded);
  for (const listener of session.listeners) {
    listener(session.view);
  }
  if (!isLive(session.view.status)) {
    // Nothing queued reaches an agent that is gone.
    for (const item of session.queued.splice(0)) {
      item.settle("closed");
    }
    session.onFinished();
  }
}

async function writeAfter(previous: Promise<void>, session: LiveSession, event: SessionEvent) {
  await previous;
  try {
    await write(session, event);
  } catch (error) {
    // A failed write must not stop the writes after it.
    session.dependencies.onError(error);
  }
}

/**
 * Appends the event to the journal after the earlier ones, then tells the listeners. Call it
 * synchronously in the order the events happen; await it to wait for the write.
 */
export async function record(session: LiveSession, event: SessionEvent): Promise<void> {
  session.written = writeAfter(session.written, session, event);
  await session.written;
}

/**
 * Records the request and waits for the Candidate's answer. Without an agent or a turn nobody can
 * answer it later, so the agent gets `cancelled` at once.
 */
async function askCandidate(
  session: LiveSession,
  request: PermissionRequest,
): Promise<PermissionAnswer> {
  if (session.agent === null || !session.turnActive) {
    return { outcome: "cancelled" };
  }
  const requestId = randomUUID();
  const answered = Promise.withResolvers<PermissionAnswer>();
  session.permissions.set(requestId, {
    optionIds: request.options.map((option) => option.optionId),
    resolve: answered.resolve,
  });
  void record(session, { type: "permission_requested", requestId, ...request });
  return answered.promise;
}

/**
 * Passes the answer to the agent and records it. Returns false when the request does not wait
 * for an answer or did not offer the option.
 */
export function answerPermission(
  session: LiveSession,
  requestId: string,
  answer: PermissionAnswer,
): boolean {
  const pending = session.permissions.get(requestId);
  if (
    pending === undefined ||
    (answer.outcome === "selected" && !pending.optionIds.includes(answer.optionId))
  ) {
    return false;
  }
  session.permissions.delete(requestId);
  // Recorded before the agent gets the answer, so the journal shows it before the agent's reply.
  void record(session, { type: "permission_answered", requestId, answer });
  pending.resolve(answer);
  return true;
}

/** Answers every waiting request with `cancelled`, as ACP requires when the turn ends. */
export function cancelPermissions(session: LiveSession): void {
  for (const requestId of session.permissions.keys()) {
    answerPermission(session, requestId, { outcome: "cancelled" });
  }
}

/** Closes the session's MCP address; a failure goes to `onError`. */
async function closeMcp(session: LiveSession): Promise<void> {
  const { mcp, onError } = session.dependencies;
  try {
    await mcp.close(session.view.id);
  } catch (error) {
    onError(error);
  }
}

/** Starts the session's agent and records whether it started. */
export async function launch(
  session: LiveSession,
  {
    launcher,
    workingDirectory,
    roleAddition,
  }: { launcher: AgentLauncher; workingDirectory: string; roleAddition: string | undefined },
): Promise<void> {
  try {
    const { id: sessionId, kind, agent: agentKind, targetId } = session.view;
    const agent = await launcher.start({
      agent: agentKind,
      kind,
      ...(roleAddition === undefined ? {} : { roleAddition }),
      workingDirectory,
      mcpServer: session.dependencies.mcp.open({
        sessionId,
        kind,
        ...(targetId === undefined ? {} : { targetId }),
      }),
      onUpdate: (update) => {
        void record(session, { type: "agent_update", update });
      },
      onPermission: async (request) => askCandidate(session, request),
      onExit: ({ exitCode, signal }) => {
        session.agent = null;
        cancelPermissions(session);
        const failure = { reason: "agent_exited", exitCode, signal } as const;
        void record(session, { type: "session_failed", failure });
        void closeMcp(session);
      },
    });
    session.agent = agent;
    await record(session, { type: "session_started", acpSessionId: agent.acpSessionId });
    session.onIdle();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await record(session, {
      type: "session_failed",
      failure: { reason: "agent_not_started", message },
    });
    await closeMcp(session);
  }
}

/**
 * Records the prompt with the server's waiting notes and starts its turn; the agent gets the notes
 * first. `turnActive` is already set.
 */
export async function sendPrompt(
  session: LiveSession,
  agent: LiveAgent,
  { text, origin }: { text: string; origin?: "server" },
): Promise<void> {
  const notes = session.notes.splice(0);
  await record(session, {
    type: "prompt_sent",
    text,
    ...(origin === undefined ? {} : { origin }),
    ...(notes.length === 0 ? {} : { notes }),
  });
  void runTurn(session, agent, [...notes, text].join("\n\n"));
}

/** Sends the prompt and records how the turn ended. */
async function runTurn(session: LiveSession, agent: LiveAgent, text: string) {
  try {
    const outcome = await agent.prompt(text);
    await record(
      session,
      outcome.type === "ended"
        ? { type: "turn_ended", stopReason: outcome.stopReason }
        : { type: "turn_failed", message: outcome.message },
    );
  } catch {
    // The process exited or the server stopped it during the turn; onExit or close records it.
  } finally {
    // A request the agent left open at the end of the turn no longer waits for the Candidate.
    cancelPermissions(session);
    session.turnActive = false;
    session.onIdle();
  }
}

/** Stops the session's agent and marks the session as ended, once its journal writes are done. */
export async function end(session: LiveSession): Promise<void> {
  // Wait for a starting agent, so its process does not outlive the server.
  await session.started;
  const { agent } = session;
  session.agent = null;
  cancelPermissions(session);
  await agent?.stop();
  await closeMcp(session);
  if (isLive(session.view.status)) {
    await record(session, { type: "session_ended" });
  }
  await session.written;
}
