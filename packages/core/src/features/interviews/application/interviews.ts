import type { HistoryFilter, HistoryPage, TopicAttempt } from "../domain/history.ts";
import type { InterviewView } from "../domain/interview-view.ts";
import { answerPresented } from "./candidate-answer.ts";
import type { AnswerOutcome, CandidateReply } from "./candidate-answer.ts";
import { createContext, viewOf } from "./context.ts";
import { answerFollowUp } from "./follow-ups.ts";
import type { FollowUpOutcome } from "./follow-ups.ts";
import type { Context, InterviewListener, InterviewsDependencies } from "./context.ts";
import { start } from "./start-interview.ts";
import type { StartOutcome, StartRequest } from "./start-interview.ts";
import { endInterrupted, finish } from "./endings.ts";
import type { FinishOutcome } from "./endings.ts";
import { createInterviewer } from "./interviewer.ts";
import type { Interviewer } from "./interviewer.ts";
import { debrief, dispute, history, interviewSummary, targetTopicAttempts } from "./records.ts";
import type { AttemptDebrief, DisputeRequest, InterviewSummary } from "./records.ts";
import { createSideThreads } from "./side-threads.ts";
import type { SideThreads } from "./side-threads.ts";

/** How many of a Target's newest Mock interviews the canvas shows. */
const latestCount = 5;

export interface Interviews extends SideThreads {
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
  /**
   * The Debrief of one Attempt with its Grade and the latest Dispute; undefined until the Attempt
   * is recorded.
   */
  readonly attempt: (id: string, attemptId: string) => Promise<AttemptDebrief | undefined>;
  /** Records the Candidate's correction of the Grade; the latest one applies. */
  readonly dispute: (request: DisputeRequest) => Promise<AttemptDebrief | undefined>;
  /** How the Mock interview ended, for its summary Debrief. */
  readonly summary: (id: string) => Promise<InterviewSummary | undefined>;
  /** One page of the Target's session history, from 1, the newest first. */
  readonly history: (request: {
    targetId: string;
    page: number;
    filter: HistoryFilter;
  }) => Promise<HistoryPage>;
  /** The Attempts of the Target's ended Mock interviews, Grades after Disputes, the earliest first. */
  readonly topicAttempts: (targetId: string) => Promise<readonly TopicAttempt[]>;
  /** Marks the Mock interviews that ran when the server last stopped as «прерван». */
  readonly endInterrupted: () => Promise<void>;
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
    attempt: async (id, attemptId) => debrief(dependencies, id, attemptId),
    dispute: async (request) => dispute(context, request),
    summary: async (id) => interviewSummary(dependencies, id),
    history: async (request) => history(dependencies, request),
    topicAttempts: async (targetId) => targetTopicAttempts(dependencies, targetId),
    endInterrupted: async () => endInterrupted(context),
    subscribe: (id, listener) => subscribe(context, id, listener),
    interviewer: createInterviewer(context),
    ...createSideThreads(context),
  };
}
