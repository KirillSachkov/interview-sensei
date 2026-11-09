import type { Attempt, Grade } from "./interview.ts";

/** The Candidate's correction of an Attempt's Grade, with a required reason; the latest one applies. */
export interface Dispute {
  readonly id: string;
  readonly interviewId: string;
  readonly attemptId: string;
  readonly grade: Grade;
  readonly reason: string;
  /** ISO 8601. */
  readonly disputedAt: string;
}

/** The latest Dispute of each Attempt, from the Disputes in the order they were made. */
export function latestDisputes(disputes: readonly Dispute[]): ReadonlyMap<string, Dispute> {
  return new Map(disputes.map((dispute) => [dispute.attemptId, dispute]));
}

/** The Grade that applies: the latest Dispute's, or the recorded one without a Dispute. */
export function correctedGrade(attempt: Attempt, latest: ReadonlyMap<string, Dispute>): Grade {
  return latest.get(attempt.id)?.grade ?? attempt.grade;
}
