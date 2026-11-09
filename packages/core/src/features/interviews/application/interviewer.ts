// What the interviewer's MCP tools do. Each action finds the Mock interview of the calling
// session and refuses with a rule the agent can follow. Texts for the agent are in English.
import { randomUUID } from "node:crypto";

import { interviewBrief } from "../domain/brief.ts";
import type { Judgment } from "../domain/interview.ts";
import { change, inBackground } from "./context.ts";
import type { Context } from "./context.ts";
import { setSection } from "./current-section.ts";
import { askFollowUp } from "./follow-ups.ts";
import { present } from "./present-question.ts";
import type { PresentRequest } from "./present-question.ts";
import { candidates } from "./question-candidates.ts";
import type { CandidatesRequest } from "./question-candidates.ts";
import {
  answeredQuestion,
  assertRunning,
  InterviewToolError,
  interviewOf,
  planOf,
  recordedAlready,
} from "./tool-session.ts";
import { briefHistory } from "./records.ts";

export interface Interviewer {
  /** The brief as JSON. */
  readonly brief: (sessionId: string) => Promise<string>;
  /** Candidates of the current Section as JSON, the most needed first. */
  readonly candidates: (sessionId: string, request: CandidatesRequest) => Promise<string>;
  readonly present: (sessionId: string, request: PresentRequest) => Promise<string>;
  readonly setSection: (sessionId: string, request: { sectionId: string }) => Promise<string>;
  readonly askFollowUp: (sessionId: string, request: { question: string }) => Promise<string>;
  readonly record: (sessionId: string, judgment: Judgment) => Promise<string>;
  readonly finish: (
    sessionId: string,
    result: { summary: string; nextStep: string },
  ) => Promise<string>;
}

async function brief(context: Context, sessionId: string): Promise<string> {
  const interview = await interviewOf(context, sessionId);
  const [plan, past] = await Promise.all([
    planOf(context, interview),
    briefHistory(context.dependencies, interview),
  ]);
  return JSON.stringify(interviewBrief(interview, plan, past));
}

async function record(context: Context, sessionId: string, judgment: Judgment) {
  const found = await interviewOf(context, sessionId);
  const { repository, clock } = context.dependencies;
  return change(context, found.id, async () => {
    const interview = await interviewOf(context, sessionId);
    assertRunning(interview);
    const presented = await answeredQuestion(context, interview);
    const id = randomUUID();
    const outcome = await repository.record({
      id,
      interviewId: interview.id,
      askedQuestionId: presented.id,
      ...judgment,
      gradedBy: "agent",
      hinted: presented.hinted,
      recordedAt: clock.now().toISOString(),
    });
    if (outcome === "exists") {
      throw new InterviewToolError(recordedAlready);
    }
    return `The Attempt ${id} is recorded. Present the next question with present_question; a Deeper question names this Attempt as its parent.`;
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
    candidates: async (sessionId, request) => candidates(context, sessionId, request),
    present: async (sessionId, request) => present(context, sessionId, request),
    setSection: async (sessionId, request) => setSection(context, sessionId, request),
    askFollowUp: async (sessionId, request) => askFollowUp(context, sessionId, request),
    record: async (sessionId, judgment) => record(context, sessionId, judgment),
    finish: async (sessionId, result) => finish(context, sessionId, result),
  };
}
