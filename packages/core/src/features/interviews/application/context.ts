import type { Clock, Timer } from "../../../shared/time/index.ts";
import type { MockInterview } from "../domain/interview.ts";
import { interviewView } from "../domain/interview-view.ts";
import type { InterviewView } from "../domain/interview-view.ts";
import type {
  InterviewAgents,
  InterviewProgress,
  InterviewQuestions,
  InterviewRepository,
  InterviewSessions,
  InterviewTargets,
} from "../domain/ports.ts";

export interface InterviewsDependencies {
  readonly repository: InterviewRepository;
  readonly targets: InterviewTargets;
  readonly agents: InterviewAgents;
  readonly questions: InterviewQuestions;
  readonly sessions: InterviewSessions;
  readonly clock: Clock;
  /** Runs the reminder before the time limit, the end of the limit and the wait for `finish_interview`. */
  readonly timer: Timer;
  /** The Topics to work on first, for the brief. */
  readonly progress: InterviewProgress;
  /** Receives errors of background work, such as a template message that failed to send. */
  readonly onError: (error: unknown) => void;
}

/** Receives the Mock interview's view after each change. */
export type InterviewListener = (view: InterviewView) => void;

/** The state the Candidate's side and the interviewer's side share. */
export interface Context {
  readonly dependencies: InterviewsDependencies;
  readonly listeners: Map<string, Set<InterviewListener>>;
  /** The last change of each Mock interview; changes of one Mock interview run one at a time. */
  readonly changes: Map<string, Promise<unknown>>;
}

export function createContext(dependencies: InterviewsDependencies): Context {
  return { dependencies, listeners: new Map(), changes: new Map() };
}

export async function viewOf(
  { repository, clock }: InterviewsDependencies,
  interview: MockInterview,
): Promise<InterviewView> {
  const [asked, attempts, sideThreads] = await Promise.all([
    repository.asked(interview.id),
    repository.attempts(interview.id),
    repository.sideThreads(interview.id),
  ]);
  return interviewView(interview, {
    asked,
    attempts,
    sideThreads,
    now: clock.now().toISOString(),
  });
}

/** Tells the listeners of the Mock interview its new view. */
async function notify(context: Context, interviewId: string): Promise<void> {
  const listeners = context.listeners.get(interviewId);
  if (listeners === undefined || listeners.size === 0) {
    return;
  }
  const interview = await context.dependencies.repository.get(interviewId);
  if (interview === undefined) {
    return;
  }
  const view = await viewOf(context.dependencies, interview);
  for (const listener of listeners) {
    listener(view);
  }
}

/** Runs the change, then tells the listeners, even after a refused change; see `change`. */
async function changeAndNotify<Result>(
  context: Context,
  interviewId: string,
  run: () => Promise<Result>,
): Promise<Result> {
  try {
    return await run();
  } finally {
    try {
      await notify(context, interviewId);
    } catch (error) {
      context.dependencies.onError(error);
    }
  }
}

/** Runs the work after the previous one, whether that one succeeded or not. */
async function after<Result>(previous: Promise<unknown>, run: () => Promise<Result>) {
  try {
    await previous;
  } catch {
    // The previous change's failure went to its own caller.
  }
  return run();
}

/** Runs the work in the background; a failure goes to `onError`. */
export function inBackground(context: Context, work: () => Promise<unknown>): void {
  void (async () => {
    try {
      await work();
    } catch (error) {
      context.dependencies.onError(error);
    }
  })();
}

/**
 * Runs the change after the earlier changes of the same Mock interview, then tells its listeners.
 * The Candidate's answers and the agent's tool calls reach the server at the same time; one at a
 * time, each change sees the state the previous one left.
 */
export async function change<Result>(
  context: Context,
  interviewId: string,
  run: () => Promise<Result>,
): Promise<Result> {
  // The listeners hear of each change before the next one starts, so views arrive in order.
  const current = after(context.changes.get(interviewId) ?? Promise.resolve(), async () =>
    changeAndNotify(context, interviewId, run),
  );
  context.changes.set(interviewId, current);
  try {
    return await current;
  } finally {
    if (context.changes.get(interviewId) === current) {
      context.changes.delete(interviewId);
    }
  }
}

/** Sends a template message to the interviewer after its current turn. */
export function tellInterviewer(context: Context, sessionId: string, text: string): void {
  inBackground(context, async () =>
    context.dependencies.sessions.queuePrompt(sessionId, text, { showAgentText: false }),
  );
}

/**
 * Sends the template message of the Candidate's answer, or of the finish, after the agent's current
 * turn. The agent's text stays hidden while a question or Follow-up waits for the answer (#41,
 * story 26); from this message on it goes to the chat again.
 */
export function tellAndShowAgentText(context: Context, sessionId: string, text: string): void {
  inBackground(context, async () =>
    context.dependencies.sessions.queuePrompt(sessionId, text, { showAgentText: true }),
  );
}
