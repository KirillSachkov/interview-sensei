// Seam 1 of spec #47: what the Candidate does with the Questions of an Inbox report. A Question the
// processing agent made up without a Source is «не подтверждён»; the report's filter «новые» shows
// the Questions the Candidate has not seen; bulk actions act on them; the history lists the reports.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { browserHeaders } from "./chat-test-support.ts";
import { manualProcessing, reportOf, textOf, topicOf } from "./inbox-test-support.ts";
import type { ReportView } from "./inbox-test-support.ts";
import { materialQuestion } from "./material-test-support.ts";
import { callTool, questionsOf, toolResult } from "./setup-test-support.ts";
import type { Events } from "./setup-test-support.ts";

async function review(server: FastifyInstance, targetId: string, payload: object) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/questions/review`,
    headers: browserHeaders(server),
    payload,
  });
}

/** The ids of the Questions that add_bank_questions added. */
async function added(events: Events, questions: readonly object[]): Promise<string[]> {
  const result = await toolResult(events, "add_bank_questions", { questions });
  if (typeof result !== "object" || result === null || !("added" in result)) {
    throw new TypeError("add_bank_questions added nothing");
  }
  const list: unknown = result.added;
  return Array.isArray(list) ? list.map((item: unknown) => textOf(item, "id")) : [];
}

describe("«не подтверждён» in Inbox processing", () => {
  it("a Question made up without a Source is unconfirmed until 👍, a Question from the material is confirmed", async () => {
    const { server, target, file, events } = await manualProcessing();
    const topicId = topicOf(target, "Go");
    const {
      sourceId: _sourceId,
      part: _part,
      referenceAnswer: _answer,
      ...made
    } = materialQuestion({ topicId, sourceId: file.id }, "Как профилировать горутины?");
    const [fromMaterial, madeUp] = await added(events, [
      materialQuestion({ topicId, sourceId: file.id }, "Как устроен планировщик Go?"),
      made,
    ]);

    const bank = await questionsOf(server, target.id, `?topicId=${topicId}`);
    expect(bank.find((question) => question.id === fromMaterial)).toMatchObject({
      unconfirmed: false,
      sourceIds: [file.id],
    });
    expect(bank.find((question) => question.id === madeUp)).toMatchObject({
      unconfirmed: true,
      sourceIds: [],
      sourcePart: null,
      referenceAnswer: null,
    });

    await review(server, target.id, { action: "confirm", questionIds: [madeUp] });

    const after = await questionsOf(server, target.id, `?topicId=${topicId}`);
    expect(after.find((question) => question.id === madeUp)).toMatchObject({ unconfirmed: false });
  });

  it("refuses a reference answer or a part without a Source", async () => {
    const { target, file, events } = await manualProcessing();
    const { sourceId: _sourceId, ...withoutSource } = materialQuestion(
      { topicId: topicOf(target, "Go"), sourceId: file.id },
      "Что такое GOMAXPROCS?",
    );

    const reply = await callTool(events, "add_bank_questions", { questions: [withoutSource] });

    expect(reply).toBe(
      "Ошибка add_bank_questions: A Question without a Source has neither a part nor a reference answer",
    );
  });
});

/** A processing that added two Questions of the vacancy and wrote its report. */
async function reportWithTwoQuestions() {
  const { server, target, file, events } = await manualProcessing();
  const ids = { topicId: topicOf(target, "Go"), sourceId: file.id };
  const questionIds = await added(events, [
    materialQuestion(ids, "Как устроен планировщик Go?"),
    materialQuestion(ids, "Что такое GOMAXPROCS?"),
  ]);
  const written = await toolResult(events, "write_inbox_report", { summary: "Вакансия." });
  return { server, target, questionIds, reportId: textOf(written, "reportId") };
}

/** «Отметить просмотренными» of the report. */
async function markSeen(server: FastifyInstance, targetId: string, reportId: string) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/inbox-reports/${reportId}/seen`,
    headers: browserHeaders(server),
  });
}

/** The Questions of the report's Topics, in order. */
const reportedQuestions = (report: ReportView) =>
  report.sections.flatMap((section) => section.topics).flatMap((topic) => topic.questions);

describe("the Questions of an Inbox report", () => {
  it("the filter «новые» shows the Questions the Candidate has not seen", async () => {
    const { server, target, questionIds, reportId } = await reportWithTwoQuestions();

    const fresh = await reportOf(server, target.id, `${reportId}?new=true`);

    expect(fresh.newQuestions).toBe(2);
    expect(reportedQuestions(fresh)).toMatchObject(questionIds.map((id) => ({ id, unseen: true })));
  });

  it("«просмотрено» empties the filter «новые» and keeps every Question in the report", async () => {
    const { server, target, questionIds, reportId } = await reportWithTwoQuestions();

    const seen = await markSeen(server, target.id, reportId);

    expect(seen.statusCode).toBe(204);
    const afterSeen = await reportOf(server, target.id, `${reportId}?new=true`);
    expect(afterSeen).toMatchObject({ newQuestions: 0, sections: [] });
    const all = await reportOf(server, target.id, reportId);
    expect(all.added).toBe(2);
    expect(reportedQuestions(all)).toMatchObject(questionIds.map((id) => ({ id, unseen: false })));
  });

  it("bulk-hidden Questions stay in the report as hidden, deleted ones leave it", async () => {
    const { server, target, file, events } = await manualProcessing();
    const ids = { topicId: topicOf(target, "Go"), sourceId: file.id };
    const [hidden, deleted, kept] = await added(events, [
      materialQuestion(ids, "Как устроен планировщик Go?"),
      materialQuestion(ids, "Что такое GOMAXPROCS?"),
      materialQuestion(ids, "Зачем нужен select?"),
    ]);
    const written = await toolResult(events, "write_inbox_report", { summary: "Вакансия." });

    await review(server, target.id, { action: "hide", questionIds: [hidden] });
    await review(server, target.id, { action: "delete", questionIds: [deleted] });

    const report = await reportOf(server, target.id, textOf(written, "reportId"));
    expect(reportedQuestions(report)).toMatchObject([
      { id: hidden, hidden: true },
      { id: kept, hidden: false },
    ]);
  });
});
