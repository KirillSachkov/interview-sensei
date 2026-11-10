// The continuation summary of a Mock interview (#84): after a pause a new agent session goes on
// with the interview, and the server tells it where the interview stopped from its own records,
// not from the agent's log. The agent reads it in `get_brief`. Grades are in it: the agent needs
// them for Deeper questions and the difficulty; the skill keeps unopened Grades out of the chat.
import { correctedGrade, latestDisputes } from "./dispute.ts";
import type { Dispute } from "./dispute.ts";
import { pendingFollowUp } from "./follow-ups.ts";
import type { AskedQuestion, Attempt, MockInterview } from "./interview.ts";
import { presentedQuestion } from "./interview.ts";
import { limitPassed, timeLeftMs } from "./time-limit.ts";

/** What the summary reads of the Mock interview's records at the moment `now`. */
export interface ContinuationRecords {
  readonly asked: readonly AskedQuestion[];
  readonly attempts: readonly Attempt[];
  readonly disputes: readonly Dispute[];
  readonly now: string;
}

/** The Candidate's answer: free text, the texts of the chosen quiz options, or «Не знаю». */
function answerOf({ answer, options }: AskedQuestion) {
  return answer === null
    ? null
    : {
        text: answer.text,
        chosenOptions: options
          .filter((option) => answer.optionIds.includes(option.id))
          .map((option) => option.text),
        skipped: answer.skipped,
      };
}

/** A question as the agent showed it, with the Candidate's answer and Follow-ups. */
function shown(question: AskedQuestion) {
  return {
    number: question.position + 1,
    questionId: question.questionId,
    topicId: question.topicId,
    sectionId: question.sectionId,
    text: question.text,
    format: question.format,
    ...(question.format === "quiz"
      ? { options: question.options.map((option) => option.text) }
      : {}),
    parentAttemptId: question.parentAttemptId,
    answer: answerOf(question),
    followUps: question.followUps.map(({ question: asked, answer }) => ({
      question: asked,
      answer,
    })),
  };
}

/** What the presented question waits for: the answer, the answer to a Follow-up, or its Attempt. */
function waitingFor(question: AskedQuestion): "answer" | "follow_up_answer" | "attempt" {
  if (question.answer === null) {
    return "answer";
  }
  return pendingFollowUp(question) === undefined ? "attempt" : "follow_up_answer";
}

/**
 * Where the paused Mock interview stopped: the current Section, the time left as it stood, the
 * asked questions in order with the answers, Follow-ups and Grades after Disputes, and the presented
 * question with what it waits for. The Target, the Sections, the difficulty and the Preferences
 * are in the rest of the brief.
 */
export function continuationSummary(
  interview: Pick<
    MockInterview,
    "status" | "startedAt" | "limitMinutes" | "pausedAt" | "pausedMs" | "currentSectionId"
  >,
  { asked, attempts, disputes, now }: ContinuationRecords,
) {
  const latest = latestDisputes(disputes);
  const presented = presentedQuestion(asked, attempts);
  const left = timeLeftMs(interview, now);
  return {
    currentSectionId: interview.currentSectionId,
    /** Whole minutes; null without a limit, 0 or below in overtime. */
    timeLeftMinutes: left === null ? null : Math.round(left / 60_000),
    // The paused Mock interview is in overtime once it goes on: its time stands as it stood.
    overtime: limitPassed(left),
    askedQuestions: asked.flatMap((question) => {
      const attempt = attempts.find((entry) => entry.askedQuestionId === question.id);
      return attempt === undefined
        ? []
        : [
            {
              ...shown(question),
              attempt: {
                id: attempt.id,
                grade: correctedGrade(attempt, latest),
                gradedBy: attempt.gradedBy,
                gaps: attempt.gaps,
              },
            },
          ];
    }),
    presentedQuestion:
      presented === undefined ? null : { ...shown(presented), waitingFor: waitingFor(presented) },
  };
}

export type ContinuationSummary = ReturnType<typeof continuationSummary>;
