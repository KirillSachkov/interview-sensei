// Seam 1 of spec #47: the status «ошибка» of a material with its reason. The agent gives it with
// mark_source_failed; the server gives it to a format it cannot read, to a material without text,
// to a video file without speech recognition installed and to a video link without a transcript.
// A web page the server could not read stays for the agent, which opens it on the web.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import {
  addLink,
  attach,
  inboxOf,
  latestReportId,
  manualProcessing,
  processingEvents,
  readParts,
  startProcessing,
  stopProcessing,
  textOf,
  topicOf,
} from "./inbox-test-support.ts";
import { reportOf } from "./inbox-report-test-support.ts";
import { localPage, materialQuestion } from "./material-test-support.ts";
import { api, appliedTarget, callTool, toolResult } from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";

async function activeTarget() {
  const { server } = await startServer(await temporaryDirectory());
  const { target, events: setup } = await appliedTarget(server);
  return { server, target, setup };
}

/** The Target's materials by title with their status and reason, once none is «разбирается». */
async function settled(server: FastifyInstance, targetId: string) {
  await latestReportId(server, targetId);
  const list = await sources(server, targetId);
  return Object.fromEntries(list.map(({ title, status, failure }) => [title, { status, failure }]));
}

/** The processing after its end: its latest report and how many processing sessions started. */
async function ending(server: FastifyInstance, targetId: string) {
  const { run, unprocessed, latestReport } = await inboxOf(server, targetId);
  const { partial, added, summary } = await reportOf(server, targetId, textOf(latestReport, "id"));
  const response = await api(server).get("/api/sessions");
  const sessions = response.json<{ kind: string }[]>();
  return {
    run,
    unprocessed,
    report: { partial, added, summary },
    processingSessions: sessions.filter((session) => session.kind === "inbox-processing").length,
  };
}

/** A link to a page that answers 404 on a local HTTP server. */
async function missingPage(): Promise<string> {
  const page = await localPage("<p>?</p>");
  return page.replace(/\/page$/u, "/missing");
}

/** A processing of one link that the server cannot read, with its agent waiting for commands. */
async function unreadableLink() {
  const { server, target, setup } = await activeTarget();
  const url = await missingPage();
  const link = await addLink(setup, { title: "Статья [manual]", url });
  await startProcessing(server, target.id);
  const { events } = await processingEvents(server, target.id);
  return { server, target, url, link, events };
}

/** The agent's tool calls for an unread page: list, read, a Question with a part and without. */
async function webCalls({ target, link, events }: Awaited<ReturnType<typeof unreadableLink>>) {
  const question = materialQuestion(
    { topicId: topicOf(target, "Go"), sourceId: link },
    "Что такое канал?",
  );
  const { part: _part, ...withoutPart } = question;
  return {
    listed: await toolResult(events, "list_inbox", {}),
    read: await callTool(events, "read_source", { id: link, part: 1 }),
    withPart: await callTool(events, "add_bank_questions", { questions: [question] }),
    added: await toolResult(events, "add_bank_questions", { questions: [withoutPart] }),
  };
}

describe("the status «ошибка» of a material", () => {
  it("mark_source_failed gives a material of the processing «ошибка» with the agent's reason, and the report keeps it", async () => {
    const { server, target, file, notes, events } = await manualProcessing({ notes: true });
    const notesId = textOf(notes, "id");
    const stranger = crypto.randomUUID();
    await toolResult(events, "read_source", { id: file.id, part: 1 });

    const replies = {
      marked: await toolResult(events, "mark_source_failed", {
        id: notesId,
        reason: "заметки о другой вакансии",
      }),
      refused: await callTool(events, "mark_source_failed", {
        id: stranger,
        reason: "?",
      }),
    };
    const written = await toolResult(events, "write_inbox_report", { summary: "Вакансия." });

    expect(replies).toStrictEqual({
      marked: { id: notesId, status: "failed", failure: "заметки о другой вакансии" },
      refused: `Ошибка mark_source_failed: The Source ${stranger} is not a material of this processing`,
    });
    await expect(settled(server, target.id)).resolves.toStrictEqual({
      "vacancy [manual].md": { status: "ready", failure: null },
      "notes.md": { status: "failed", failure: "заметки о другой вакансии" },
    });
    const report = await reportOf(server, target.id, textOf(written, "reportId"));
    expect(report.sources.map(({ status }) => status)).toStrictEqual(["ready", "failed"]);
  });

  it("the server gives «ошибка» to a format it cannot read, an archive and a material without text, and with nothing to read ends the processing with a partial report and no agent", async () => {
    const { server, target } = await activeTarget();
    for (const [name, body] of [
      ["materials.zip", Buffer.from([80, 75, 3, 4, 0, 0])],
      ["slides.key", "?"],
      ["empty.md", "  \n\n  "],
    ] as const) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the materials keep their order
      await attach(server, { targetId: target.id, name, body });
    }

    await expect(startProcessing(server, target.id)).resolves.toMatchObject({ statusCode: 202 });

    await expect(settled(server, target.id)).resolves.toStrictEqual({
      "materials.zip": { status: "failed", failure: "формат не поддерживается" },
      "slides.key": { status: "failed", failure: "формат не поддерживается" },
      "empty.md": { status: "failed", failure: "в материале нет текста" },
    });
    await expect(ending(server, target.id)).resolves.toStrictEqual({
      run: null,
      unprocessed: 0,
      report: {
        partial: true,
        added: 0,
        summary:
          "Сервер не смог прочитать ни один материал: причина — у каждого материала. Разобрано полностью: 0 из 3. С ошибкой: 3.",
      },
      processingSessions: 0,
    });
  });

  it("a video file without speech recognition installed and a video link get «ошибка» with what to do, and the attached transcript is processed by its text", async () => {
    const { server, target, setup } = await activeTarget();
    await attach(server, {
      targetId: target.id,
      name: "interview.mp4",
      body: Buffer.from([0, 0, 0, 24]),
    });
    await addLink(setup, { title: "Запись собеседования", url: "https://youtu.be/dQw4w9WgXcQ" });
    const transcript = await attach(server, {
      targetId: target.id,
      name: "interview [manual].vtt",
      body: "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nРасскажите про горутины.\n",
    });

    await startProcessing(server, target.id);

    const { events } = await processingEvents(server, target.id);
    const list = await sources(server, target.id);
    expect(list.map(({ title, status, failure }) => ({ title, status, failure }))).toStrictEqual([
      {
        title: "interview.mp4",
        status: "failed",
        failure:
          "распознавание речи не установлено: скачайте модель в «Настройки» → «Распознавание речи» или приложите транскрипт с тем же именем файла",
      },
      { title: "Запись собеседования", status: "failed", failure: "приложите транскрипт" },
      { title: "interview [manual].vtt", status: "processing", failure: null },
    ]);
    await expect(readParts(events, transcript.id, 1)).resolves.toStrictEqual([
      "Расскажите про горутины.",
    ]);
  });

  it("a web page the server could not read stays «разбирается» without parts: the agent adds its Questions without a part, and its report makes the page «готов»", async () => {
    const processing = await unreadableLink();
    const { server, target, url, link, events } = processing;

    const replies = await webCalls(processing);
    const written = await toolResult(events, "write_inbox_report", { summary: "Статья." });

    expect(replies).toMatchObject({
      listed: [{ id: link, status: "processing", parts: null, url }],
      read: "Ошибка read_source: The server could not read this page: open its url on the web and add its Questions without a part, or call mark_source_failed",
      withPart: `Ошибка add_bank_questions: The server could not read the Source ${link}: give no part`,
      added: { added: [{ text: "Что такое канал?" }], duplicates: [] },
    });
    await expect(settled(server, target.id)).resolves.toStrictEqual({
      "Статья [manual]": { status: "ready", failure: null },
    });
    const report = await reportOf(server, target.id, textOf(written, "reportId"));
    const questions = report.sections.flatMap((section) =>
      section.topics.flatMap((topic) => topic.questions),
    );
    expect(questions).toMatchObject([
      { source: { id: link, part: null }, referenceAnswer: { origin: "material", part: null } },
    ]);
  });

  it("a web page the server could not read goes back to the Inbox when the processing stops before the agent's report", async () => {
    const { server, target } = await unreadableLink();

    await expect(stopProcessing(server, target.id)).resolves.toMatchObject({ statusCode: 200 });

    await expect(settled(server, target.id)).resolves.toStrictEqual({
      "Статья [manual]": { status: "inbox", failure: null },
    });
  });
});
