import type { AskedQuestion } from "./interview.ts";
import type { BankQuestion } from "./ports.ts";

/**
 * The Questions the agent may show next, from the Questions of the current Section's Topics: none
 * that is hidden or already asked in this Mock interview. The full selection rules (#8) rank and
 * exclude more.
 */
export function questionCandidates({
  questions,
  asked,
  limit,
}: {
  questions: readonly BankQuestion[];
  asked: readonly AskedQuestion[];
  limit: number;
}): readonly BankQuestion[] {
  const askedIds = new Set(asked.map((question) => question.questionId));
  return questions
    .filter((question) => !question.hidden && !askedIds.has(question.id))
    .slice(0, limit);
}
