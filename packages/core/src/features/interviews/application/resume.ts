// The continuation of a paused Mock interview (#84): «Продолжить» starts a new agent session that
// continues the previous one, so the chat shows both, and tells the agent where the interview
// stopped with the continuation summary of `get_brief`. The agent of the Mock interview goes on
// with it; when it is unavailable, the Candidate may go on with the Target's agent, which the Mock
// interview keeps from then on.
import { interviewContinues } from "../domain/agent-messages.ts";
import type { MockInterview } from "../domain/interview.ts";
import { interviewerRole } from "../domain/interviewer-role.ts";
import type { InterviewView } from "../domain/interview-view.ts";
import { resumedTime } from "../domain/time-limit.ts";
import { continuingAgent } from "./agent-choice.ts";
import type { ContinuationRefusal, ContinuationRequest } from "./agent-choice.ts";
import { change, tellInterviewer, viewOf } from "./context.ts";
import { hideWhileWaiting } from "./follow-ups.ts";
import type { Context, InterviewsDependencies } from "./context.ts";
import { pause, pauseInterrupted, pauseRunning, watchAgent } from "./pauses.ts";
import type { PauseOutcome } from "./pauses.ts";
import { watchTimeLimit } from "./time-limit.ts";

/**
 * - `resumed`: a new agent session goes on with the Mock interview.
 * - `not_paused`: it runs or has ended.
 * - `invalid_agent`, `agent_unavailable`: see ContinuationRefusal.
 */
export type ResumeOutcome =
  | { readonly type: "resumed"; readonly interview: InterviewView }
  | { readonly type: "not_found" | "not_paused" }
  | ContinuationRefusal;

/** The paused Mock interview with the interviewer's role from its plan, or the refusal. */
async function pausedWithRole(
  { repository, targets }: InterviewsDependencies,
  id: string,
): Promise<
  { interview: MockInterview; roleAddition: string } | Exclude<ResumeOutcome, { type: "resumed" }>
> {
  const interview = await repository.get(id);
  const plan = interview === undefined ? undefined : await targets.get(interview.targetId);
  if (interview === undefined || plan === undefined) {
    return { type: "not_found" };
  }
  return interview.status === "paused"
    ? { interview, roleAddition: interviewerRole(plan) }
    : { type: "not_paused" };
}

/**
 * Starts the new agent session with the agent; it continues the previous session, so the chat
 * shows both. Stores the running Mock interview with it.
 */
async function startContinuation(
  { repository, sessions, clock }: InterviewsDependencies,
  {
    interview,
    roleAddition,
    agent,
  }: { interview: MockInterview; roleAddition: string; agent: string },
): Promise<MockInterview> {
  const session = await sessions.start({
    kind: "mock-interview",
    agent,
    targetId: interview.targetId,
    roleAddition,
    continues: interview.sessionId,
  });
  const now = clock.now().toISOString();
  const changes = {
    status: "running",
    sessionId: session.id,
    agent,
    ...resumedTime(interview, now),
    pauseReason: null,
    resumedAt: now,
  } as const;
  await repository.update(interview.id, changes);
  return { ...interview, ...changes };
}

/** Goes on with the paused Mock interview in a new agent session; the refusal when it cannot. */
async function continueWith(
  context: Context,
  id: string,
  request: ContinuationRequest,
): Promise<MockInterview | Exclude<ResumeOutcome, { type: "resumed" }>> {
  const { dependencies } = context;
  return change(context, id, async () => {
    const paused = await pausedWithRole(dependencies, id);
    if ("type" in paused) {
      return paused;
    }
    const agent = await continuingAgent(dependencies, paused.interview, request);
    return typeof agent === "string"
      ? startContinuation(dependencies, { ...paused, agent })
      : agent;
  });
}

/** «Продолжить»: the Mock interview goes on with a new agent session from where it stopped. */
async function resume(
  context: Context,
  id: string,
  request: ContinuationRequest,
): Promise<ResumeOutcome> {
  const resumed = await continueWith(context, id, request);
  if ("type" in resumed) {
    return resumed;
  }
  await hideWhileWaiting(context, resumed);
  watchAgent(context, resumed);
  tellInterviewer(context, resumed.sessionId, interviewContinues);
  watchTimeLimit(context, resumed);
  return { type: "resumed", interview: await viewOf(context.dependencies, resumed) };
}

/** The pause and the continuation of Mock interviews. */
export interface Pauses {
  /** «Пауза»: the time stops and the agent stops at once (#84). */
  readonly pause: (id: string) => Promise<PauseOutcome>;
  /** «Продолжить»: a new agent session goes on with the paused Mock interview. */
  readonly resume: (id: string, request: ContinuationRequest) => Promise<ResumeOutcome>;
  /** Pauses every running Mock interview; call it when the server stops, before its agents stop. */
  readonly pauseRunning: () => Promise<void>;
  /** Pauses the Mock interviews that still ran when the server last stopped; call it at start. */
  readonly pauseInterrupted: () => Promise<void>;
}

export function createPauses(context: Context): Pauses {
  return {
    pause: async (id) => pause(context, id),
    resume: async (id, request) => resume(context, id, request),
    pauseRunning: async () => pauseRunning(context),
    pauseInterrupted: async () => pauseInterrupted(context),
  };
}
