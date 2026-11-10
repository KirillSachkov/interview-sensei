// The limit of questions in a row on one Topic (#64) as the interviewer's tools enforce it:
// next_question_candidates with a topicId and present_question refuse a Topic that reached it.
import { topicOf } from "../domain/candidates.ts";
import type { CandidateTopic } from "../domain/candidates.ts";
import type { MockInterview } from "../domain/interview.ts";
import type { TargetPlan } from "../domain/ports.ts";
import { fullTopic, topicStreakLimit } from "../domain/topic-streak.ts";
import type { Context } from "./context.ts";
import { InterviewToolError } from "./tool-session.ts";

/** The importance of each Topic of the plan with its Topic status from ended Mock interviews. */
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

/** The name of the Topic in the plan, or its id. */
function topicName(plan: TargetPlan, topicId: string): string {
  return (
    plan.sections.flatMap((section) => section.topics).find((topic) => topic.id === topicId)
      ?.name ?? topicId
  );
}

/** Refuses the Topic when this Mock interview's last questions in a row reached its limit. */
export async function assertTopicOpen(
  context: Context,
  {
    interview,
    plan,
    topics,
  }: { interview: MockInterview; plan: TargetPlan; topics: ReadonlyMap<string, CandidateTopic> },
  topicId: string,
): Promise<void> {
  const asked = await context.dependencies.repository.asked(interview.id);
  const statusOf = (id: string) => topicOf(topics, id).status;
  if (fullTopic(asked, statusOf) !== topicId) {
    return;
  }
  const limit = topicStreakLimit(statusOf(topicId));
  throw new InterviewToolError(
    `The Topic «${topicName(plan, topicId)}» already had ${limit} questions in a row, Deeper questions included: move to another Topic.`,
  );
}
