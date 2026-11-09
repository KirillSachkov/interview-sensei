// Seam 1 of spec #80, ticket #82: where a Side thread opens and what its Handoff brief holds. It
// opens at a question card, at an interviewer message or at a Debrief; the brief holds the Grade,
// gaps, justification and strong answer only once the Candidate opened the Debrief.
import { describe, expect, it } from "vitest";

import { browserHeaders, isIdle } from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import { cardNow } from "./interview-flow-test-support.ts";
import {
  ask,
  cardAt,
  hasQuestions,
  interviewApi,
  isGraded,
  saysWhenIdle,
} from "./interview-test-support.ts";
import type { Card } from "./interview-test-support.ts";
import {
  briefIn,
  debriefOrigin,
  openedSideThread,
  openSideThread,
  repliesWith,
} from "./side-thread-test-support.ts";
import type { Origin } from "./side-thread-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

const fakeDebrief = (grade: number) => ({
  grade,
  gaps: "Фейковый интервьюер: не хватает примера из практики.",
  justification: `Фейковый интервьюер поставил оценку из метки в ответе: ${grade}.`,
  strongAnswer: "Фейковый интервьюер: определение, ограничения и пример из практики.",
});

/** The id of the interviewer's chat message with the text. */
function messageId(view: SessionView, text: string): string {
  const entry = view.entries.find((line) => line.type === "agent_message" && line.text === text);
  if (entry === undefined) {
    throw new Error(`No interviewer message «${text}»`);
  }
  return entry.id;
}

/** A Mock interview whose first answer is graded with the Grade; `[last]` shows no next question. */
async function gradedFirst(api: Api, grade: number) {
  const run = await api.answered(["Опыт и резюме"], `Ответ [grade:${grade}] [last]`);
  const card = cardAt(await run.events.waitFor(isGraded(0)), 0);
  return { run, card };
}

/** Records that the Candidate opened the Debrief of the card's Attempt, as the browser does. */
async function openDebrief(api: Api, interviewId: string, card: Card) {
  return api.server.inject({
    method: "POST",
    url: `/api/interviews/${interviewId}/attempts/${card.attemptId}/debrief-opened`,
    headers: browserHeaders(api.server),
  });
}

/** The Handoff brief that the Side thread's agent reads, once it has answered the opening. */
async function briefOf(chat: Awaited<ReturnType<typeof openedSideThread>>["chat"]) {
  await chat.waitFor(isIdle);
  return briefIn(await ask(chat, "/brief", "Фейковый агент прочитал brief"));
}

/** The brief of a new Side thread at the card. */
async function briefAtCard(api: Api, { interviewId, card }: { interviewId: string; card: Card }) {
  const { chat } = await openedSideThread(api, { interviewId, cardId: card.id });
  return briefOf(chat);
}

describe("side thread origins", () => {
  it("opens at an interviewer message beside the current question, with the whole message as the fragment", async () => {
    const api = await interviewApi();
    const { run, card } = await gradedFirst(api, 2);
    const chatView = await run.chat.waitFor(saysWhenIdle("Ответ получен."));
    const id = messageId(chatView, "Ответ получен.");

    const { thread, chat } = await openedSideThread(api, {
      interviewId: run.interview.id,
      origin: { kind: "message", id },
    });

    expect(thread).toMatchObject({
      origin: { kind: "message", id },
      askedQuestionId: card.id,
      fragment: "Ответ получен.",
      hinted: false,
    });
    await expect(briefOf(chat)).resolves.toMatchObject({
      origin: "message",
      question: { number: 1, text: card.text },
      fragment: "Ответ получен.",
    });
  });

  it("opens at an interviewer message on the question that was shown when the message came, without a hint for the next one", async () => {
    const api = await interviewApi();
    const run = await api.answered(["Опыт и резюме"], "Ответ [grade:2]");
    await run.events.waitFor(isGraded(0));
    const shown = await run.events.waitFor(hasQuestions(2));
    const chatView = await run.chat.waitFor(saysWhenIdle("Ответ получен."));

    const { thread } = await openedSideThread(api, {
      interviewId: run.interview.id,
      origin: { kind: "message", id: messageId(chatView, "Ответ получен.") },
    });

    expect(thread).toMatchObject({ askedQuestionId: cardAt(shown, 0).id, hinted: false });
    await expect(cardNow(api, run.interview.id, 1)).resolves.toMatchObject({ hinted: false });
  });

  it("sends the text that the Candidate selected as the fragment", async () => {
    const api = await interviewApi();
    const { run, card } = await gradedFirst(api, 2);

    const { thread, chat } = await openedSideThread(api, {
      interviewId: run.interview.id,
      cardId: card.id,
      fragment: "  самый сложный проект  ",
    });

    expect(thread.fragment).toBe("самый сложный проект");
    await expect(briefOf(chat)).resolves.toMatchObject({ fragment: "самый сложный проект" });
  });

  it("opens at a Debrief and gives the brief its Grade, gaps, justification and strong answer", async () => {
    const api = await interviewApi();
    const { run, card } = await gradedFirst(api, 1);

    const { thread, chat } = await openedSideThread(api, {
      interviewId: run.interview.id,
      origin: debriefOrigin(card),
      question: "Почему 1?",
    });

    expect(thread).toMatchObject({ askedQuestionId: card.id, hinted: false });
    await chat.waitFor(repliesWith("Разбираю вопрос кандидата: «Почему 1?»"));
    await expect(briefOf(chat)).resolves.toMatchObject({
      origin: "debrief",
      debrief: fakeDebrief(1),
      candidateQuestion: "Почему 1?",
    });
  });

  it("refuses an origin that the mock interview does not have", async () => {
    const api = await interviewApi();
    const { run } = await gradedFirst(api, 2);
    const unknown = "00000000-0000-4000-8000-000000000001";
    const open = async (origin: Origin) =>
      openSideThread(api, { interviewId: run.interview.id, origin });

    const debrief = await open({ kind: "debrief", id: unknown });
    expect(debrief.statusCode).toBe(404);
    expect(debrief.json()).toStrictEqual({ error: "attempt_not_found" });
    const message = await open({ kind: "message", id: "agent-999999" });
    expect(message.json()).toStrictEqual({ error: "message_not_found" });
  });
});

describe("side thread brief and the Debrief", () => {
  it("holds no Grade while the Candidate has not opened the Debrief, even after the Debrief was read", async () => {
    const api = await interviewApi();
    const { run, card } = await gradedFirst(api, 3);

    const before = await briefAtCard(api, { interviewId: run.interview.id, card });
    await api.debrief(run.interview.id, card);
    const afterRead = await briefAtCard(api, { interviewId: run.interview.id, card });

    expect(before).toMatchObject({ origin: "question", debrief: null });
    expect(JSON.stringify(before)).not.toMatch(/Фейковый интервьюер/u);
    expect(afterRead).toMatchObject({ debrief: null });
  });

  it("holds the Grade once the Candidate opened the Debrief of the Attempt", async () => {
    const api = await interviewApi();
    const { run, card } = await gradedFirst(api, 3);

    const opened = await openDebrief(api, run.interview.id, card);

    expect(opened.statusCode).toBe(204);
    await expect(briefAtCard(api, { interviewId: run.interview.id, card })).resolves.toMatchObject({
      debrief: fakeDebrief(3),
    });
  });

  it("refuses to record the opening of a Debrief that the mock interview does not have", async () => {
    const api = await interviewApi();
    const { run, card } = await gradedFirst(api, 2);

    const response = await openDebrief(api, run.interview.id, {
      ...card,
      attemptId: "00000000-0000-4000-8000-000000000001",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "attempt_not_found" });
  });

  it("gives the Grade after the Candidate's latest Dispute", async () => {
    const api = await interviewApi();
    const { run, card } = await gradedFirst(api, 1);
    const disputed = await api.server.inject({
      method: "POST",
      url: `/api/interviews/${run.interview.id}/attempts/${card.attemptId}/dispute`,
      headers: browserHeaders(api.server),
      payload: { grade: 3, reason: "Я назвал пример." },
    });
    expect(disputed.statusCode).toBe(200);

    const { chat } = await openedSideThread(api, {
      interviewId: run.interview.id,
      origin: debriefOrigin(card),
    });

    await expect(briefOf(chat)).resolves.toMatchObject({ debrief: { grade: 3 } });
  });
});
