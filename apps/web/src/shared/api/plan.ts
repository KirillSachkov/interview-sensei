import { request } from "./request";
import { isTargetView } from "./targets";
import type { TargetView } from "./targets";

/** The Candidate's opinion of a Question: useful, irrelevant or wrong. */
export type QuestionRating = "useful" | "irrelevant" | "wrong";

/** A Question of the Target's bank as the side panel shows it. */
export interface Question {
  readonly id: string;
  readonly topicId: string;
  readonly text: string;
  readonly hidden: boolean;
  readonly rating: QuestionRating | null;
}

function isQuestion(value: unknown): value is Question {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "text" in value &&
    typeof value.text === "string" &&
    "hidden" in value &&
    typeof value.hidden === "boolean"
  );
}

function target(id: string): string {
  return `/api/targets/${encodeURIComponent(id)}`;
}

/** Switches the Section on or off at once and answers the Target. */
export async function setSectionEnabled(
  targetId: string,
  sectionId: string,
  enabled: boolean,
): Promise<TargetView> {
  const body = await request(
    `${target(targetId)}/sections/${encodeURIComponent(sectionId)}/enabled`,
    { method: "PUT", body: { enabled } },
  );
  if (!isTargetView(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** The Questions of one Section or one Topic: the visible ones, or the hidden ones. */
export interface QuestionScope {
  readonly sectionId?: string;
  readonly topicId?: string;
}

export async function fetchQuestions(
  targetId: string,
  scope: QuestionScope,
  hidden: boolean,
): Promise<Question[]> {
  const query = new URLSearchParams({ ...scope, hidden: String(hidden) });
  const body = await request(`${target(targetId)}/questions?${query.toString()}`);
  if (!Array.isArray(body) || !body.every((item: unknown) => isQuestion(item))) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** Hides the Question from the plan and the mocks, or returns it. */
export async function hideQuestion(questionId: string, hidden: boolean): Promise<void> {
  await request(`/api/questions/${encodeURIComponent(questionId)}/hidden`, {
    method: "PUT",
    body: { hidden },
  });
}

/** Stores the Question rating; null clears it. */
export async function rateQuestion(
  questionId: string,
  rating: QuestionRating | null,
): Promise<void> {
  await request(`/api/questions/${encodeURIComponent(questionId)}/rating`, {
    method: "PUT",
    body: { rating },
  });
}
