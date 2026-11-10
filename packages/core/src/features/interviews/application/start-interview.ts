// The start of a Mock interview: the checks the Candidate can fix, then the interviewer's
// AgentSession with the Target's tone and language, then the first template message.
import { randomUUID } from "node:crypto";

import { interviewStarted } from "../domain/agent-messages.ts";
import type { Difficulty, MockInterview } from "../domain/interview.ts";
import { interviewerRole } from "../domain/interviewer-role.ts";
import type { InterviewView } from "../domain/interview-view.ts";
import type { PlanSection, TargetPlan } from "../domain/ports.ts";
import { agentRefusal } from "./agent-choice.ts";
import type { AgentRefusal } from "./agent-choice.ts";
import { tellInterviewer, viewOf } from "./context.ts";
import { watchAgent } from "./pauses.ts";
import type { Context, InterviewsDependencies } from "./context.ts";
import { watchTimeLimit } from "./time-limit.ts";

export interface StartRequest {
  readonly targetId: string;
  /** The Sections to train; each must be an enabled Section of the Target's plan. */
  readonly sectionIds: readonly string[];
  readonly limitMinutes?: number | null;
  readonly difficulty?: Difficulty;
}

/**
 * - `started`: the agent starts in the background and gets the first template message.
 * - `invalid_sections`: no Section, a repeated one, or one that is not an enabled Section of the plan.
 * - `agent_unavailable`: the Target's agent cannot run now; `reason` says why, in Russian, when
 *   the runtime knows it.
 * - `interview_running`: the Target already has a running Mock interview.
 * - `interview_paused`: the Target has a paused Mock interview; the Candidate continues or
 *   finishes it first (#84).
 */
export type StartOutcome =
  | { readonly type: "started"; readonly interview: InterviewView }
  | { readonly type: "target_not_found" | "invalid_sections" | "interview_running" }
  | { readonly type: "interview_paused"; readonly interviewId: string }
  | AgentRefusal;

/** The selected Sections in the plan's order, or null when the selection is invalid. */
function selectedSections(plan: TargetPlan, sectionIds: readonly string[]) {
  const wanted = new Set(sectionIds);
  const selected = plan.sections
    .filter((section) => wanted.has(section.id) && section.enabled)
    .toSorted((left, right) => left.position - right.position);
  return selected.length === 0 ||
    selected.length !== sectionIds.length ||
    wanted.size !== sectionIds.length
    ? null
    : selected;
}

/** The Target's agent when it can run now; otherwise the refusal. */
async function interviewerAgent(
  dependencies: InterviewsDependencies,
  targetId: string,
): Promise<string | AgentRefusal> {
  const targetAgent = await dependencies.targets.agent(targetId);
  const chosen = targetAgent?.agent ?? null;
  if (chosen === null) {
    return { type: "agent_unavailable", reason: null };
  }
  return (await agentRefusal(dependencies, chosen)) ?? chosen;
}

/** What a start needs once every check passed. */
interface StartPlan {
  readonly plan: TargetPlan;
  readonly sections: readonly PlanSection[];
  readonly agent: string;
  /** The requested difficulty, or the one of the Target's last Mock interview. */
  readonly difficulty: Difficulty;
}

/** The Target keeps the difficulty the Candidate chose last, «как есть» at first. */
async function difficultyOf(
  { repository }: InterviewsDependencies,
  { targetId, difficulty }: StartRequest,
): Promise<Difficulty> {
  if (difficulty !== undefined) {
    return difficulty;
  }
  const [last] = await repository.latest(targetId, 1);
  return last?.difficulty ?? "as_is";
}

/** The refusal when the Target has a running or paused Mock interview; null when it has none. */
async function activeRefusal(
  { repository }: InterviewsDependencies,
  targetId: string,
): Promise<Exclude<StartOutcome, { type: "started" }> | null> {
  const active = await repository.active(targetId);
  if (active === undefined) {
    return null;
  }
  return active.status === "paused"
    ? { type: "interview_paused", interviewId: active.id }
    : { type: "interview_running" };
}

/** Checks the start request in the order the Candidate can fix it. */
async function checkStart(
  dependencies: InterviewsDependencies,
  request: StartRequest,
): Promise<StartPlan | Exclude<StartOutcome, { type: "started" }>> {
  const plan = await dependencies.targets.get(request.targetId);
  const sections = plan === undefined ? null : selectedSections(plan, request.sectionIds);
  if (plan === undefined || sections === null) {
    return { type: plan === undefined ? "target_not_found" : "invalid_sections" };
  }
  const active = await activeRefusal(dependencies, plan.id);
  if (active !== null) {
    return active;
  }
  const agent = await interviewerAgent(dependencies, plan.id);
  return typeof agent === "string"
    ? { plan, sections, agent, difficulty: await difficultyOf(dependencies, request) }
    : agent;
}

function newInterview(
  { plan, sections, agent, difficulty }: StartPlan,
  {
    request,
    sessionId,
    startedAt,
  }: { request: StartRequest; sessionId: string; startedAt: string },
): MockInterview {
  return {
    id: randomUUID(),
    targetId: plan.id,
    sessionId,
    agent,
    status: "running",
    sectionIds: sections.map((section) => section.id),
    currentSectionId: sections[0]?.id ?? null,
    limitMinutes: request.limitMinutes ?? null,
    difficulty,
    startedAt,
    pausedAt: null,
    pausedMs: 0,
    pauseReason: null,
    resumedAt: null,
    finishRequestedAt: null,
    finishedAt: null,
    summary: null,
    nextStep: null,
  };
}

/** Starts the interviewer's AgentSession with the Target's tone and language in its role. */
async function startSession({ sessions }: InterviewsDependencies, { plan, agent }: StartPlan) {
  return sessions.start({
    kind: "mock-interview",
    agent,
    targetId: plan.id,
    roleAddition: interviewerRole(plan),
  });
}

/**
 * Stores the new Mock interview; false when another start of the same Target won the race, and
 * then this agent has nothing to do.
 */
async function stored(
  { repository, sessions }: InterviewsDependencies,
  interview: MockInterview,
): Promise<boolean> {
  if ((await repository.create(interview)) === "created") {
    return true;
  }
  await sessions.end(interview.sessionId);
  return false;
}

/**
 * Watches the agent of the stored Mock interview, sends it the first template message and keeps
 * the time of a limit.
 */
function begin(context: Context, interview: MockInterview): void {
  watchAgent(context, interview);
  tellInterviewer(context, interview.sessionId, interviewStarted);
  watchTimeLimit(context, interview);
}

export async function start(context: Context, request: StartRequest): Promise<StartOutcome> {
  const { dependencies } = context;
  const checked = await checkStart(dependencies, request);
  if (!("plan" in checked)) {
    return checked;
  }
  const session = await startSession(dependencies, checked);
  const interview = newInterview(checked, {
    request,
    sessionId: session.id,
    startedAt: dependencies.clock.now().toISOString(),
  });
  if (!(await stored(dependencies, interview))) {
    return { type: "interview_running" };
  }
  begin(context, interview);
  return { type: "started", interview: await viewOf(dependencies, interview) };
}
