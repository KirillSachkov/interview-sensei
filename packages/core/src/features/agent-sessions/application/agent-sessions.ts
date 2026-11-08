import path from "node:path";

import type { AgentSession, SessionKind, SessionView } from "../domain/agent-session.ts";
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
export type PromptOutcome = "accepted" | "busy" | "closed" | "not_found";

export interface AgentSessions {
  /** Creates the session and starts its agent in the background; the view reports progress. */
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
  /** Stops every agent and marks its session as ended. */
  readonly close: () => Promise<void>;
}

interface Context {
  readonly dependencies: AgentSessionsDependencies;
  readonly live: Map<string, LiveSession>;
}

async function start(
  { dependencies, live }: Context,
  { kind, agent }: { kind: SessionKind; agent: string },
): Promise<SessionView> {
  const { repository, clock, launcher, sessionsDirectory } = dependencies;
  const created = await repository.create({ kind, agent, createdAt: clock.now() });
  const session = liveSession(created, dependencies);
  live.set(created.id, session);
  const workingDirectory = path.join(sessionsDirectory, created.id);
  session.started = launch(session, { launcher, workingDirectory });
  return session.view;
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

async function close({ live }: Context): Promise<void> {
  const sessions = [...live.values()];
  live.clear();
  await Promise.all(sessions.map(async (session) => end(session)));
}

/** AgentSessions of this server: starts their agents, keeps their journals and tells listeners. */
export function createAgentSessions(dependencies: AgentSessionsDependencies): AgentSessions {
  const context: Context = { dependencies, live: new Map() };
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
