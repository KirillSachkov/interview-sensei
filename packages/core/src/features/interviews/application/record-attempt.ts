// `record_attempt` (#10, #64): the interviewer's judgment of the answered question, against its
// reference answer when it has one.
import { randomUUID } from "node:crypto";

import type { AskedQuestion, Attempt, Judgment } from "../domain/interview.ts";
import { referenceFields } from "../domain/reference-judgment.ts";
import type { ReferenceVerdict } from "../domain/reference-judgment.ts";
import { change } from "./context.ts";
import type { Context } from "./context.ts";
import {
  answeredQuestion,
  assertRunning,
  InterviewToolError,
  interviewOf,
  recordedAlready,
} from "./tool-session.ts";

/**
 * Records the Attempt; the interviewer's disagreement with the reference answer puts the Question
 * on the list «проверить опорный ответ» in the same transaction (#64).
 */
async function store(
  context: Context,
  { attempt, questionId }: { attempt: Attempt; questionId: string },
): Promise<"recorded" | "exists"> {
  const { repository, referenceChecks, transaction } = context.dependencies;
  const comment = attempt.referenceDisagreement;
  if (comment === null) {
    return repository.record(attempt);
  }
  return transaction(async (open) => {
    const outcome = await repository.record(attempt, open);
    if (outcome === "recorded") {
      await referenceChecks.requestReferenceCheck(
        { questionId, reason: "interviewer", comment, requestedAt: attempt.recordedAt },
        open,
      );
    }
    return outcome;
  });
}

/** What the agent gives in `record_attempt`: its judgment and its verdict on the reference answer. */
export type RecordRequest = Judgment & ReferenceVerdict;

/** The agent's Attempt of the answered question, after checking its reference verdict. */
function attemptOf(
  context: Context,
  presented: AskedQuestion,
  { coveredPoints, disagreement, ...judgment }: RecordRequest,
): Attempt {
  const reference = referenceFields(presented.referenceAnswer, { coveredPoints, disagreement });
  if ("problem" in reference) {
    throw new InterviewToolError(reference.problem);
  }
  return {
    id: randomUUID(),
    interviewId: presented.interviewId,
    askedQuestionId: presented.id,
    ...judgment,
    ...reference.fields,
    gradedBy: "agent",
    hinted: presented.hinted,
    recordedAt: context.dependencies.clock.now().toISOString(),
  };
}

/** `record_attempt`: the agent's judgment of the answered question; returns the Attempt's id. */
export async function record(
  context: Context,
  sessionId: string,
  judgment: RecordRequest,
): Promise<string> {
  const found = await interviewOf(context, sessionId);
  return change(context, found.id, async () => {
    const interview = await interviewOf(context, sessionId);
    assertRunning(interview);
    const presented = await answeredQuestion(context, interview);
    const attempt = attemptOf(context, presented, judgment);
    const { id } = attempt;
    const outcome = await store(context, { attempt, questionId: presented.questionId });
    if (outcome === "exists") {
      throw new InterviewToolError(recordedAlready);
    }
    return `The Attempt ${id} is recorded. Present the next question with present_question; a Deeper question names this Attempt as its parent.`;
  });
}
