// Seam 1 of spec #80: the Side thread through the server's HTTP and WebSocket API, with real PGlite
// and the fake ACP agent as a separate process. Its side thread mode answers the server's opening
// message after `get_brief`; see fake-agent-side-thread.ts in core.
import { describe, expect, it } from "vitest";

import { fixedTime, isIdle } from "./chat-test-support.ts";
import { cardNow, followUpsOf } from "./interview-flow-test-support.ts";
import { ask, cardAt, interviewApi, isGraded, sectionNamed } from "./interview-test-support.ts";
import {
  briefIn,
  firstQuestion,
  hasStoppedTurn,
  openedSideThread,
  openSideThread,
  repliesWith,
  threadAtFirstQuestion,
} from "./side-thread-test-support.ts";
import { sources, upload } from "./source-test-support.ts";

const candidateQuestion = "Что здесь значит «вклад»?";

describe("side thread", () => {
  it("opens at a question card with the mock interview's agent, which reads the Handoff brief and answers the Candidate's question", async () => {
    const api = await interviewApi();
    const { run, card } = await firstQuestion(api);

    const { thread, chat } = await openedSideThread(api, {
      interviewId: run.interview.id,
      cardId: card.id,
      question: candidateQuestion,
    });

    expect(thread).toMatchObject({
      interviewId: run.interview.id,
      origin: { kind: "question", id: card.id },
      askedQuestionId: card.id,
      question: candidateQuestion,
      createdAt: fixedTime,
    });
    await chat.waitFor(repliesWith(`Разбираю вопрос кандидата: «${candidateQuestion}»`));
    const brief = briefIn(await ask(chat, "/brief", "Фейковый агент прочитал brief"));
    expect(brief).toStrictEqual({
      origin: "question",
      target: { name: api.target.name, level: api.target.level },
      language: "ru",
      question: {
        number: 1,
        text: card.text,
        format: "open",
        options: [],
        section: sectionNamed(api.target, "Опыт и резюме").name,
        topic: "Опыт разработки",
      },
      answer: null,
      followUps: [],
      debrief: null,
      fragment: null,
      candidateQuestion,
    });
  });

  it("gives the brief the Candidate's answer and Follow-ups, without a Grade or the rest of the mock interview", async () => {
    const api = await interviewApi();
    const text = "Я вёл сервис платежей. [followup]";
    const run = await api.answered(["Опыт и резюме"], text);
    const card = cardAt(await run.events.waitFor(followUpsOf(1)), 0);

    const { chat } = await openedSideThread(api, {
      interviewId: run.interview.id,
      cardId: card.id,
    });

    await chat.waitFor(isIdle);
    const brief = briefIn(await ask(chat, "/brief", "Фейковый агент прочитал brief"));
    expect(brief).toMatchObject({
      answer: { text, chosenOptions: [], skipped: false },
      followUps: [{ question: "Фейковый Follow-up: приведите пример.", answer: null }],
      candidateQuestion: null,
    });
    expect(JSON.stringify(brief)).not.toMatch(/grade|gaps|justification|strongAnswer/iu);
  });
});

describe("side thread requests", () => {
  it("lists the side threads of the mock interview, also in its view", async () => {
    const api = await interviewApi();
    const { run, card } = await firstQuestion(api);

    const { thread } = await openedSideThread(api, {
      interviewId: run.interview.id,
      cardId: card.id,
    });

    const listed = await api.get(`/api/interviews/${run.interview.id}/side-threads`);
    expect(listed.json()).toStrictEqual([thread]);
    const view = await run.events.waitFor((entry) => entry.sideThreads.length > 0);
    expect(view.sideThreads).toStrictEqual([thread]);
  });

  it("refuses a side thread at a question that the mock interview did not ask", async () => {
    const api = await interviewApi();
    const run = await api.started(["Опыт и резюме"]);

    const response = await openSideThread(api, {
      interviewId: run.interview.id,
      cardId: "00000000-0000-4000-8000-000000000001",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "question_not_found" });
  });
});

describe("side thread agent", () => {
  it("runs with the sensei-explain skill and the web, without shell", async () => {
    const api = await interviewApi();

    const { chat } = await threadAtFirstQuestion(api);

    await expect(ask(chat, "/skills", "Skills:")).resolves.toBe('Skills: ["sensei-explain"]');
    await expect(ask(chat, "/tools", "Запреты:")).resolves.toBe('Запреты: ["shell"]');
    await expect(ask(chat, "/system", "Роль")).resolves.toContain(
      "You are the explaining agent of Interview Sensei",
    );
  });

  it("gets only the tools that read, so it cannot record an Attempt", async () => {
    const api = await interviewApi();

    const { run, chat } = await threadAtFirstQuestion(api);

    // `/tool-list` lists the tools of the session's MCP server.
    await expect(ask(chat, "/tool-list", "MCP tools:")).resolves.toBe(
      'MCP tools: ["get_brief","get_progress","get_source","get_target","search_questions"]',
    );
    // `/tool <name> <json>` calls the tool after the permission that the server allows.
    await expect(ask(chat, "/tool record_attempt {}", "Ошибка record_attempt:")).resolves.toMatch(
      /^Ошибка record_attempt: .*not found/iu,
    );
    await expect(cardNow(api, run.interview.id, 0)).resolves.toMatchObject({ attemptId: null });
  });
});

describe("side thread materials", () => {
  it("reads a material of the Target with get_source", async () => {
    const api = await interviewApi();
    await upload(api.server, { targetId: api.target.id, name: "vacancy.txt", body: "Go" });
    const [source] = await sources(api.server, api.target.id);
    const { chat } = await threadAtFirstQuestion(api);

    const reply = await ask(
      chat,
      `/tool get_source {"id":"${source?.id}"}`,
      "Результат get_source:",
    );

    const read: unknown = JSON.parse(reply.slice("Результат get_source: ".length));
    expect(read).toMatchObject({ id: source?.id, title: "vacancy.txt", path: source?.path });
  });
});

describe("side thread chat", () => {
  it("lets the Candidate stop the agent's turn and write again", async () => {
    const api = await interviewApi();
    const { chat } = await threadAtFirstQuestion(api);

    chat.send({ type: "prompt", text: "/wait" });
    await chat.waitFor((view) => view.status === "working");
    chat.send({ type: "cancel" });

    const stopped = await chat.waitFor(hasStoppedTurn);
    expect(stopped.entries.at(-1)).toMatchObject({
      type: "turn_interrupted",
      stopReason: "cancelled",
    });
    await expect(ask(chat, "Ещё вопрос", "Фейковый агент получил")).resolves.toBe(
      "Фейковый агент получил: «Ещё вопрос»",
    );
  });

  it("keeps the mock interview going when the side thread's agent fails", async () => {
    const api = await interviewApi();
    const { run, chat } = await threadAtFirstQuestion(api);

    // `/crash` makes the fake agent exit with code 1 in the middle of its turn.
    chat.send({ type: "prompt", text: "/crash" });
    await chat.waitFor((view) => view.status === "failed");
    await api.answer(run.interview.id, "Ответ [grade:2]");

    const graded = await run.events.waitFor(isGraded(0));
    expect(graded.status).toBe("running");
    await expect(cardNow(api, run.interview.id, 0)).resolves.toMatchObject({
      answer: { text: "Ответ [grade:2]" },
    });
  });
});
