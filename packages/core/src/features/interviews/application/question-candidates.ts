// `next_question_candidates`: the selection rules v2 (#8, #64) on the Target's history of Mock
// interviews, with the reasons of each candidate and the suggested move to the next Section.
import { candidateLevel, questionCandidates } from "../domain/candidates.ts";
import type { Candidate } from "../domain/candidates.ts";
import type { MockInterview } from "../domain/interview.ts";
import type { BankQuestion, PlanSection, TargetPlan } from "../domain/ports.ts";
import { suggestedSection } from "../domain/section-shares.ts";
import { runningMs } from "../domain/time-limit.ts";
import type { Context } from "./context.ts";
import { earlierInterviews } from "./question-history.ts";
import { assertTopicOpen, planTopics } from "./topic-limit.ts";
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
  if (topicId !== undefined) {
    await assertTopicOpen(context, { interview, plan, topics }, topicId);
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
