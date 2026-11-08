import type { Clock } from "../../../shared/time/index.ts";
import type { AgentSession, SessionView } from "../domain/agent-session.ts";
import type { AgentLauncher, LiveAgent, SessionRepository } from "../domain/ports.ts";
import type { SessionEvent } from "../domain/session-event.ts";
import { applyEvent, emptyView, statusAfter } from "../domain/session-view.ts";

/** Receives the session view after each journal entry. */
export type SessionListener = (view: SessionView) => void;

export interface LiveSessionDependencies {
  readonly repository: SessionRepository;
  readonly clock: Clock;
  /** Receives errors of background work, such as a failed journal write. */
  readonly onError: (error: unknown) => void;
}

/** A session whose agent process belongs to this server. */
export interface LiveSession {
  view: SessionView;
  agent: LiveAgent | null;
  turnActive: boolean;
  /** Settles when the agent started or failed to start. */
  started: Promise<void>;
  /** The last journal write; writes run one after another and never reject. */
  written: Promise<void>;
  readonly listeners: Set<SessionListener>;
  readonly dependencies: LiveSessionDependencies;
}

export function liveSession(
  session: AgentSession,
  dependencies: LiveSessionDependencies,
): LiveSession {
  return {
    view: emptyView(session),
    agent: null,
    turnActive: false,
    started: Promise.resolve(),
    written: Promise.resolve(),
    listeners: new Set(),
    dependencies,
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

/** Starts the session's agent and records whether it started. */
export async function launch(
  session: LiveSession,
  { launcher, workingDirectory }: { launcher: AgentLauncher; workingDirectory: string },
): Promise<void> {
  try {
    const agent = await launcher.start({
      agent: session.view.agent,
      workingDirectory,
      onUpdate: (update) => {
        void record(session, { type: "agent_update", update });
      },
      onExit: ({ exitCode, signal }) => {
        session.agent = null;
        const failure = { reason: "agent_exited", exitCode, signal } as const;
        void record(session, { type: "session_failed", failure });
      },
    });
    session.agent = agent;
    await record(session, { type: "session_started", acpSessionId: agent.acpSessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await record(session, {
      type: "session_failed",
      failure: { reason: "agent_not_started", message },
    });
  }
}

/** Sends the prompt and records how the turn ended. */
export async function runTurn(session: LiveSession, agent: LiveAgent, text: string) {
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
    session.turnActive = false;
  }
}
