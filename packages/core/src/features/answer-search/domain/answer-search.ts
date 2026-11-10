// Answer search («Наполнение ответов», spec #70): a background Agent session finds reference
// answers on the web for the Target's Questions. The server keeps the queue and the rules of
// overwriting; the agent only searches and words the answers.

/** Where a reference answer comes from; see ReferenceAnswer in the question bank. */
export type ReferenceOrigin = "material" | "internet" | "agent" | "candidate";

/** The origins answer search writes: with a web source, or from the agent's own knowledge. */
export type SearchOrigin = "internet" | "agent";

/** How many Questions the start window offers and «Наполнять в фоне» fills (spec #70). */
export const defaultSearchCount = 20;

/** The most Questions one answer search may fill: each one costs about one web search. */
export const maxSearchCount = 200;

/** A Question of the bank as the queue reads it. */
export interface QueueQuestion {
  readonly id: string;
  readonly topicId: string;
  readonly hidden: boolean;
  /** ISO 8601: when the Question was added. */
  readonly createdAt: string;
  readonly referenceAnswer: { readonly origin: ReferenceOrigin } | null;
}

/** What the queue knows of the Target besides its bank. */
export interface QueueFacts {
  /** The Questions that were asked in a Mock interview: they have Attempts. */
  readonly asked: ReadonlySet<string>;
  /** The Topics with the Topic status «шатко» or «не начато». */
  readonly weakTopics: ReadonlySet<string>;
}

const byAddition = (left: QueueQuestion, right: QueueQuestion) =>
  left.createdAt.localeCompare(right.createdAt);

/**
 * The Questions answer search fills, in order: 1) asked in a Mock interview, without a reference
 * answer or with one «из знаний агента»; 2) without one, in a shaky or not started Topic; 3) the
 * other ones without one. Each group goes from the earliest added; hidden Questions stay out.
 */
export function answerQueue(
  questions: readonly QueueQuestion[],
  { asked, weakTopics }: QueueFacts,
): QueueQuestion[] {
  const visible = questions.filter((question) => !question.hidden).toSorted(byAddition);
  const unanswered = (question: QueueQuestion) => question.referenceAnswer === null;
  const first = visible.filter(
    (question) =>
      asked.has(question.id) &&
      (unanswered(question) || question.referenceAnswer?.origin === "agent"),
  );
  const rest = visible.filter((question) => unanswered(question) && !asked.has(question.id));
  const weak = rest.filter((question) => weakTopics.has(question.topicId));
  const other = rest.filter((question) => !weakTopics.has(question.topicId));
  return [...first, ...weak, ...other];
}

/** The number «без опорного ответа» of the start window: visible Questions without one. */
export function withoutAnswerCount(questions: readonly QueueQuestion[]): number {
  return questions.filter((question) => !question.hidden && question.referenceAnswer === null)
    .length;
}

/**
 * Why answer search may not write an answer of the origin over the Question's current one, as the
 * tool's error in English; null when it may. An answer «из материала» or «проверен кандидатом»
 * stays, and an answer «из знаний агента» never replaces one «из интернета».
 */
export function overwriteRefusal(
  current: { readonly origin: ReferenceOrigin } | null,
  origin: SearchOrigin,
): string | null {
  const currentOrigin = current?.origin;
  switch (currentOrigin) {
    case "material": {
      return "The Question has a reference answer from its material; it stays";
    }
    case "candidate": {
      return "The Question has a reference answer the Candidate checked; it stays";
    }
    case "internet": {
      return origin === "agent"
        ? "An answer from the agent's knowledge never replaces one from the internet"
        : null;
    }
    case "agent":
    case undefined: {
      return null;
    }
    default: {
      return currentOrigin satisfies never;
    }
  }
}
