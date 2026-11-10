// Seam 1 of spec #74 and the owner's decision in PR #92: a video with its transcript. A file of
// subtitles or text with the video's name is the video's text, so the video needs no recognition.
// The bound transcript follows its video: «готов» with it, back to the Inbox with it.
// The components come from a local HTTP server; stubs stand for ffmpeg and the model.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { startServer } from "./chat-test-support.ts";
import {
  attach,
  inboxOf,
  processingEvents,
  readParts,
  startProcessing,
  stopProcessing,
} from "./inbox-test-support.ts";
import { toolResult } from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";
import { stubTranscription, transcriptionTarget } from "./transcription-test-support.ts";

/** The id, status and parts of each of the Target's Sources. */
async function statuses(server: FastifyInstance, targetId: string) {
  const list = await sources(server, targetId);
  return list.map(({ id, status, parts }) => ({ id, status, parts }));
}

/** Subtitles of a recording as a player exports them. */
const subtitles = `WEBVTT

00:00:01.000 --> 00:00:03.000
Расскажите про горутины.

00:00:04.000 --> 00:00:06.000
Что такое канал?
`;

/** A `[manual]` video and its transcript with the same name, attached to the Target. */
async function videoWithTranscript(server: FastifyInstance, targetId: string) {
  const video = await attach(server, { targetId, name: "talk [manual].mp4", body: "A\n" });
  const transcript = await attach(server, { targetId, name: "talk [manual].vtt", body: subtitles });
  return { video, transcript };
}

describe("a video with its transcript", () => {
  it("takes the text of the transcript with the same name, without recognition or a download", async () => {
    const { server, target, model, served } = await transcriptionTarget([]);
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
    await expect(statuses(server, target.id)).resolves.toStrictEqual([
      { id: video.id, status: "processing", parts: 1 },
      { id: transcript.id, status: "processing", parts: null },
      { id: other.id, status: "inbox", parts: null },
    ]);
    expect([...model.heard, ...served.requested]).toStrictEqual([]);
  });

  it("the agent sees only the video, and the transcript becomes «готов» with it", async () => {
    const { server, target } = await transcriptionTarget([]);
    const { video, transcript } = await videoWithTranscript(server, target.id);

    await startProcessing(server, target.id, [video.id]);
    const { events } = await processingEvents(server, target.id);
    const listed = await toolResult(events, "list_inbox");
    await readParts(events, video.id, 1);
    await toolResult(events, "write_inbox_report", { summary: "Собеседование." });

    expect(listed).toMatchObject([{ id: video.id }]);
    expect(listed).toHaveLength(1);
    await expect(statuses(server, target.id)).resolves.toStrictEqual([
      { id: video.id, status: "ready", parts: 1 },
      { id: transcript.id, status: "ready", parts: null },
    ]);
  });

  it("goes back to the Inbox when its video gets «ошибка»", async () => {
    const { server, target } = await transcriptionTarget([]);
    const { video, transcript } = await videoWithTranscript(server, target.id);

    await startProcessing(server, target.id, [video.id]);
    const { events } = await processingEvents(server, target.id);
    await readParts(events, video.id, 1);
    await toolResult(events, "mark_source_failed", { id: video.id, reason: "запись о другом" });
    await toolResult(events, "write_inbox_report", { summary: "Ничего." });

    await expect(statuses(server, target.id)).resolves.toStrictEqual([
      { id: video.id, status: "failed", parts: 1 },
      { id: transcript.id, status: "inbox", parts: null },
    ]);
  });

  it("goes back to the Inbox with its video on «Остановить разбор»", async () => {
    const { server, target } = await transcriptionTarget([]);
    const { video, transcript } = await videoWithTranscript(server, target.id);

    await startProcessing(server, target.id, [video.id]);
    await processingEvents(server, target.id);
    await stopProcessing(server, target.id);

    await expect(statuses(server, target.id)).resolves.toStrictEqual([
      { id: video.id, status: "inbox", parts: 1 },
      { id: transcript.id, status: "inbox", parts: null },
    ]);
  });

  it("goes back to the Inbox with its video after a restart", async () => {
    const { server, stop, dataDirectory, target } = await transcriptionTarget([]);
    const { video, transcript } = await videoWithTranscript(server, target.id);
    await startProcessing(server, target.id, [video.id]);
    await processingEvents(server, target.id);

    await stop();
    const again = await stubTranscription();
    const restarted = await startServer(dataDirectory, { transcription: again.components });

    await expect(statuses(restarted.server, target.id)).resolves.toStrictEqual([
      { id: video.id, status: "inbox", parts: 1 },
      { id: transcript.id, status: "inbox", parts: null },
    ]);
  });

  it("needs no speech recognition in the processing card, which names the bound transcript", async () => {
    const { server, target, setup } = await transcriptionTarget([]);
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
