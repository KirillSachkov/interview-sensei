// Helpers of the unit tests of the question selection rules (#8, #64): made-up Questions, their
// history and the candidates the rules pick from them.
import { questionCandidates } from "./domain/candidates.ts";
import type { CandidateTopic } from "./domain/candidates.ts";
import type { PastQuestion } from "./domain/interview.ts";
import type { BankQuestion } from "./domain/ports.ts";

export const now = "2026-03-01T12:00:00.000Z";
export const daysAgo = (days: number) =>
  new Date(Date.parse(now) - days * 86_400_000).toISOString();

export function question(id: string, changes: Partial<BankQuestion> = {}): BankQuestion {
  return {
    id,
    topicId: "types",
    text: `Вопрос ${id}`,
    format: "open",
    options: [],
    correctOptionIds: [],
    level: "middle",
    hidden: false,
    rating: null,
    referenceAnswer: null,
    ...changes,
  };
}

export function past(questionId: string, changes: Partial<PastQuestion> = {}): PastQuestion {
  return {
    interviewId: "earlier",
    questionId,
    topicId: "types",
    presentedAt: daysAgo(30),
    grade: 2,
    ...changes,
  };
}

export interface Selection {
  questions: readonly BankQuestion[];
  history?: readonly PastQuestion[];
  recentInterviewIds?: readonly string[];
  level?: BankQuestion["level"];
  /** The Topics by id; a Topic left out is normal and confident. */
  topics?: Readonly<Record<string, Partial<CandidateTopic>>>;
}

function candidatesOf({
  questions,
  history = [],
  recentInterviewIds = ["earlier"],
  level = "middle",
  topics = {},
}: Selection) {
  const topicIds = new Set([
    ...questions.map((entry) => entry.topicId),
    ...history.map((entry) => entry.topicId),
  ]);
  return questionCandidates({
    questions,
    topics: new Map(
      [...topicIds].map((id) => [
        id,
        { importance: "normal", status: "confident", ...topics[id] } satisfies CandidateTopic,
      ]),
    ),
    interviewId: "current",
    history,
    recentInterviewIds,
    level,
    now,
  });
}

/** The ids of the candidates, in the order the agent gets them. */
export function picked(selection: Selection): string[] {
  return candidatesOf(selection).map((candidate) => candidate.question.id);
}

/** The reasons of each candidate by its id. */
export function reasons(selection: Selection): Record<string, readonly string[]> {
  return Object.fromEntries(
    candidatesOf(selection).map((candidate) => [candidate.question.id, candidate.reasons]),
  );
}

/** A Question asked in this Mock interview a moment ago, in the order of `index`. */
export const current = (questionId: string, topicId: string, index: number) =>
  past(questionId, {
    interviewId: "current",
    topicId,
    grade: 2,
    presentedAt: new Date(Date.parse(now) - (10 - index) * 60_000).toISOString(),
  });
