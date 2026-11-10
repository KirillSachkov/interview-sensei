// Seam 1 of spec #74, ticket #77: «Остановить разбор» and a restart during a transcription, a
// finished transcript that is never recognized again, the refusal to download and the model of
// the file's language. The components come from a local HTTP server; stubs stand for ffmpeg and
// the model.
import { access } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";

import {
  agentTexts,
  isIdle,
  openEvents,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import {
  attach,
  inboxOf,
  processingEvents,
  readParts,
  startProcessing,
  stopProcessing,
} from "./inbox-test-support.ts";
import { api, appliedTarget, toolResult } from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";
import {
  installed,
  installModels,
  removeModel,
  stubTranscription,
  transcriptionStatus,
  waitMark,
} from "./transcription-test-support.ts";
import type { TranscriptionStatus } from "./transcription-test-support.ts";

/** A server with the stand-ins on its own data directory, the models of `models` installed. */
async function serverWith(models: Parameters<typeof installed>[1] = ["gigaam-v3"]) {
  const dataDirectory = await temporaryDirectory();
  const stub = await stubTranscription();
  const { server, stop } = await startServer(dataDirectory, { transcription: stub.components });
  if (models.length > 0) {
    await installed(server, models);
  }
  const { target, events: setup } = await appliedTarget(server);
  return { server, stop, dataDirectory, target, setup, ...stub };
}

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

/** A video whose recognition waits at «[ждать]» until the test lets it go on. */
const heldVideo = `Расскажите про горутины.\n${waitMark}\nЧто такое канал?\n`;

describe("a running transcription", () => {
  it("«Остановить разбор» cancels it, and the video goes back to the Inbox without a text", async () => {
    const { server, target, model } = await serverWith();
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
    const { server, stop, dataDirectory, target, model } = await serverWith();
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
    const { server, target, model } = await serverWith();
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
});

describe("the refusal to download speech recognition", () => {
  it("gives a video «ошибка» with a hint, and the other materials are processed", async () => {
    const { server, target } = await serverWith([]);
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
    const { server, target, model } = await serverWith(["gigaam-v3", "parakeet-v3"]);
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

    const started = await startProcessing(server, target.id, [russian.id, english.id], {
      [english.id]: "en",
    });
    const { events } = await processingEvents(server, target.id);

    expect(started.statusCode).toBe(202);
    await expect(readParts(events, english.id, 1)).resolves.toStrictEqual([
      "Tell me about goroutines.",
    ]);
    expect(model.heard).toStrictEqual(["gigaam-v3", "parakeet-v3"]);
  });

  it("without a model for it gives «ошибка» with a hint to install Parakeet or attach a transcript", async () => {
    const { server, target } = await serverWith(["gigaam-v3"]);
    const english = await attach(server, {
      targetId: target.id,
      name: "talk.mp4",
      body: "Tell me about goroutines.\n",
    });
    const japanese = await attach(server, { targetId: target.id, name: "tokyo.mp4", body: "A\n" });
    await attach(server, { targetId: target.id, name: "notes [manual].md", body: "Каналы." });

    await startProcessing(server, target.id, undefined, { [english.id]: "en", [japanese.id]: "ja" });
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

  it("is refused at the start when it is not a language code", async () => {
    const { server, target } = await serverWith([]);
    const video = await attach(server, { targetId: target.id, name: "talk.mp4", body: "A\n" });

    const started = await startProcessing(server, target.id, [video.id], {
      [video.id]: "английский; rm -rf",
    });

    expect(started.statusCode).toBe(400);
  });
});

describe("«Распознавание речи» in «Настройки»", () => {
  it("lists the languages of recognition with the model that hears each of them now", async () => {
    const { server } = await serverWith(["gigaam-v3"]);

    const { languages } = await transcriptionStatus(server);

    expect(languages).toHaveLength(25);
    expect(languages.slice(0, 2)).toStrictEqual([
      { code: "ru", name: "русский", model: "gigaam-v3" },
      { code: "en", name: "английский", model: null },
    ]);
  });

  it("deletes an installed model with its files, and its language has no model then", async () => {
    const { server, dataDirectory } = await serverWith(["gigaam-v3", "parakeet-v3"]);

    const response = await removeModel(server, "parakeet-v3");

    expect(response.statusCode).toBe(200);
    expect(response.json<TranscriptionStatus>()).toMatchObject({
      models: [
        { id: "gigaam-v3", installed: true },
        { id: "parakeet-v3", installed: false },
      ],
      shared: { installed: true },
      languages: expect.arrayContaining([{ code: "en", name: "английский", model: null }]),
    });
    await expect(
      access(path.join(dataDirectory, "transcription", "parakeet-v3")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to delete a model while the components download", async () => {
    const { server, served } = await serverWith(["gigaam-v3"]);
    const held = served.hold("parakeet-v3");
    await installModels(server, ["parakeet-v3"]);
    await held.reached;

    const response = await removeModel(server, "gigaam-v3");

    held.release();
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "install_running" });
  });

  it("refuses to delete a model that recognizes a video now", async () => {
    const { server, target, model } = await serverWith(["gigaam-v3"]);
    await attach(server, { targetId: target.id, name: "interview.mp4", body: heldVideo });
    await Promise.all([startProcessing(server, target.id), model.waiting()]);

    const response = await removeModel(server, "gigaam-v3");

    model.continueSpeech();
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "model_in_use" });
  });
});

/** Subtitles of a recording as a player exports them. */
const subtitles = `WEBVTT

00:00:01.000 --> 00:00:03.000
Расскажите про горутины.

00:00:04.000 --> 00:00:06.000
Что такое канал?
`;

describe("a video with its transcript", () => {
  it("takes the text of the transcript with the same name, without recognition or a download", async () => {
    const { server, target, model, served } = await serverWith([]);
    const video = await attach(server, {
      targetId: target.id,
      name: "interview [manual].mp4",
      body: "Неразборчиво.\n",
    });
    const transcript = await attach(server, {
      targetId: target.id,
      name: "Interview [manual].VTT",
      body: subtitles,
    });
    const other = await attach(server, {
      targetId: target.id,
      name: "lecture.srt",
      body: "1\n00:00:01,000 --> 00:00:02,000\nЛекция.\n",
    });

    await startProcessing(server, target.id, [video.id]);
    const { events } = await processingEvents(server, target.id);

    await expect(readParts(events, video.id, 1)).resolves.toStrictEqual([
      "Расскажите про горутины.\nЧто такое канал?",
    ]);
    const list = await sources(server, target.id);
    expect(list.map(({ id, status, parts }) => ({ id, status, parts }))).toStrictEqual([
      { id: video.id, status: "processing", parts: 1 },
      { id: transcript.id, status: "ready", parts: null },
      { id: other.id, status: "inbox", parts: null },
    ]);
    expect(model.heard).toStrictEqual([]);
    expect(served.requested).toStrictEqual([]);
  });

  it("needs no speech recognition in the processing card, which names the bound transcript", async () => {
    const { server, target, setup } = await serverWith([]);
    const video = await attach(server, { targetId: target.id, name: "talk.mov", body: "A\n" });
    const transcript = await attach(server, {
      targetId: target.id,
      name: "talk.txt",
      body: "Доклад про Go.",
    });

    await toolResult(setup, "propose_inbox_processing", {
      sources: [
        { id: video.id, assessment: "запись доклада" },
        { id: transcript.id, assessment: "транскрипт доклада" },
      ],
    });

    await expect(inboxOf(server, target.id)).resolves.toMatchObject({
      proposal: {
        items: [
          { title: "talk.mov", video: false, transcript: "talk.txt" },
          { title: "talk.txt", video: false, transcript: null },
        ],
      },
    });
  });
});
