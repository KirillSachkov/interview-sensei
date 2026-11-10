// What the Candidate and progress read of recorded Mock interviews (#54): the Debrief with its
// Dispute, the session history and the Attempts for Topic status.
import { randomUUID } from "node:crypto";

import type { Dispute } from "../domain/dispute.ts";
import { latestDisputes } from "../domain/dispute.ts";
import type { BriefHistory } from "../domain/brief.ts";
import { continuationSummary } from "../domain/continuation.ts";
import type { ContinuationSummary } from "../domain/continuation.ts";
import type { HistoryFilter, HistoryPage, TopicAttempt } from "../domain/history.ts";
import { gradeCorrections, sessionSummary, topicAttempts } from "../domain/history.ts";
import { isActive } from "../domain/interview.ts";
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
interface InterviewSummary {
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

/**
 * The Candidate opened the Debrief of the Attempt: its Grade went to the Candidate, so from now on
 * the Handoff brief of a Side thread on its question holds it too. `not_found` for an unknown Attempt.
 */
async function openDebrief(
  { repository }: InterviewsDependencies,
  id: string,
  attemptId: string,
): Promise<"recorded" | "not_found"> {
  const attempts = await repository.attempts(id);
  const attempt = attempts.find((entry) => entry.id === attemptId);
  if (attempt === undefined) {
    return "not_found";
  }
  await repository.markDebriefOpened(attempt.askedQuestionId);
  return "recorded";
}

/** The Candidate's correction of the Grade of the Mock interview's Attempt, with its reason. */
interface DisputeRequest {
  readonly id: string;
  readonly attemptId: string;
  readonly grade: Grade;
  readonly reason: string;
}

/** The Question of the disputed Attempt; undefined when its asked question is gone. */
async function disputedQuestion(
  { repository }: InterviewsDependencies,
  { id, attempt }: { id: string; attempt: Attempt },
) {
  const asked = await repository.asked(id);
  return asked.find((entry) => entry.id === attempt.askedQuestionId)?.questionId;
}

/**
 * Records the Candidate's Dispute of the Attempt's Grade and puts its Question on the list
 * «проверить опорный ответ»; undefined for an unknown Attempt.
 */
async function dispute(
  context: Context,
  { id, attemptId, grade, reason }: DisputeRequest,
): Promise<AttemptDebrief | undefined> {
  const { dependencies } = context;
  return change(context, id, async () => {
    const disputed = await debrief(dependencies, id, attemptId);
    if (disputed === undefined) {
      return disputed;
    }
    const disputedAt = dependencies.clock.now().toISOString();
    const questionId = await disputedQuestion(dependencies, { id, attempt: disputed });
    // A Dispute and its reference check (#65) span two slices, so they share one transaction.
    await dependencies.transaction(async (transaction) => {
      await dependencies.repository.dispute(
        { id: randomUUID(), interviewId: id, attemptId, grade, reason, disputedAt },
        transaction,
      );
      if (questionId !== undefined) {
        await dependencies.referenceChecks.requestReferenceCheck(
          { questionId, comment: reason, requestedAt: disputedAt },
          transaction,
        );
      }
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
async function history(
  dependencies: InterviewsDependencies,
  { targetId, page, filter }: { targetId: string; page: number; filter: HistoryFilter },
): Promise<HistoryPage> {
  const found = await dependencies.repository.historyPage(targetId, filter, {
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  const items = await Promise.all(
    found.interviews.map(async (interview) => summaryOf(dependencies, interview)),
  );
  return { items, total: found.total, page, pageSize };
}

async function interviewSummary(
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

/** The Attempts of the Target's ended Mock interviews as progress counts them. */
async function targetTopicAttempts(
  { repository }: InterviewsDependencies,
  targetId: string,
): Promise<readonly TopicAttempt[]> {
  const [records, disputes, active] = await Promise.all([
    repository.targetAttempts(targetId),
    repository.targetDisputes(targetId),
    repository.active(targetId),
  ]);
  return topicAttempts(records, disputes, active?.id);
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
  const last = latest.find((entry) => entry.id !== interview.id && !isActive(entry.status));
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

/**
 * The continuation summary for the brief of a Mock interview that went on after a pause (#84):
 * where it stopped, from the server's records; null for one never paused.
 */
export async function briefContinuation(
  { repository, clock }: InterviewsDependencies,
  interview: MockInterview,
): Promise<ContinuationSummary | null> {
  if (interview.resumedAt === null) {
    return null;
  }
  const [asked, attempts, disputes] = await Promise.all([
    repository.asked(interview.id),
    repository.attempts(interview.id),
    repository.disputes(interview.id),
  ]);
  return continuationSummary(interview, {
    asked,
    attempts,
    disputes,
    now: clock.now().toISOString(),
  });
}

/** What the Candidate and progress read of recorded Mock interviews. */
export interface Records {
  /**
   * The Debrief of one Attempt with its Grade and the latest Dispute; undefined until the Attempt
   * is recorded.
   */
  readonly attempt: (id: string, attemptId: string) => Promise<AttemptDebrief | undefined>;
  /** The Candidate opened the Debrief: Side threads on its question learn the Grade from now on. */
  readonly openDebrief: (id: string, attemptId: string) => Promise<"recorded" | "not_found">;
  /** Records the Candidate's correction of the Grade; the latest one applies. */
  readonly dispute: (request: DisputeRequest) => Promise<AttemptDebrief | undefined>;
  /** How the Mock interview ended, for its summary Debrief. */
  readonly summary: (id: string) => Promise<InterviewSummary | undefined>;
  /** One page of the Target's session history, from 1, the newest first. */
  readonly history: (request: {
    targetId: string;
    page: number;
    filter: HistoryFilter;
  }) => Promise<HistoryPage>;
  /** The Attempts of the Target's ended Mock interviews, Grades after Disputes, the earliest first. */
  readonly topicAttempts: (targetId: string) => Promise<readonly TopicAttempt[]>;
}

export function createRecords(context: Context): Records {
  const { dependencies } = context;
  return {
    attempt: async (id, attemptId) => debrief(dependencies, id, attemptId),
    openDebrief: async (id, attemptId) => openDebrief(dependencies, id, attemptId),
    dispute: async (request) => dispute(context, request),
    summary: async (id) => interviewSummary(dependencies, id),
    history: async (request) => history(dependencies, request),
    topicAttempts: async (targetId) => targetTopicAttempts(dependencies, targetId),
  };
}
