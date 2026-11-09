// Helpers of the Side thread API tests (#80): a Side thread at a question card of a Mock interview,
// and its chat with the fake agent, whose side thread mode answers the server's opening message.
import { browserHeaders, isIdle, openEvents } from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import { cardNow } from "./interview-flow-test-support.ts";
import { cardAt, hasQuestions, lastAgentText } from "./interview-test-support.ts";
import type { interviewApi } from "./interview-test-support.ts";
import { demoWithMock } from "./progress-test-support.ts";

export interface SideThread {
  readonly id: string;
  readonly interviewId: string;
  readonly sessionId: string;
  readonly origin: { readonly kind: string; readonly id: string };
  readonly askedQuestionId: string;
  readonly fragment: string | null;
  readonly question: string | null;
  readonly hinted: boolean;
  readonly createdAt: string;
}

type Api = Awaited<ReturnType<typeof interviewApi>>;

/** Where the Side thread opens: a question card, an interviewer message or a Debrief. */
export interface Origin {
  readonly kind: "question" | "message" | "debrief";
  readonly id: string;
}

/** The origin of the Debrief of the card's Attempt; throws while the card has no Attempt. */
export function debriefOrigin(card: { readonly attemptId: string | null }): Origin {
  if (card.attemptId === null) {
    throw new Error("The card has no Attempt yet");
  }
  return { kind: "debrief", id: card.attemptId };
}

/** What «Обсудить отдельно» sends: the card, or another origin, with an optional fragment and question. */
export interface Opening {
  readonly interviewId: string;
  readonly cardId?: string;
  readonly origin?: Origin;
  readonly fragment?: string;
  readonly question?: string;
}

/** Posts «Обсудить отдельно» at the origin, the card's question by default. */
export async function openSideThread(
  api: Api,
  { interviewId, cardId, origin, fragment, question }: Opening,
) {
  return api.server.inject({
    method: "POST",
    url: `/api/interviews/${interviewId}/side-threads`,
    headers: browserHeaders(api.server),
    payload: {
      origin: origin ?? { kind: "question", id: cardId },
      ...(fragment === undefined ? {} : { fragment }),
      ...(question === undefined ? {} : { question }),
    },
  });
}

/** Opens a Side thread at the card and follows its chat; throws when the server refuses it. */
export async function openedSideThread(api: Api, request: Opening) {
  const response = await openSideThread(api, request);
  if (response.statusCode !== 201) {
    throw new Error(`The Side thread did not open: ${response.statusCode} ${response.body}`);
  }
  const thread = response.json<SideThread>();
  const chat = await openEvents(api.server, thread.sessionId);
  return { thread, chat };
}

/** The chat waits for a prompt and its last agent text starts with the prefix. */
export const repliesWith = (prefix: string) => (view: SessionView) =>
  isIdle(view) && lastAgentText(view).startsWith(prefix);

/** The Handoff brief in the fake agent's reply to `/brief`. */
export function briefIn(text: string): unknown {
  const prefix = "Фейковый агент прочитал brief: ";
  if (!text.startsWith(prefix)) {
    throw new Error(`No brief in: ${text}`);
  }
  return JSON.parse(text.slice(prefix.length));
}

/** Starts a mock interview on «Опыт и резюме» and waits for its first question. */
export async function firstQuestion(api: Api) {
  const run = await api.started(["Опыт и резюме"]);
  const card = cardAt(await run.events.waitFor(hasQuestions(1)), 0);
  return { run, card };
}

/** Opens a Side thread at the first question without a question and waits until it takes prompts. */
export async function threadAtFirstQuestion(api: Api) {
  const { run, card } = await firstQuestion(api);
  const opened = await openedSideThread(api, { interviewId: run.interview.id, cardId: card.id });
  await opened.chat.waitFor(isIdle);
  return { run, card, ...opened };
}

/** The chat's agent works on the Candidate's message with the text. */
export const isWorkingOn = (text: string) => (view: SessionView) =>
  view.status === "working" && view.entries.some((entry) => entry.text === text);

/** The chat waits for a prompt after a turn that the Candidate stopped. */
export const hasStoppedTurn = (view: SessionView) =>
  isIdle(view) && view.entries.some((entry) => entry.type === "turn_interrupted");

/** Whether the Debrief marks its Attempt as received with a hint. */
function hintedOf(debrief: unknown): boolean | undefined {
  return typeof debrief === "object" &&
    debrief !== null &&
    "hinted" in debrief &&
    typeof debrief.hinted === "boolean"
    ? debrief.hinted
    : undefined;
}

/** The hint marks of the Side thread, the card and the Debrief of its Attempt. */
export async function hintMarks(
  api: Api,
  { thread, position }: { thread: SideThread; position: number },
) {
  const card = await cardNow(api, thread.interviewId, position);
  return {
    thread: thread.hinted,
    card: card.hinted,
    attempt: hintedOf(await api.debrief(thread.interviewId, card)),
  };
}

/**
 * The demo Target with a finished Mock interview, as demoWithMock gives it, and a Side thread from
 * the Debrief of its Attempt, for the deletion tests; the thread's agent crashes, so no session of
 * the Target runs.
 */
export async function demoWithSideThread(dataDirectory: string) {
  const api = await demoWithMock(dataDirectory);
  const { chat } = await openedSideThread(api, {
    interviewId: api.interviewId,
    origin: debriefOrigin(api.graded),
    question: "Почему такая оценка?",
  });
  await chat.waitFor(repliesWith("Разбираю вопрос кандидата"));
  chat.send({ type: "prompt", text: "/crash" });
  await chat.waitFor((view) => view.status === "failed");
  return api;
}
