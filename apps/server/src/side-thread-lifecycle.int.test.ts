// Seam 1 of spec #80, ticket #82: the life of Side threads. Several of them stack at one question;
// ✕ deletes one with its journal for good and the hint mark stays; the Debrief of a past session
// opens one; after a restart they stay readable and take no messages.
import { describe, expect, it } from "vitest";

import { browserHeaders, isIdle, openEvents, temporaryDirectory } from "./chat-test-support.ts";
import { cardNow } from "./interview-flow-test-support.ts";
import { ask, cardAt, interviewApi, isGraded, lastAgentText } from "./interview-test-support.ts";
import type { Interview } from "./interview-test-support.ts";
import { demoWithMock } from "./progress-test-support.ts";
import {
  debriefOrigin,
  firstQuestion,
  hintMarks,
  isWorkingOn,
  openSideThread,
  openedSideThread,
  repliesWith,
} from "./side-thread-test-support.ts";
import type { SideThread } from "./side-thread-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

async function deleteSideThread(
  api: Api,
  { interviewId, id }: Pick<SideThread, "interviewId" | "id">,
) {
  return api.server.inject({
    method: "DELETE",
    url: `/api/interviews/${interviewId}/side-threads/${id}`,
    headers: browserHeaders(api.server),
  });
}

async function listed(api: Api, interviewId: string) {
  const response = await api.get(`/api/interviews/${interviewId}/side-threads`);
  return response.json<SideThread[]>();
}

const isFinished = (view: Interview) => view.status === "finished";

/** A side thread before the first answer whose agent is in a `/wait` turn until it is stopped. */
async function busyThreadBeforeAnswer(api: Api) {
  const { run, card } = await firstQuestion(api);
  const { thread, chat } = await openedSideThread(api, {
    interviewId: run.interview.id,
    cardId: card.id,
  });
  await chat.waitFor(isIdle);
  chat.send({ type: "prompt", text: "/wait" });
  await chat.waitFor(isWorkingOn("/wait"));
  return { run, thread };
}

/** Answers the first question and waits for its Attempt. */
async function answerFirst(api: Api, run: Awaited<ReturnType<typeof firstQuestion>>["run"]) {
  await api.answer(run.interview.id, "Ответ [grade:3]");
  await run.events.waitFor(isGraded(0));
}

describe("side thread deletion", () => {
  it("deletes the side thread and its journal for good, even while its agent works, and the hint mark stays", async () => {
    const api = await interviewApi();
    const { run, thread } = await busyThreadBeforeAnswer(api);

    const deleted = await deleteSideThread(api, thread);

    expect(deleted.statusCode).toBe(204);
    await expect(listed(api, run.interview.id)).resolves.toStrictEqual([]);
    await expect(api.get(`/api/sessions/${thread.sessionId}`)).resolves.toMatchObject({
      statusCode: 404,
    });
    await run.events.waitFor((view) => view.sideThreads.length === 0);
    await answerFirst(api, run);
    await expect(hintMarks(api, { thread, position: 0 })).resolves.toMatchObject({
      card: true,
      attempt: true,
    });
  });

  it("refuses to delete a side thread that the mock interview does not have", async () => {
    const api = await interviewApi();
    const { run } = await firstQuestion(api);

    const response = await deleteSideThread(api, {
      interviewId: run.interview.id,
      id: "00000000-0000-4000-8000-000000000001",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "side_thread_not_found" });
  });
});

describe("several side threads", () => {
  it("keeps the side threads of one question in the order they were opened, each with its own agent", async () => {
    const api = await interviewApi();
    const { run, card } = await firstQuestion(api);
    const open = async (question: string) =>
      openedSideThread(api, { interviewId: run.interview.id, cardId: card.id, question });

    const first = await open("Первый вопрос");
    const second = await open("Второй вопрос");

    await first.chat.waitFor(repliesWith("Разбираю вопрос кандидата: «Первый вопрос»"));
    await second.chat.waitFor(repliesWith("Разбираю вопрос кандидата: «Второй вопрос»"));
    expect(first.thread.sessionId).not.toBe(second.thread.sessionId);
    await expect(listed(api, run.interview.id)).resolves.toStrictEqual([
      first.thread,
      second.thread,
    ]);
  });
});

/** Waits until the Side thread's agent is in a `/wait` turn, which goes on until it is stopped. */
async function keepWorking({ chat }: Awaited<ReturnType<typeof openedSideThread>>) {
  await chat.waitFor(isIdle);
  chat.send({ type: "prompt", text: "/wait" });
  await chat.waitFor(isWorkingOn("/wait"));
}

/** Archives the Target as the Candidate does with «В архив». */
async function archiveTarget(api: Api) {
  return api.server.inject({
    method: "POST",
    url: `/api/targets/${api.target.id}/archive`,
    headers: browserHeaders(api.server),
  });
}

/** The status of the Side thread's AgentSession as the API gives it. */
async function sessionStatus(api: Api, thread: SideThread) {
  const response = await api.get(`/api/sessions/${thread.sessionId}`);
  return response.json<{ status: string }>().status;
}

describe("side threads when the mock interview finishes", () => {
  it("closes a side thread whose agent waits for a message, and a working one goes on", async () => {
    const api = await interviewApi();
    const { run, card } = await firstQuestion(api);
    const opening = { interviewId: run.interview.id, cardId: card.id };
    const [waiting, working] = await Promise.all([
      openedSideThread(api, opening),
      openedSideThread(api, opening),
    ]);
    await Promise.all([waiting.chat.waitFor(isIdle), keepWorking(working)]);

    await answerFirst(api, run);

    await api.finish(run.interview.id);

    await run.events.waitFor(isFinished);
    await waiting.chat.waitFor((view) => view.status === "ended");
    await expect(sessionStatus(api, working.thread)).resolves.toBe("working");
  });
});

/** A finished Mock interview whose first question has its Attempt. */
async function endedWithAttempt(api: Api) {
  const run = await api.answered(["Опыт и резюме"], "Ответ [grade:2]");
  await run.events.waitFor(isGraded(0));
  await api.finish(run.interview.id);
  const ended = await run.events.waitFor(isFinished);
  return { run, graded: cardAt(ended, 0) };
}

/** A side thread on a server over the data directory that answered twice, then the server stops. */
async function threadBeforeRestart(dataDirectory: string) {
  const before = await interviewApi({ dataDirectory });
  const { run, card } = await firstQuestion(before);
  const { thread, chat } = await openedSideThread(before, {
    interviewId: run.interview.id,
    cardId: card.id,
    question: "Что такое вклад?",
  });
  await chat.waitFor(repliesWith("Разбираю вопрос кандидата"));
  await ask(chat, "Ещё", "Фейковый агент получил");
  await before.stop();
  return thread;
}

describe("side threads of past sessions", () => {
  it("opens a side thread from the Debrief of an ended mock interview, without a hint", async () => {
    const api = await interviewApi();
    const { run, graded } = await endedWithAttempt(api);

    const { thread } = await openedSideThread(api, {
      interviewId: run.interview.id,
      origin: debriefOrigin(graded),
    });

    expect(thread).toMatchObject({ askedQuestionId: graded.id, hinted: false });
    const view = await api.get(`/api/interviews/${run.interview.id}`);
    expect(view.json<Interview>().sideThreads).toMatchObject([{ id: thread.id }]);
    await expect(cardNow(api, run.interview.id, 0)).resolves.toMatchObject({ hinted: false });
  });

  it("refuses a side thread on an archived Target, as other new sessions of the Target", async () => {
    const api = await demoWithMock();
    await api.server.inject({
      method: "POST",
      url: `/api/targets/${api.target.id}/archive`,
      headers: browserHeaders(api.server),
    });

    const response = await openSideThread(api, {
      interviewId: api.interviewId,
      origin: debriefOrigin(api.graded),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "target_archived" });
    await expect(listed(api, api.interviewId)).resolves.toStrictEqual([]);
  });

  it("archives the Target while a side thread's agent works: the side thread stops and stays readable", async () => {
    const api = await demoWithMock();
    const opened = await openedSideThread(api, {
      interviewId: api.interviewId,
      origin: debriefOrigin(api.graded),
    });
    await keepWorking(opened);

    const response = await archiveTarget(api);

    expect(response.statusCode).toBe(200);
    await opened.chat.waitFor((view) => view.status === "ended");
    await expect(listed(api, api.interviewId)).resolves.toStrictEqual([opened.thread]);
    await expect(sessionStatus(api, opened.thread)).resolves.toBe("ended");
  });

  it("keeps side threads readable after a restart, and they take no more messages", async () => {
    const dataDirectory = await temporaryDirectory();
    const thread = await threadBeforeRestart(dataDirectory);

    const after = await interviewApi({ dataDirectory });

    await expect(listed(after, thread.interviewId)).resolves.toStrictEqual([thread]);
    const reopened = await openEvents(after.server, thread.sessionId);
    const view = await reopened.waitFor((entry) => entry.status === "ended");
    expect(lastAgentText(view)).toBe("Фейковый агент получил: «Ещё»");
    reopened.send({ type: "prompt", text: "Можно продолжить?" });
    await expect(reopened.nextReply()).resolves.toStrictEqual({
      type: "prompt_rejected",
      reason: "closed",
    });
  });
});
