// The Attempts the app records itself, without the agent: a quiz answer and «Не знаю». Their texts
// go to the Candidate's Debrief, so they are in Russian.
import type { AskedQuestion, Grade, Judgment } from "./interview.ts";

/**
 * The owner's quiz rule (#41): exactly every correct option gives 3; only correct options, but not
 * all of them, give 1; any wrong option gives 0.
 */
export function quizGrade(
  correctOptionIds: readonly string[],
  chosen: readonly string[],
): Exclude<Grade, 2> {
  const correct = new Set(correctOptionIds);
  if (chosen.some((id) => !correct.has(id))) {
    return 0;
  }
  return new Set(chosen).size === correct.size ? 3 : 1;
}

const reasons = {
  0: "Выбран неверный вариант.",
  1: "Выбраны только верные варианты, но не все.",
  3: "Выбраны ровно все верные варианты.",
} as const;

/** The texts of the options with the ids, in the quiz's order, joined for a sentence. */
function optionTexts(question: Pick<AskedQuestion, "options">, ids: ReadonlySet<string>): string {
  return question.options
    .filter((option) => ids.has(option.id))
    .map((option) => `«${option.text}»`)
    .join(", ");
}

/** What the chosen options missed or got wrong; empty for a full answer. */
function quizGaps(
  question: Pick<AskedQuestion, "options">,
  chosen: Set<string>,
  correct: Set<string>,
) {
  const wrong = new Set([...chosen].filter((id) => !correct.has(id)));
  const missed = new Set([...correct].filter((id) => !chosen.has(id)));
  return [
    wrong.size === 0 ? "" : `Неверно выбрано: ${optionTexts(question, wrong)}.`,
    missed.size === 0 ? "" : `Не выбрано: ${optionTexts(question, missed)}.`,
  ]
    .filter((text) => text !== "")
    .join(" ");
}

/** The judgment of a quiz answer by the owner's rule. */
export function quizJudgment(
  question: Pick<AskedQuestion, "options" | "correctOptionIds">,
  chosen: readonly string[],
): Judgment {
  const grade = quizGrade(question.correctOptionIds, chosen);
  const correct = new Set(question.correctOptionIds);
  return {
    grade,
    gaps: quizGaps(question, new Set(chosen), correct),
    justification: `Квиз оценён по правилу: ${reasons[grade]}`,
    strongAnswer: `Верные варианты: ${optionTexts(question, correct)}.`,
  };
}

/**
 * «Не знаю» gives Grade 0. The agent does not judge a skipped question, so only a quiz gets an
 * outline of a strong answer: its correct options.
 */
export function skippedJudgment(
  question: Pick<AskedQuestion, "format" | "options" | "correctOptionIds">,
): Judgment {
  return {
    grade: 0,
    gaps: "Вопрос пропущен.",
    justification: "Вы нажали «Не знаю».",
    strongAnswer:
      question.format === "quiz"
        ? `Верные варианты: ${optionTexts(question, new Set(question.correctOptionIds))}.`
        : "",
  };
}
