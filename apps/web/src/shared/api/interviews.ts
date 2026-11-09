// The Mock interview API of the server. The view never holds a Grade: it comes only with the
// Debrief of an Attempt.
import { checked, isObject, path, sent } from "./http";
import type { SideThread } from "./side-threads";
import { fetchTarget } from "./targets";
import type { PlanSection } from "./targets";

/** The Candidate's answer as the server recorded it. */
interface CandidateAnswer {
  readonly text: string | null;
  readonly optionIds: readonly string[];
  readonly skipped: boolean;
  readonly answeredAt: string;
}

/** A question the interviewer showed, as a card. */
export interface QuestionCard {
  readonly id: string;
  readonly questionId: string;
  readonly topicId: string;
  readonly sectionId: string;
  readonly text: string;
  readonly format: "open" | "quiz";
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly parentAttemptId: string | null;
  readonly presentedAt: string;
  readonly answer: CandidateAnswer | null;
  /** The interviewer's clarifications of the answer; the last one may wait for its answer. */
  readonly followUps: readonly FollowUp[];
  /** Set once the interviewer recorded the Attempt: the Debrief is ready. */
  readonly attemptId: string | null;
  /** A Side thread opened before the answer: the Attempt is received with a hint. */
  readonly hinted: boolean;
  /**
   * How many interviewer chat entries came before the question; null for a question from before
   * Side threads, which counts from the chat's start.
   */
  readonly chatPosition: number | null;
}

interface FollowUp {
  readonly question: string;
  readonly answer: string | null;
  readonly askedAt: string;
}

/** How the Candidate shifts the level of the questions: «легче», «как есть», «сложнее». */
export type Difficulty = "easier" | "as_is" | "harder";

export interface InterviewView {
  readonly id: string;
  readonly targetId: string;
  /** The interviewer's AgentSession: its chat goes over the session's socket. */
  readonly sessionId: string;
  readonly agent: string;
  /** «прерван» only for Mock interviews from before pauses. */
  readonly status: "running" | "paused" | "finished" | "interrupted";
  /** Why it is paused: «Пауза», a crash of its agent, or a stop of the app; null while it runs. */
  readonly pauseReason: "candidate" | "agent_failed" | "server_stopped" | null;
  readonly sectionIds: readonly string[];
  readonly currentSectionId: string | null;
  /** Null without a limit. */
  readonly limitMinutes: number | null;
  readonly difficulty: Difficulty;
  readonly startedAt: string;
  /** When the limit ends while it runs; null without a limit or on a pause. */
  readonly endsAt: string | null;
  /** The time left before the limit, below 0 in overtime; on a pause it stands still. */
  readonly timeLeftMs: number | null;
  /** Past the limit the interview goes on until the Candidate finishes it. */
  readonly overtime: boolean;
  readonly finishRequestedAt: string | null;
  readonly finishedAt: string | null;
  readonly summary: string | null;
  readonly nextStep: string | null;
  readonly questions: readonly QuestionCard[];
  /** The Side threads in the order they were opened. */
  readonly sideThreads: readonly SideThread[];
}

/** The Debrief of one Attempt. */
export interface AttemptDebrief {
  readonly id: string;
  readonly grade: number;
  /** `skip` for «Не знаю». */
  readonly gradedBy: "agent" | "quiz" | "skip";
  readonly gaps: string;
  readonly justification: string;
  readonly strongAnswer: string;
  /** The Candidate got a hint in a Side thread before answering. */
  readonly hinted: boolean;
  /** The Candidate's latest Dispute: its Grade applies instead of `grade`. */
  readonly dispute: { readonly grade: number; readonly reason: string } | null;
}

/** The server builds the view; the web app checks only that it got one. */
function isInterviewView(value: unknown): value is InterviewView {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.questions)
  );
}

function isDebrief(value: unknown): value is AttemptDebrief {
  return isObject(value) && typeof value.grade === "number" && typeof value.gaps === "string";
}

function postJson(url: string, body?: object) {
  return fetch(url, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

/** The Target's five newest Mock interviews, the newest first. */
export async function fetchLatestInterviews(targetId: string): Promise<InterviewView[]> {
  return checked(
    await fetch(`/api/targets/${path(targetId)}/interviews`),
    (value): value is InterviewView[] =>
      Array.isArray(value) && value.every((item: unknown) => isInterviewView(item)),
  );
}

/** The Sections of the Target's plan in order. */
export async function fetchPlanSections(targetId: string): Promise<readonly PlanSection[]> {
  const target = await fetchTarget(targetId);
  if (target === null) {
    throw new Error("цель не найдена");
  }
  return target.sections;
}

/** What the Candidate chose in «Начать мок». */
export interface StartSettings {
  readonly sectionIds: readonly string[];
  readonly limitMinutes: number | null;
  readonly difficulty: Difficulty;
}

/** Starts a Mock interview; the error says in Russian why it did not start. */
export async function startInterview(
  targetId: string,
  settings: StartSettings,
): Promise<InterviewView> {
  return checked(
    await postJson(`/api/targets/${path(targetId)}/interviews`, settings),
    isInterviewView,
  );
}

/** The answer to the presented question: free text, the chosen quiz options or «Не знаю». */
type CandidateReply =
  | { readonly text: string }
  | { readonly optionIds: readonly string[] }
  | { readonly skipped: true };

export async function answerQuestion(interviewId: string, reply: CandidateReply): Promise<void> {
  await sent(await postJson(`/api/interviews/${path(interviewId)}/answer`, reply));
}

/** The answer to the interviewer's last Follow-up. */
export async function answerFollowUp(interviewId: string, text: string): Promise<void> {
  await sent(await postJson(`/api/interviews/${path(interviewId)}/follow-up`, { text }));
}

/** «Пауза»: the timer stops and the interviewer's session ends. */
export async function pauseInterview(interviewId: string): Promise<void> {
  await sent(await postJson(`/api/interviews/${path(interviewId)}/pause`));
}

/**
 * The agent of the paused Mock interview cannot go on with it; the message says why in Russian.
 * `targetAgent` is the Target's agent the Candidate may go on with, or null.
 */
export class AgentUnavailableError extends Error {
  readonly targetAgent: string | null;

  constructor(message: string, targetAgent: string | null) {
    super(message);
    this.name = "AgentUnavailableError";
    this.targetAgent = targetAgent;
  }
}

/** The refusal of «Продолжить» because of the agent, from the body of a 409. */
async function unavailableAgent(response: Response): Promise<AgentUnavailableError | null> {
  if (response.status !== 409) {
    return null;
  }
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  return isObject(body) && body.error === "agent_unavailable" && typeof body.message === "string"
    ? new AgentUnavailableError(
        body.message,
        typeof body.targetAgent === "string" ? body.targetAgent : null,
      )
    : null;
}

/**
 * «Продолжить»: a new interviewer session goes on with the paused Mock interview, with its agent or
 * the chosen `agent` of the Target. Throws AgentUnavailableError when the agent cannot run.
 */
export async function resumeInterview(interviewId: string, agent?: string): Promise<InterviewView> {
  const response = await postJson(
    `/api/interviews/${path(interviewId)}/resume`,
    agent === undefined ? {} : { agent },
  );
  const unavailable = await unavailableAgent(response);
  if (unavailable !== null) {
    throw unavailable;
  }
  return checked(response, isInterviewView);
}

export async function finishInterview(interviewId: string): Promise<void> {
  await sent(await postJson(`/api/interviews/${path(interviewId)}/finish`));
}

/** The Candidate opened the Debrief: Side threads on its question learn the Grade from now on. */
export async function recordDebriefOpened(interviewId: string, attemptId: string): Promise<void> {
  await sent(
    await postJson(
      `/api/interviews/${path(interviewId)}/attempts/${path(attemptId)}/debrief-opened`,
    ),
  );
}

export async function fetchDebrief(
  interviewId: string,
  attemptId: string,
): Promise<AttemptDebrief> {
  return checked(
    await fetch(`/api/interviews/${path(interviewId)}/attempts/${path(attemptId)}`),
    isDebrief,
  );
}

/** Reads one message of the Mock interview's socket; null for another message. */
export function interviewMessage(data: unknown): InterviewView | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    const message: unknown = JSON.parse(data);
    return isObject(message) && message.type === "interview" && isInterviewView(message.interview)
      ? message.interview
      : null;
  } catch {
    return null;
  }
}

/** The WebSocket address of the Mock interview's changes, on the page's own host. */
export function interviewEventsUrl(interviewId: string): string {
  const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${globalThis.location.host}/api/interviews/${path(interviewId)}/events`;
}

/** One Mock interview, such as one the Candidate opens from the session history. */
export async function fetchInterview(interviewId: string): Promise<InterviewView> {
  return checked(await fetch(`/api/interviews/${path(interviewId)}`), isInterviewView);
}
