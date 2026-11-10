export type Level = "junior" | "middle" | "senior";
export type QuestionRating = "useful" | "irrelevant" | "wrong";
/** How a Section runs and grades its answers; a Question records the kind it fits. */
export type SectionKind = "conversation" | "topics" | "design";

/**
 * Where a reference answer comes from: the material itself, the web, the agent's own knowledge, or
 * the Candidate, who checked it.
 */
type ReferenceOrigin = "material" | "internet" | "agent" | "candidate";

/**
 * The reference answer of a Question: 3–5 key points and a short sample answer, with its origin
 * and, for an answer from a material, the Source and its part; for one from the internet, the links
 * to its web sources.
 */
export interface ReferenceAnswer {
  readonly points: readonly string[];
  readonly sample: string;
  readonly origin: ReferenceOrigin;
  readonly sourceId: string | null;
  /** The number of the Source's part, from 1; null without a Source. */
  readonly part: number | null;
  /** The URLs of the web pages behind an answer «из интернета»; absent before answer search. */
  readonly links?: readonly string[];
}
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
/** What every stored Question has besides its content. */
interface QuestionRecord {
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
}

/** The Candidate's review of a Question; a new Question has neither. */
interface ReviewDetails {
  /** The Candidate's comment to ⚠, the rating «ошибка». */
  readonly ratingComment: string | null;
  /** «новый»: Inbox processing added it, and the Candidate has not seen it yet. */
  readonly unseen: boolean;
}

/**
 * Why the Question waits in the list «проверить опорный ответ» of the zone «Цель»: the Candidate
 * disputed the Grade of an Attempt on it, with their reason. «проверен» or a corrected reference
 * answer takes it off the list.
 */
export interface ReferenceCheck {
  readonly reason: "dispute";
  readonly comment: string;
  /** ISO 8601. */
  readonly requestedAt: string;
}

/** What Inbox processing adds to a Question; other writers leave them null. */
interface InboxDetails {
  /** The part of the first Source that the Question came from, from 1; null when unknown. */
  readonly sourcePart: number | null;
  /** The Section kind the Question fits; null when nobody set it. */
  readonly sectionKind: SectionKind | null;
  readonly referenceAnswer: ReferenceAnswer | null;
  /** In the list «проверить опорный ответ»; null when it is not there. */
  readonly referenceCheck: ReferenceCheck | null;
}

export type Question = QuestionContent & QuestionRecord & InboxDetails & ReviewDetails;

/**
 * A Question to store: the Inbox processing's fields it leaves out are null, a comment is null and
 * the Question is not «новый».
 */
export type StoredQuestion = QuestionContent &
  QuestionRecord &
  Partial<InboxDetails> &
  Partial<ReviewDetails>;

/** How much a Topic matters for the Target: the setup agent takes it from the vacancy. */
export type TopicImportance = "high" | "normal" | "low";

/** A Topic to store: it starts with the importance «обычная». */
export interface Topic {
  readonly id: string;
  readonly targetId: string;
  readonly name: string;
}
export interface TopicSummary extends Topic {
  readonly importance: TopicImportance;
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

/**
 * The key two Topic names of one Target match by: the same words, ignoring case and spaces around
 * them. A draft names Topics, and the same name reuses the Topic.
 */
export function topicKey(name: string): string {
  return name.trim().replaceAll(/\s+/gu, " ").toLowerCase();
}
