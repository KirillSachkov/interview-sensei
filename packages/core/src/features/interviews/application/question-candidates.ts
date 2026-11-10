// `next_question_candidates`: the selection rules v2 (#8, #64) on the Target's history of Mock
// interviews, with the reasons of each candidate and the suggested move to the next Section.
import { candidateLevel, questionCandidates } from "../domain/candidates.ts";
import type { Candidate, CandidateTopic } from "../domain/candidates.ts";
import type { MockInterview } from "../domain/interview.ts";
import type { BankQuestion, PlanSection, TargetPlan } from "../domain/ports.ts";
import { suggestedSection } from "../domain/section-shares.ts";
import { runningMs } from "../domain/time-limit.ts";
import { fullTopic, topicStreakLimit } from "../domain/topic-streak.ts";
import type { Context } from "./context.ts";
import {
  assertRunning,
  InterviewToolError,
  interviewOf,
  planOf,
  selected,
} from "./tool-session.ts";

export interface CandidatesRequest {
  /** Another level than the brief's, when the agent adjusts the difficulty. */
  readonly level?: BankQuestion["level"] | undefined;
  /** Only this Topic of the current Section, such as for a Deeper question. */
  readonly topicId?: string | undefined;
}

/** A candidate as the agent sees it: no correct options and no reference answer. */
function candidateOf({ question, reasons }: Candidate) {
  return {
    id: question.id,
    topicId: question.topicId,
    text: question.text,
    format: question.format,
    level: question.level,
    ...(question.format === "quiz" ? { options: question.options } : {}),
    reasons,
  };
}

/** The Mock interviews of the Target before this one, the newest first. */
async function earlierInterviews(context: Context, targetId: string, interviewId: string) {
  const latest = await context.dependencies.repository.latest(targetId, 3);
  return latest.filter((entry) => entry.id !== interviewId).map((entry) => entry.id);
}

/** The importance of each Topic of the plan with its Topic status. */
export async function planTopics(
  context: Context,
  plan: TargetPlan,
): Promise<ReadonlyMap<string, CandidateTopic>> {
  const statuses = await context.dependencies.progress.topicStatuses(plan.id);
  const statusOf = new Map(statuses.map(({ id, status }) => [id, status]));
  return new Map(
    plan.sections.flatMap((section) =>
      section.topics.map(({ id, importance }) => [
        id,
        { importance, status: statusOf.get(id) ?? "not_started" },
      ]),
    ),
  );
}

/**
 * The Topic that had its limit of questions in a row in this Mock interview; undefined when the
 * last Topic may get one more.
 */
export async function topicAtLimit(
  context: Context,
  { interview, topics }: { interview: MockInterview; topics: ReadonlyMap<string, CandidateTopic> },
): Promise<string | undefined> {
  const asked = await context.dependencies.repository.asked(interview.id);
  return fullTopic(asked, (topicId) => topics.get(topicId)?.status ?? "not_started");
}

/** The rule a question in the Topic that had its limit of questions in a row breaks. */
export function topicLimitRule(name: string, topic: CandidateTopic | undefined): string {
  const limit = topicStreakLimit(topic?.status ?? "not_started");
  return `The Topic «${name}» already had ${limit} questions in a row, Deeper questions included: move to another Topic.`;
}

/** The name of the Topic in the plan, or its id. */
export function topicName(plan: TargetPlan, topicId: string): string {
  return (
    plan.sections.flatMap((section) => section.topics).find((topic) => topic.id === topicId)
      ?.name ?? topicId
  );
}

/** The suggested move to another selected Section by the shares, for the agent; null without one. */
async function sectionHint(
  context: Context,
  { interview, sections }: { interview: MockInterview; sections: readonly PlanSection[] },
): Promise<string | null> {
  const now = context.dependencies.clock.now().toISOString();
  const asked = await context.dependencies.repository.asked(interview.id);
  const pace =
    interview.limitMinutes === null
      ? { limitMinutes: null, askedCount: asked.length }
      : {
          limitMinutes: interview.limitMinutes,
          runningMinutes: runningMs(interview, now) / 60_000,
        };
  const suggested = suggestedSection(sections, {
    currentSectionId: interview.currentSectionId,
    pace,
  });
  const section = sections.find((entry) => entry.id === suggested);
  return section === undefined
    ? null
    : `By the Section shares, the interview should move to «${section.name}» now: call set_current_section with sectionId ${section.id} when the current Topic allows.`;
}

/** The current Section, after checking the asked Topic is in it and has not had its limit. */
async function scope(
  context: Context,
  { interview, plan }: { interview: MockInterview; plan: TargetPlan },
  topicId: string | undefined,
) {
  const section = selected(plan, interview).find(
    (entry) => entry.id === interview.currentSectionId,
  );
  if (topicId !== undefined && !(section?.topicIds.includes(topicId) ?? false)) {
    throw new InterviewToolError(
      "This Topic is not in the current Section: call set_current_section first, or leave topicId out.",
    );
  }
  const topics = await planTopics(context, plan);
  if (topicId !== undefined && (await topicAtLimit(context, { interview, topics })) === topicId) {
    throw new InterviewToolError(topicLimitRule(topicName(plan, topicId), topics.get(topicId)));
  }
  return { section, topics };
}

/** The 5 candidates of the current Section as JSON, the most needed first, with their reasons. */
export async function candidates(
  context: Context,
  sessionId: string,
  { level, topicId }: CandidatesRequest,
): Promise<string> {
  const interview = await interviewOf(context, sessionId);
  assertRunning(interview);
  const plan = await planOf(context, interview);
  const { section, topics } = await scope(context, { interview, plan }, topicId);
  const topicIds = topicId === undefined ? (section?.topicIds ?? []) : [topicId];
  const { repository, questions, clock } = context.dependencies;
  const found = questionCandidates({
    questions: topicIds.length === 0 ? [] : await questions.search(plan.id, { topicIds }),
    topics,
    interviewId: interview.id,
    history: await repository.history(plan.id),
    recentInterviewIds: await earlierInterviews(context, plan.id, interview.id),
    level: level ?? candidateLevel(plan.level, interview.difficulty),
    now: clock.now().toISOString(),
  });
  return JSON.stringify({
    sectionId: section?.id ?? null,
    sectionHint: await sectionHint(context, { interview, sections: selected(plan, interview) }),
    candidates: found.map((candidate) => candidateOf(candidate)),
  });
}
