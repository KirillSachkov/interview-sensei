// The rules of a link to a video (spec #74, ticket #76): what yt-dlp's answer says about the link,
// and how its text is got: the manual subtitles in the video's language, the automatic ones, or the
// speech of the original audio track.
import type { ModelId } from "./components.ts";
import { languageCode } from "./recognition.ts";

/** An audio-only track of the video, as yt-dlp lists its formats. */
export interface AudioTrack {
  /** yt-dlp's `format_id`. */
  readonly id: string;
  readonly language: string | null;
  /** yt-dlp's `language_preference`: the original track ranks highest. */
  readonly preference: number | null;
  /** The site marks the track as the original one, not a dubbing. */
  readonly original: boolean;
  /** Kilobits per second. */
  readonly bitrate: number | null;
}

/** What the application needs to know of a video behind a link. */
export interface LinkedVideo {
  /** The spoken language by the site; null when it does not tell. */
  readonly language: string | null;
  /** A live stream or one that has not started. */
  readonly live: boolean;
  /** The tracks of manual subtitles in WebVTT or SRT, such as `ru` or `en-US`. */
  readonly subtitles: readonly string[];
  /** The tracks of automatic subtitles, such as `ru-orig` for the speech of a Russian video. */
  readonly automaticSubtitles: readonly string[];
  readonly audio: readonly AudioTrack[];
}

/** How the text of the video is got. */
export type LinkMethod =
  /** The subtitles of this track, the manual or the automatic ones. */
  | { readonly subtitles: string; readonly automatic: boolean }
  /** Recognition of the speech in this language; `audio` is the track to download, null for any. */
  | { readonly speech: string; readonly audio: string | null }
  | { readonly failure: string };

/** Subtitles the server reads as text. */
const readableSubtitles = new Set(["vtt", "srt"]);

/** A track of slower speech than this gives the model nothing more; a smaller file comes faster. */
const enoughBitrate = 48;

/** The language of the original automatic subtitles, such as `en` of `en-orig`. */
function originalSubtitlesLanguage(video: LinkedVideo): string | null {
  const original = video.automaticSubtitles.find((track) => track.endsWith("-orig"));
  return original === undefined ? null : languageCode(original);
}

/** The automatic track of the language: the original speech first, then any of the language. */
function automaticTrack(video: LinkedVideo, language: string): string | undefined {
  const tracks = video.automaticSubtitles.filter((track) => languageCode(track) === language);
  return tracks.find((track) => track.endsWith("-orig")) ?? tracks[0];
}

/** The tracks of the highest rank among them. */
function bestRanked(tracks: readonly AudioTrack[]): readonly AudioTrack[] {
  const marked = tracks.filter((track) => track.original);
  if (marked.length > 0) {
    return marked;
  }
  const top = Math.max(...tracks.map((track) => track.preference ?? 0));
  return tracks.filter((track) => (track.preference ?? 0) === top);
}

/**
 * The original audio track: the one the site marks original or ranks highest, so an auto-dubbing is
 * never taken; then the one in the video's language. Of these the smallest that is good enough for
 * speech, or the best when all are small. Null without audio-only tracks.
 */
export function originalAudio(tracks: readonly AudioTrack[], language: string): string | null {
  const ranked = bestRanked(tracks);
  const inLanguage = ranked.filter(
    (track) => track.language !== null && languageCode(track.language) === language,
  );
  const chosen = inLanguage.length > 0 ? inLanguage : ranked;
  const byBitrate = chosen.toSorted(
    (first, second) => (first.bitrate ?? 0) - (second.bitrate ?? 0),
  );
  const enough = byBitrate.find((track) => (track.bitrate ?? 0) >= enoughBitrate);
  return (enough ?? byBitrate.at(-1))?.id ?? null;
}

/**
 * How to get the text of the video. The language is the video's, else the one of its original
 * automatic subtitles, else the Target's. Manual subtitles in that language come first. A Russian
 * video with only automatic subtitles is recognized by GigaAM when it is installed, otherwise those
 * subtitles are taken. Any other video is recognized from its original audio track; `models` are
 * the installed models that can run, and the choice of the model comes later.
 */
export function linkMethod(
  video: LinkedVideo,
  { fallbackLanguage, models }: { fallbackLanguage: string; models: ReadonlySet<ModelId> },
): LinkMethod {
  if (video.live) {
    return { failure: "видео идёт в прямом эфире: дождитесь записи или приложите транскрипт" };
  }
  const language = languageCode(
    video.language ?? originalSubtitlesLanguage(video) ?? fallbackLanguage,
  );
  const manual = video.subtitles.find((track) => languageCode(track) === language);
  if (manual !== undefined) {
    return { subtitles: manual, automatic: false };
  }
  const automatic = automaticTrack(video, language);
  if (automatic !== undefined && language === "ru" && !models.has("gigaam-v3")) {
    return { subtitles: automatic, automatic: true };
  }
  return { speech: language, audio: originalAudio(video.audio, language) };
}

/** What yt-dlp answered for a link: its JSON of the video, or its log when it failed. */
export type LinkAnswer = { readonly json: string } | { readonly error: string };

/** What the link is: a video, not a video at all, or a video the application cannot read. */
export type LinkCheck =
  { readonly video: LinkedVideo } | { readonly notVideo: true } | { readonly failure: string };

const transcriptHint = "приложите транскрипт";

/** The reasons of yt-dlp's failures the Candidate can act on, checked in order. */
const failureReasons: readonly (readonly [RegExp, string])[] = [
  [/private video|video is private/iu, "видео закрыто автором"],
  [
    /sign in|log ?in|cookies|members-only|registered users|authenticat|password/iu,
    "видео открывается только после входа в аккаунт",
  ],
  [/your country|geo.?restrict/iu, "видео недоступно в вашей стране"],
  [
    /removed|deleted|unavailable|no longer available|does not exist|HTTP Error 404|HTTP Error 410/iu,
    "видео удалено или недоступно",
  ],
];

/** The last error line of yt-dlp's log without its prefixes, such as `[youtube] id:`. */
function lastError(log: string): string {
  const lines = log.trim().split("\n");
  const error = lines.findLast((line) => line.startsWith("ERROR:")) ?? lines.at(-1) ?? "";
  return error
    .replace(/^ERROR:\s*/u, "")
    .replace(/^\[[^\]]+\]\s*[^:\s]+:\s*/u, "")
    .slice(0, 200);
}

/** Why the video cannot be read, in Russian, from yt-dlp's log. */
export function linkFailure(log: string): string {
  const error = lastError(log);
  const known = failureReasons.find(([pattern]) => pattern.test(error));
  return known === undefined ? `видео не открылось: ${error}` : `${known[1]}: ${transcriptHint}`;
}

/** The field of a JSON object; undefined for anything else. */
function field(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries: [string, unknown][] = Object.entries(value);
  return entries.find(([key]) => key === name)?.[1];
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The tracks of yt-dlp's `subtitles` or `automatic_captions` in a format the server reads. */
function readableTracks(tracks: unknown): string[] {
  const entries = typeof tracks === "object" && tracks !== null ? Object.entries(tracks) : [];
  return entries
    .filter(([, formats]) =>
      list(formats).some((format) => readableSubtitles.has(text(field(format, "ext")) ?? "")),
    )
    .map(([track]) => track);
}

/** The audio-only formats of yt-dlp's `formats`: no video, a known audio codec. */
function audioTracks(formats: unknown): AudioTrack[] {
  return list(formats).flatMap((format) => {
    const id = text(field(format, "format_id"));
    const codec = text(field(format, "acodec"));
    if (id === null || field(format, "vcodec") !== "none" || codec === null || codec === "none") {
      return [];
    }
    return [
      {
        id,
        language: text(field(format, "language")),
        preference: number(field(format, "language_preference")),
        original: /original/iu.test(text(field(format, "format_note")) ?? ""),
        bitrate: number(field(format, "abr")),
      },
    ];
  });
}

/** The video of yt-dlp's JSON; a playlist is refused. */
function videoOf(json: string): LinkCheck {
  const parsed: unknown = JSON.parse(json);
  const type = field(parsed, "_type");
  if (typeof parsed !== "object" || parsed === null || (type !== undefined && type !== "video")) {
    return { failure: "это плейлист, а не одно видео: прикрепите ссылку на видео" };
  }
  const live = field(parsed, "live_status");
  return {
    video: {
      language: text(field(parsed, "language")),
      live: live === "is_live" || live === "is_upcoming",
      subtitles: readableTracks(field(parsed, "subtitles")),
      automaticSubtitles: readableTracks(field(parsed, "automatic_captions")),
      audio: audioTracks(field(parsed, "formats")),
    },
  };
}

/**
 * What yt-dlp's answer says of the link. A link yt-dlp does not recognize is not a video: the
 * server reads it as a web page.
 */
export function linkCheck(answer: LinkAnswer): LinkCheck {
  if ("json" in answer) {
    return videoOf(answer.json);
  }
  if (/No suitable extractor found|Unsupported URL/u.test(answer.error)) {
    return { notVideo: true };
  }
  return { failure: linkFailure(answer.error) };
}
