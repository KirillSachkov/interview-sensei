import path from "node:path";

import type { SessionKind } from "../../../shared/session-kinds/index.ts";
import type { AgentSession, SessionView } from "../domain/agent-session.ts";
import { isLive } from "../domain/agent-session.ts";
import type { AgentLauncher } from "../domain/ports.ts";
import { replay } from "../domain/session-view.ts";
import {
  answerPermission,
  cancelPermissions,
  closeMcp,
  launch,
  liveSession,
  record,
  runTurn,
} from "./live-session.ts";
import type { LiveSession, LiveSessionDependencies, SessionListener } from "./live-session.ts";

export interface AgentSessionsDependencies extends LiveSessionDependencies {
  readonly launcher: AgentLauncher;
  /** Each session gets its own directory here, inside the data directory. */
  readonly sessionsDirectory: string;
}

/**
 * - `accepted`: the agent got the prompt.
 * - `busy`: the agent still starts or handles the previous prompt.
 * - `closed`: the session failed or ended and takes no prompts.
 * - `not_found`: no session has this id.
 */
type PromptOutcome = "accepted" | "busy" | "closed" | "not_found";

export interface AgentSessions {
  /**
   * Creates the session and starts its agent in the background; the view reports progress.
   * Rejects with SessionsClosedError once close has begun.
   */
  readonly start: (request: { kind: SessionKind; agent: string }) => Promise<SessionView>;
  /** Every session, the newest first. */
  readonly list: () => Promise<readonly AgentSession[]>;
  readonly view: (sessionId: string) => Promise<SessionView | undefined>;
  readonly prompt: (sessionId: string, text: string) => Promise<PromptOutcome>;
  /**
   * Passes the Candidate's choice to the agent's permission request. `not_found` when the request
   * no longer waits or did not offer the option.
   */
  readonly answerPermission: (
    sessionId: string,
    answer: { requestId: string; optionId: string },
  ) => Promise<"accepted" | "not_found">;
  /** Asks the agent to stop the current turn; does nothing when no turn runs. */
  readonly cancel: (sessionId: string) => Promise<void>;
  /** Calls the listener after each change of a live session; returns the unsubscribe function. */
  readonly subscribe: (sessionId: string, listener: SessionListener) => () => void;
  /** Marks sessions that were live when the server last stopped as ended. Call it at start. */
  readonly endInterrupted: () => Promise<void>;
  /**
   * Refuses new sessions, waits for the sessions being created, then stops every agent and marks
   * its session as ended.
   */
  readonly close: () => Promise<void>;
}

/** The server is shutting down: AgentSessions starts no new session. */
export class SessionsClosedError extends Error {
  constructor() {
    super("The server is shutting down and starts no new session");
    this.name = "SessionsClosedError";
  }
}

interface Context {
  readonly dependencies: AgentSessionsDependencies;
  readonly live: Map<string, LiveSession>;
  /** Starts that have not yet put their session into `live`; close waits for them. */
  readonly starting: Set<Promise<unknown>>;
  closing: boolean;
}

/** Creates the session and starts its agent; close ends it when close began meanwhile. */
async function createAndLaunch(
  context: Context,
  { kind, agent }: { kind: SessionKind; agent: string },
): Promise<SessionView> {
  const { dependencies } = context;
  const { repository, clock } = dependencies;
  const created = await repository.create({ kind, agent, createdAt: clock.now() });
  // A finished session leaves `live`: later reads come from the journal.
  const session = liveSession(created, dependencies, () => {
    context.live.delete(created.id);
  });
  if (context.closing) {
    // Close began during the create: the session ends before its agent ever starts.
    await record(session, { type: "session_ended" });
    throw new SessionsClosedError();
  }
  launchLive(context, session);
  return session.view;
}

/** Hands the session to `live`, where close finds it, and starts its agent in the background. */
function launchLive({ dependencies, live }: Context, session: LiveSession): void {
  const { launcher, sessionsDirectory } = dependencies;
  live.set(session.view.id, session);
  const workingDirectory = path.join(sessionsDirectory, session.view.id);
  session.started = launch(session, { launcher, workingDirectory });
}

async function start(
  context: Context,
  request: { kind: SessionKind; agent: string },
): Promise<SessionView> {
  if (context.closing) {
    throw new SessionsClosedError();
  }
  const starting = createAndLaunch(context, request);
  // Close waits for this start: it either hands its session to close or ends it itself.
  context.starting.add(starting);
  try {
    return await starting;
  } finally {
    context.starting.delete(starting);
  }
}

async function view({ dependencies, live }: Context, sessionId: string) {
  const session = live.get(sessionId);
  if (session !== undefined) {
    return session.view;
  }
  const { repository } = dependencies;
  const stored = await repository.load(sessionId);
  return stored === undefined ? undefined : replay(stored, await repository.journal(sessionId));
}

async function prompt(context: Context, sessionId: string, text: string): Promise<PromptOutcome> {
  const session = context.live.get(sessionId);
  if (session === undefined) {
    return (await context.dependencies.repository.load(sessionId)) ? "closed" : "not_found";
  }
  const { agent } = session;
  if (agent === null || session.turnActive || !isLive(session.view.status)) {
    return isLive(session.view.status) ? "busy" : "closed";
  }
  // Set before the first await, so a second prompt in the meantime sees the turn.
  session.turnActive = true;
  await record(session, { type: "prompt_sent", text });
  void runTurn(session, agent, text);
  return "accepted";
}

async function cancel({ live }: Context, sessionId: string): Promise<void> {
  const session = live.get(sessionId);
  const agent = session?.agent ?? null;
  if (agent !== null && session?.turnActive === true) {
    // ACP: the client answers its waiting permission requests with `cancelled` on cancel.
    cancelPermissions(session);
    await agent.cancel();
  }
}

async function answer(
  { live }: Context,
  sessionId: string,
  { requestId, optionId }: { requestId: string; optionId: string },
): Promise<"accepted" | "not_found"> {
  const session = live.get(sessionId);
  if (
    session === undefined ||
    !answerPermission(session, requestId, { outcome: "selected", optionId })
  ) {
    return "not_found";
  }
  await session.written;
  return "accepted";
}

async function endInterrupted({ dependencies: { repository, clock } }: Context): Promise<void> {
  const sessions = await repository.list();
  const interrupted = sessions.filter((session) => isLive(session.status));
  await Promise.all(
    interrupted.map(async (session) =>
      repository.append({
        sessionId: session.id,
        event: { type: "session_ended" },
        status: "ended",
        recordedAt: clock.now(),
      }),
    ),
  );
}

async function end(session: LiveSession): Promise<void> {
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

async function close(context: Context): Promise<void> {
  context.closing = true;
  // A session being created ends in its start, before the storage closes.
  await Promise.allSettled(context.starting);
  const { live } = context;
  const sessions = [...live.values()];
  live.clear();
  await Promise.all(sessions.map(async (session) => end(session)));
}

/** AgentSessions of this server: starts their agents, keeps their journals and tells listeners. */
export function createAgentSessions(dependencies: AgentSessionsDependencies): AgentSessions {
  const context: Context = {
    dependencies,
    live: new Map(),
    starting: new Set(),
    closing: false,
  };
  return {
    start: async (request) => start(context, request),
    list: async () => dependencies.repository.list(),
    view: async (sessionId) => view(context, sessionId),
    prompt: async (sessionId, text) => prompt(context, sessionId, text),
    answerPermission: async (sessionId, request) => answer(context, sessionId, request),
    cancel: async (sessionId) => cancel(context, sessionId),
    subscribe: (sessionId, listener) => {
      const listeners = context.live.get(sessionId)?.listeners;
      listeners?.add(listener);
      return () => {
        listeners?.delete(listener);
      };
    },
    endInterrupted: async () => endInterrupted(context),
    close: async () => close(context),
  };
}
