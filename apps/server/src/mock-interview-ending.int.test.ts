// Seam 1 of spec #41: how a Mock interview ends, through the server's HTTP and WebSocket API with
// real PGlite and the fake ACP agent in its interviewer mode. The server waits 2 minutes for
// `finish_interview` on the injected Timer; the tests run that task by hand.
import { describe, expect, it } from "vitest";

import { temporaryDirectory } from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import {
  cardAt,
  hasQuestions,
  interviewApi,
  isGraded,
  saysWhenIdle,
} from "./interview-test-support.ts";
import type { Interview } from "./interview-test-support.ts";
import { manualTime, minutes } from "./interview-flow-test-support.ts";

/** How long the server waits for `finish_interview` after «Завершить». */
const finishWaitMs = minutes(2);

const isEnded = (status: string) => (view: Interview) => view.status === status;

/** The demo Topic of «Опыт и резюме». */
const experience = "Опыт разработки";

const isWorking = (view: SessionView) => view.status === "working";

type Chat = Awaited<ReturnType<Api["started"]>>["chat"];

/** Keeps the agent in a turn that waits for a cancel, so no template message reaches it. */
async function keepBusy(chat: Chat): Promise<void> {
  chat.send({ type: "prompt", text: "/wait" });
  await chat.waitFor(isWorking);
}

type Api = Awaited<ReturnType<typeof interviewApi>>;

/**
 * Starts on «Опыт и резюме» and answers the first question with the text; resolves once the agent
 * graded it, showed the second question and waits for a prompt.
 */
async function secondQuestionShown(api: Api, text: string) {
  const run = await api.answered(["Опыт и резюме"], text);
  const graded = cardAt(await run.events.waitFor(isGraded(0)), 0);
  await run.events.waitFor(hasQuestions(2));
  await run.chat.waitFor(saysWhenIdle("Ответ получен."));
  return { ...run, graded };
}

/** The summary Debrief of the Mock interview. */
async function summaryOf(api: Api, id: string): Promise<unknown> {
  const response = await api.get(`/api/interviews/${id}/summary`);
  return response.json();
}

/** The Mock interview as the server reads it now. */
async function storedView(api: Api, id: string): Promise<Interview> {
  const response = await api.get(`/api/interviews/${id}`);
  return response.json<Interview>();
}

describe("mock interview ending", () => {
  it("finishes with the agent's summary and the Topic status changes; the unanswered question stays without an answer", async () => {
    const api = await interviewApi();
    const { interview, events } = await secondQuestionShown(api, "Ответ [grade:1]");

    await api.finish(interview.id);

    const done = await events.waitFor(isEnded("finished"));
    expect(cardAt(done, 1)).toMatchObject({ answer: null, attemptId: null });
    await expect(summaryOf(api, interview.id)).resolves.toStrictEqual({
      status: "finished",
      summary: "Фейковый интервьюер: мок завершён.",
      nextStep: "Фейковый интервьюер: повторить темы с низкой оценкой.",
      answered: 1,
      unanswered: 1,
      topicChanges: [
        { id: cardAt(done, 0).topicId, name: experience, before: "not_started", after: "shaky" },
      ],
    });
  });

  it("finishes the mock itself 2 minutes after «Завершить» when the agent does not call finish_interview", async () => {
    const time = manualTime();
    const api = await interviewApi({ timer: time.timer });
    const { interview, events, chat } = await secondQuestionShown(api, "Ответ [grade:2]");
    await keepBusy(chat);
    await api.finish(interview.id);
    await expect(storedView(api, interview.id)).resolves.toMatchObject({ status: "running" });

    await time.fire(finishWaitMs);

    await events.waitFor(isEnded("finished"));
    await expect(summaryOf(api, interview.id)).resolves.toMatchObject({
      status: "finished",
      summary: null,
      nextStep: null,
      answered: 1,
      unanswered: 1,
      topicChanges: [{ name: experience, before: "not_started", after: "shaky" }],
    });
    await expect(api.start([api.sectionId("Проектирование")])).resolves.toMatchObject({
      statusCode: 201,
    });
  });

  it("becomes interrupted when the agent crashes, and keeps its Attempts and their Debriefs", async () => {
    const api = await interviewApi();
    const { interview, events, chat, graded } = await secondQuestionShown(api, "Ответ [grade:3]");

    chat.send({ type: "prompt", text: "/crash" });

    const interrupted = await events.waitFor(isEnded("interrupted"));
    expect(cardAt(interrupted, 0).attemptId).toBe(graded.attemptId);
    await expect(api.debrief(interview.id, graded)).resolves.toMatchObject({ grade: 3 });
    await expect(summaryOf(api, interview.id)).resolves.toMatchObject({
      status: "interrupted",
      answered: 1,
      unanswered: 1,
    });
    await expect(api.start([api.sectionId("Проектирование")])).resolves.toMatchObject({
      statusCode: 201,
    });
  });

  it("becomes interrupted after a server restart, and keeps its Attempts and their Debriefs", async () => {
    const dataDirectory = await temporaryDirectory();
    const before = await interviewApi({ dataDirectory });
    const { interview, events } = await before.answered(["Опыт и резюме"], "Ответ [grade:3]");
    const graded = cardAt(await events.waitFor(isGraded(0)), 0);
    await before.stop();

    const after = await interviewApi({ dataDirectory });

    await expect(storedView(after, interview.id)).resolves.toMatchObject({
      status: "interrupted",
      questions: [{ attemptId: graded.attemptId }],
    });
    await expect(after.debrief(interview.id, graded)).resolves.toMatchObject({ grade: 3 });
    await expect(after.start([after.sectionId("Проектирование")])).resolves.toMatchObject({
      statusCode: 201,
    });
  });
});
