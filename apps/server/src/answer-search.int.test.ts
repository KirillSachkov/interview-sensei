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
import { demoApi, first } from "./model-test-support.ts";
import type { Questions } from "./model-test-support.ts";
import { demoWithMock } from "./progress-test-support.ts";

/** The reference answers of the bank, by origin. */
function referenceAnswers(bank: Questions) {
  return bank
    .flatMap(({ referenceAnswer }) => (referenceAnswer === null ? [] : [referenceAnswer]))
    .toSorted((left, right) => left.origin.localeCompare(right.origin));
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
      usage: { tokens: 4321, cost: null },
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
