// The start of a Mock interview: the checks the Candidate can fix, then the interviewer's
// AgentSession with the Target's tone and language, then the first template message.
import { randomUUID } from "node:crypto";

import { interviewStarted } from "../domain/agent-messages.ts";
import type { Difficulty, MockInterview } from "../domain/interview.ts";
import { interviewerRole } from "../domain/interviewer-role.ts";
import type { InterviewView } from "../domain/interview-view.ts";
import type { PlanSection, TargetPlan } from "../domain/ports.ts";
import { tellInterviewer, viewOf } from "./context.ts";
import { watchAgent } from "./endings.ts";
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
 */
export type StartOutcome =
  | { readonly type: "started"; readonly interview: InterviewView }
  | { readonly type: "target_not_found" | "invalid_sections" | "interview_running" }
  | { readonly type: "agent_unavailable"; readonly reason: string | null };

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
  { targets, agents }: InterviewsDependencies,
  targetId: string,
): Promise<string | Extract<StartOutcome, { type: "agent_unavailable" }>> {
  const targetAgent = await targets.agent(targetId);
  const chosen = targetAgent?.agent ?? null;
  const offered = chosen === null ? [] : await agents.listAgents();
  const availability = offered.find((entry) => entry.agent === chosen);
  if (chosen === null || availability === undefined) {
    return { type: "agent_unavailable", reason: null };
  }
  return availability.available
    ? chosen
    : { type: "agent_unavailable", reason: availability.reason };
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

/** Checks the start request in the order the Candidate can fix it. */
async function checkStart(
  dependencies: InterviewsDependencies,
  request: StartRequest,
): Promise<StartPlan | Exclude<StartOutcome, { type: "started" }>> {
  const plan = await dependencies.targets.get(request.targetId);
  if (plan === undefined) {
    return { type: "target_not_found" };
  }
  const sections = selectedSections(plan, request.sectionIds);
  if (sections === null) {
    return { type: "invalid_sections" };
  }
  if ((await dependencies.repository.running(plan.id)) !== undefined) {
    return { type: "interview_running" };
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
