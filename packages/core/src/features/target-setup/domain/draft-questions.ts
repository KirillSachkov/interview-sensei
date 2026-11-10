// The Questions in the draft of changes: new ones, edits of existing ones, and the rule that
// finds duplicates by text.
import type { Level } from "./target-values.ts";

/**
 * The key two Question texts match by: the same words, ignoring case, spaces and punctuation.
 * A new Question with the key of a Question of the Target is a duplicate.
 */
export function questionKey(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/[\p{P}\p{S}]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/**
 * Splits the candidates into the ones to keep and the duplicates: of the `existing` texts, or of
 * an earlier candidate.
 */
export function withoutDuplicates<Candidate extends { readonly text: string }>(
  candidates: readonly Candidate[],
  existing: readonly string[],
): { kept: Candidate[]; duplicates: Candidate[] } {
  const seen = new Set(existing.map((text) => questionKey(text)));
  const kept: Candidate[] = [];
  const duplicates: Candidate[] = [];
  for (const candidate of candidates) {
    const key = questionKey(candidate.text);
    if (seen.has(key)) {
      duplicates.push(candidate);
    } else {
      seen.add(key);
      kept.push(candidate);
    }
  }
  return { kept, duplicates };
}

export type QuestionRating = "useful" | "irrelevant" | "wrong";

/** A new Question in the draft: its Topic by name; `level` null takes the Target's level. */
export interface NewQuestion {
  readonly id: string;
  readonly topic: string;
  readonly text: string;
  readonly format: "open" | "quiz";
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly correctOptionIds: readonly string[];
  readonly level: Level | null;
}

/** What a good answer contains: 3–5 key points and a short sample answer. */
export interface ReferenceContent {
  readonly points: readonly string[];
  readonly sample: string;
}

/** A Question of the Target as the draft sees it. */
export interface DraftQuestion extends NewQuestion {
  readonly hidden: boolean;
  readonly rating: QuestionRating | null;
  /** The content of its reference answer; null without one. */
  readonly referenceAnswer: ReferenceContent | null;
}

/**
 * Rephrases, moves to the Topic of another name, hides or shows, rates one Question, or corrects
 * its reference answer.
 */
export interface QuestionEdit {
  readonly id: string;
  readonly text?: string;
  readonly topic?: string;
  readonly hidden?: boolean;
  readonly rating?: QuestionRating | null;
  readonly referenceAnswer?: ReferenceContent;
}

/** The Questions after the edits; `missing` for the edits of Questions that do not exist. */
export function editedQuestions(
  questions: readonly DraftQuestion[],
  edits: readonly QuestionEdit[],
): { questions: readonly DraftQuestion[]; missing: readonly string[] } {
  const missing = edits
    .filter((edit) => !questions.some((question) => question.id === edit.id))
    .map((edit) => `Вопроса ${edit.id} нет в цели.`);
  const edited = questions.map((question) => {
    const current = { ...question };
    for (const { id, ...fields } of edits) {
      if (id === question.id) {
        Object.assign(current, fields);
      }
    }
    return current;
  });
  return { questions: edited, missing };
}

/** Why the Question cannot be stored; null when it can. */
function questionProblem(question: DraftQuestion): string | null {
  const ids = new Set(question.options.map((option) => option.id));
  if (question.format === "open") {
    return question.options.length > 0 || question.correctOptionIds.length > 0
      ? `У открытого вопроса «${question.text}» не может быть вариантов ответа.`
      : null;
  }
  if (question.options.length < 2 || ids.size !== question.options.length) {
    return `У квиза «${question.text}» должно быть не меньше двух разных вариантов ответа.`;
  }
  if (
    question.correctOptionIds.length === 0 ||
    question.correctOptionIds.some((id) => !ids.has(id))
  ) {
    return `У квиза «${question.text}» нет верного ответа.`;
  }
  return null;
}

/** Why the Questions cannot be stored, for the Candidate and the agent; empty when they can. */
export function questionProblems(
  questions: readonly DraftQuestion[],
  targetLevel: Level | null,
): string[] {
  return questions.flatMap((question) => {
    const problems = [questionProblem(question)];
    if (question.level === null && targetLevel === null) {
      problems.push(`У вопроса «${question.text}» нет уровня: укажите уровень цели или вопроса.`);
    }
    return problems.filter((problem) => problem !== null);
  });
}
