// `present_question`: a Question of the bank, or a new one the agent made up when no candidate
// fits; the bank keeps a new one as unconfirmed. A Deeper question names its parent Attempt.
import { randomUUID } from "node:crypto";

import { candidateLevel } from "../domain/candidates.ts";
import type { MockInterview } from "../domain/interview.ts";
import { presentedQuestion } from "../domain/interview.ts";
import type { BankQuestion, NewBankQuestion, PlanSection, TargetPlan } from "../domain/ports.ts";
import { change } from "./context.ts";
import type { Context } from "./context.ts";
import {
  assertNotFinishing,
  assertRunning,
  InterviewToolError,
  interviewOf,
  planOf,
  selected,
} from "./tool-session.ts";

/** The Question to show: a bank id, or the text and Topic of a new one; and its parent Attempt. */
export interface PresentRequest {
  readonly questionId?: string | undefined;
  readonly text?: string | undefined;
  readonly topicId?: string | undefined;
  readonly parentAttemptId?: string | undefined;
}

/** Refuses a new question while the presented one waits for its answer or its Attempt. */
async function assertNothingPresented(context: Context, interview: MockInterview): Promise<number> {
  const { repository } = context.dependencies;
  const [asked, attempts] = await Promise.all([
    repository.asked(interview.id),
    repository.attempts(interview.id),
  ]);
  const presented = presentedQuestion(asked, attempts);
  if (presented?.answer === null) {
    throw new InterviewToolError(
      "The presented question still waits for the Candidate's answer: end your turn and wait.",
    );
  }
  if (presented !== undefined) {
    throw new InterviewToolError(
      "The presented question has no Attempt yet: call record_attempt first.",
    );
  }
  return asked.length;
}

/** The Section of the Topic among the selected ones, the current Section first. */
function sectionOf(
  sections: readonly PlanSection[],
  interview: MockInterview,
  topicId: string,
): PlanSection | undefined {
  const ordered = [
    ...sections.filter((entry) => entry.id === interview.currentSectionId),
    ...sections.filter((entry) => entry.id !== interview.currentSectionId),
  ];
  return ordered.find((entry) => entry.topicIds.includes(topicId));
}

/** The Topic of the parent Attempt of this Mock interview; undefined without a parent. */
async function parentTopic(
  context: Context,
  interview: MockInterview,
  parentAttemptId: string | undefined,
): Promise<string | undefined> {
  if (parentAttemptId === undefined) {
    return undefined;
  }
  const { repository } = context.dependencies;
  const [asked, attempts] = await Promise.all([
    repository.asked(interview.id),
    repository.attempts(interview.id),
  ]);
  const parent = attempts.find((attempt) => attempt.id === parentAttemptId);
  const topicId = asked.find((entry) => entry.id === parent?.askedQuestionId)?.topicId;
  if (topicId === undefined) {
    throw new InterviewToolError(
      "The parent Attempt is not an Attempt of this mock interview: use an id that record_attempt returned.",
    );
  }
  return topicId;
}

/** The bank Question with the id, when it belongs to a selected Section and was not asked yet. */
async function bankQuestion(
  context: Context,
  { interview, sections }: { interview: MockInterview; sections: readonly PlanSection[] },
  questionId: string,
): Promise<BankQuestion> {
  const { questions, repository } = context.dependencies;
  const bank = await questions.search(interview.targetId, {
    topicIds: sections.flatMap((section) => section.topicIds),
  });
  const question = bank.find((entry) => entry.id === questionId);
  if (question === undefined) {
    throw new InterviewToolError(
      "This question is not in the selected Sections of the mock interview: pick one from next_question_candidates.",
    );
  }
  const asked = await repository.asked(interview.id);
  if (asked.some((entry) => entry.questionId === question.id)) {
    throw new InterviewToolError("This question was already asked in this mock interview.");
  }
  return question;
}

/** A new open Question for the Topic at the Mock interview's level, not added to the bank yet. */
function madeUpQuestion(
  context: Context,
  { interview, level }: { interview: MockInterview; level: BankQuestion["level"] },
  { text, topicId }: { text: string; topicId: string },
): NewBankQuestion {
  return {
    id: randomUUID(),
    targetId: interview.targetId,
    topicId,
    text,
    format: "open",
    options: [],
    correctOptionIds: [],
    level,
    sourceIds: [],
    unconfirmed: true,
    hidden: false,
    rating: null,
    createdAt: context.dependencies.clock.now().toISOString(),
  };
}

/** A Question of the bank, or the text and Topic of a new one. */
type Choice =
  | { readonly kind: "bank"; readonly questionId: string }
  | { readonly kind: "new"; readonly text: string; readonly topicId: string };

function choiceOf({ questionId, text, topicId }: PresentRequest): Choice {
  if (questionId !== undefined && text === undefined && topicId === undefined) {
    return { kind: "bank", questionId };
  }
  if (questionId === undefined && text !== undefined && topicId !== undefined) {
    return { kind: "new", text, topicId };
  }
  throw new InterviewToolError(
    "Give either questionId of a candidate, or text and topicId of a new question.",
  );
}

/**
 * The selected Section of the Topic; refuses a Topic outside them, and a Deeper question outside
 * the Topic of its parent Attempt.
 */
async function placed(
  context: Context,
  { interview, sections }: { interview: MockInterview; sections: readonly PlanSection[] },
  { topicId, parentAttemptId }: { topicId: string; parentAttemptId: string | undefined },
): Promise<PlanSection> {
  const section = sectionOf(sections, interview, topicId);
  if (section === undefined) {
    throw new InterviewToolError(
      "This Topic is not in the selected Sections of the mock interview.",
    );
  }
  const parent = await parentTopic(context, interview, parentAttemptId);
  if (parent !== undefined && parent !== topicId) {
    throw new InterviewToolError(
      "A Deeper question stays in the Topic of its parent Attempt: pick one with next_question_candidates and that topicId.",
    );
  }
  return section;
}

/** The chosen Question; `made` is the new one the bank does not have yet. */
async function chosenQuestion(
  context: Context,
  { interview, plan }: { interview: MockInterview; plan: TargetPlan },
  choice: Choice,
): Promise<{ question: BankQuestion; made: NewBankQuestion | null }> {
  if (choice.kind === "bank") {
    const scope = { interview, sections: selected(plan, interview) };
    return { question: await bankQuestion(context, scope, choice.questionId), made: null };
  }
  const level = candidateLevel(plan.level, interview.difficulty);
  const made = madeUpQuestion(context, { interview, level }, choice);
  return { question: made, made };
}

/** The Question to show and its Section; a new Question is added to the bank as unconfirmed. */
async function questionToShow(
  context: Context,
  interview: MockInterview,
  request: PresentRequest,
): Promise<{ question: BankQuestion; section: PlanSection }> {
  const choice = choiceOf(request);
  const plan = await planOf(context, interview);
  const { question, made } = await chosenQuestion(context, { interview, plan }, choice);
  const section = await placed(
    context,
    { interview, sections: selected(plan, interview) },
    { topicId: question.topicId, parentAttemptId: request.parentAttemptId },
  );
  if (made !== null) {
    await context.dependencies.questions.add(made);
  }
  return { question, section };
}

/** Shows the Question as a card; the agent's text stays out of the chat until the answer. */
export async function present(
  context: Context,
  sessionId: string,
  request: PresentRequest,
): Promise<string> {
  const found = await interviewOf(context, sessionId);
  const { repository, sessions, clock } = context.dependencies;
  return change(context, found.id, async () => {
    const interview = await interviewOf(context, sessionId);
    assertRunning(interview);
    assertNotFinishing(interview);
    const position = await assertNothingPresented(context, interview);
    const { question, section } = await questionToShow(context, interview, request);
    await repository.ask({
      id: randomUUID(),
      interviewId: interview.id,
      position,
      questionId: question.id,
      topicId: question.topicId,
      sectionId: section.id,
      text: question.text,
      format: question.format,
      options: question.options,
      correctOptionIds: question.correctOptionIds,
      parentAttemptId: request.parentAttemptId ?? null,
      presentedAt: clock.now().toISOString(),
      answer: null,
      followUps: [],
      hinted: false,
    });
    // Until the Candidate answers, the agent's text could hint at the answer, its replies to the
    // Candidate's chat messages included; the chat leaves it out.
    await sessions.hideAgentText(sessionId);
    return "The question is shown to the Candidate. End your turn now and wait for the Candidate's answer.";
  });
}
