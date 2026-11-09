// The Candidate's answer to the presented question: free text for the agent to judge, or a quiz
// choice and «Не знаю», whose Attempts the app records itself (#41).
import { randomUUID } from "node:crypto";

import { candidateAnswered, questionSkipped, quizAnswered } from "../domain/agent-messages.ts";
import { quizJudgment, skippedJudgment } from "../domain/app-judgment.ts";
import type { AskedQuestion, CandidateAnswer, MockInterview } from "../domain/interview.ts";
import { presentedQuestion } from "../domain/interview.ts";
import { change, tellInterviewer } from "./context.ts";
import type { Context, InterviewsDependencies } from "./context.ts";

/** Free text, the chosen quiz options, or «Не знаю». */
export type CandidateReply =
  | { readonly text: string }
  | { readonly optionIds: readonly string[] }
  | { readonly skipped: true };

/**
 * - `no_question`: no question waits for an answer.
 * - `already_answered`: the presented question has the Candidate's answer.
 * - `not_open`: the presented question is a quiz; its answer is a choice of options.
 * - `not_quiz`: the presented question takes free text, not options.
 * - `invalid_options`: no option, a repeated one, or one the quiz does not have.
 */
export type AnswerOutcome =
  | "accepted"
  | "not_found"
  | "not_running"
  | "no_question"
  | "already_answered"
  | "not_open"
  | "not_quiz"
  | "invalid_options";

/** Why the Mock interview takes no answer now, or null when it takes one. */
function notAnswerable(interview: MockInterview | undefined): "not_found" | "not_running" | null {
  if (interview === undefined) {
    return "not_found";
  }
  return interview.status !== "running" || interview.finishRequestedAt !== null
    ? "not_running"
    : null;
}

/** The presented question that waits for the Candidate's answer, or why there is none. */
async function waitingQuestion(
  { repository }: InterviewsDependencies,
  interview: MockInterview,
): Promise<AskedQuestion | "no_question" | "already_answered"> {
  const [asked, attempts] = await Promise.all([
    repository.asked(interview.id),
    repository.attempts(interview.id),
  ]);
  const presented = presentedQuestion(asked, attempts);
  if (presented === undefined) {
    return "no_question";
  }
  return presented.answer === null ? presented : "already_answered";
}

/** Why the reply does not fit the question, or null when it fits. */
function misfit(
  question: AskedQuestion,
  reply: CandidateReply,
): Exclude<AnswerOutcome, "accepted"> | null {
  if ("text" in reply) {
    return question.format === "open" ? null : "not_open";
  }
  if (!("optionIds" in reply)) {
    return null;
  }
  if (question.format !== "quiz") {
    return "not_quiz";
  }
  const known = new Set(question.options.map((option) => option.id));
  const chosen = new Set(reply.optionIds);
  return chosen.size === 0 ||
    chosen.size !== reply.optionIds.length ||
    [...chosen].some((id) => !known.has(id))
    ? "invalid_options"
    : null;
}

function recordedAnswer(reply: CandidateReply, answeredAt: string): CandidateAnswer {
  return {
    text: "text" in reply ? reply.text : null,
    optionIds: "optionIds" in reply ? reply.optionIds : [],
    skipped: "skipped" in reply,
    answeredAt,
  };
}

/** Records the Attempt of a quiz or «Не знаю» and tells the agent; it records none itself. */
async function recordByApp(
  context: Context,
  {
    interview,
    question,
    reply,
  }: {
    interview: MockInterview;
    question: AskedQuestion;
    reply: Exclude<CandidateReply, { text: string }>;
  },
): Promise<void> {
  const { repository, clock } = context.dependencies;
  const skipped = "skipped" in reply;
  const judgment = skipped ? skippedJudgment(question) : quizJudgment(question, reply.optionIds);
  const id = randomUUID();
  await repository.record({
    id,
    interviewId: interview.id,
    askedQuestionId: question.id,
    ...judgment,
    gradedBy: skipped ? "skip" : "quiz",
    hinted: false,
    recordedAt: clock.now().toISOString(),
  });
  tellInterviewer(
    context,
    interview.sessionId,
    skipped ? questionSkipped(id) : quizAnswered(judgment.grade, id),
  );
}

/** The running Mock interview and its question that takes the reply, or why there is none. */
async function questionFor(
  { dependencies }: Context,
  id: string,
  reply: CandidateReply,
): Promise<
  { interview: MockInterview; question: AskedQuestion } | Exclude<AnswerOutcome, "accepted">
> {
  const interview = await dependencies.repository.get(id);
  const refusal = notAnswerable(interview);
  if (refusal !== null || interview === undefined) {
    return refusal ?? "not_found";
  }
  const question = await waitingQuestion(dependencies, interview);
  if (typeof question === "string") {
    return question;
  }
  return misfit(question, reply) ?? { interview, question };
}

/** Records the Candidate's answer to the presented question and tells the agent. */
export async function answerPresented(
  context: Context,
  id: string,
  reply: CandidateReply,
): Promise<AnswerOutcome> {
  const { repository, clock } = context.dependencies;
  return change(context, id, async (): Promise<AnswerOutcome> => {
    const found = await questionFor(context, id, reply);
    if (typeof found === "string") {
      return found;
    }
    const { interview, question } = found;
    await repository.answer(question.id, recordedAnswer(reply, clock.now().toISOString()));
    if ("text" in reply) {
      tellInterviewer(context, interview.sessionId, candidateAnswered(reply.text));
    } else {
      await recordByApp(context, { interview, question, reply });
    }
    return "accepted";
  });
}
