// What the Target's history and progress read of past Mock interviews (#54). The Grades here are
// the ones that apply after the Candidate's Disputes.
import type { Dispute } from "./dispute.ts";
import { correctedGrade, latestDisputes } from "./dispute.ts";
import type { AskedQuestion, Attempt, InterviewStatus, MockInterview } from "./interview.ts";

/** A Mock interview as a collapsed card of the session history. */
export interface SessionSummary {
  readonly id: string;
  readonly status: InterviewStatus;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly sectionIds: readonly string[];
  readonly questionCount: number;
  readonly answeredCount: number;
  /** The average Grade after Disputes, to one decimal; null while it runs or without Attempts. */
  readonly averageGrade: number | null;
}

export function sessionSummary(
  interview: MockInterview,
  { asked, attempts, disputes }: InterviewRecords,
): SessionSummary {
  const latest = latestDisputes(disputes);
  const grades = attempts.map((attempt) => correctedGrade(attempt, latest));
  const average =
    interview.status === "running" || grades.length === 0
      ? null
      : Math.round((grades.reduce((sum: number, grade) => sum + grade, 0) / grades.length) * 10) /
        10;
  return {
    id: interview.id,
    status: interview.status,
    startedAt: interview.startedAt,
    finishedAt: interview.finishedAt,
    sectionIds: interview.sectionIds,
    questionCount: asked.length,
    answeredCount: asked.filter((question) => question.answer !== null).length,
    averageGrade: average,
  };
}

/** What one Mock interview recorded. */
export interface InterviewRecords {
  readonly asked: readonly AskedQuestion[];
  readonly attempts: readonly Attempt[];
  readonly disputes: readonly Dispute[];
}

/** The filters of the session history; `from` is inclusive and `to` exclusive, both ISO 8601. */
export interface HistoryFilter {
  readonly from?: string;
  readonly to?: string;
  readonly sectionId?: string;
}

/** One page of the session history, the newest Mock interview first. */
export interface HistoryPage {
  readonly items: readonly SessionSummary[];
  /** How many Mock interviews match the filters. */
  readonly total: number;
  /** From 1. */
  readonly page: number;
  readonly pageSize: number;
}

/** An Attempt with the asked question it answers, for progress and the brief. */
export interface AttemptRecord {
  readonly attempt: Attempt;
  readonly question: Pick<AskedQuestion, "topicId" | "text" | "parentAttemptId">;
}

/** An Attempt as the progress slice counts it; `deeper` when it answers a Deeper question. */
export interface TopicAttempt {
  readonly topicId: string;
  readonly interviewId: string;
  readonly grade: Attempt["grade"];
  readonly hinted: boolean;
  readonly gradedBy: Attempt["gradedBy"];
  readonly deeper: boolean;
  readonly recordedAt: string;
}

export function topicAttempts(
  records: readonly AttemptRecord[],
  disputes: readonly Dispute[],
): readonly TopicAttempt[] {
  const latest = latestDisputes(disputes);
  return records.map(({ attempt, question }) => ({
    topicId: question.topicId,
    interviewId: attempt.interviewId,
    grade: correctedGrade(attempt, latest),
    hinted: attempt.hinted,
    gradedBy: attempt.gradedBy,
    deeper: question.parentAttemptId !== null,
    recordedAt: attempt.recordedAt,
  }));
}

/** A Grade correction for the brief of later Mock interviews: a calibration signal for the agent. */
export interface GradeCorrection {
  readonly question: string;
  readonly topicId: string;
  readonly agentGrade: Attempt["grade"];
  readonly correctedGrade: Attempt["grade"];
  readonly reason: string;
  readonly disputedAt: string;
}

/** The latest correction of each disputed Attempt, the newest first, at most `limit`. */
export function gradeCorrections(
  records: readonly AttemptRecord[],
  disputes: readonly Dispute[],
  limit: number,
): readonly GradeCorrection[] {
  const byAttempt = new Map(records.map((record) => [record.attempt.id, record]));
  const seen = new Set<string>();
  const corrections: GradeCorrection[] = [];
  for (const dispute of disputes.toReversed()) {
    const record = byAttempt.get(dispute.attemptId);
    if (record !== undefined && !seen.has(dispute.attemptId)) {
      seen.add(dispute.attemptId);
      corrections.push({
        question: record.question.text,
        topicId: record.question.topicId,
        agentGrade: record.attempt.grade,
        correctedGrade: dispute.grade,
        reason: dispute.reason,
        disputedAt: dispute.disputedAt,
      });
    }
  }
  return corrections.slice(0, limit);
}
