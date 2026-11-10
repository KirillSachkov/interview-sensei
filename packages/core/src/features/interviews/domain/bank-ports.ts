// What the interviews slice takes from the question-bank slice: the Target's Questions with their
// reference answers, a made-up Question to add, and the list «проверить опорный ответ».
import type { Level, ReferenceAnswer } from "./interview.ts";

/** A Question of the Target's bank, as the question-bank slice gives it. */
export interface BankQuestion {
  readonly id: string;
  readonly topicId: string;
  readonly text: string;
  readonly format: "open" | "quiz";
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly correctOptionIds: readonly string[];
  readonly level: Level;
  readonly hidden: boolean;
  readonly rating: "useful" | "irrelevant" | "wrong" | null;
  /** Null when the Question has none: the agent grades from its own knowledge. */
  readonly referenceAnswer: ReferenceAnswer | null;
}

/** A Question the agent made up when no candidate fitted: open, with no Source, unconfirmed. */
export interface NewBankQuestion {
  readonly id: string;
  readonly targetId: string;
  readonly topicId: string;
  readonly text: string;
  readonly format: "open";
  readonly options: readonly [];
  readonly correctOptionIds: readonly [];
  readonly level: BankQuestion["level"];
  readonly sourceIds: readonly [];
  readonly unconfirmed: true;
  readonly hidden: false;
  readonly rating: null;
  readonly referenceAnswer: null;
  /** ISO 8601. */
  readonly createdAt: string;
}

/** The question-bank slice supplies the Target's Questions that are not hidden. */
export interface InterviewQuestions {
  readonly search: (
    targetId: string,
    filter: { readonly topicIds: readonly string[] },
  ) => Promise<readonly BankQuestion[]>;
  /** Adds the Question to the Target's bank. */
  readonly add: (question: NewBankQuestion) => Promise<void>;
}

/**
 * Why a Question goes on the list «проверить опорный ответ»: the Candidate disputed the Grade of an
 * Attempt on it (`dispute`), or the interviewer disagreed with its reference answer (`interviewer`).
 */
interface ReferenceCheckRequest {
  readonly questionId: string;
  readonly reason: "dispute" | "interviewer";
  /** The Candidate's reason for the Dispute, or why the interviewer disagrees. */
  readonly comment: string;
  /** ISO 8601. */
  readonly requestedAt: string;
}

/**
 * The question-bank slice puts a Question on the list «проверить опорный ответ»; nothing for a
 * Question without a reference answer. `Transaction` is the storage's open transaction, in which
 * the Dispute or the Attempt is recorded too.
 */
export interface ReferenceChecks<Transaction> {
  readonly requestReferenceCheck: (
    request: ReferenceCheckRequest,
    transaction: Transaction,
  ) => Promise<void>;
}
