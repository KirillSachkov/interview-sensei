import { rm } from "node:fs/promises";
import path from "node:path";

import type { AgentSession, SessionView } from "../domain/agent-session.ts";
import { isLive } from "../domain/agent-session.ts";
import type { AgentLauncher } from "../domain/ports.ts";
import { replay } from "../domain/session-view.ts";
import {
  answerPermission,
  cancelPermissions,
  end,
  launch,
  liveSession,
  record,
} from "./live-session.ts";
import type { LiveSession, LiveSessionDependencies, SessionListener } from "./live-session.ts";
import {
  addNote,
  candidatePrompt,
  drain,
  enqueue,
  hideAgentText,
  queuePrompt,
} from "./server-prompts.ts";
import type { PromptOutcome, QueueContext, QueueOutcome } from "./server-prompts.ts";
import { runningFor, sessionOpener, stopNow } from "./open-session.ts";
import type { OpenSession, StartRequest } from "./open-session.ts";

export interface AgentSessionsDependencies extends LiveSessionDependencies {
  readonly launcher: AgentLauncher;
  /** Each session gets its own directory here, inside the data directory. */
  readonly sessionsDirectory: string;
}

export interface AgentSessions {
  /**
   * Creates the session and starts its agent in the background; the view reports progress.
   * Rejects with SessionsClosedError once close has begun.
   */
  readonly start: (request: StartRequest) => Promise<SessionView>;
  /**
   * The live session of the kind for the Target, or a new one that `prepare` describes; one live
   * session per kind and Target. Rejects as `prepare` does, and with SessionsClosedError on close.
   */
  readonly open: OpenSession;
  /** Every session, the newest first. */
  readonly list: () => Promise<readonly AgentSession[]>;
  /** Whether a live session of the Target, of any kind, runs on this server now. */
  readonly running: (targetId: string) => boolean;
  readonly view: (sessionId: string) => Promise<SessionView | undefined>;
  /** Sends the Candidate's prompt to the agent; refuses it while the agent works. */
  readonly prompt: (sessionId: string, text: string) => Promise<PromptOutcome>;
  /**
   * Sends the server's prompt, such as a template message of a mock interview, once the agent has
   * started and finished its current turn and the server's earlier prompts. It stays out of the
   * chat. With `showAgentText`, the agent's hidden text goes to the chat again from this prompt on.
   * Resolves when the agent gets it, or with `closed` when the session ends first.
   */
  readonly queuePrompt: (
    sessionId: string,
    text: string,
    options: { readonly showAgentText: boolean },
  ) => Promise<QueueOutcome>;
  /** Hides the agent's text from the chat until a prompt with `showAgentText`; only when live. */
  readonly hideAgentText: (sessionId: string) => Promise<void>;
  /** See `addNote` in server-prompts.ts, such as the mock interview's note about a Side thread. */
  readonly addNote: (sessionId: string, text: string) => void;
  /**
   * Stops the agent after its current turn and the server's queued prompts, and marks the session
   * as ended. Does nothing for a session that is not live.
   */
  readonly end: (sessionId: string) => Promise<void>;
  /** Stops the agent at once and deletes the session with its journal for good, such as a Side thread. */
  readonly remove: (sessionId: string) => Promise<void>;
  /** Stops the agent at once, even in a turn, and ends the session; false when it is not live. */
  readonly stop: (sessionId: string) => Promise<boolean>;
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
  /** The live sessions for the server's queued prompts and ends. */
  readonly queue: QueueContext;
  /** Starts that have not yet put their session into `live`; close waits for them. */
  readonly starting: Set<Promise<unknown>>;
  closing: boolean;
}

/** Creates the session and starts its agent; close ends it when close began meanwhile. */
async function createAndLaunch(
  context: Context,
  { kind, agent, targetId, roleAddition, opening }: StartRequest,
): Promise<SessionView> {
  const { dependencies } = context;
  const { repository, clock } = dependencies;
  const created = await repository.create({
    kind,
    agent,
    ...(targetId === undefined ? {} : { targetId }),
    createdAt: clock.now(),
  });
  // A finished session leaves `live`: later reads come from the journal.
  const session = liveSession(created, dependencies, {
    onFinished: () => {
      context.live.delete(created.id);
    },
    onIdle: () => {
      void drain(context.queue, session);
    },
  });
  if (context.closing) {
    // Close began during the create: the session ends before its agent ever starts.
    await record(session, { type: "session_ended" });
    throw new SessionsClosedError();
  }
  launchLive(context, session, { roleAddition, opening });
  return session.view;
}

/**
 * Hands the session to `live`, where close finds it, and starts its agent in the background. The
 * opening is the first server prompt: the agent gets it once it starts, so it speaks first.
 */
function launchLive(
  { dependencies, live }: Context,
  session: LiveSession,
  { roleAddition, opening }: { roleAddition: string | undefined; opening: string | undefined },
): void {
  const { launcher, sessionsDirectory } = dependencies;
  if (opening !== undefined) {
    session.queued.push({ type: "prompt", text: opening, showAgentText: false, settle: () => {} });
  }
  live.set(session.view.id, session);
  const workingDirectory = path.join(sessionsDirectory, session.view.id);
  session.started = launch(session, { launcher, workingDirectory, roleAddition });
}

async function start(context: Context, request: StartRequest): Promise<SessionView> {
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

/** Stops the session's agent at once and deletes the session, its journal and its directory. */
async function remove({ live, dependencies }: Context, sessionId: string): Promise<void> {
  await stopNow(live, sessionId);
  await dependencies.repository.remove(sessionId);
  await rm(path.join(dependencies.sessionsDirectory, sessionId), { recursive: true, force: true });
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
  const live = new Map<string, LiveSession>();
  const context: Context = {
    dependencies,
    live,
    queue: {
      live,
      repository: dependencies.repository,
      endSession: async (session) => {
        live.delete(session.view.id);
        await end(session);
      },
    },
    starting: new Set(),
    closing: false,
  };
  return {
    start: async (request) => start(context, request),
    open: sessionOpener({
      live: context.live,
      start: async (request) => start(context, request),
    }),
    list: async () => dependencies.repository.list(),
    running: (targetId) => runningFor(context.live, targetId),
    view: async (sessionId) => view(context, sessionId),
    prompt: async (sessionId, text) => candidatePrompt(context.queue, sessionId, text),
    queuePrompt: async (sessionId, text, options) =>
      queuePrompt(context.queue, { sessionId, text }, options),
    hideAgentText: async (sessionId) => hideAgentText(context.queue, sessionId),
    addNote: (sessionId, text) => {
      addNote(context.queue, sessionId, text);
    },
    end: async (sessionId) => {
      await enqueue(context.queue, sessionId, (settle) => ({ type: "end", settle }));
    },
    remove: async (sessionId) => remove(context, sessionId),
    stop: async (sessionId) => stopNow(context.live, sessionId),
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
