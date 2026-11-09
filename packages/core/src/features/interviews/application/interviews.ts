import { candidateAnswered, candidateFinished } from "../domain/agent-messages.ts";
import type { HistoryFilter, HistoryPage, TopicAttempt } from "../domain/history.ts";
import type { AskedQuestion, Grade, MockInterview } from "../domain/interview.ts";
import { presentedQuestion } from "../domain/interview.ts";
import type { InterviewView } from "../domain/interview-view.ts";
import { change, createContext, tellInterviewer, viewOf } from "./context.ts";
import type { Context, InterviewListener, InterviewsDependencies } from "./context.ts";
import { start } from "./start-interview.ts";
import type { StartOutcome, StartRequest } from "./start-interview.ts";
import { awaitFinish, endInterrupted } from "./endings.ts";
import { createInterviewer } from "./interviewer.ts";
import type { Interviewer } from "./interviewer.ts";
import { debrief, dispute, history, interviewSummary, targetTopicAttempts } from "./records.ts";
import type { AttemptDebrief, InterviewSummary } from "./records.ts";

/** How many of a Target's newest Mock interviews the canvas shows. */
const latestCount = 5;

/**
 * - `no_question`: no question waits for an answer.
 * - `already_answered`: the presented question has the Candidate's answer.
 * - `not_open`: the presented question is a quiz; its answer is a choice of options.
 */
type AnswerOutcome =
  "accepted" | "not_found" | "not_running" | "no_question" | "already_answered" | "not_open";

type FinishOutcome = "accepted" | "not_found" | "not_running";

export interface Interviews {
  /** Starts a Mock interview with the Target's agent as the interviewer. */
  readonly start: (request: StartRequest) => Promise<StartOutcome>;
  readonly view: (id: string) => Promise<InterviewView | undefined>;
  /** The Target's newest Mock interviews, the newest first. */
  readonly latest: (targetId: string) => Promise<readonly InterviewView[]>;
  /** Records the Candidate's free-text answer to the presented question and tells the agent. */
  readonly answer: (id: string, answer: { readonly text: string }) => Promise<AnswerOutcome>;
  /** The Candidate presses «Завершить»: the agent gets the message and calls finish_interview. */
  readonly finish: (id: string) => Promise<FinishOutcome>;
  /**
   * The Debrief of one Attempt with its Grade and the latest Dispute; undefined until the Attempt
   * is recorded.
   */
  readonly attempt: (id: string, attemptId: string) => Promise<AttemptDebrief | undefined>;
  /** Records the Candidate's correction of the Grade; the latest one applies. */
  readonly dispute: (request: {
    id: string;
    attemptId: string;
    grade: Grade;
    reason: string;
  }) => Promise<AttemptDebrief | undefined>;
  /** How the Mock interview ended, for its summary Debrief. */
  readonly summary: (id: string) => Promise<InterviewSummary | undefined>;
  /** One page of the Target's session history, from 1, the newest first. */
  readonly history: (request: {
    targetId: string;
    page: number;
    filter: HistoryFilter;
  }) => Promise<HistoryPage>;
  /** The Attempts of the Target with their Grades after Disputes, the earliest first. */
  readonly topicAttempts: (targetId: string) => Promise<readonly TopicAttempt[]>;
  /** Marks the Mock interviews that ran when the server last stopped as «прерван». */
  readonly endInterrupted: () => Promise<void>;
  /** Calls the listener after each change of the Mock interview; returns the unsubscribe. */
  readonly subscribe: (id: string, listener: InterviewListener) => () => void;
  /** What the interviewer's MCP tools do; each acts on the Mock interview of its session. */
  readonly interviewer: Interviewer;
}

/** Why the Mock interview takes no answer now, or null when it takes one. */
function notAnswerable(interview: MockInterview | undefined): "not_found" | "not_running" | null {
  if (interview === undefined) {
    return "not_found";
  }
  return interview.status !== "running" || interview.finishRequestedAt !== null
    ? "not_running"
    : null;
}

/** The presented question that takes a free-text answer now, or why there is none. */
async function openQuestion(
  { repository }: InterviewsDependencies,
  interview: MockInterview,
): Promise<AskedQuestion | Exclude<AnswerOutcome, "accepted">> {
  const [asked, attempts] = await Promise.all([
    repository.asked(interview.id),
    repository.attempts(interview.id),
  ]);
  const presented = presentedQuestion(asked, attempts);
  if (presented === undefined) {
    return "no_question";
  }
  if (presented.answer !== null) {
    return "already_answered";
  }
  return presented.format === "open" ? presented : "not_open";
}

async function answer(context: Context, id: string, { text }: { text: string }) {
  const { repository, clock } = context.dependencies;
  return change(context, id, async (): Promise<AnswerOutcome> => {
    const interview = await repository.get(id);
    const refusal = notAnswerable(interview);
    if (refusal !== null || interview === undefined) {
      return refusal ?? "not_found";
    }
    const question = await openQuestion(context.dependencies, interview);
    if (typeof question === "string") {
      return question;
    }
    await repository.answer(question.id, {
      text,
      optionIds: [],
      skipped: false,
      answeredAt: clock.now().toISOString(),
    });
    tellInterviewer(context, interview.sessionId, candidateAnswered(text));
    return "accepted";
  });
}

async function finish(context: Context, id: string) {
  const { repository, clock } = context.dependencies;
  return change(context, id, async (): Promise<FinishOutcome> => {
    const interview = await repository.get(id);
    if (interview === undefined) {
      return "not_found";
    }
    if (interview.status !== "running") {
      return "not_running";
    }
    if (interview.finishRequestedAt === null) {
      await repository.update(id, { finishRequestedAt: clock.now().toISOString() });
      tellInterviewer(context, interview.sessionId, candidateFinished);
      awaitFinish(context, interview);
    }
    return "accepted";
  });
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
    answer: async (id, request) => answer(context, id, request),
    finish: async (id) => finish(context, id),
    attempt: async (id, attemptId) => debrief(dependencies, id, attemptId),
    dispute: async (request) => dispute(context, request),
    summary: async (id) => interviewSummary(dependencies, id),
    history: async (request) => history(dependencies, request),
    topicAttempts: async (targetId) => targetTopicAttempts(dependencies, targetId),
    endInterrupted: async () => endInterrupted(context),
    subscribe: (id, listener) => subscribe(context, id, listener),
    interviewer: createInterviewer(context),
  };
}
