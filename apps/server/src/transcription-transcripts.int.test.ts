// Seam 1 of spec #74 and the owner's decision in PR #92: a video with its transcript. A file of
// subtitles or text with the video's name is the video's text, so the video needs no recognition.
// The components come from a local HTTP server; stubs stand for ffmpeg and the model.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import {
  attach,
  inboxOf,
  processingEvents,
  readParts,
  startProcessing,
} from "./inbox-test-support.ts";
import { toolResult } from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";
import { transcriptionTarget } from "./transcription-test-support.ts";

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
      { id: transcript.id, status: "ready", parts: null },
      { id: other.id, status: "inbox", parts: null },
    ]);
    expect([...model.heard, ...served.requested]).toStrictEqual([]);
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
