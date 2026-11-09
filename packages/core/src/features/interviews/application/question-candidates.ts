// `next_question_candidates`: the selection rules (#8) on the Target's history of Mock interviews.
import { candidateLevel, questionCandidates } from "../domain/candidates.ts";
import type { BankQuestion } from "../domain/ports.ts";
import type { Context } from "./context.ts";
import {
  assertRunning,
  InterviewToolError,
  interviewOf,
  planOf,
  selected,
} from "./tool-session.ts";

export interface CandidatesRequest {
  readonly limit: number;
  /** Another level than the brief's, when the agent adjusts the difficulty. */
  readonly level?: BankQuestion["level"] | undefined;
  /** Only this Topic of the current Section, such as for a Deeper question. */
  readonly topicId?: string | undefined;
}

/** A candidate as the agent sees it: no correct options. */
function candidateOf(question: BankQuestion) {
  return {
    id: question.id,
    topicId: question.topicId,
    text: question.text,
    format: question.format,
    level: question.level,
    ...(question.format === "quiz" ? { options: question.options } : {}),
  };
}

/** The Mock interviews of the Target before this one, the newest first. */
async function earlierInterviews(context: Context, targetId: string, interviewId: string) {
  const latest = await context.dependencies.repository.latest(targetId, 3);
  return latest.filter((entry) => entry.id !== interviewId).map((entry) => entry.id);
}

/** Up to `limit` candidates of the current Section as JSON, the most needed first. */
export async function candidates(
  context: Context,
  sessionId: string,
  { limit, level, topicId }: CandidatesRequest,
): Promise<string> {
  const interview = await interviewOf(context, sessionId);
  assertRunning(interview);
  const plan = await planOf(context, interview);
  const section = selected(plan, interview).find(
    (entry) => entry.id === interview.currentSectionId,
  );
  if (topicId !== undefined && !(section?.topicIds.includes(topicId) ?? false)) {
    throw new InterviewToolError(
      "This Topic is not in the current Section: call set_current_section first, or leave topicId out.",
    );
  }
  const topicIds = topicId === undefined ? (section?.topicIds ?? []) : [topicId];
  const { repository, questions, clock } = context.dependencies;
  const found = questionCandidates({
    questions: topicIds.length === 0 ? [] : await questions.search(plan.id, { topicIds }),
    interviewId: interview.id,
    history: await repository.history(plan.id),
    recentInterviewIds: await earlierInterviews(context, plan.id, interview.id),
    level: level ?? candidateLevel(plan.level, interview.difficulty),
    now: clock.now().toISOString(),
    limit,
  });
  return JSON.stringify({
    sectionId: section?.id ?? null,
    candidates: found.map((question) => candidateOf(question)),
  });
}
