// The continuation of a paused Mock interview (#84): «Продолжить» starts a new agent session that
// continues the previous one, so the chat shows both, and tells the agent where the interview
// stopped with the continuation summary of `get_brief`. The agent of the Mock interview goes on
// with it; when it is unavailable, the Candidate may go on with the Target's agent, which the Mock
// interview keeps from then on.
import { interviewContinues } from "../domain/agent-messages.ts";
import { pendingFollowUp } from "../domain/follow-ups.ts";
import type { MockInterview } from "../domain/interview.ts";
import { presentedQuestion } from "../domain/interview.ts";
import { interviewerRole } from "../domain/interviewer-role.ts";
import type { InterviewView } from "../domain/interview-view.ts";
import type { TargetPlan } from "../domain/ports.ts";
import { resumedTime } from "../domain/time-limit.ts";
import { change, tellInterviewer, viewOf } from "./context.ts";
import type { Context, InterviewsDependencies } from "./context.ts";
import { pause, pauseInterrupted, pauseRunning, watchAgent } from "./pauses.ts";
import type { PauseOutcome } from "./pauses.ts";
import { watchTimeLimit } from "./time-limit.ts";

/** The Candidate's «Продолжить», with the agent to go on with: the Mock interview's by default. */
export interface ResumeRequest {
  /** The Mock interview's agent or the Target's agent. */
  readonly agent?: string;
}

/**
 * - `resumed`: a new agent session goes on with the Mock interview.
 * - `not_paused`: it runs or has ended.
 * - `invalid_agent`: the agent is neither the Mock interview's nor the Target's.
 * - `agent_unavailable`: the agent cannot run now; `reason` says why in Russian when the runtime
 *   knows it. `targetAgent` is the Target's agent when it is another one and available: the
 *   Candidate may go on with it.
 */
export type ResumeOutcome =
  | { readonly type: "resumed"; readonly interview: InterviewView }
  | { readonly type: "not_found" | "not_paused" | "invalid_agent" }
  | {
      readonly type: "agent_unavailable";
      readonly agent: string;
      readonly reason: string | null;
      readonly targetAgent: string | null;
    };

/** Whether the agent can run now and, if not, why; a null reason when the server does not offer it. */
async function availability({ agents }: InterviewsDependencies, agent: string) {
  const listed = await agents.listAgents();
  const offered = listed.find((entry) => entry.agent === agent);
  if (offered === undefined) {
    return { available: false, reason: null } as const;
  }
  return offered.available
    ? ({ available: true } as const)
    : ({ available: false, reason: offered.reason } as const);
}

/** The Target's agent when it differs from the unavailable one and can run now; null otherwise. */
async function otherAgent(
  dependencies: InterviewsDependencies,
  { agent, targetAgent }: { agent: string; targetAgent: string | null },
): Promise<string | null> {
  if (targetAgent === null || targetAgent === agent) {
    return null;
  }
  const target = await availability(dependencies, targetAgent);
  return target.available ? targetAgent : null;
}

/** The agent to go on with once it can run, or the refusal. */
async function continuingAgent(
  dependencies: InterviewsDependencies,
  interview: MockInterview,
  request: ResumeRequest,
): Promise<string | Exclude<ResumeOutcome, { type: "resumed" }>> {
  const target = await dependencies.targets.agent(interview.targetId);
  const targetAgent = target?.agent ?? null;
  const agent = request.agent ?? interview.agent;
  if (agent !== interview.agent && agent !== targetAgent) {
    return { type: "invalid_agent" };
  }
  const chosen = await availability(dependencies, agent);
  if (chosen.available) {
    return agent;
  }
  return {
    type: "agent_unavailable",
    agent,
    reason: chosen.reason,
    targetAgent: await otherAgent(dependencies, { agent, targetAgent }),
  };
}

/** The paused Mock interview with its plan, or the refusal. */
async function pausedWithPlan(
  { repository, targets }: InterviewsDependencies,
  id: string,
): Promise<
  { interview: MockInterview; plan: TargetPlan } | Exclude<ResumeOutcome, { type: "resumed" }>
> {
  const interview = await repository.get(id);
  const plan = interview === undefined ? undefined : await targets.get(interview.targetId);
  if (interview === undefined || plan === undefined) {
    return { type: "not_found" };
  }
  return interview.status === "paused" ? { interview, plan } : { type: "not_paused" };
}

/**
 * Starts the new agent session with the agent; it continues the previous session, so the chat
 * shows both. Stores the running Mock interview with it.
 */
async function startContinuation(
  { repository, sessions, clock }: InterviewsDependencies,
  { interview, plan, agent }: { interview: MockInterview; plan: TargetPlan; agent: string },
): Promise<MockInterview> {
  const session = await sessions.start({
    kind: "mock-interview",
    agent,
    targetId: interview.targetId,
    roleAddition: interviewerRole(plan),
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
  request: ResumeRequest,
): Promise<MockInterview | Exclude<ResumeOutcome, { type: "resumed" }>> {
  const { dependencies } = context;
  return change(context, id, async () => {
    const paused = await pausedWithPlan(dependencies, id);
    if ("type" in paused) {
      return paused;
    }
    const agent = await continuingAgent(dependencies, paused.interview, request);
    return typeof agent === "string"
      ? startContinuation(dependencies, { ...paused, agent })
      : agent;
  });
}

/**
 * Keeps the new agent's text out of the chat while the presented question or its Follow-up waits
 * for the Candidate's answer, as after `present_question`: it could hint at the answer.
 */
async function hideWhileWaiting(context: Context, interview: MockInterview): Promise<void> {
  const { repository, sessions } = context.dependencies;
  const [asked, attempts] = await Promise.all([
    repository.asked(interview.id),
    repository.attempts(interview.id),
  ]);
  const presented = presentedQuestion(asked, attempts);
  const waits =
    presented !== undefined &&
    (presented.answer === null || pendingFollowUp(presented) !== undefined);
  if (waits) {
    await sessions.hideAgentText(interview.sessionId);
  }
}

/** «Продолжить»: the Mock interview goes on with a new agent session from where it stopped. */
async function resume(
  context: Context,
  id: string,
  request: ResumeRequest,
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
  readonly resume: (id: string, request: ResumeRequest) => Promise<ResumeOutcome>;
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
