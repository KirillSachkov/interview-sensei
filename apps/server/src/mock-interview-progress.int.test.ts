// Seam 1 of spec #41: progress and Disputes through the server's HTTP and WebSocket API with real
// PGlite and the fake ACP agent in its interviewer mode. The agent reads its tools over the
// session's real MCP address, as `/mcp` in the interviewer chat reveals it.
import { describe, expect, it } from "vitest";

import {
  cardAt,
  hasQuestions,
  hasSpoken,
  interviewApi,
  isGraded,
  saysWhenIdle,
} from "./interview-test-support.ts";
import type { Interview } from "./interview-test-support.ts";
import { callTool, dispute } from "./progress-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

const experience = "Опыт разработки";
const reason = "Я привёл пример из практики, интервьюер его не учёл.";

/** Starts on «Опыт и резюме», answers the first question with the text and waits for its Attempt. */
async function gradedAnswer(api: Api, text: string) {
  const run = await api.answered(["Опыт и резюме"], text);
  const graded = cardAt(await run.events.waitFor(isGraded(0)), 0);
  await run.events.waitFor(hasQuestions(2));
  await run.chat.waitFor(saysWhenIdle("Ответ получен."));
  return { ...run, graded };
}

async function progressOf(api: Api): Promise<unknown> {
  const response = await api.get(`/api/targets/${api.target.id}/progress`);
  return response.json();
}

const isFinished = (view: Interview) => view.status === "finished";

/** Finishes the Mock interview with the agent's summary, then starts the next one. */
async function nextInterview(api: Api, { interview, events }: Awaited<ReturnType<Api["started"]>>) {
  await api.finish(interview.id);
  await events.waitFor(isFinished);
  const next = await api.started(["Проектирование"]);
  await next.events.waitFor(hasQuestions(1));
  await next.chat.waitFor(hasSpoken);
  return next;
}

describe("progress and disputes", () => {
  it("shows every Topic not started and the Topics to work on before the first Mock interview", async () => {
    const api = await interviewApi();

    const progress = await progressOf(api);

    expect(progress).toMatchObject({
      readiness: { confident: 0, shaky: 0, notStarted: 5, total: 5 },
      focus: [
        { name: experience, status: "not_started" },
        { name: "Система типов TypeScript" },
        { name: "Асинхронность Node.js" },
      ],
    });
  });

  it("makes a Topic shaky after its first Attempt", async () => {
    const api = await interviewApi();

    await gradedAnswer(api, "Ответ [grade:3]");

    await expect(progressOf(api)).resolves.toMatchObject({
      readiness: { confident: 0, shaky: 1, notStarted: 4, total: 5 },
      focus: [{ name: experience, status: "shaky" }, { status: "not_started" }, {}],
    });
  });

  it("corrects the Grade with a Dispute; the latest Dispute applies", async () => {
    const api = await interviewApi();
    const { interview, graded } = await gradedAnswer(api, "Ответ [grade:1]");

    const first = await dispute(api, {
      interviewId: interview.id,
      card: graded,
      payload: { grade: 3, reason },
    });
    const second = await dispute(api, {
      interviewId: interview.id,
      card: graded,
      payload: { grade: 2, reason: "Скорее на 2." },
    });

    expect(first.json()).toMatchObject({ grade: 1, dispute: { grade: 3, reason } });
    expect(second.json()).toMatchObject({
      grade: 1,
      dispute: { grade: 2, reason: "Скорее на 2." },
    });
    await expect(api.debrief(interview.id, graded)).resolves.toMatchObject({
      grade: 1,
      dispute: { grade: 2, reason: "Скорее на 2." },
    });
  });

  it.each([
    ["without a reason", { grade: 3, reason: "  " }, "empty_reason"],
    ["with a Grade out of the scale", { grade: 4, reason }, "invalid_grade"],
  ])("refuses a Dispute %s", async (_case, payload, error) => {
    const api = await interviewApi();
    const { interview, graded } = await gradedAnswer(api, "Ответ [grade:1]");

    const response = await dispute(api, { interviewId: interview.id, card: graded, payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error });
    await expect(api.debrief(interview.id, graded)).resolves.toMatchObject({ dispute: null });
  });

  it("gives the next Mock interview's brief the corrections, the last summary and the weak Topics", async () => {
    const api = await interviewApi();
    const run = await gradedAnswer(api, "Ответ [grade:1]");
    await dispute(api, {
      interviewId: run.interview.id,
      card: run.graded,
      payload: { grade: 3, reason },
    });

    const next = await nextInterview(api, run);

    await expect(callTool(next.chat, "get_brief")).resolves.toMatchObject({
      lastInterview: {
        status: "finished",
        summary: "Фейковый интервьюер: мок завершён.",
        nextStep: "Фейковый интервьюер: повторить темы с низкой оценкой.",
      },
      weakTopics: [{ name: experience, status: "shaky" }, {}, {}],
      gradeCorrections: [{ question: run.graded.text, agentGrade: 1, correctedGrade: 3, reason }],
    });
  });

  it("gives the agent the Target's progress with get_progress", async () => {
    const api = await interviewApi();
    const { chat } = await gradedAnswer(api, "Ответ [grade:2]");

    const progress = await callTool(chat, "get_progress");

    expect(progress).toMatchObject({
      readiness: { confident: 0, shaky: 1, notStarted: 4, total: 5 },
      topics: [{ name: experience, status: "shaky" }, {}, {}, {}, {}],
    });
  });
});
