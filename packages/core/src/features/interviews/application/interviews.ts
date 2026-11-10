import type { InterviewView } from "../domain/interview-view.ts";
import { answerPresented } from "./candidate-answer.ts";
import type { AnswerOutcome, CandidateReply } from "./candidate-answer.ts";
import { createContext, viewOf } from "./context.ts";
import { answerFollowUp } from "./follow-ups.ts";
import type { FollowUpOutcome } from "./follow-ups.ts";
import type { Context, InterviewListener, InterviewsDependencies } from "./context.ts";
import { start } from "./start-interview.ts";
import type { StartOutcome, StartRequest } from "./start-interview.ts";
import { finish, finishByAgent } from "./endings.ts";
import { createPauses } from "./resume.ts";
import type { Pauses } from "./resume.ts";
import type { FinishOutcome } from "./endings.ts";
import { createInterviewer } from "./interviewer.ts";
import type { Interviewer } from "./interviewer.ts";
import { createRecords } from "./records.ts";
import type { Records } from "./records.ts";
import { createSideThreads } from "./side-thread-api.ts";
import type { SideThreads } from "./side-thread-api.ts";

/** How many of a Target's newest Mock interviews the canvas shows. */
const latestCount = 5;

export interface Interviews extends SideThreads, Records, Pauses {
  /** Starts a Mock interview with the Target's agent as the interviewer. */
  readonly start: (request: StartRequest) => Promise<StartOutcome>;
  readonly view: (id: string) => Promise<InterviewView | undefined>;
  /** The Target's newest Mock interviews, the newest first. */
  readonly latest: (targetId: string) => Promise<readonly InterviewView[]>;
  /**
   * Records the Candidate's answer to the presented question and tells the agent: free text, the
   * chosen quiz options or «Не знаю». The app grades a quiz and «Не знаю» itself.
   */
  readonly answer: (id: string, reply: CandidateReply) => Promise<AnswerOutcome>;
  /** Records the Candidate's answer to the agent's last Follow-up and tells the agent. */
  readonly answerFollowUp: (
    id: string,
    reply: { readonly text: string },
  ) => Promise<FollowUpOutcome>;
  /** The Candidate presses «Завершить»: the agent gets the message and calls finish_interview. */
  readonly finish: (id: string) => Promise<FinishOutcome>;
  /** Calls the listener after each change of the Mock interview; returns the unsubscribe. */
  readonly subscribe: (id: string, listener: InterviewListener) => () => void;
  /** What the interviewer's MCP tools do; each acts on the Mock interview of its session. */
  readonly interviewer: Interviewer;
}

function subscribe(context: Context, id: string, listener: InterviewListener) {
  const listeners = context.listeners.get(id) ?? new Set();
  context.listeners.set(id, listeners);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      context.listeners.delete(id);
    }
  };
}

/** Mock interviews of every Target: the Candidate's side and the interviewer's MCP tools. */
export function createInterviews(dependencies: InterviewsDependencies): Interviews {
  const context = createContext(dependencies);
  const { repository } = dependencies;
  return {
    start: async (request) => start(context, request),
    view: async (id) => {
      const interview = await repository.get(id);
      return interview === undefined ? undefined : viewOf(dependencies, interview);
    },
    latest: async (targetId) => {
      const interviews = await repository.latest(targetId, latestCount);
      return Promise.all(interviews.map(async (interview) => viewOf(dependencies, interview)));
    },
    answer: async (id, reply) => answerPresented(context, id, reply),
    answerFollowUp: async (id, reply) => answerFollowUp(context, id, reply),
    finish: async (id) => finish(context, id),
    ...createRecords(context),
    ...createPauses(context),
    subscribe: (id, listener) => subscribe(context, id, listener),
    interviewer: {
      ...createInterviewer(context),
      finish: async (sessionId, result) => finishByAgent(context, sessionId, result),
    },
    ...createSideThreads(context),
  };
}
