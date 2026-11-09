export type Level = "junior" | "middle" | "senior";
export type QuestionRating = "useful" | "irrelevant" | "wrong";
export interface QuizOption {
  readonly id: string;
  readonly text: string;
}
export type QuestionContent =
  | {
      readonly format: "open";
      readonly options: readonly [];
      readonly correctOptionIds: readonly [];
    }
  | {
      readonly format: "quiz";
      readonly options: readonly QuizOption[];
      readonly correctOptionIds: readonly string[];
    };
export type Question = QuestionContent & {
  readonly id: string;
  readonly targetId: string;
  readonly topicId: string;
  readonly text: string;
  readonly level: Level;
  readonly sourceIds: readonly string[];
  readonly unconfirmed: boolean;
  readonly hidden: boolean;
  readonly rating: QuestionRating | null;
  readonly createdAt: string;
};
export interface Topic {
  readonly id: string;
  readonly targetId: string;
  readonly name: string;
}
export interface TopicSummary extends Topic {
  readonly questionCount: number;
}

/** Rejects malformed quizzes and options attached to an open Question. */
export function validateQuestion(content: {
  readonly format: QuestionContent["format"];
  readonly options: readonly QuizOption[];
  readonly correctOptionIds: readonly string[];
}): void {
  if (content.format === "open") {
    if (content.options.length > 0 || content.correctOptionIds.length > 0) {
      throw new Error("An open Question has no quiz options");
    }
    return;
  }
  const ids = new Set(content.options.map((option) => option.id));
  if (
    content.options.length < 2 ||
    ids.size !== content.options.length ||
    content.correctOptionIds.length === 0 ||
    new Set(content.correctOptionIds).size !== content.correctOptionIds.length ||
    content.correctOptionIds.some((id) => !ids.has(id))
  ) {
    throw new Error("A quiz needs distinct options and at least one valid correct option");
  }
}
