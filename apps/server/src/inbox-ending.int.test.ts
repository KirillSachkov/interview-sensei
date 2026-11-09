// Seam 1 of spec #47: how an Inbox processing ends without the agent's report. «Остановить разбор»,
// a failed agent and a restart of the server close it the same way: the added Questions stay, the
// materials the agent did not read to the end go back to the Inbox, and a partial report remains.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import {
  inboxOf,
  latestReportId,
  manualProcessing,
  sessionEnded,
  startProcessing,
  stopProcessing,
  textOf,
  topicOf,
} from "./inbox-test-support.ts";
import { reportOf } from "./inbox-report-test-support.ts";
import { materialQuestion } from "./material-test-support.ts";
import { questionsOf, toolResult } from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";

/**
 * A running processing of a vacancy and notes, in which the agent read the whole vacancy and added
 * one Question from it, but never opened the notes.
 */
async function halfProcessed(dataDirectory?: string) {
  const processing = await manualProcessing({
    notes: true,
    ...(dataDirectory === undefined ? {} : { dataDirectory }),
  });
  const { target, file, events } = processing;
  await toolResult(events, "read_source", { id: file.id, part: 1 });
  await toolResult(events, "add_bank_questions", {
    questions: [
      materialQuestion({ topicId: topicOf(target, "Go"), sourceId: file.id }, "Что такое канал?"),
    ],
  });
  return processing;
}

/** The statuses of the Target's materials by title. */
async function statuses(server: FastifyInstance, targetId: string) {
  const list = await sources(server, targetId);
  return Object.fromEntries(list.map(({ title, status }) => [title, status]));
}

/**
 * What the Candidate sees after the end: the materials, the processing, the report, and whether the
 * bank kept the Question the agent added.
 */
async function afterEnd(server: FastifyInstance, targetId: string, reportId: string) {
  const { run, unprocessed } = await inboxOf(server, targetId);
  const { partial, added, summary } = await reportOf(server, targetId, reportId);
  const bank = await questionsOf(server, targetId);
  return {
    statuses: await statuses(server, targetId),
    run,
    unprocessed,
    report: { partial, added, summary },
    keptQuestion: bank.some((question) => question.text === "Что такое канал?"),
  };
}

/** The vacancy read to the end is «готов», the unread notes are back in the Inbox. */
const halfReturned = {
  statuses: { "vacancy [manual].md": "ready", "notes.md": "inbox" },
  run: null,
  unprocessed: 1,
  keptQuestion: true,
};

describe("the end of Inbox processing without the agent's report", () => {
  it("«Остановить разбор» cancels the agent's turn, ends its session, keeps the added Questions and gives the unread materials back to the Inbox", async () => {
    const { server, target, session, events } = await halfProcessed();
    events.send({ type: "prompt", text: "/wait" });
    await events.waitFor((view) => view.status === "working");

    const stopped = await stopProcessing(server, target.id);

    expect(stopped.statusCode).toBe(200);
    await sessionEnded(server, session);
    await expect(
      afterEnd(server, target.id, textOf(stopped.json(), "reportId")),
    ).resolves.toMatchObject({
      ...halfReturned,
      report: {
        partial: true,
        added: 1,
        summary: "Разбор остановлен кандидатом. Разобрано полностью: 1 из 2. Вернулись в Inbox: 1.",
      },
    });
    await expect(stopProcessing(server, target.id)).resolves.toMatchObject({ statusCode: 409 });
  });

  it("a crashed agent ends the processing the same way, with a partial report", async () => {
    const { server, target, events } = await halfProcessed();

    events.send({ type: "prompt", text: "/crash" });

    const reportId = await latestReportId(server, target.id);
    await expect(afterEnd(server, target.id, reportId)).resolves.toMatchObject({
      ...halfReturned,
      report: {
        partial: true,
        added: 1,
        summary: "Агент разбора упал. Разобрано полностью: 1 из 2. Вернулись в Inbox: 1.",
      },
    });
  });

  it("a restart of the server leaves no processing running: a partial report remains and a new start goes", async () => {
    const dataDirectory = await temporaryDirectory();
    const before = await halfProcessed(dataDirectory);
    await before.stop();

    const { server } = await startServer(dataDirectory);

    const targetId = before.target.id;
    const { latestReport } = await inboxOf(server, targetId);
    await expect(afterEnd(server, targetId, textOf(latestReport, "id"))).resolves.toMatchObject({
      ...halfReturned,
      report: {
        partial: true,
        added: 1,
        summary:
          "Разбор прерван: приложение перезапустилось. Разобрано полностью: 1 из 2. Вернулись в Inbox: 1.",
      },
    });
    await expect(startProcessing(server, targetId)).resolves.toMatchObject({ statusCode: 202 });
  });
});
