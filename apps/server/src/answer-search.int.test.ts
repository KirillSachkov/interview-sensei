// Seam 1 of spec #70: «Найти ответы» in the «Цель» zone, the queue, the agent's answers and the
// answer report, with the fake agent's researcher.
import { describe, expect, it } from "vitest";

import {
  answersOf,
  latestAnswerReport,
  searchSessions,
  startSearch,
} from "./answer-test-support.ts";
import { browserHeaders } from "./chat-test-support.ts";
import { cardAt, hasQuestions, interviewApi, isGraded } from "./interview-test-support.ts";
import { demoApi, first } from "./model-test-support.ts";
import type { Questions } from "./model-test-support.ts";
import { demoWithMock } from "./progress-test-support.ts";

/** The reference answers of the bank, by origin. */
function referenceAnswers(bank: Questions) {
  return bank
    .flatMap(({ referenceAnswer }) => (referenceAnswer === null ? [] : [referenceAnswer]))
    .toSorted((left, right) => left.origin.localeCompare(right.origin));
}

/** The Topic status of the Topic in the Target's progress. */
async function topicStatus(api: Awaited<ReturnType<typeof interviewApi>>, topicId: string) {
  const response = await api.get(`/api/targets/${api.target.id}/progress`);
  const { topics } = response.json<{ topics: { id: string; status: string }[] }>();
  return topics.find((topic) => topic.id === topicId)?.status;
}

/** A finished Mock interview with a strong answer and a strong answer to its Deeper question. */
async function strongMock(api: Awaited<ReturnType<typeof interviewApi>>) {
  const run = await api.answered(["Опыт и резюме"], "Ответ [grade:3] [deeper]");
  const deeper = cardAt(await run.events.waitFor(hasQuestions(2)), 1);
  await api.answer(run.interview.id, "Ответ [grade:3] [last]");
  const opening = cardAt(await run.events.waitFor(isGraded(1)), 0);
  await api.finish(run.interview.id);
  await run.chat.waitFor((view) => view.status === "ended");
  return { opening, deeper };
}

/**
 * The demo Target after a finished Mock interview with two strong Attempts on one Topic, one on a
 * Deeper question, which make the Topic confident. `groupOf` tells a Question's group of the queue:
 * asked in the mock, of the confident Topic, or of a shaky or not started one.
 */
async function demoWithConfidentTopic() {
  const api = await interviewApi();
  const { opening, deeper } = await strongMock(api);
  const asked = new Set([opening.questionId, deeper.questionId]);
  const bank = await api.questions();
  const confident = new Set(
    bank.flatMap((question) =>
      question.topicId === deeper.topicId && !asked.has(question.id) ? [question.id] : [],
    ),
  );
  const groupOf = (questionId: string) => {
    if (asked.has(questionId)) {
      return "asked";
    }
    return confident.has(questionId) ? "confident" : "weak";
  };
  return { api, groupOf, status: await topicStatus(api, deeper.topicId) };
}

describe("the start window of answer search", () => {
  it("shows how many visible Questions have no reference answer", async () => {
    const { server, target, questions } = await demoApi();
    const bank = await questions();
    const hidden = await server.inject({
      method: "PUT",
      url: `/api/questions/${first(bank).id}/hidden`,
      headers: browserHeaders(server),
      payload: { hidden: true },
    });
    expect(hidden.statusCode).toBe(204);

    const state = await answersOf(server, target.id);

    expect(state).toMatchObject({
      withoutAnswer: bank.length - 1,
      queued: bank.length - 1,
      run: null,
      latestReport: null,
    });
  });
});

describe("the answer search", () => {
  it("fills the chosen number of Questions with answers and sources, and the report counts them by origin with the agent's token usage", async () => {
    const { server, target, questions } = await demoApi();
    const before = await questions();

    const started = await startSearch(server, target.id, 3);

    expect({ status: started.statusCode, run: started.json<unknown>() }).toMatchObject({
      status: 202,
      run: { status: "running", requested: 3 },
    });
    await expect(latestAnswerReport(server, target.id)).resolves.toMatchObject({
      partial: false,
      summary: "Фейковый поисковик: записано ответов: 3.",
      total: 3,
      filled: 3,
      internet: 1,
      agent: 2,
      failed: [],
      usage: { contextTokens: 4321, contextSize: 200_000, cost: null },
    });
    const bank = await questions();
    expect(referenceAnswers(bank)).toMatchObject([
      { origin: "agent", links: [] },
      { origin: "agent", links: [] },
      { origin: "internet", links: ["https://example.com/answers"] },
    ]);
    await expect(answersOf(server, target.id)).resolves.toMatchObject({
      withoutAnswer: before.length - 3,
      run: null,
    });
  });

  it("fills the Questions asked in a mock interview first", async () => {
    const { server, target, graded } = await demoWithMock();

    await startSearch(server, target.id, 2);

    const report = await latestAnswerReport(server, target.id);
    expect(first(report.questions).text).toBe(graded.text);
  });

  it("fills the Questions of shaky and not started Topics before those of confident Topics", async () => {
    const { api, groupOf, status } = await demoWithConfidentTopic();
    const { queued } = await answersOf(api.server, api.target.id);

    await startSearch(api.server, api.target.id, queued);

    const report = await latestAnswerReport(api.server, api.target.id);
    const order = report.questions.map((question) => groupOf(question.questionId));
    expect(status).toBe("confident");
    expect(order.join(" ")).toMatch(/^(?:asked )+(?:weak )+(?:confident ?)+$/u);
  });

  it("refuses a second start while the Target's answer search runs", async () => {
    const { server, target } = await demoApi();
    await startSearch(server, target.id, 1);

    const second = await startSearch(server, target.id, 1);

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: "search_running" });
    await latestAnswerReport(server, target.id);
    await expect(searchSessions(server, target.id)).resolves.toHaveLength(1);
  });
});
