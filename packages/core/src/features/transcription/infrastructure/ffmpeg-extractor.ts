// The sound of a recording through the downloaded ffmpeg-static, never a system ffmpeg: ffmpeg
// decodes any container to mono 32-bit float samples at 16 kHz on its standard output, so no
// temporary sound file is written. Its standard error gives the duration for the percent.
import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import path from "node:path";

import type { Audio, AudioExtractor } from "../domain/ports.ts";
import { TranscriptionError } from "../domain/recognition.ts";
import { componentsDirectory } from "./component-store.ts";

/** The first `Duration: HH:MM:SS.xx` of ffmpeg's log, in seconds. */
function durationOf(log: string): number | null {
  const match = /Duration: (?<hours>\d+):(?<minutes>\d{2}):(?<seconds>\d{2}(?:\.\d+)?)/u.exec(log);
  if (match?.groups === undefined) {
    return null;
  }
  const { hours, minutes, seconds } = match.groups;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** The last lines of ffmpeg's log that the Candidate may understand. */
function reason(log: string): string {
  if (/does not contain any stream|Output file is empty|matches no streams/u.test(log)) {
    return "в файле нет звука";
  }
  if (/Invalid data found when processing input/u.test(log)) {
    return "звук не извлечён: файл повреждён или это не видео и не аудио";
  }
  const last = log.trim().split("\n").at(-1) ?? "";
  return `звук не извлечён: ${last.slice(0, 200)}`;
}

/** The program of the ffmpeg component in the data directory. */
function ffmpegPath(dataDirectory: string): string {
  const name = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(componentsDirectory(dataDirectory), "ffmpeg", name);
}

/** Copies whole 4-byte samples out of the chunks; the rest waits for the next chunk. */
function samplesOf(pending: Buffer): { samples: Float32Array; rest: Buffer } {
  const usable = pending.length - (pending.length % 4);
  const samples = new Float32Array(usable / 4);
  new Uint8Array(samples.buffer).set(pending.subarray(0, usable));
  return { samples, rest: pending.subarray(usable) };
}

/** ffmpeg's arguments: any input to mono 32-bit float samples at 16 kHz on standard output. */
function argumentsFor(file: string): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-i",
    file,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "f32le",
    "pipe:1",
  ];
}

/**
 * Follows ffmpeg's log: the duration once the log names it, and the exit code with the log at the
 * end. `ended` never rejects: a failed start gives the code null and the error.
 */
function follow(child: ChildProcessByStdio<null, Readable, Readable>) {
  const log = { text: "" };
  const duration = Promise.withResolvers<number | null>();
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (text: string) => {
    log.text = `${log.text}${text}`.slice(-20_000);
    const seconds = durationOf(log.text);
    if (seconds !== null) {
      duration.resolve(seconds);
    }
  });
  const ended = Promise.withResolvers<{ code: number | null; error: Error | null }>();
  child.on("error", (error) => {
    duration.resolve(durationOf(log.text));
    ended.resolve({ code: null, error });
  });
  child.on("close", (code: number | null) => {
    duration.resolve(durationOf(log.text));
    ended.resolve({ code, error: null });
  });
  return { log, duration: duration.promise, ended: ended.promise };
}

/** The samples of ffmpeg's output in order; TranscriptionError when ffmpeg fails. */
async function* samplesFrom(
  child: ChildProcessByStdio<null, Readable, Readable>,
  { log, ended }: ReturnType<typeof follow>,
): AsyncGenerator<Float32Array> {
  let pending: Buffer = Buffer.alloc(0);
  for await (const chunk of child.stdout) {
    const bytes: unknown = chunk;
    const read = samplesOf(
      Buffer.concat([pending, Buffer.isBuffer(bytes) ? bytes : Buffer.alloc(0)]),
    );
    pending = read.rest;
    yield read.samples;
  }
  await checkEnded({ log, ended });
}

/** Rejects when ffmpeg did not start or did not finish well. */
async function checkEnded({ log, ended }: Pick<ReturnType<typeof follow>, "log" | "ended">) {
  const { code, error } = await ended;
  if (error !== null) {
    throw error;
  }
  if (code !== 0) {
    throw new TranscriptionError(reason(log.text));
  }
}

/** Extracts the sound with the ffmpeg of the data directory. */
export function ffmpegExtractor(dataDirectory: string): AudioExtractor {
  return {
    extract: (file, signal): Audio => {
      const child = spawn(ffmpegPath(dataDirectory), argumentsFor(file), {
        stdio: ["ignore", "pipe", "pipe"],
        signal,
        windowsHide: true,
      });
      const followed = follow(child);
      return { duration: followed.duration, samples: samplesFrom(child, followed) };
    },
  };
}
