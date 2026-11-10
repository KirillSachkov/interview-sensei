// Seam 3 of spec #74: the real components on this machine. The module downloads the pinned
// sherpa-onnx-node, ffmpeg-static, Silero VAD and GigaAM into a data directory, then recognizes a
// short Russian clip through ffmpeg, VAD and the model. CI runs it on ubuntu-latest and
// windows-latest with the data directory cached; `pnpm test` never runs it: it downloads 270 MB.
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
  const chosen = process.env["INTERVIEW_SENSEI_TRANSCRIPTION_LIVE_DIR"];
  if (chosen !== undefined && chosen !== "") {
    await mkdir(chosen, { recursive: true });
    return chosen;
  }
  return mkdtemp(path.join(tmpdir(), "interview-sensei-transcription-"));
}

/** The clip in the data directory, downloaded once and checked by its SHA-256. */
async function clipFile(directory: string): Promise<string> {
  const file = path.join(directory, "clip-example.wav");
  const cached = await readFile(file).catch(() => null);
  const bytes = cached ?? Buffer.from(await (await fetch(clip.url)).arrayBuffer());
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(clip.sha256);
  await writeFile(file, bytes);
  return file;
}

describe("speech recognition with the real components", () => {
  it("downloads GigaAM with the shared components and recognizes a Russian clip", async () => {
    const directory = await dataDirectory();
    const transcription = transcriptionModule({ dataDirectory: directory, onError: () => {} });
    const started = performance.now();
    await transcription.install(["gigaam-v3"]);
    const status = await vi.waitFor(
      async () => {
        const current = await transcription.status();
        expect(current).toMatchObject({ installation: null });
        return current;
      },
      { timeout: 900_000, interval: 500 },
    );
    const downloaded = performance.now();
    const percents: number[] = [];

    const outcome = await transcription.transcribe({
      file: await clipFile(directory),
      language: "ru",
      onProgress: (percent) => percents.push(percent),
    });

    const recognized = performance.now();
    console.log(
      `Скачивание и проверка компонентов: ${((downloaded - started) / 1000).toFixed(1)} с; ` +
        `распознавание клипа 11,3 с: ${((recognized - downloaded) / 1000).toFixed(2)} с ` +
        `(${process.platform}-${process.arch})`,
    );
    console.log(`Текст: ${"text" in outcome ? outcome.text : outcome.failure}`);
    expect(status).toMatchObject({
      failure: null,
      models: [{ installed: true }, { installed: false }],
    });
    expect(outcome).toMatchObject({ text: expect.stringMatching(/лукоморья дуб зел[её]ный/iu) });
    expect(percents.at(-1)).toBeGreaterThan(90);
  });
});
