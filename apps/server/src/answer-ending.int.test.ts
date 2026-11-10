// Seam 1 of spec #70: how an answer search ends without the agent's report, and when it starts.
// «Остановить», a failed agent, an idle agent and a restart close it the same way: the written
// answers stay, and a partial report remains. While the Target's Inbox processing runs, the answer
// search waits for its end.
import path from "node:path";

import type { FastifyInstance } from "fastify";
import { describe, expect, it, onTestFinished } from "vitest";

import {
  answerReportOf,
  answersOf,
  internetAnswer,
  latestAnswerReport,
  manualSearch,
  handOut,
  searchSessions,
  startSearch,
  stopSearch,
} from "./answer-test-support.ts";
import type { ServerOptions } from "./chat-test-support.ts";
import { browserHeaders, fixedTime, startServer, temporaryDirectory } from "./chat-test-support.ts";
import { latestReportId, manualProcessing, sessionEnded, textOf } from "./inbox-test-support.ts";
import { manualTime } from "./interview-flow-test-support.ts";
import { buildServer } from "./server.ts";
import { questionsOf, toolResult } from "./setup-test-support.ts";

/** How long the server waits after the agent's turn ends without the report. */
const idleWaitMs = 2 * 60 * 1000;

/**
 * A running answer search of a `[manual]` Target in which the agent took the whole queue and wrote
 * one answer from the internet.
 */
async function halfFilled(options: ServerOptions & { dataDirectory?: string } = {}) {
  const { dataDirectory, ...serverOptions } = options;
  const started = await startServer(dataDirectory ?? (await temporaryDirectory()), serverOptions);
  const search = await manualSearch(started.server);
  const { questions } = await handOut(search.events);
  const [answered = "", ...skipped] = questions.map((question) => question.id);
  await toolResult(search.events, "save_reference_answer", internetAnswer(answered));
  return { ...started, ...search, answered, skipped };
}

/** What the Candidate sees after the end: the search, the report and the written answer. */
async function afterEnd(
  server: FastifyInstance,
  { targetId, answered }: { targetId: string; answered: string },
) {
  const state = await answersOf(server, targetId);
  const report = await answerReportOf(server, targetId, textOf(state.latestReport, "id"));
  const bank = await questionsOf(server, targetId);
  return {
    run: state.run,
    report,
    keptAnswer: bank.find((question) => question.id === answered)?.referenceAnswer?.origin,
  };
}

/** The partial report of halfFilled with the server's summary. */
function partialEnd(summary: string, skipped: readonly string[]) {
  return {
    run: null,
    report: {
      partial: true,
      summary,
      total: 3,
      filled: 1,
      internet: 1,
      agent: 0,
      failed: skipped.map((questionId) => ({ questionId, reason: null })),
    },
    keptAnswer: "internet",
  };
}

describe("the end of an answer search without the agent's report", () => {
  it("«Остановить» stops the agent even in a turn, keeps the written answers and leaves a partial report", async () => {
    const { server, target, session, events, answered, skipped } = await halfFilled();
    events.send({ type: "prompt", text: "/wait" });
    await events.waitFor((view) => view.status === "working");

    const stopped = await stopSearch(server, target.id);

    expect(stopped.statusCode).toBe(200);
    await sessionEnded(server, session);
    await expect(afterEnd(server, { targetId: target.id, answered })).resolves.toMatchObject(
      partialEnd("Наполнение остановлено.", skipped),
    );
    await expect(stopSearch(server, target.id)).resolves.toMatchObject({ statusCode: 409 });
  });

  it("a crashed agent ends the answer search the same way", async () => {
    const { server, target, events, answered, skipped } = await halfFilled();

    events.send({ type: "prompt", text: "/crash" });

    await latestAnswerReport(server, target.id);
    await expect(afterEnd(server, { targetId: target.id, answered })).resolves.toMatchObject(
      partialEnd("Агент упал, наполнение остановлено.", skipped),
    );
  });

  it("an agent that ends its turn without the report ends the answer search after the wait", async () => {
    const time = manualTime();
    const { server, target, session, answered, skipped } = await halfFilled(time);

    await time.fire(idleWaitMs);

    await latestAnswerReport(server, target.id);
    await expect(afterEnd(server, { targetId: target.id, answered })).resolves.toMatchObject(
      partialEnd("Агент закончил работу без отчёта.", skipped),
    );
    await sessionEnded(server, session);
  });

  it("a restart of the server leaves no answer search running: a partial report remains and a new start goes", async () => {
    const dataDirectory = await temporaryDirectory();
    const before = await halfFilled({ dataDirectory });
    await before.stop();

    const { server } = await startServer(dataDirectory);

    const targetId = before.target.id;
    await expect(afterEnd(server, { targetId, answered: before.answered })).resolves.toMatchObject(
      partialEnd("Приложение перезапустилось, наполнение остановлено.", before.skipped),
    );
    await expect(startSearch(server, targetId, 1)).resolves.toMatchObject({ statusCode: 202 });
  });
});

describe("one background work of the agent per Target", () => {
  it("the answer search waits while the Target's Inbox processing runs and starts when it ends", async () => {
    const { server, target, events } = await manualProcessing();

    const started = await startSearch(server, target.id, 2);

    expect({ status: started.statusCode, run: started.json<unknown>() }).toMatchObject({
      status: 202,
      run: { status: "waiting", requested: 2 },
    });
    await expect(answersOf(server, target.id)).resolves.toMatchObject({
      run: { status: "waiting", filled: 0, total: 2 },
    });
    await expect(searchSessions(server, target.id)).resolves.toStrictEqual([]);
    await toolResult(events, "write_inbox_report", { summary: "Готово." });
    await expect(latestAnswerReport(server, target.id)).resolves.toMatchObject({
      partial: false,
      total: 2,
      filled: 2,
    });
    await expect(searchSessions(server, target.id)).resolves.toHaveLength(1);
  });

  it("«Остановить» closes a waiting answer search before its agent starts", async () => {
    const { server, target, events } = await manualProcessing();
    await startSearch(server, target.id, 2);

    const stopped = await stopSearch(server, target.id);
    await toolResult(events, "write_inbox_report", { summary: "Готово." });

    expect(stopped.statusCode).toBe(200);
    await latestReportId(server, target.id);
    const report = await answerReportOf(server, target.id, textOf(stopped.json(), "reportId"));
    expect(report).toMatchObject({ partial: true, total: 0, filled: 0, usage: null });
    await expect(answersOf(server, target.id)).resolves.toMatchObject({ run: null });
    await expect(searchSessions(server, target.id)).resolves.toStrictEqual([]);
  });
});

/** A server that offers Claude Code, Codex and OpenCode from an empty temporary home. */
async function serverWithRealAgents(home: string) {
  const server = await buildServer({
    clock: { now: () => new Date(fixedTime) },
    timer: { repeat: () => () => {}, after: () => () => {} },
    dataDirectory: path.join(home, ".interview-sensei"),
    userEnvironment: { home, env: { PATH: path.join(home, "bin") } },
  });
  onTestFinished(async () => server.close());
  await server.listen({ host: "127.0.0.1", port: 0 });
  return server;
}

describe("the start with the Target's agent unavailable", () => {
  it("«Найти ответы» answers with a clear error, and nothing starts", async () => {
    const home = await temporaryDirectory();
    const server = await serverWithRealAgents(home);
    const headers = browserHeaders(server);
    const created = await server.inject({ method: "POST", url: "/api/targets/demo", headers });
    const { id } = created.json<{ id: string }>();
    await server.inject({
      method: "PUT",
      url: `/api/targets/${id}/agent`,
      headers,
      payload: { agent: "codex" },
    });

    const started = await startSearch(server, id, 5);

    expect({ status: started.statusCode, body: started.json<unknown>() }).toStrictEqual({
      status: 400,
      body: {
        error: "agent_unavailable",
        message: `Агент цели недоступен. Нет входа в Codex: не найден ${path.join(home, ".codex", "auth.json")}. Выполните \`codex login\` и обновите страницу. Или выберите другого агента в меню «Агент» в верхней панели.`,
      },
    });
    await expect(answersOf(server, id)).resolves.toMatchObject({ run: null, latestReport: null });
  });
});
