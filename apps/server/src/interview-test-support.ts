// Helpers of the Mock interview API tests: the demo Target on a server with the fake agent, whose
// interviewer mode answers the server's template messages through our MCP tools.
import type { FastifyInstance } from "fastify";
import { onTestFinished } from "vitest";

import { agentTexts, browserHeaders, isIdle, openEvents } from "./chat-test-support.ts";
import type { ServerOptions, SessionView } from "./chat-test-support.ts";
import { demoApi } from "./model-test-support.ts";
import type { TargetView } from "./model-test-support.ts";

export interface Card {
  readonly id: string;
  readonly questionId: string;
  readonly topicId: string;
  readonly sectionId: string;
  readonly text: string;
  readonly format: string;
  readonly options: readonly { id: string; text: string }[];
  readonly parentAttemptId: string | null;
  readonly answer: {
    text: string | null;
    optionIds: readonly string[];
    skipped: boolean;
    answeredAt: string;
  } | null;
  readonly followUps: readonly { question: string; answer: string | null; askedAt: string }[];
  readonly attemptId: string | null;
}

export interface Interview {
  readonly id: string;
  readonly targetId: string;
  readonly sessionId: string;
  readonly status: string;
  readonly sectionIds: readonly string[];
  readonly currentSectionId: string | null;
  readonly limitMinutes: number | null;
  readonly difficulty: string;
  readonly endsAt: string | null;
  readonly overtime: boolean;
  readonly finishRequestedAt: string | null;
  readonly summary: string | null;
  readonly nextStep: string | null;
  readonly questions: readonly Card[];
}

function isInterviewMessage(message: unknown): message is { interview: Interview } {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "interview"
  );
}

/** Opens the Mock interview's socket and keeps every message it sends, as the browser gets them. */
async function followInterview(server: FastifyInstance, id: string) {
  const views: Interview[] = [];
  const raw: string[] = [];
  let received = Promise.withResolvers<null>();
  const socket = await server.injectWS(
    `/api/interviews/${id}/events`,
    { headers: browserHeaders(server) },
    {
      onInit: (ws) => {
        ws.on("message", (data: Buffer) => {
          const text = data.toString("utf8");
          raw.push(text);
          const message: unknown = JSON.parse(text);
          if (isInterviewMessage(message)) {
            views.push(message.interview);
          }
          received.resolve(null);
          received = Promise.withResolvers<null>();
        });
      },
    },
  );
  onTestFinished(() => {
    socket.terminate();
  });
  /** Resolves with the first view, already received or later, that matches. */
  const waitFor = async (matches: (view: Interview) => boolean): Promise<Interview> => {
    const found = views.find((view) => matches(view));
    if (found !== undefined) {
      return found;
    }
    await received.promise;
    return waitFor(matches);
  };
  return { views, raw, waitFor };
}

export const hasQuestions = (count: number) => (view: Interview) => view.questions.length >= count;
export const isGraded = (position: number) => (view: Interview) =>
  view.questions[position] !== undefined && view.questions[position].attemptId !== null;

/** The card at the position; throws when the view has none there. */
export function cardAt(view: Interview, position: number): Card {
  const card = view.questions[position];
  if (card === undefined) {
    throw new Error(`No question at ${position}`);
  }
  return card;
}

export const lastAgentText = (view: SessionView) => agentTexts(view).at(-1) ?? "";

/** The chat waits for a prompt and some agent text contains the fragment. */
export const saysWhenIdle = (fragment: string) => (view: SessionView) =>
  isIdle(view) && agentTexts(view).some((text) => text.includes(fragment));

/** The chat waits for a prompt after the agent's turn on the Candidate's chat message. */
export const repliedTo = (text: string) => (view: SessionView) =>
  isIdle(view) && view.entries.some((entry) => entry.text === text);

/** The first agent text with the fragment, or an empty text. */
export const agentTextWith = (view: SessionView, fragment: string) =>
  agentTexts(view).find((text) => text.includes(fragment)) ?? "";

/** Every agent text the browser got over the session's socket. */
export const everyAgentText = (views: readonly SessionView[]) =>
  views.flatMap((view) => agentTexts(view));

type Chat = Awaited<ReturnType<typeof openEvents>>;

/** Sends a chat command and resolves with the agent's reply that starts with the prefix. */
export async function ask(chat: Chat, command: string, prefix: string): Promise<string> {
  chat.send({ type: "prompt", text: command });
  const replied = await chat.waitFor(
    (view) => isIdle(view) && lastAgentText(view).startsWith(prefix),
  );
  return lastAgentText(replied);
}

/** The chat waits for a prompt after the agent's first text. */
export const hasSpoken = (view: SessionView) => isIdle(view) && agentTexts(view).length > 0;

/** The demo Section with the name; throws when there is none. */
export function sectionNamed(target: TargetView, name: string): TargetView["sections"][number] {
  const section = target.sections.find((entry) => entry.name === name);
  if (section === undefined) {
    throw new Error(`No demo Section ${name}`);
  }
  return section;
}

/** The limit and the difficulty of a start; the server's defaults without them. */
interface StartSettings {
  readonly limitMinutes?: unknown;
  readonly difficulty?: string;
}

/** The Debrief of the card's Attempt. */
async function debriefOf(server: FastifyInstance, { id, card }: { id: string; card: Card }) {
  const response = await server.inject({
    url: `/api/interviews/${id}/attempts/${card.attemptId}`,
    headers: browserHeaders(server),
  });
  return response.json<unknown>();
}

/**
 * The demo Target on a server with the fake agent, and the Mock interview API on it. A data
 * directory of an earlier server keeps its demo Target.
 */
export async function interviewApi({
  dataDirectory,
  ...options
}: ServerOptions & { dataDirectory?: string } = {}) {
  const api = await demoApi(dataDirectory, options);
  const { server, target } = api;
  const headers = browserHeaders(server);
  const post = async (url: string, payload?: object) =>
    server.inject({ method: "POST", url, headers, ...(payload === undefined ? {} : { payload }) });
  /** Starts a Mock interview; the settings are the limit and the difficulty. */
  const start = async (sectionIds: readonly string[], settings: StartSettings = {}) =>
    post(`/api/targets/${target.id}/interviews`, { sectionIds, ...settings });
  const sectionId = (name: string) => sectionNamed(target, name).id;
  /** Starts a Mock interview on the Sections and follows it and its interviewer chat. */
  const started = async (names: readonly string[], settings: StartSettings = {}) => {
    const response = await start(
      names.map((name) => sectionId(name)),
      settings,
    );
    if (response.statusCode !== 201) {
      throw new Error(`The start failed: ${response.statusCode} ${response.body}`);
    }
    const interview = response.json<Interview>();
    const events = await followInterview(server, interview.id);
    const chat = await openEvents(server, interview.sessionId);
    return { interview, events, chat };
  };
  const answer = async (id: string, text: string) => post(`/api/interviews/${id}/answer`, { text });
  /** Starts on the Sections, waits for the first question and answers it with the text. */
  const answered = async (names: readonly string[], text: string) => {
    const run = await started(names);
    const card = cardAt(await run.events.waitFor(hasQuestions(1)), 0);
    const response = await answer(run.interview.id, text);
    return { ...run, card, response };
  };
  return {
    ...api,
    start,
    sectionId,
    started,
    answer,
    answered,
    finish: async (id: string) => post(`/api/interviews/${id}/finish`),
    debrief: async (id: string, card: Card) => debriefOf(server, { id, card }),
  };
}
