// What the Candidate and progress read of recorded Mock interviews (#54): the Debrief with its
// Dispute, the session history and the Attempts for Topic status.
import { randomUUID } from "node:crypto";

import type { Dispute } from "../domain/dispute.ts";
import { latestDisputes } from "../domain/dispute.ts";
import type { BriefHistory } from "../domain/brief.ts";
import type { HistoryFilter, HistoryPage, TopicAttempt } from "../domain/history.ts";
import { gradeCorrections, sessionSummary, topicAttempts } from "../domain/history.ts";
import type { Attempt, Grade, InterviewStatus, MockInterview } from "../domain/interview.ts";
import { change } from "./context.ts";
import type { Context, InterviewsDependencies } from "./context.ts";

/** How many Mock interviews one page of the session history holds. */
const pageSize = 20;
/** How many of the latest Grade corrections the brief gives. */
const correctionCount = 20;

/** The Debrief of an Attempt with the Candidate's latest Dispute, if any. */
export type AttemptDebrief = Attempt & {
  readonly dispute: Pick<Dispute, "grade" | "reason" | "disputedAt"> | null;
};

/** The ending of a Mock interview for its summary Debrief; the Topic status changes come apart. */
export interface InterviewSummary {
  readonly targetId: string;
  readonly status: InterviewStatus;
  readonly summary: string | null;
  readonly nextStep: string | null;
  readonly answered: number;
  /** Questions shown without the Candidate's answer: «без ответа». */
  readonly unanswered: number;
}

export async function debrief(
  { repository }: InterviewsDependencies,
  id: string,
  attemptId: string,
): Promise<AttemptDebrief | undefined> {
  const [attempts, disputes] = await Promise.all([
    repository.attempts(id),
    repository.disputes(id),
  ]);
  const attempt = attempts.find((entry) => entry.id === attemptId);
  if (attempt === undefined) {
    return undefined;
  }
  const latest = latestDisputes(disputes).get(attemptId);
  return {
    ...attempt,
    dispute:
      latest === undefined
        ? null
        : { grade: latest.grade, reason: latest.reason, disputedAt: latest.disputedAt },
  };
}

/** Records the Candidate's Dispute of the Attempt's Grade; undefined for an unknown Attempt. */
export async function dispute(
  context: Context,
  { id, attemptId, grade, reason }: { id: string; attemptId: string; grade: Grade; reason: string },
): Promise<AttemptDebrief | undefined> {
  const { dependencies } = context;
  return change(context, id, async () => {
    const disputed = await debrief(dependencies, id, attemptId);
    if (disputed === undefined) {
      return disputed;
    }
    await dependencies.repository.dispute({
      id: randomUUID(),
      interviewId: id,
      attemptId,
      grade,
      reason,
      disputedAt: dependencies.clock.now().toISOString(),
    });
    return debrief(dependencies, id, attemptId);
  });
}

async function summaryOf({ repository }: InterviewsDependencies, interview: MockInterview) {
  const [asked, attempts, disputes] = await Promise.all([
    repository.asked(interview.id),
    repository.attempts(interview.id),
    repository.disputes(interview.id),
  ]);
  return sessionSummary(interview, { asked, attempts, disputes });
}

/** One page of the Target's session history, from 1, the newest Mock interview first. */
export async function history(
  dependencies: InterviewsDependencies,
  { targetId, page, filter }: { targetId: string; page: number; filter: HistoryFilter },
): Promise<HistoryPage> {
  const found = await dependencies.repository.history(targetId, filter, {
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  const items = await Promise.all(
    found.interviews.map(async (interview) => summaryOf(dependencies, interview)),
  );
  return { items, total: found.total, page, pageSize };
}

export async function interviewSummary(
  { repository }: InterviewsDependencies,
  id: string,
): Promise<InterviewSummary | undefined> {
  const interview = await repository.get(id);
  if (interview === undefined) {
    return undefined;
  }
  const asked = await repository.asked(id);
  const answered = asked.filter((question) => question.answer !== null).length;
  return {
    targetId: interview.targetId,
    status: interview.status,
    summary: interview.summary,
    nextStep: interview.nextStep,
    answered,
    unanswered: asked.length - answered,
  };
}

/** The Attempts of the Target's Mock interviews as progress counts them. */
export async function targetTopicAttempts(
  { repository }: InterviewsDependencies,
  targetId: string,
): Promise<readonly TopicAttempt[]> {
  const [records, disputes] = await Promise.all([
    repository.targetAttempts(targetId),
    repository.targetDisputes(targetId),
  ]);
  return topicAttempts(records, disputes);
}

/** The brief's part about the Target's earlier Mock interviews and progress. */
export async function briefHistory(
  { repository, progress }: InterviewsDependencies,
  interview: MockInterview,
): Promise<BriefHistory> {
  const [latest, records, disputes, focus] = await Promise.all([
    repository.latest(interview.targetId, 2),
    repository.targetAttempts(interview.targetId),
    repository.targetDisputes(interview.targetId),
    progress.focus(interview.targetId),
  ]);
  const last = latest.find((entry) => entry.id !== interview.id && entry.status !== "running");
  return {
    lastInterview:
      last === undefined
        ? null
        : {
            status: last.status,
            finishedAt: last.finishedAt,
            summary: last.summary,
            nextStep: last.nextStep,
          },
    weakTopics: focus.map(({ id, name, status }) => ({ id, name, status })),
    gradeCorrections: gradeCorrections(records, disputes, correctionCount),
  };
}
