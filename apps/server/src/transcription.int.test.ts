// Seam 1 of spec #74, ticket #75: the consent to download the components of speech recognition,
// the choice of models, the download with its progress and the SHA-256 check, and a video or audio
// file that the server transcribes before the processing agent reads its text. The components
// come from a local HTTP server; stubs stand for ffmpeg and the model.
import { access } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import {
  attach,
  inboxOf,
  processingEvents,
  readParts,
  startProcessing,
} from "./inbox-test-support.ts";
import { appliedTarget, toolResult } from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";
import {
  afterDownload,
  installed,
  installModels,
  stubTranscription,
  transcriptionStatus,
  heldAtQuarter,
  waitMark,
} from "./transcription-test-support.ts";

async function serverWith(options: Parameters<typeof stubTranscription>[0] = {}) {
  const dataDirectory = await temporaryDirectory();
  const stub = await stubTranscription(options);
  const { server } = await startServer(dataDirectory, { transcription: stub.components });
  return { server, dataDirectory, ...stub };
}

describe("the consent to download speech recognition", () => {
  it("shows both models with their sizes and downloads nothing before the Candidate's consent", async () => {
    const { server, served } = await serverWith();

    const { languages, ...status } = await transcriptionStatus(server);

    expect(languages).toContainEqual({ code: "ru", name: "русский", model: null });
    expect(status).toStrictEqual({
      available: true,
      models: [
        {
          id: "gigaam-v3",
          name: "GigaAM v3",
          languages: "русский",
          size: 17_000,
          installed: false,
        },
        {
          id: "parakeet-v3",
          name: "Parakeet TDT 0.6B v3",
          languages: "25 европейских языков",
          size: 49_000,
          installed: false,
        },
      ],
      shared: { size: 6000, installed: false },
      ytDlp: { size: 4000, installed: false },
      installation: null,
      failure: null,
    });
    expect(served.requested).toStrictEqual([]);
  });

  it("«Скачать» with GigaAM downloads the shared components, yt-dlp and that model with progress, and not the other model", async () => {
    const { server, served } = await serverWith();

    const { started, during, again, after } = await heldDownload(server, served);

    expect({ started, again }).toStrictEqual({ started: 202, again: 409 });
    expect(during.installation).toStrictEqual({
      models: ["gigaam-v3"],
      downloaded: 6000 + 4000 + 8500,
      total: 6000 + 4000 + 17_000,
    });
    expect(after).toMatchObject({
      models: [
        { id: "gigaam-v3", installed: true },
        { id: "parakeet-v3", installed: false },
      ],
      shared: { installed: true },
      ytDlp: { installed: true },
      failure: null,
    });
    expect(served.requested).toStrictEqual(["engine", "ffmpeg", "vad", "yt-dlp", "gigaam-v3"]);
  });

  it("a later «Скачать» of the other model downloads only that model", async () => {
    const { server, served } = await serverWith();
    await installed(server, ["gigaam-v3"]);

    const status = await installed(server, ["parakeet-v3"]);

    const both = await installModels(server, ["gigaam-v3", "parakeet-v3"]);
    expect(status.models.every((model) => model.installed)).toBe(true);
    expect(served.requested).toStrictEqual([
      "engine",
      "ffmpeg",
      "vad",
      "yt-dlp",
      "gigaam-v3",
      "parakeet-v3",
    ]);
    expect(both.statusCode).toBe(200);
  });

  it("«Скачать» without a model downloads only yt-dlp for the subtitles of links", async () => {
    const { server, served } = await serverWith();

    const status = await installed(server, []);

    expect(served.requested).toStrictEqual(["yt-dlp"]);
    expect(status).toMatchObject({
      shared: { installed: false },
      ytDlp: { installed: true },
      models: [{ installed: false }, { installed: false }],
    });
  });

  it("a file whose SHA-256 differs from the pinned one is deleted, and the download fails with the reason", async () => {
    const { server, dataDirectory } = await serverWith({ brokenSha: "gigaam-v3" });

    const status = await installed(server, ["gigaam-v3"]);

    expect(status).toMatchObject({
      shared: { installed: true },
      failure: "контрольная сумма не совпала у gigaam-v3/gigaam-v3.bin: файл удалён",
    });
    expect(status.models[0]?.installed).toBe(false);
    await expect(
      access(path.join(dataDirectory, "transcription", "gigaam-v3")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

/**
 * «Скачать» of GigaAM while the server holds its file halfway: the answers to the start and to a
 * second «Скачать», the state during the download and after it.
 */
async function heldDownload(
  server: FastifyInstance,
  served: Awaited<ReturnType<typeof stubTranscription>>["served"],
) {
  const held = served.hold("gigaam-v3");
  const started = await installModels(server, ["gigaam-v3"]);
  await held.reached;
  const during = await transcriptionStatus(server);
  const again = await installModels(server, ["parakeet-v3"]);
  held.release();
  const after = await afterDownload(server);
  return { started: started.statusCode, during, again: again.statusCode, after };
}

/** An active Target and its setup chat on a server with the stand-ins, GigaAM installed. */
async function targetWithGigaam() {
  const stub = await serverWith();
  await installed(stub.server, ["gigaam-v3"]);
  const { target } = await appliedTarget(stub.server);
  return { ...stub, target };
}

describe("a video or audio file in Inbox processing", () => {
  it("is «транскрибируется» with the percent heard, then the agent reads its recognized text", async () => {
    const { server, target, model } = await targetWithGigaam();
    const video = await attach(server, {
      targetId: target.id,
      name: "interview [manual].mp4",
      body: `Расскажите про горутины.\n${waitMark}\nЧто такое канал?\nСпасибо.\n`,
    });

    await startProcessing(server, target.id);
    const during = await heldAtQuarter(server, { targetId: target.id, model });
    model.continueSpeech();
    const { events } = await processingEvents(server, target.id);

    expect(during).toMatchObject({ title: "interview [manual].mp4", parts: null });
    await expect(readParts(events, video.id, 1)).resolves.toStrictEqual([
      "Расскажите про горутины. Что такое канал? Спасибо.",
    ]);
    await expect(sources(server, target.id)).resolves.toMatchObject([
      { status: "processing", progress: null, parts: 1 },
    ]);
    expect(model.heard).toStrictEqual(["gigaam-v3"]);
  });

  it("an audio file goes through recognition too, and a file without sound gets «ошибка» with the reason", async () => {
    const { server, target } = await targetWithGigaam();
    const audio = await attach(server, {
      targetId: target.id,
      name: "lecture [manual].m4a",
      body: "Лекция про планировщик Go.\n",
    });
    await attach(server, { targetId: target.id, name: "silence.mp3", body: "[без звука]\n" });

    await startProcessing(server, target.id);
    const { events } = await processingEvents(server, target.id);

    await expect(readParts(events, audio.id, 1)).resolves.toStrictEqual([
      "Лекция про планировщик Go.",
    ]);
    const list = await sources(server, target.id);
    expect(list.map(({ title, status, failure }) => ({ title, status, failure }))).toStrictEqual([
      { title: "lecture [manual].m4a", status: "processing", failure: null },
      { title: "silence.mp3", status: "failed", failure: "в файле нет звука" },
    ]);
  });

  it("the processing card marks a video among the proposed materials", async () => {
    const { server } = await serverWith();
    const { target, events: setup } = await appliedTarget(server);
    const video = await attach(server, {
      targetId: target.id,
      name: "talk.mov",
      body: "Привет.\n",
    });
    const notes = await attach(server, {
      targetId: target.id,
      name: "notes.md",
      body: "# Заметки",
    });

    await toolResult(setup, "propose_inbox_processing", {
      sources: [
        { id: video.id, assessment: "запись доклада" },
        { id: notes.id, assessment: "заметки" },
      ],
    });

    await expect(inboxOf(server, target.id)).resolves.toMatchObject({
      proposal: {
        items: [
          { title: "talk.mov", video: true },
          { title: "notes.md", video: false },
        ],
      },
    });
  });
});
