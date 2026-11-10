// What the interviewer's MCP tools do. Each action finds the Mock interview of the calling
// session and refuses with a rule the agent can follow. Texts for the agent are in English.
import { interviewBrief } from "../domain/brief.ts";
import type { Context } from "./context.ts";
import { setSection } from "./current-section.ts";
import { askFollowUp } from "./follow-ups.ts";
import { present } from "./present-question.ts";
import type { PresentRequest } from "./present-question.ts";
import { candidates } from "./question-candidates.ts";
import type { CandidatesRequest } from "./question-candidates.ts";
import { record } from "./record-attempt.ts";
import type { RecordRequest } from "./record-attempt.ts";
import { interviewOf, planOf } from "./tool-session.ts";
import { briefContinuation, briefHistory } from "./records.ts";

export interface Interviewer {
  /** The brief as JSON. */
  readonly brief: (sessionId: string) => Promise<string>;
  /** Candidates of the current Section as JSON, the most needed first. */
  readonly candidates: (sessionId: string, request: CandidatesRequest) => Promise<string>;
  readonly present: (sessionId: string, request: PresentRequest) => Promise<string>;
  readonly setSection: (sessionId: string, request: { sectionId: string }) => Promise<string>;
  readonly askFollowUp: (sessionId: string, request: { question: string }) => Promise<string>;
  readonly record: (sessionId: string, judgment: RecordRequest) => Promise<string>;
  readonly finish: (
    sessionId: string,
    result: { summary: string; nextStep: string },
  ) => Promise<string>;
}

async function brief(context: Context, sessionId: string): Promise<string> {
  const interview = await interviewOf(context, sessionId);
  const [plan, past, continuation] = await Promise.all([
    planOf(context, interview),
    briefHistory(context.dependencies, interview),
    briefContinuation(context.dependencies, interview),
  ]);
  return JSON.stringify(
    interviewBrief(interview, plan, continuation === null ? past : { ...past, continuation }),
  );
}

/** The interviewer's tools but `finish_interview`, which endings.ts owns. */
export function createInterviewer(context: Context): Omit<Interviewer, "finish"> {
  return {
    brief: async (sessionId) => brief(context, sessionId),
    candidates: async (sessionId, request) => candidates(context, sessionId, request),
    present: async (sessionId, request) => present(context, sessionId, request),
    setSection: async (sessionId, request) => setSection(context, sessionId, request),
    askFollowUp: async (sessionId, request) => askFollowUp(context, sessionId, request),
    record: async (sessionId, judgment) => record(context, sessionId, judgment),
  };
}
