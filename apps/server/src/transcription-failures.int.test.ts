// Seam 1 of spec #74, ticket #77: «Остановить разбор» and a restart during a transcription, a
// finished transcript that is never recognized again, the refusal to download and the model of
// the file's language. The components come from a local HTTP server; stubs stand for ffmpeg and
// the model.
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { agentTexts, isIdle, openEvents, startServer } from "./chat-test-support.ts";
import {
  addLink,
  attach,
  inboxOf,
  processingEvents,
  readParts,
  startProcessing,
  stopProcessing,
} from "./inbox-test-support.ts";
import { api, toolResult } from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";
import {
  heldVideo,
  startWithLanguages,
  stubTranscription,
  transcriptionTarget,
} from "./transcription-test-support.ts";

/** The Target's Sources once the first one has the status. */
async function sourcesOnceFirst(server: FastifyInstance, targetId: string, status: string) {
  return vi.waitFor(
    async () => {
      const list = await sources(server, targetId);
      expect(list[0]?.status).toBe(status);
      return list;
    },
    { timeout: 10_000, interval: 20 },
  );
}

/** The Target's Inbox processing sessions, once there are `count` of them. */
async function processingSessions(server: FastifyInstance, targetId: string, count: number) {
  return vi.waitFor(
    async () => {
      const response = await api(server).get("/api/sessions");
      const list = response
        .json<{ id: string; kind: string; targetId?: string | null }[]>()
        .filter((session) => session.kind === "inbox-processing" && session.targetId === targetId);
      expect(list).toHaveLength(count);
      return list;
    },
    { timeout: 10_000, interval: 50 },
  );
}

/** The events of the Target's second Inbox processing after the fake processor's first turn. */
async function secondProcessing(
  server: FastifyInstance,
  { targetId, first }: { targetId: string; first: string },
) {
  const list = await processingSessions(server, targetId, 2);
  const second = list.find((session) => session.id !== first);
  if (second === undefined) {
    throw new Error("No second Inbox processing");
  }
  const events = await openEvents(server, second.id);
  await events.waitFor(
    (view) => isIdle(view) && agentTexts(view).some((text) => text.endsWith("Жду команд.")),
  );
  return events;
}

describe("a running transcription", () => {
  it("«Остановить разбор» cancels it, and the video goes back to the Inbox without a text", async () => {
    const { server, target, model } = await transcriptionTarget();
    await attach(server, { targetId: target.id, name: "interview.mp4", body: heldVideo });
    await Promise.all([startProcessing(server, target.id), model.waiting()]);

    const stopped = await stopProcessing(server, target.id);

    expect(stopped.statusCode).toBe(200);
    await vi.waitFor(() => {
      expect(model.cancelled).toBe(1);
    });
    await expect(sources(server, target.id)).resolves.toMatchObject([
      { title: "interview.mp4", status: "inbox", progress: null, parts: null, failure: null },
    ]);
  });

  it("the server's close does not wait for it, and after a restart the video is back in the Inbox", async () => {
    const { server, stop, dataDirectory, target, model } = await transcriptionTarget();
    await attach(server, { targetId: target.id, name: "interview.mp4", body: heldVideo });
    await Promise.all([startProcessing(server, target.id), model.waiting()]);

    await stop();
    const again = await stubTranscription();
    const restarted = await startServer(dataDirectory, { transcription: again.components });

    expect(model.cancelled).toBe(1);
    await expect(sourcesOnceFirst(restarted.server, target.id, "inbox")).resolves.toMatchObject([
      { title: "interview.mp4", status: "inbox", progress: null, parts: null, failure: null },
    ]);
  });

  it("a finished transcript stays with the video and is not recognized again in the next processing", async () => {
    const { server, target, model } = await transcriptionTarget();
    const video = await attach(server, {
      targetId: target.id,
      name: "interview [manual].mp4",
      body: "Расскажите про горутины.\nЧто такое канал?\n",
    });
    await startProcessing(server, target.id);
    const first = await processingEvents(server, target.id);
    await expect(stopProcessing(server, target.id)).resolves.toMatchObject({ statusCode: 200 });

    await startProcessing(server, target.id);
    const events = await secondProcessing(server, { targetId: target.id, first: first.session.id });

    expect(model.heard).toStrictEqual(["gigaam-v3"]);
    await expect(readParts(events, video.id, 1)).resolves.toStrictEqual([
      "Расскажите про горутины. Что такое канал?",
    ]);
  });

  it("a finished transcript of a link to a video on a site outside the known hostings is not recognized again", async () => {
    const { server, target, setup, model, links } = await transcriptionTarget();
    const url = "https://talks.example.org/go/interview";
    links.add(url, { language: "ru", speech: "Расскажите про горутины.\nЧто такое канал?\n" });
    const link = await addLink(setup, { title: "Доклад [manual]", url });
    await startProcessing(server, target.id);
    const first = await processingEvents(server, target.id);
    await expect(stopProcessing(server, target.id)).resolves.toMatchObject({ statusCode: 200 });

    await startProcessing(server, target.id);
    const events = await secondProcessing(server, { targetId: target.id, first: first.session.id });

    expect(model.heard).toStrictEqual(["gigaam-v3"]);
    expect(links.calls.inspected).toStrictEqual([url]);
    await expect(readParts(events, link, 1)).resolves.toStrictEqual([
      "Расскажите про горутины. Что такое канал?",
    ]);
  });
});

describe("the refusal to download speech recognition", () => {
  it("gives a video «ошибка» with a hint, and the other materials are processed", async () => {
    const { server, target } = await transcriptionTarget([]);
    await attach(server, { targetId: target.id, name: "interview.mp4", body: "Привет.\n" });
    await attach(server, { targetId: target.id, name: "notes [manual].md", body: "Каналы." });

    await startProcessing(server, target.id);
    await processingEvents(server, target.id);

    const list = await sources(server, target.id);
    expect(list.map(({ title, status, failure }) => ({ title, status, failure }))).toStrictEqual([
      {
        title: "interview.mp4",
        status: "failed",
        failure:
          "распознавание речи не установлено: скачайте модель в «Настройки» → «Распознавание речи» или приложите транскрипт с тем же именем файла",
      },
      { title: "notes [manual].md", status: "processing", failure: null },
    ]);
  });
});

describe("the language of a file", () => {
  it("is the Target's language by default, and the card's choice sends each file to the model of its language", async () => {
    const { server, target, model } = await transcriptionTarget(["gigaam-v3", "parakeet-v3"]);
    const russian = await attach(server, {
      targetId: target.id,
      name: "собеседование [manual].mp4",
      body: "Расскажите про горутины.\n",
    });
    const english = await attach(server, {
      targetId: target.id,
      name: "talk [manual].mp4",
      body: "Tell me about goroutines.\n",
    });

    const started = await startWithLanguages(server, {
      targetId: target.id,
      sourceIds: [russian.id, english.id],
      languages: { [english.id]: "en" },
    });
    const { events } = await processingEvents(server, target.id);

    expect(started.statusCode).toBe(202);
    await expect(readParts(events, english.id, 1)).resolves.toStrictEqual([
      "Tell me about goroutines.",
    ]);
    expect(model.heard).toStrictEqual(["gigaam-v3", "parakeet-v3"]);
  });

  it("without a model for it gives «ошибка» with a hint to install Parakeet or attach a transcript", async () => {
    const { server, target } = await transcriptionTarget(["gigaam-v3"]);
    const english = await attach(server, {
      targetId: target.id,
      name: "talk.mp4",
      body: "Tell me about goroutines.\n",
    });
    const japanese = await attach(server, { targetId: target.id, name: "tokyo.mp4", body: "A\n" });
    await attach(server, { targetId: target.id, name: "notes [manual].md", body: "Каналы." });

    await startWithLanguages(server, {
      targetId: target.id,
      languages: { [english.id]: "en", [japanese.id]: "ja" },
    });
    await processingEvents(server, target.id);

    const list = await sources(server, target.id);
    expect(list.slice(0, 2).map(({ status, failure }) => ({ status, failure }))).toStrictEqual([
      {
        status: "failed",
        failure:
          "нет модели для языка «английский»: установите Parakeet TDT 0.6B v3 в «Настройки» → «Распознавание речи» или приложите транскрипт с тем же именем файла",
      },
      {
        status: "failed",
        failure:
          "распознавание речи не знает язык «ja»: приложите транскрипт с тем же именем файла",
      },
    ]);
  });

  it("is offered in the processing card with the Target's language for a video", async () => {
    const { server, target, setup } = await transcriptionTarget([]);
    const video = await attach(server, { targetId: target.id, name: "talk.mp4", body: "A\n" });
    const notes = await attach(server, { targetId: target.id, name: "notes.md", body: "B" });

    await toolResult(setup, "propose_inbox_processing", {
      sources: [
        { id: video.id, assessment: "доклад" },
        { id: notes.id, assessment: "заметки" },
      ],
    });

    await expect(inboxOf(server, target.id)).resolves.toMatchObject({
      proposal: {
        items: [
          { title: "talk.mp4", video: true, language: target.language },
          { title: "notes.md", video: false, language: null },
        ],
      },
    });
  });

  it("is refused at the start when it is not a language code", async () => {
    const { server, target } = await transcriptionTarget([]);
    const video = await attach(server, { targetId: target.id, name: "talk.mp4", body: "A\n" });

    const started = await startWithLanguages(server, {
      targetId: target.id,
      sourceIds: [video.id],
      languages: { [video.id]: "английский; rm -rf" },
    });

    expect(started.statusCode).toBe(400);
  });
});
