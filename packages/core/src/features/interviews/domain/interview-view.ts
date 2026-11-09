import type {
  AskedQuestion,
  Attempt,
  CandidateAnswer,
  FollowUp,
  MockInterview,
} from "./interview.ts";
import type { SideThread } from "./side-thread.ts";
import { inOvertime, limitEndsAt } from "./time-limit.ts";

/** An asked question as the browser shows it: no correct options and no Grade. */
interface QuestionCard {
  readonly id: string;
  readonly questionId: string;
  readonly topicId: string;
  readonly sectionId: string;
  readonly text: string;
  readonly format: "open" | "quiz";
  readonly options: AskedQuestion["options"];
  readonly parentAttemptId: string | null;
  readonly presentedAt: string;
  readonly answer: CandidateAnswer | null;
  readonly followUps: readonly FollowUp[];
  /** The Attempt's id once it is recorded: the Debrief is ready. */
  readonly attemptId: string | null;
  /** A Side thread opened before the answer: the Attempt is received with a hint. */
  readonly hinted: boolean;
}

/** A Mock interview as the browser shows it; Grades come only with the Debrief of an Attempt. */
export interface InterviewView extends MockInterview {
  readonly questions: readonly QuestionCard[];
  /** When the time limit ends; null without a limit. */
  readonly endsAt: string | null;
  /** The running Mock interview has passed its limit and goes on until the Candidate ends it. */
  readonly overtime: boolean;
  /** The Side threads in the order they were opened. */
  readonly sideThreads: readonly SideThread[];
}

function card(question: AskedQuestion, attempts: readonly Attempt[]): QuestionCard {
  const attempt = attempts.find((entry) => entry.askedQuestionId === question.id);
  return {
    id: question.id,
    questionId: question.questionId,
    topicId: question.topicId,
    sectionId: question.sectionId,
    text: question.text,
    format: question.format,
    options: question.options,
    parentAttemptId: question.parentAttemptId,
    presentedAt: question.presentedAt,
    answer: question.answer,
    followUps: question.followUps,
    attemptId: attempt?.id ?? null,
    hinted: question.hinted,
  };
}

export function interviewView(
  interview: MockInterview,
  {
    asked,
    attempts,
    sideThreads,
    now,
  }: {
    asked: readonly AskedQuestion[];
    attempts: readonly Attempt[];
    sideThreads: readonly SideThread[];
    now: string;
  },
): InterviewView {
  return {
    ...interview,
    questions: asked.map((question) => card(question, attempts)),
    endsAt: limitEndsAt(interview),
    overtime: inOvertime(interview, now),
    sideThreads,
  };
}
