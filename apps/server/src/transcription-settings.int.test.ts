// Seam 1 of spec #74, ticket #77: «Распознавание речи» in «Настройки»: the languages with their
// models and the deletion of a model. The components come from a local HTTP server; stubs stand
// for ffmpeg and the model.
import { access } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { attach, startProcessing } from "./inbox-test-support.ts";
import {
  heldVideo,
  installModels,
  removeModel,
  transcriptionStatus,
  transcriptionTarget,
} from "./transcription-test-support.ts";
import type { TranscriptionStatus } from "./transcription-test-support.ts";

describe("«Распознавание речи» in «Настройки»", () => {
  it("lists the languages of recognition with the model that hears each of them now", async () => {
    const { server } = await transcriptionTarget(["gigaam-v3"]);

    const { languages } = await transcriptionStatus(server);

    expect(languages).toHaveLength(25);
    expect(languages.slice(0, 2)).toStrictEqual([
      { code: "ru", name: "русский", model: "gigaam-v3" },
      { code: "en", name: "английский", model: null },
    ]);
  });

  it("deletes an installed model with its files, and its language has no model then", async () => {
    const { server, dataDirectory } = await transcriptionTarget(["gigaam-v3", "parakeet-v3"]);

    const response = await removeModel(server, "parakeet-v3");

    expect(response.statusCode).toBe(200);
    expect(response.json<TranscriptionStatus>()).toMatchObject({
      models: [
        { id: "gigaam-v3", installed: true },
        { id: "parakeet-v3", installed: false },
      ],
      shared: { installed: true },
    });
    expect(response.json<TranscriptionStatus>().languages).toContainEqual({
      code: "en",
      name: "английский",
      model: null,
    });
    await expect(
      access(path.join(dataDirectory, "transcription", "parakeet-v3")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to delete a model while the components download", async () => {
    const { server, served } = await transcriptionTarget(["gigaam-v3"]);
    const held = served.hold("parakeet-v3");
    await installModels(server, ["parakeet-v3"]);
    await held.reached;

    const response = await removeModel(server, "gigaam-v3");

    held.release();
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "install_running" });
  });

  it("refuses to delete a model that recognizes a video now", async () => {
    const { server, target, model } = await transcriptionTarget(["gigaam-v3"]);
    await attach(server, { targetId: target.id, name: "interview.mp4", body: heldVideo });
    await Promise.all([startProcessing(server, target.id), model.waiting()]);

    const response = await removeModel(server, "gigaam-v3");

    model.continueSpeech();
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "model_in_use" });
  });
});
