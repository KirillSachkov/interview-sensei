// Spec #83, seam 1, ticket #85: «Продолжить» in a Side thread whose agent is gone after a restart or
// a crash. A new session of the Side thread goes on with the Handoff brief and the thread's earlier
// messages in its `get_brief`; its chat starts with the earlier one, and the hint mark stays as the
// opening set it. When the Mock interview's agent is unavailable, the thread goes on with the
// Target's agent. A Side thread the server closed (#80) stays readable and does not go on.
import { describe, expect, it } from "vitest";

import { browserHeaders, isIdle, openEvents, temporaryDirectory } from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import { ask, interviewApi } from "./interview-test-support.ts";
import { pauseApi, storeAgent } from "./pause-test-support.ts";
import {
  briefIn,
  firstQuestion,
  hintMarks,
  openedSideThread,
  repliesWith,
} from "./side-thread-test-support.ts";
import type { SideThread } from "./side-thread-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

/** «Продолжить» in the Side thread, with the agent the Candidate chose when its own is unavailable. */
async function continueThread(api: Api, { interviewId, id }: SideThread, payload: object = {}) {
  return api.server.inject({
    method: "POST",
    url: `/api/interviews/${interviewId}/side-threads/${id}/continue`,
    headers: browserHeaders(api.server),
    payload,
  });
}

/** «Продолжить» that succeeds: the Side thread with its new session. */
async function continued(api: Api, thread: SideThread, payload: object = {}): Promise<SideThread> {
  const response = await continueThread(api, thread, payload);
  if (response.statusCode !== 200) {
    throw new Error(`The Side thread did not continue: ${response.statusCode} ${response.body}`);
  }
  return response.json<SideThread>();
}

/**
 * A Side thread at the first question before its answer, with the Candidate's question and one
 * more message, on a server over the data directory that then stops.
 */
async function threadBeforeRestart(dataDirectory: string) {
  const before = await interviewApi({ dataDirectory });
  const { run, card } = await firstQuestion(before);
  const { thread, chat } = await openedSideThread(before, {
    interviewId: run.interview.id,
    cardId: card.id,
    question: "Что такое вклад?",
  });
  await chat.waitFor(repliesWith("Разбираю вопрос кандидата"));
  await ask(chat, "Ещё пример", "Фейковый агент получил");
  await before.stop();
  return thread;
}

/** «Продолжить» after a restart, once the new agent has read the brief and spoken. */
async function continuedAfterRestart() {
  const dataDirectory = await temporaryDirectory();
  const thread = await threadBeforeRestart(dataDirectory);
  const after = await interviewApi({ dataDirectory });
  const next = await continued(after, thread);
  const chat = await openEvents(after.server, next.sessionId);
  const view = await chat.waitFor(repliesWith("Продолжаю ветку: 3 сообщения до перерыва"));
  return { after, thread, next, chat, view };
}

/** A Side thread at the first question whose agent waits for a message. */
async function idleThread(api: Api) {
  const { run, card } = await firstQuestion(api);
  const opened = await openedSideThread(api, { interviewId: run.interview.id, cardId: card.id });
  await opened.chat.waitFor(isIdle);
  return opened;
}

/** A Side thread before a restart whose Mock interview's stored agent is Codex, which the fake server does not offer. */
async function codexThreadAfterRestart() {
  const dataDirectory = await temporaryDirectory();
  const thread = await threadBeforeRestart(dataDirectory);
  await storeAgent(dataDirectory, { interviewId: thread.interviewId, agent: "codex" });
  return { thread, after: await interviewApi({ dataDirectory }) };
}

/** The Side thread as the API lists it now. */
async function listedThread(api: Api, { interviewId, id }: SideThread) {
  const listed = await api.get(`/api/interviews/${interviewId}/side-threads`);
  return listed.json<SideThread[]>().find((entry) => entry.id === id);
}

/** The Target goes to the archive and comes back. */
async function archivedAndRestored({ server, headers, target }: Api) {
  for (const step of ["archive", "restore"]) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the restore follows the archive
    const response = await server.inject({
      method: "POST",
      url: `/api/targets/${target.id}/${step}`,
      headers,
    });
    if (response.statusCode !== 200) {
      throw new Error(`The ${step} failed: ${response.statusCode} ${response.body}`);
    }
  }
}

const isEnded = (view: SessionView) => view.status === "ended";

/** The status codes of the API for the sessions. */
async function sessionStatuses(api: Api, sessionIds: readonly string[]) {
  const responses = await Promise.all(sessionIds.map(async (id) => api.get(`/api/sessions/${id}`)));
  return responses.map((response) => response.statusCode);
}

describe("side thread continuation", () => {
  it("continues a side thread after a restart in a new session whose chat starts with the earlier one", async () => {
    const { after, thread, next, view } = await continuedAfterRestart();

    expect(next).toStrictEqual({ ...thread, sessionId: next.sessionId });
    expect(view.entries.map((entry) => entry.text)).toStrictEqual([
      "Разбираю вопрос кандидата: «Что такое вклад?»",
      "Ещё пример",
      "Фейковый агент получил: «Ещё пример»",
      "Продолжаю ветку: 3 сообщения до перерыва",
    ]);
    const listed = await after.get(`/api/interviews/${thread.interviewId}/side-threads`);
    expect(listed.json()).toStrictEqual([next]);
    await expect(hintMarks(after, { thread: next, position: 0 })).resolves.toMatchObject({
      thread: true,
      card: true,
    });
  });

  it("gives the continued side thread's agent the Handoff brief with the thread's messages", async () => {
    const { chat } = await continuedAfterRestart();

    const brief = briefIn(await ask(chat, "/brief", "Фейковый агент прочитал brief"));

    expect(brief).toMatchObject({
      candidateQuestion: "Что такое вклад?",
      question: { number: 1 },
      continuation: {
        messages: [
          { from: "agent", text: "Разбираю вопрос кандидата: «Что такое вклад?»" },
          { from: "candidate", text: "Ещё пример" },
          { from: "agent", text: "Фейковый агент получил: «Ещё пример»" },
        ],
      },
    });
  });

  it("refuses to continue a side thread whose agent still runs", async () => {
    const api = await interviewApi();
    const { thread } = await idleThread(api);

    const response = await continueThread(api, thread);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "side_thread_running" });
  });

  it("continues a side thread whose agent crashed", async () => {
    const api = await interviewApi();
    const { thread, chat } = await idleThread(api);
    chat.send({ type: "prompt", text: "/crash" });
    await chat.waitFor((view) => view.status === "failed");

    const next = await continued(api, thread);

    const reopened = await openEvents(api.server, next.sessionId);
    await expect(reopened.waitFor(repliesWith("Продолжаю ветку"))).resolves.toMatchObject({
      status: "idle",
    });
  });

  it("explains an unavailable agent of the mock interview and continues the side thread with the Target's agent", async () => {
    const { thread, after } = await codexThreadAfterRestart();

    const refused = await continueThread(after, thread);
    const otherAgent = await continueThread(after, thread, { agent: "opencode" });
    const next = await continued(after, thread, { agent: "fake" });

    expect(refused.json()).toStrictEqual({
      error: "agent_unavailable",
      agent: "codex",
      reason: null,
      targetAgent: "fake",
      message: "Агент мока больше не доступен. Можно продолжить ветку с агентом цели.",
    });
    expect(otherAgent.statusCode).toBe(400);
    const session = await after.get(`/api/sessions/${next.sessionId}`);
    expect(session.json()).toMatchObject({ agent: "fake", continuesSessionId: thread.sessionId });
    await expect(pauseApi(after).stored(thread.interviewId)).resolves.toMatchObject({
      agent: "codex",
    });
  });

  it("keeps a side thread that closed when its mock interview finished readable, and does not continue it", async () => {
    const api = await interviewApi();
    const { thread, chat } = await idleThread(api);
    await api.finish(thread.interviewId);
    await chat.waitFor(isEnded);

    const response = await continueThread(api, thread);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "side_thread_closed" });
    const listed = await listedThread(api, thread);
    expect(listed?.closedAt).not.toBeNull();
    await expect(api.get(`/api/sessions/${thread.sessionId}`)).resolves.toMatchObject({
      statusCode: 200,
    });
  });

  it("does not continue the side threads that the archive closed, after the Target returns", async () => {
    const api = await interviewApi();
    const { thread } = await idleThread(api);
    await pauseApi(api).pause(thread.interviewId);
    await archivedAndRestored(api);

    const response = await continueThread(api, thread);

    expect(response.json()).toMatchObject({ error: "side_thread_closed" });
  });

  it("refuses to continue a side thread that the mock interview does not have", async () => {
    const api = await interviewApi();
    const { thread } = await idleThread(api);

    const response = await continueThread(api, {
      ...thread,
      id: "00000000-0000-4000-8000-000000000001",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "side_thread_not_found" });
  });

  it("deletes a continued side thread with every session of its chat", async () => {
    const { after, thread, next } = await continuedAfterRestart();

    const deleted = await after.server.inject({
      method: "DELETE",
      url: `/api/interviews/${thread.interviewId}/side-threads/${thread.id}`,
      headers: browserHeaders(after.server),
    });

    expect(deleted.statusCode).toBe(204);
    await expect(sessionStatuses(after, [thread.sessionId, next.sessionId])).resolves.toStrictEqual(
      [404, 404],
    );
  });
});
