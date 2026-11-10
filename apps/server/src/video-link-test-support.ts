// A stub yt-dlp for the API tests of links to videos (spec #74, ticket #76): it knows the videos the
// test gives it and answers with yt-dlp's JSON and logs, so the server's own rules read them. Its
// audio is a stub recording that the stub ffmpeg reads: one second of speech per line.
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { temporaryDirectory } from "./chat-test-support.ts";
import type { VideoLinks } from "./composition.ts";

/** An audio-only track as yt-dlp lists it. */
interface StubTrack {
  readonly id: string;
  readonly language: string;
  /** yt-dlp's `language_preference`: 10 for the original track of an auto-dubbed video. */
  readonly preference?: number;
  readonly note?: string;
  readonly bitrate?: number;
}

/** A video the stub yt-dlp knows. */
export interface StubVideo {
  readonly language: string | null;
  /** Manual subtitles in WebVTT by track, such as `ru`. */
  readonly subtitles?: Readonly<Record<string, string>>;
  /** Automatic subtitles in WebVTT by track, such as `ru-orig`. */
  readonly automatic?: Readonly<Record<string, string>>;
  readonly audio?: readonly StubTrack[];
  /** The stub recording of its audio: lines of speech. */
  readonly speech?: string;
}

/** yt-dlp's subtitle tracks: each in JSON3 and WebVTT. */
function subtitleTracks(subtitles: Readonly<Record<string, string>> | undefined) {
  return Object.fromEntries(
    Object.keys(subtitles ?? {}).map((track) => [track, [{ ext: "json3" }, { ext: "vtt" }]]),
  );
}

/** yt-dlp's JSON of the stub video, with the fields yt-dlp gives. */
function ytDlpJson(url: string, video: StubVideo): string {
  return JSON.stringify({
    _type: "video",
    webpage_url: url,
    language: video.language,
    live_status: "not_live",
    subtitles: subtitleTracks(video.subtitles),
    automatic_captions: subtitleTracks(video.automatic),
    formats: [
      { format_id: "18", vcodec: "avc1.42001E", acodec: "mp4a.40.2", abr: 96 },
      ...(video.audio ?? []).map((track) => ({
        format_id: track.id,
        vcodec: "none",
        acodec: "opus",
        abr: track.bitrate ?? 64,
        language: track.language,
        language_preference: track.preference ?? -1,
        format_note: track.note ?? "medium",
      })),
    ],
  });
}

/** The URL of the video of yt-dlp's JSON. */
function urlOf(json: string): string {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed === "object" && parsed !== null && "webpage_url" in parsed) {
    return String(parsed.webpage_url);
  }
  throw new Error("yt-dlp's JSON has no webpage_url");
}

type Known = StubVideo | { readonly error: string };

/** What the stub yt-dlp did: the checked links, the subtitle tracks and the audio files. */
interface StubCalls {
  readonly inspected: string[];
  readonly subtitles: string[];
  readonly audio: (string | null)[];
  readonly files: string[];
}

/** The stub video of yt-dlp's JSON. */
function videoAt(videos: ReadonlyMap<string, Known>, json: string): StubVideo {
  const video = videos.get(urlOf(json));
  if (video === undefined || "error" in video) {
    throw new Error("The stub yt-dlp does not know this video");
  }
  return video;
}

/** The stub's audio: the video's stub recording in a file of its own. */
async function stubAudio(
  {
    videos,
    calls,
    directory,
  }: { videos: ReadonlyMap<string, Known>; calls: StubCalls; directory: string },
  { json, format }: { json: string; format: string | null },
) {
  calls.audio.push(format);
  const file = path.join(directory, `${calls.audio.length}`, "audio.webm");
  calls.files.push(file);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, videoAt(videos, json).speech ?? "");
  return { file, remove: async () => rm(path.dirname(file), { recursive: true }) };
}

/** The port of the stub yt-dlp over the videos it knows. */
function stubVideoLinks(state: {
  videos: ReadonlyMap<string, Known>;
  calls: StubCalls;
  directory: string;
}): VideoLinks {
  const { videos, calls } = state;
  return {
    inspect: (url) => {
      calls.inspected.push(url);
      const video = videos.get(url);
      if (video === undefined) {
        return Promise.resolve({ error: `ERROR: No suitable extractor found for URL ${url}` });
      }
      return Promise.resolve("error" in video ? video : { json: ytDlpJson(url, video) });
    },
    subtitles: ({ json, track, automatic }) => {
      calls.subtitles.push(`${automatic ? "automatic" : "manual"} ${track}`);
      const video = videoAt(videos, json);
      return Promise.resolve((automatic ? video.automatic : video.subtitles)?.[track] ?? "");
    },
    audio: async (request) => stubAudio(state, request),
  };
}

/** Whether the file is still there. */
async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

/**
 * The stub yt-dlp. `add` teaches it a video, `fail` a link it fails with yt-dlp's log; any other
 * link is one it does not recognize. `calls` records each check, each subtitle track and each
 * audio track it downloaded, and `audioLeft` tells whether a downloaded audio file is still there.
 */
export async function stubLinks() {
  const directory = await temporaryDirectory();
  const videos = new Map<string, Known>();
  const calls: StubCalls = { inspected: [], subtitles: [], audio: [], files: [] };
  return {
    links: stubVideoLinks({ videos, calls, directory }),
    calls,
    add: (url: string, video: StubVideo) => {
      videos.set(url, video);
    },
    fail: (url: string, log: string) => {
      videos.set(url, { error: log });
    },
    audioLeft: async () => {
      const left = await Promise.all(calls.files.map(async (file) => exists(file)));
      return left.some(Boolean);
    },
  };
}

/** WebVTT of the lines, two seconds a cue. */
export function vtt(lines: readonly string[]): string {
  const cues = lines.map(
    (line, index) => `00:00:0${index * 2}.000 --> 00:00:0${index * 2 + 2}.000\n${line}`,
  );
  return ["WEBVTT", ...cues].join("\n\n");
}
