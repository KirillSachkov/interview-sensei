// Seam 3 of spec #74: the real components on this machine. The module downloads the pinned
// sherpa-onnx-node, ffmpeg-static, Silero VAD, yt-dlp, GigaAM and Parakeet into a data directory,
// then recognizes a short Russian clip with GigaAM and a short English clip with Parakeet through
// ffmpeg, VAD and the model, and runs yt-dlp. CI runs it on ubuntu-latest and windows-latest with
// the data directory cached; `pnpm test` never runs it: it downloads 950 MB.
// INTERVIEW_SENSEI_TRANSCRIPTION_LIVE_DIR names the data directory; a temporary one otherwise.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ModelId } from "./domain/components.ts";
import { transcriptionModule } from "./module.ts";

/** A test clip of a model's export at its pinned commit, and what the model must hear in it. */
interface Clip {
  readonly name: string;
  readonly url: string;
  readonly sha256: string;
  readonly language: string;
  readonly model: ModelId;
  readonly seconds: string;
}

/** 11 s of Pushkin, read in Russian: the test clip of the GigaAM export. */
const russianClip: Clip = {
  name: "clip-example.wav",
  url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-transducer-punct-giga-am-v3-russian-2025-12-16/resolve/a6039be7cee829a9044a69ac0ebaf1c191217c97/test_wavs/example.wav",
  sha256: "d8aaaa18a5098d7c6de0595ae7ac1e64cacd0d4022af3595213bdaf23be77e69",
  language: "ru",
  model: "gigaam-v3",
  seconds: "11,3",
};

/** 3.8 s of Kennedy's «Ask not…», in English: the test clip of the Parakeet export. */
const englishClip: Clip = {
  name: "clip-en.wav",
  url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/resolve/ed5d745623472f97cfc2e6c2916ee248798fc5a8/test_wavs/en.wav",
  sha256: "148b936b43ce7c546a866e64da059f0458aee2d65e617f16e9d94f06e8d99ed6",
  language: "en",
  model: "parakeet-v3",
  seconds: "3,8",
};

async function dataDirectory(): Promise<string> {
  const chosen = process.env.INTERVIEW_SENSEI_TRANSCRIPTION_LIVE_DIR ?? "";
  if (chosen !== "") {
    await mkdir(chosen, { recursive: true });
    return chosen;
  }
  return mkdtemp(path.join(tmpdir(), "interview-sensei-transcription-"));
}

/** The bytes of the clip: the copy in the data directory, or a download. */
async function clipBytes(clip: Clip, file: string): Promise<Buffer> {
  try {
    return await readFile(file);
  } catch {
    const response = await fetch(clip.url);
    return Buffer.from(await response.arrayBuffer());
  }
}

/** The clip in the data directory, downloaded once and checked by its SHA-256. */
async function clipFile(clip: Clip, directory: string): Promise<string> {
  const file = path.join(directory, clip.name);
  const bytes = await clipBytes(clip, file);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(clip.sha256);
  await writeFile(file, bytes);
  return file;
}

/** Seconds since `start`, for the log. */
function since(start: number): string {
  return ((performance.now() - start) / 1000).toFixed(2);
}

type Transcription = ReturnType<typeof transcriptionModule>;

/** Downloads the model with the shared components; resolves with the state after the download. */
async function installModel(transcription: Transcription, model: ModelId) {
  const started = performance.now();
  await transcription.install([model]);
  const status = await vi.waitFor(
    async () => {
      const current = await transcription.status();
      expect(current).toMatchObject({ installation: null });
      return current;
    },
    { timeout: 1_500_000, interval: 500 },
  );
  console.log(`Скачивание и проверка компонентов для ${model}: ${since(started)} с`);
  return status;
}

/** Recognizes the clip and logs the time; resolves with the outcome and the percents shown. */
async function recognizeClip(transcription: Transcription, directory: string, clip: Clip) {
  const percents: number[] = [];
  const file = await clipFile(clip, directory);
  const recognizing = performance.now();
  const outcome = await transcription.transcribe({
    file,
    language: clip.language,
    onProgress: (percent) => {
      percents.push(percent);
    },
  });
  console.log(
    `Распознавание клипа ${clip.seconds} с моделью ${clip.model}: ${since(recognizing)} с ` +
      `(${process.platform}-${process.arch}). Итог: ${JSON.stringify(outcome)}`,
  );
  return { outcome, percents };
}

describe("speech recognition with the real components", () => {
  it("downloads GigaAM with the shared components and recognizes a Russian clip", async () => {
    const directory = await dataDirectory();
    const transcription = transcriptionModule({ dataDirectory: directory, onError: () => {} });
    const status = await installModel(transcription, "gigaam-v3");
    const { outcome, percents } = await recognizeClip(transcription, directory, russianClip);

    expect(status).toMatchObject({ failure: null, models: [{ installed: true }, {}] });
    expect(JSON.stringify(outcome)).toMatch(/"text":".*лукоморья дуб зел[её]ный/iu);
    expect(percents.at(-1)).toBeGreaterThan(90);
  });

  it("downloads Parakeet and recognizes an English clip with it", async () => {
    const directory = await dataDirectory();
    const transcription = transcriptionModule({ dataDirectory: directory, onError: () => {} });
    const status = await installModel(transcription, "parakeet-v3");
    const { outcome } = await recognizeClip(transcription, directory, englishClip);

    expect(status).toMatchObject({ failure: null, models: [{}, { installed: true }] });
    expect(JSON.stringify(outcome)).toMatch(/"text":".*ask not what your country can do for you/iu);
  });

  it("runs the downloaded yt-dlp with the application's Node: a link it does not know is a web page", async () => {
    const directory = await dataDirectory();
    const transcription = transcriptionModule({ dataDirectory: directory, onError: () => {} });
    await installModel(transcription, "gigaam-v3");
    const started = performance.now();

    const outcome = await transcription.transcribeLink({
      url: "https://example.com/vacancy",
      language: "ru",
      onProgress: () => {},
    });

    console.log(`Проверка ссылки через yt-dlp: ${since(started)} с`);
    expect(outcome).toStrictEqual({ skipped: "not_video" });
  });
});
