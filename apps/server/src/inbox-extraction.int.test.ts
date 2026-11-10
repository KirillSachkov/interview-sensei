// Seam 1 of spec #47: the server reads the text of each material itself and cuts it into numbered
// parts, which the processing agent reads with read_source.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import {
  addLink,
  attach,
  processingEvents,
  readParts,
  sourcesOnceRead,
  startProcessing,
} from "./inbox-test-support.ts";
import { docxWith, localPage, pdfWith } from "./material-test-support.ts";
import { first } from "./model-test-support.ts";
import { appliedTarget, callTool } from "./setup-test-support.ts";

const article = [
  "<html><head><title>Статья</title></head><body>",
  "<nav>Меню сайта</nav>",
  "<article><h1>Модель памяти Go</h1>",
  `<p>${"Горутины общаются через каналы. ".repeat(12)}</p>`,
  `<p>${"Мьютекс защищает общие данные. ".repeat(12)}</p>`,
  "</article><footer>Подвал</footer></body></html>",
].join("");

/** An active Target and its setup chat. */
async function activeTarget() {
  const { server } = await startServer(await temporaryDirectory());
  const { target, events: setup } = await appliedTarget(server);
  return { server, target, setup };
}

/** Starts the processing of every material, waits for their texts and the agent's first turn. */
async function processAll(server: FastifyInstance, targetId: string) {
  await startProcessing(server, targetId);
  const read = await sourcesOnceRead(server, targetId);
  const { events } = await processingEvents(server, targetId);
  return { read, events };
}

describe("text extraction for Inbox processing", () => {
  it("reads the text of a PDF, a DOCX and a web page's article, and read_source gives it by part", async () => {
    const { server, target, setup } = await activeTarget();
    const pdf = await attach(server, {
      targetId: target.id,
      name: "vacancy [manual].pdf",
      body: pdfWith(["Golang developer", "Goroutines and channels"]),
    });
    const docx = await attach(server, {
      targetId: target.id,
      name: "resume.docx",
      body: docxWith(["Опыт: пять лет на Go", "Kafka & PostgreSQL"]),
    });
    const link = await addLink(setup, { title: "Статья", url: await localPage(article) });

    const { read, events } = await processAll(server, target.id);

    expect(read.map(({ status, parts }) => ({ status, parts }))).toStrictEqual(
      Array.from({ length: 3 }, () => ({ status: "processing", parts: 1 })),
    );
    const texts = [
      ...(await readParts(events, pdf.id, 1)),
      ...(await readParts(events, docx.id, 1)),
      ...(await readParts(events, link, 1)),
    ];
    expect(texts.slice(0, 2)).toStrictEqual([
      "Golang developer\nGoroutines and channels",
      "Опыт: пять лет на Go\n\nKafka & PostgreSQL",
    ]);
    expect(texts[2]).toMatch(/^Модель памяти Go\n\nГорутины общаются через каналы\./u);
    expect(texts[2]).not.toMatch(/Меню сайта|Подвал/u);
  });

  it("cuts a long material into parts and gives each by its number, never cutting the text", async () => {
    const { server, target } = await activeTarget();
    const paragraphs = Array.from(
      { length: 40 },
      (_item, index) => `Абзац-${index + 1}:${"про-горутины-и-каналы-".repeat(18)}`,
    );
    const notes = await attach(server, {
      targetId: target.id,
      name: "notes [manual].md",
      body: paragraphs.join("\n\n"),
    });

    const { read, events } = await processAll(server, target.id);

    expect(first(read).parts).toBe(3);
    const texts = await readParts(events, notes.id, 3);
    expect(texts.join("\n\n")).toBe(paragraphs.join("\n\n"));
    await expect(callTool(events, "read_source", { id: notes.id, part: 4 })).resolves.toBe(
      "Ошибка read_source: The material has parts 1 to 3",
    );
  });

  it("reads subtitles without numbers and times, and a text file as it is", async () => {
    const { server, target } = await activeTarget();
    const subtitles = await attach(server, {
      targetId: target.id,
      name: "interview [manual].srt",
      body: "1\n00:00:01,000 --> 00:00:02,000\nЧто такое горутина?\n\n2\n00:00:02,000 --> 00:00:04,000\nЛёгкий поток.\n",
    });
    const text = await attach(server, { targetId: target.id, name: "notes.txt", body: "Каналы" });

    const { events } = await processAll(server, target.id);

    await expect(readParts(events, subtitles.id, 1)).resolves.toStrictEqual([
      "Что такое горутина?\nЛёгкий поток.",
    ]);
    await expect(readParts(events, text.id, 1)).resolves.toStrictEqual(["Каналы"]);
  });
});
