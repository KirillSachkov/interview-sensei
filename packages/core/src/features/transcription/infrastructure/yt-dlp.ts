// Links to videos through the yt-dlp build in the data directory, never a system yt-dlp (#76).
// yt-dlp solves YouTube's JavaScript with the application's own Node and no other runtime, reads
// no user config or plugins, keeps its cache in the data directory and finds only the downloaded
// ffmpeg. Subtitles and audio come into a directory of their own under `transcription/downloads/`,
// deleted after use.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ytDlpProgram } from "../domain/pinned-catalog.ts";
import type { DownloadedAudio, VideoLinks } from "../domain/ports.ts";
import { TranscriptionError } from "../domain/recognition.ts";
import { linkFailure } from "../domain/video-link.ts";
import { componentsDirectory } from "./component-store.ts";
import { ffmpegPath } from "./ffmpeg-extractor.ts";

/** A link to a media file by its extension: only yt-dlp's generic extractor reads it. */
const mediaFile = /\.(?:mp4|m4v|mov|mkv|webm|avi|mp3|m4a|wav|ogg|oga|opus|flac|aac)$/iu;

/**
 * yt-dlp's extractors for the link. The generic one finds a video embedded in any page, so an
 * article with a video in it would lose its text: it reads only links to media files.
 */
function extractorsFor(url: string): string {
  const pathname = URL.parse(url)?.pathname ?? "";
  return mediaFile.test(pathname) ? "default" : "default,-generic";
}

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** The longest tail of yt-dlp's log the application keeps. */
const logLimit = 20_000;

/** Runs yt-dlp to its end; rejects when it does not start or the signal stops it. */
async function run(program: string, args: readonly string[], signal: AbortSignal): Promise<Run> {
  const child = spawn(program, args, {
    stdio: ["ignore", "pipe", "pipe"],
    signal,
    windowsHide: true,
  });
  const stdout: Buffer[] = [];
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout.push(chunk);
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (text: string) => {
    stderr = `${stderr}${text}`.slice(-logLimit);
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", (error) => {
      reject(
        signal.aborted
          ? error
          : new TranscriptionError(`yt-dlp не запустился: ${error.message}`, { cause: error }),
      );
    });
    child.on("close", resolve);
  });
  return { code, stdout: Buffer.concat(stdout).toString("utf8"), stderr };
}

/** The arguments of every run: nothing from the system or the user's yt-dlp settings. */
function commonArguments(dataDirectory: string): string[] {
  return [
    "--ignore-config",
    "--no-plugin-dirs",
    "--no-js-runtimes",
    "--js-runtimes",
    `node:${process.execPath}`,
    "--no-remote-components",
    "--ffmpeg-location",
    ffmpegPath(dataDirectory),
    "--cache-dir",
    path.join(componentsDirectory(dataDirectory), "yt-dlp-cache"),
    "--no-playlist",
    "--flat-playlist",
    "--no-progress",
    "--socket-timeout",
    "30",
  ];
}

/**
 * A new directory under `transcription/downloads/` with the video's JSON for `--load-info-json`,
 * and yt-dlp's output template for the file `<name>.<ext>` there.
 */
async function workDirectory(
  dataDirectory: string,
  { json, name }: { json: string; name: string },
) {
  const directory = path.join(componentsDirectory(dataDirectory), "downloads", randomUUID());
  await mkdir(directory, { recursive: true });
  const info = path.join(directory, "video.info.json");
  await writeFile(info, json);
  return { directory, info, output: path.join(directory, `${name}.%(ext)s`) };
}

/** The first file of the directory whose name starts with the prefix; null without one. */
async function fileStarting(directory: string, prefix: string): Promise<string | null> {
  const names = await readdir(directory);
  const name = names.find((candidate) => candidate.startsWith(prefix));
  return name === undefined ? null : path.join(directory, name);
}

interface YtDlp {
  readonly dataDirectory: string;
  readonly program: string;
  readonly common: readonly string[];
}

/**
 * Runs yt-dlp on the video's JSON in a new directory and finds the file it wrote there, named
 * `<name>.<ext>`; the directory is deleted when the run fails. TranscriptionError with the reason
 * when the file does not come.
 */
async function downloaded(
  { dataDirectory, program, common }: YtDlp,
  {
    json,
    name,
    options,
    missing,
    signal,
  }: {
    json: string;
    name: string;
    options: readonly string[];
    missing: string;
    signal: AbortSignal;
  },
) {
  const { directory, info, output } = await workDirectory(dataDirectory, { json, name });
  const remove = async () => rm(directory, { recursive: true, force: true });
  try {
    const { code, stderr } = await run(
      program,
      [...common, "--load-info-json", info, ...options, "-o", output],
      signal,
    );
    const file = await fileStarting(directory, `${name}.`);
    if (file === null || code !== 0) {
      throw new TranscriptionError(code === 0 ? missing : linkFailure(stderr));
    }
    return { file, remove };
  } catch (error) {
    await remove();
    throw error;
  }
}

/** The yt-dlp of the data directory; it reads links once «Скачать» has downloaded it. */
export function ytDlpLinks(dataDirectory: string): VideoLinks {
  const relative = ytDlpProgram(`${process.platform}-${process.arch}`) ?? "yt-dlp/yt-dlp";
  const program = path.join(componentsDirectory(dataDirectory), "yt-dlp", ...relative.split("/"));
  const ytDlp: YtDlp = { dataDirectory, program, common: commonArguments(dataDirectory) };
  return {
    inspect: async (url, signal) => {
      const args = [...ytDlp.common, "--use-extractors", extractorsFor(url), "-J", "--", url];
      const { code, stdout, stderr } = await run(program, args, signal);
      return code === 0 ? { json: stdout } : { error: stderr };
    },
    subtitles: async ({ json, track, automatic, signal }) => {
      const kind = automatic ? "--write-auto-subs" : "--write-subs";
      const options = ["--skip-download", kind, "--sub-langs", track, "--sub-format", "vtt/srt"];
      const missing = "субтитры видео не скачались";
      const { file, remove } = await downloaded(ytDlp, {
        json,
        name: "subtitles",
        options,
        missing,
        signal,
      });
      try {
        return await readFile(file, "utf8");
      } finally {
        await remove();
      }
    },
    audio: async ({ json, format, signal }): Promise<DownloadedAudio> => {
      const options = ["-f", format ?? "ba/b"];
      const missing = "звук видео не скачался";
      return downloaded(ytDlp, { json, name: "audio", options, missing, signal });
    },
  };
}
