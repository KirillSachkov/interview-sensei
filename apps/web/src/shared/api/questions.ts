// The Question bank of a Target: the Candidate's rating of a Question and whether it is confirmed.

import type { QuestionRating } from "./plan";

/** What a question card shows of the Question itself. */
export interface QuestionMarks {
  readonly id: string;
  readonly rating: QuestionRating | null;
  /** The interviewer made it up; nobody has confirmed it yet. */
  readonly unconfirmed: boolean;
}

function isMarks(value: unknown): value is QuestionMarks {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "unconfirmed" in value &&
    typeof value.unconfirmed === "boolean" &&
    "rating" in value
  );
}

/** The marks of the Target's Questions that are not hidden. */
export async function fetchQuestionMarks(targetId: string): Promise<QuestionMarks[]> {
  const response = await fetch(`/api/targets/${encodeURIComponent(targetId)}/questions`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body) || !body.every((item: unknown) => isMarks(item))) {
    throw new Error("неожиданный ответ");
  }
  return body;
}
