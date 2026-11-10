// Seam 1 of spec #70, ticket #79: «Наполнять в фоне» in «Настройки». Off by default; on, it starts
// an answer search of up to 20 Questions after an Inbox processing ends and after a Mock interview
// is finished. One background work of the agent per Target: an Inbox processing that starts while
// an answer search runs closes the search with a partial report.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import {
  answersOf,
  bankQuestion,
  handOut,
  internetAnswer,
  latestAnswerReport,
  manualSearch,
  searchSessions,
} from "./answer-test-support.ts";
import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import {
  attach,
  inboxOf,
  latestReportId,
  manualProcessing,
  processedVacancy,
  processingSession,
  sessionEnded,
  startProcessing,
  vacancy,
} from "./inbox-test-support.ts";
import { interviewApi, isGraded, saysWhenIdle } from "./interview-test-support.ts";
import { api, applied, appliedTarget, toolResult } from "./setup-test-support.ts";

/** «Наполнять в фоне» on or off. */
async function fillInBackground(server: FastifyInstance, enabled: boolean) {
  return api(server).put("/api/settings/fill-in-background", { enabled });
}

/** The Target's answer search, latest answer report and answer search sessions. */
async function searchOf(server: FastifyInstance, targetId: string) {
  const { run, latestReport } = await answersOf(server, targetId);
  return { run, latestReport, sessions: await searchSessions(server, targetId) };
}

/**
 * The Target's answer search on a new server, after the server closed: its close waits for its
 * background work, so a search that started there left a report.
 */
async function searchAfterClose(
  { dataDirectory, stop }: { dataDirectory: string; stop: () => Promise<void> },
  targetId: string,
) {
  await stop();
  const { server } = await startServer(dataDirectory);
  return searchOf(server, targetId);
}

/** No answer search ran on the Target. */
const noSearch = { run: null, latestReport: null, sessions: [] };

describe("«Наполнять в фоне»", () => {
  it("is off by default: an Inbox processing ends without an answer search", async () => {
    const dataDirectory = await temporaryDirectory();
    const { server, stop } = await startServer(dataDirectory);
    const { target, events } = await appliedTarget(server);

    const settings = await api(server).get("/api/settings");
    await processedVacancy(server, { setup: events, targetId: target.id });

    expect(settings.json()).toStrictEqual({ defaultAgent: null, fillInBackground: false });
    await expect(searchAfterClose({ dataDirectory, stop }, target.id)).resolves.toStrictEqual(
      noSearch,
    );
  });

  it("stays on once the Candidate turns it on, and turns off again", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const on = await fillInBackground(server, true);
    const read = await api(server).get("/api/settings");
    const off = await fillInBackground(server, false);

    expect(on.json()).toStrictEqual({ defaultAgent: null, fillInBackground: true });
    expect(read.json()).toStrictEqual({ defaultAgent: null, fillInBackground: true });
    expect(off.json()).toStrictEqual({ defaultAgent: null, fillInBackground: false });
    await expect(
      api(server).put("/api/settings/fill-in-background", { enabled: "yes" }),
    ).resolves.toMatchObject({ statusCode: 400 });
  });

  it("on, fills the Questions without a reference answer after an Inbox processing ends", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    await fillInBackground(server, true);

    await processedVacancy(server, { setup: events, targetId: target.id });

    // The three Questions of the setup; the vacancy's Question has its answer «из материала».
    await expect(latestAnswerReport(server, target.id)).resolves.toMatchObject({
      partial: false,
      total: 3,
      filled: 3,
    });
    await expect(answersOf(server, target.id)).resolves.toMatchObject({ withoutAnswer: 0 });
  });

  it("on, starts nothing after a recheck of the bank", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await appliedTarget(server);
    await applied({ server, events, targetId: target.id }, [
      "save_preference",
      { text: "Меньше вопросов про Kafka" },
    ]);
    await fillInBackground(server, true);

    const started = await api(server).post(`/api/targets/${target.id}/inbox/recheck`);
    await latestReportId(server, target.id);
    await sessionEnded(server, await processingSession(server, target.id));

    expect(started.statusCode).toBe(202);
    await expect(searchOf(server, target.id)).resolves.toStrictEqual(noSearch);
  });

  it("on, starts nothing after an Inbox processing that a restart interrupted", async () => {
    const dataDirectory = await temporaryDirectory();
    const before = await manualProcessing({ dataDirectory });
    await fillInBackground(before.server, true);
    await before.stop();

    const restarted = await startServer(dataDirectory);
    const closed = await inboxOf(restarted.server, before.target.id);

    expect(closed).toMatchObject({ run: null, latestReport: { partial: true } });
    await expect(
      searchAfterClose({ dataDirectory, stop: restarted.stop }, before.target.id),
    ).resolves.toStrictEqual(noSearch);
  });

  it("on, fills up to 20 Questions after a Mock interview is finished", async () => {
    const mock = await interviewApi();
    await fillInBackground(mock.server, true);
    const run = await mock.answered(["Опыт и резюме"], "Ответ [grade:2] [last]");
    await run.events.waitFor(isGraded(0));

    await mock.finish(run.interview.id);
    await run.events.waitFor((view) => view.status === "finished");

    const report = await latestAnswerReport(mock.server, mock.target.id);
    expect(report).toMatchObject({ partial: false, total: 20, filled: 20 });
    // The asked Question goes first in the queue.
    expect(report.questions.map((question) => question.questionId)).toContain(run.card.questionId);
  });

  it("on, starts nothing after a Mock interview that ended «прерван»", async () => {
    const dataDirectory = await temporaryDirectory();
    const mock = await interviewApi({ dataDirectory });
    await fillInBackground(mock.server, true);
    const run = await mock.answered(["Опыт и резюме"], "Ответ [grade:2] [last]");
    await run.events.waitFor(isGraded(0));

    await run.chat.waitFor(saysWhenIdle("Ответ получен."));
    run.chat.send({ type: "prompt", text: "/crash" });
    await run.events.waitFor((view) => view.status === "interrupted");

    await expect(
      searchAfterClose({ dataDirectory, stop: mock.stop }, mock.target.id),
    ).resolves.toStrictEqual(noSearch);
  });
});

/**
 * A running answer search of a `[manual]` Target with one answer from the internet, and a
 * `[manual]` vacancy in the Target's Inbox.
 */
async function searchWithMaterial() {
  const { server } = await startServer(await temporaryDirectory());
  const { target, session, events } = await manualSearch(server);
  const { questions } = await handOut(events);
  const [answered = ""] = questions.map((question) => question.id);
  await toolResult(events, "save_reference_answer", internetAnswer(answered));
  const material = await attach(server, {
    targetId: target.id,
    name: "vacancy [manual].md",
    body: vacancy,
  });
  return { server, target, session, answered, material };
}

describe("an Inbox processing takes over the Target's answer search", () => {
  it("closes the running answer search with a partial report, keeps the found answers and stops its agent", async () => {
    const { server, target, session, answered, material } = await searchWithMaterial();

    const started = await startProcessing(server, target.id, [material.id]);

    expect(started.statusCode).toBe(202);
    await expect(latestAnswerReport(server, target.id)).resolves.toMatchObject({
      partial: true,
      summary: "Начался разбор Inbox, наполнение остановлено. Найденные ответы сохранены.",
      filled: 1,
      internet: 1,
    });
    await expect(bankQuestion(server, target.id, answered)).resolves.toMatchObject({
      referenceAnswer: { origin: "internet" },
    });
    await sessionEnded(server, session);
    await expect(inboxOf(server, target.id)).resolves.toMatchObject({
      run: { mode: "processing" },
    });
  });
});
