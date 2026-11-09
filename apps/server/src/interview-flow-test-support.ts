// Helpers of the full interview flow tests (#53): the Candidate's other answers and a clock and
// timer that the test moves by hand.
import type { Clock, Timer } from "@interview-sensei/core/time";
import type { FastifyInstance } from "fastify";

import { browserHeaders, fixedTime } from "./chat-test-support.ts";
import { cardAt, hasQuestions, interviewApi } from "./interview-test-support.ts";
import type { Card, Interview } from "./interview-test-support.ts";

/**
 * A clock that stands until the test moves it, and a timer whose delayed tasks run only when the
 * test fires them. Repeated work, such as database dumps, never runs.
 */
export function manualTime() {
  let now = new Date(fixedTime).getTime();
  const pending: { delayMs: number; task: () => void }[] = [];
  let scheduled = Promise.withResolvers<null>();
  const clock: Clock = { now: () => new Date(now) };
  const timer: Timer = {
    repeat: () => () => {},
    after: (delayMs, task) => {
      const entry = { delayMs, task };
      pending.push(entry);
      scheduled.resolve(null);
      scheduled = Promise.withResolvers<null>();
      return () => {
        const index = pending.indexOf(entry);
        if (index !== -1) {
          pending.splice(index, 1);
        }
      };
    },
  };
  /** Waits until a task with the delay is scheduled, then runs it. */
  const fire = async (delayMs: number): Promise<void> => {
    const entry = pending.find((candidate) => candidate.delayMs === delayMs);
    if (entry === undefined) {
      await scheduled.promise;
      return fire(delayMs);
    }
    pending.splice(pending.indexOf(entry), 1);
    entry.task();
  };
  /** Moves the clock forward. */
  const pass = (ms: number) => {
    now += ms;
  };
  return { clock, timer, fire, pass };
}

export const minutes = (count: number) => count * 60_000;

/** Posts the Candidate's action on the Mock interview as the browser does. */
async function candidatePost(
  server: FastifyInstance,
  { id, action, payload }: { id: string; action: string; payload: object },
) {
  return server.inject({
    method: "POST",
    url: `/api/interviews/${id}/${action}`,
    headers: browserHeaders(server),
    payload,
  });
}

/** The card's quiz options whose text is in the bank's correct options of its Question. */
export function correctOptions(
  card: Card,
  bank: readonly { id: string; correctOptionIds: readonly string[] }[],
): string[] {
  const question = bank.find((entry) => entry.id === card.questionId);
  if (question === undefined) {
    throw new Error(`The Question ${card.questionId} is not in the bank`);
  }
  return [...question.correctOptionIds];
}

/** The view has a quiz card at the position. */
const hasQuizAt = (position: number) => (view: Interview) =>
  view.questions[position]?.format === "quiz";

type Api = Awaited<ReturnType<typeof interviewApi>>;

/** Posts the Candidate's answer to the presented question: `{ text }`, `{ optionIds }` or `{ skipped }`. */
export async function answerWith(api: Api, id: string, payload: object) {
  return candidatePost(api.server, { id, action: "answer", payload });
}

/** Posts the Candidate's answer to the agent's last Follow-up. */
export async function answerFollowUp(api: Api, id: string, text: string) {
  return candidatePost(api.server, { id, action: "follow-up", payload: { text } });
}

/** The Mock interview's card at the position as the server shows it now. */
export async function cardNow(api: Api, id: string, position: number): Promise<Card> {
  const response = await api.get(`/api/interviews/${id}`);
  return cardAt(response.json<Interview>(), position);
}

/** Starts on «TypeScript и Node.js», answers the first question and waits for a quiz after it. */
export async function quizShown(api: Api) {
  const run = await api.answered(["TypeScript и Node.js"], "Ответ [grade:2] [quiz]");
  const quiz = cardAt(await run.events.waitFor(hasQuizAt(1)), 1);
  return { ...run, quiz };
}

/** The first card has at least the count of Follow-ups. */
export const followUpsOf = (count: number) => (view: Interview) =>
  (view.questions[0]?.followUps.length ?? 0) >= count;

/** Waits for the Follow-up with the number, from 1, then answers it. */
export async function answerFollowUpNumber(
  api: Api,
  run: {
    interview: { id: string };
    events: { waitFor: (matches: (view: Interview) => boolean) => Promise<Interview> };
  },
  { number, text }: { number: number; text: string },
) {
  await run.events.waitFor(followUpsOf(number));
  return answerFollowUp(api, run.interview.id, text);
}

/** A Mock interview with a 30-minute limit on a clock and timer the test moves, at its question. */
export async function limitedInterview() {
  const time = manualTime();
  const api = await interviewApi({ clock: time.clock, timer: time.timer });
  const run = await api.started(["Опыт и резюме"], { limitMinutes: 30 });
  await run.events.waitFor(hasQuestions(1));
  return { ...run, api, time };
}
