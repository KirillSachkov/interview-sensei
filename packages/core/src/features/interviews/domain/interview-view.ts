import type {
  AskedQuestion,
  Attempt,
  CandidateAnswer,
  FollowUp,
  MockInterview,
} from "./interview.ts";

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
}

/** A Mock interview as the browser shows it; Grades come only with the Debrief of an Attempt. */
export interface InterviewView extends MockInterview {
  readonly questions: readonly QuestionCard[];
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
  };
}

export function interviewView(
  interview: MockInterview,
  asked: readonly AskedQuestion[],
  attempts: readonly Attempt[],
): InterviewView {
  return { ...interview, questions: asked.map((question) => card(question, attempts)) };
}
