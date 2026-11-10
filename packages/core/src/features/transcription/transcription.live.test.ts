// Seam 3 of spec #74: the real components on this machine. The module downloads the pinned
// sherpa-onnx-node, ffmpeg-static, Silero VAD, yt-dlp and GigaAM into a data directory, then
// recognizes a short Russian clip through ffmpeg, VAD and the model, and runs yt-dlp. CI runs it on ubuntu-latest and
// windows-latest with the data directory cached; `pnpm test` never runs it: it downloads 300 MB.
// INTERVIEW_SENSEI_TRANSCRIPTION_LIVE_DIR names the data directory; a temporary one otherwise.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { transcriptionModule } from "./module.ts";

/** The test clip of the GigaAM export at its pinned commit: 11 s of Pushkin, read in Russian. */
const clip = {
  url: "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-transducer-punct-giga-am-v3-russian-2025-12-16/resolve/a6039be7cee829a9044a69ac0ebaf1c191217c97/test_wavs/example.wav",
  sha256: "d8aaaa18a5098d7c6de0595ae7ac1e64cacd0d4022af3595213bdaf23be77e69",
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
async function clipBytes(file: string): Promise<Buffer> {
  try {
    return await readFile(file);
  } catch {
    const response = await fetch(clip.url);
    return Buffer.from(await response.arrayBuffer());
  }
}

/** The clip in the data directory, downloaded once and checked by its SHA-256. */
async function clipFile(directory: string): Promise<string> {
  const file = path.join(directory, "clip-example.wav");
  const bytes = await clipBytes(file);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(clip.sha256);
  await writeFile(file, bytes);
  return file;
}

type Transcription = ReturnType<typeof transcriptionModule>;

/** Downloads GigaAM with the shared components; resolves with the state after the download. */
async function installGigaam(transcription: Transcription) {
  await transcription.install(["gigaam-v3"]);
  return vi.waitFor(
    async () => {
      const current = await transcription.status();
      expect(current).toMatchObject({ installation: null });
      return current;
    },
    { timeout: 900_000, interval: 500 },
  );
}

/** Seconds since `start`, for the log. */
function since(start: number): string {
  return ((performance.now() - start) / 1000).toFixed(2);
}

/** Recognizes the clip and logs the time; resolves with the outcome and the percents shown. */
async function recognizeClip(transcription: Transcription, directory: string) {
  const percents: number[] = [];
  const file = await clipFile(directory);
  const recognizing = performance.now();
  const outcome = await transcription.transcribe({
    file,
    language: "ru",
    onProgress: (percent) => {
      percents.push(percent);
    },
  });
  console.log(
    `Распознавание клипа 11,3 с: ${since(recognizing)} с (${process.platform}-${process.arch}). ` +
      `Итог: ${JSON.stringify(outcome)}`,
  );
  return { outcome, percents };
}

describe("speech recognition with the real components", () => {
  it("downloads GigaAM with the shared components and recognizes a Russian clip", async () => {
    const directory = await dataDirectory();
    const transcription = transcriptionModule({ dataDirectory: directory, onError: () => {} });
    const started = performance.now();
    const status = await installGigaam(transcription);
    console.log(`Скачивание и проверка компонентов: ${since(started)} с`);
    const { outcome, percents } = await recognizeClip(transcription, directory);

    expect(status).toMatchObject({
      failure: null,
      models: [{ installed: true }, { installed: false }],
    });
    expect(JSON.stringify(outcome)).toMatch(/"text":".*лукоморья дуб зел[её]ный/iu);
    expect(percents.at(-1)).toBeGreaterThan(90);
  });

  it("runs the downloaded yt-dlp with the application's Node: a link it does not know is a web page", async () => {
    const directory = await dataDirectory();
    const transcription = transcriptionModule({ dataDirectory: directory, onError: () => {} });
    await installGigaam(transcription);
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
