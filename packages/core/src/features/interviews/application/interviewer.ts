// What the interviewer's MCP tools do. Each action finds the Mock interview of the calling
// session and refuses with a rule the agent can follow. Texts for the agent are in English.
import { randomUUID } from "node:crypto";

import { interviewBrief } from "../domain/brief.ts";
import { questionCandidates } from "../domain/candidates.ts";
import type { Judgment, MockInterview } from "../domain/interview.ts";
import { presentedQuestion } from "../domain/interview.ts";
import type {
  BankQuestion,
  InterviewRepository,
  PlanSection,
  TargetPlan,
} from "../domain/ports.ts";
import { change, inBackground } from "./context.ts";
import type { Context } from "./context.ts";

/** A refused tool call; the agent gets the message as the tool's error. */
class InterviewToolError extends Error {
  override name = "InterviewToolError";
}

export interface Interviewer {
  /** The brief as JSON. */
  readonly brief: (sessionId: string) => Promise<string>;
  /** Up to `limit` candidates of the current Section as JSON. */
  readonly candidates: (sessionId: string, limit: number) => Promise<string>;
  readonly present: (sessionId: string, request: { questionId: string }) => Promise<string>;
  readonly record: (sessionId: string, judgment: Judgment) => Promise<string>;
  readonly finish: (
    sessionId: string,
    result: { summary: string; nextStep: string },
  ) => Promise<string>;
}

async function interviewOf({ dependencies }: Context, sessionId: string): Promise<MockInterview> {
  const interview = await dependencies.repository.bySession(sessionId);
  if (interview === undefined) {
    throw new InterviewToolError("No mock interview belongs to this session.");
  }
  return interview;
}

function assertRunning(interview: MockInterview): void {
  if (interview.status !== "running") {
    throw new InterviewToolError("The mock interview has ended.");
  }
}

async function planOf({ dependencies }: Context, interview: MockInterview): Promise<TargetPlan> {
  const plan = await dependencies.targets.get(interview.targetId);
  if (plan === undefined) {
    throw new InterviewToolError("The Target of this mock interview no longer exists.");
  }
  return plan;
}

/** The selected Sections of the Mock interview, in its order. */
function selected(plan: TargetPlan, interview: MockInterview): readonly PlanSection[] {
  return interview.sectionIds.flatMap((id) => plan.sections.filter((section) => section.id === id));
}

async function brief(context: Context, sessionId: string): Promise<string> {
  const interview = await interviewOf(context, sessionId);
  return JSON.stringify(interviewBrief(interview, await planOf(context, interview)));
}

/** A candidate as the agent sees it: no correct options. */
function candidateOf(question: BankQuestion) {
  return {
    id: question.id,
    topicId: question.topicId,
    text: question.text,
    format: question.format,
    level: question.level,
    ...(question.format === "quiz" ? { options: question.options } : {}),
  };
}

async function candidates(context: Context, sessionId: string, limit: number): Promise<string> {
  const interview = await interviewOf(context, sessionId);
  assertRunning(interview);
  const plan = await planOf(context, interview);
  const section = selected(plan, interview).find(
    (entry) => entry.id === interview.currentSectionId,
  );
  const { repository, questions } = context.dependencies;
  const bank =
    section === undefined
      ? []
      : await questions.search(interview.targetId, { topicIds: section.topicIds });
  const found = questionCandidates({
    questions: bank,
    asked: await repository.asked(interview.id),
    limit,
  });
  return JSON.stringify({
    sectionId: section?.id ?? null,
    candidates: found.map((question) => candidateOf(question)),
  });
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

/** The Section of the Question among the selected ones, the current Section first. */
function sectionOf(
  sections: readonly PlanSection[],
  interview: MockInterview,
  question: BankQuestion,
): PlanSection | undefined {
  const ordered = [
    ...sections.filter((entry) => entry.id === interview.currentSectionId),
    ...sections.filter((entry) => entry.id !== interview.currentSectionId),
  ];
  return ordered.find((entry) => entry.topicIds.includes(question.topicId));
}

/** The Question with its Section, when it belongs to a selected Section and was not asked yet. */
async function questionToShow(
  context: Context,
  interview: MockInterview,
  questionId: string,
): Promise<{ question: BankQuestion; section: PlanSection }> {
  const sections = selected(await planOf(context, interview), interview);
  const { questions, repository } = context.dependencies;
  const bank = await questions.search(interview.targetId, {
    topicIds: sections.flatMap((section) => section.topicIds),
  });
  const question = bank.find((entry) => entry.id === questionId);
  const section = question === undefined ? undefined : sectionOf(sections, interview, question);
  if (question === undefined || section === undefined) {
    throw new InterviewToolError(
      "This question is not in the selected Sections of the mock interview: pick one from next_question_candidates.",
    );
  }
  await assertNotAsked(repository, interview, question);
  return { question, section };
}

async function assertNotAsked(
  repository: InterviewRepository,
  interview: MockInterview,
  question: BankQuestion,
): Promise<void> {
  const asked = await repository.asked(interview.id);
  if (asked.some((entry) => entry.questionId === question.id)) {
    throw new InterviewToolError("This question was already asked in this mock interview.");
  }
}

async function present(
  context: Context,
  sessionId: string,
  { questionId }: { questionId: string },
) {
  const found = await interviewOf(context, sessionId);
  const { repository, sessions, clock } = context.dependencies;
  return change(context, found.id, async () => {
    const interview = await interviewOf(context, sessionId);
    assertRunning(interview);
    if (interview.finishRequestedAt !== null) {
      throw new InterviewToolError(
        "The Candidate finished the mock interview: call finish_interview instead.",
      );
    }
    const position = await assertNothingPresented(context, interview);
    const { question, section } = await questionToShow(context, interview, questionId);
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
      parentAttemptId: null,
      presentedAt: clock.now().toISOString(),
      answer: null,
      followUps: [],
    });
    // The rest of this turn could hint at the answer, so the chat leaves it out.
    await sessions.hideAgentText(sessionId);
    return "The question is shown to the Candidate. End your turn now and wait for the Candidate's answer.";
  });
}

const recordedAlready =
  "The last question already has its Attempt; a recorded Attempt never changes.";

/** The presented question with the Candidate's answer, which waits for its Attempt. */
async function answeredQuestion(context: Context, interview: MockInterview) {
  const { repository } = context.dependencies;
  const [asked, attempts] = await Promise.all([
    repository.asked(interview.id),
    repository.attempts(interview.id),
  ]);
  const presented = presentedQuestion(asked, attempts);
  if (presented === undefined) {
    throw new InterviewToolError(
      asked.length === 0
        ? "No question is presented: show one with present_question first."
        : recordedAlready,
    );
  }
  if (presented.answer === null) {
    throw new InterviewToolError(
      "The Candidate has not answered the presented question yet: wait for the answer.",
    );
  }
  return presented;
}

async function record(context: Context, sessionId: string, judgment: Judgment) {
  const found = await interviewOf(context, sessionId);
  const { repository, clock } = context.dependencies;
  return change(context, found.id, async () => {
    const interview = await interviewOf(context, sessionId);
    assertRunning(interview);
    const presented = await answeredQuestion(context, interview);
    const outcome = await repository.record({
      id: randomUUID(),
      interviewId: interview.id,
      askedQuestionId: presented.id,
      ...judgment,
      gradedBy: "agent",
      hinted: false,
      recordedAt: clock.now().toISOString(),
    });
    if (outcome === "exists") {
      throw new InterviewToolError(recordedAlready);
    }
    return "The Attempt is recorded. Present the next question with present_question.";
  });
}

async function finish(
  context: Context,
  sessionId: string,
  { summary, nextStep }: { summary: string; nextStep: string },
) {
  const found = await interviewOf(context, sessionId);
  const { repository, sessions, clock } = context.dependencies;
  return change(context, found.id, async () => {
    const interview = await interviewOf(context, sessionId);
    assertRunning(interview);
    if (interview.finishRequestedAt === null) {
      throw new InterviewToolError(
        "Only the Candidate ends the mock interview: keep asking questions until the message that the Candidate finished.",
      );
    }
    await repository.update(interview.id, {
      status: "finished",
      finishedAt: clock.now().toISOString(),
      summary,
      nextStep,
    });
    // The agent's work is done once this turn ends.
    inBackground(context, async () => sessions.end(sessionId));
    return "The mock interview is finished. End your turn.";
  });
}

export function createInterviewer(context: Context): Interviewer {
  return {
    brief: async (sessionId) => brief(context, sessionId),
    candidates: async (sessionId, limit) => candidates(context, sessionId, limit),
    present: async (sessionId, request) => present(context, sessionId, request),
    record: async (sessionId, judgment) => record(context, sessionId, judgment),
    finish: async (sessionId, result) => finish(context, sessionId, result),
  };
}
