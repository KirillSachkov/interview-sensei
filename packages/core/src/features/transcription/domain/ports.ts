import type { Component, ModelId } from "./components.ts";
import type { LinkAnswer } from "./video-link.ts";

/**
 * The components in the data directory. `install` downloads each file of the component, checks its
 * size and SHA-256, unpacks it and only then marks the component installed; a file whose SHA-256
 * differs is deleted, and `install` rejects with TranscriptionError.
 */
export interface ComponentStore {
  /** The ids of the components installed in their pinned version. */
  readonly installed: (catalog: readonly Component[]) => Promise<ReadonlySet<string>>;
  readonly install: (
    component: Component,
    progress: { readonly onBytes: (bytes: number) => void; readonly signal: AbortSignal },
  ) => Promise<void>;
}

/** The sound of a recording as the recognizer hears it. */
export interface Audio {
  /** The recording's length in seconds; null when the extractor cannot tell. */
  readonly duration: Promise<number | null>;
  /**
   * Mono samples at 16 kHz in order. The iteration rejects with TranscriptionError when the
   * file has no sound the extractor can read.
   */
  readonly samples: AsyncIterable<Float32Array>;
}

/** Extracts the sound of a video or audio file: `ffmpeg-static` in the application. */
export interface AudioExtractor {
  readonly extract: (file: string, signal: AbortSignal) => Audio;
}

/**
 * Recognizes speech: Silero VAD cuts the samples into phrases, and the model recognizes each phrase
 * through `sherpa-onnx-node` in the application. `onSeconds` gets the seconds of sound heard so far.
 */
export interface SpeechRecognizer {
  readonly recognize: (request: {
    readonly model: ModelId;
    readonly samples: AsyncIterable<Float32Array>;
    readonly onSeconds: (seconds: number) => void;
    readonly signal: AbortSignal;
  }) => Promise<string>;
}

/** A downloaded audio track of a video in the data directory; `remove` deletes it. */
export interface DownloadedAudio {
  readonly file: string;
  readonly remove: () => Promise<void>;
}

/**
 * Links to videos through the application's own yt-dlp, never a system one; yt-dlp solves the
 * site's JavaScript with the application's Node, without Deno. `json` is yt-dlp's JSON of the video
 * as `inspect` gave it, so the later calls do not ask the site again.
 */
export interface VideoLinks {
  /** yt-dlp's JSON of the video behind the link, or yt-dlp's log when it failed. */
  readonly inspect: (url: string, signal: AbortSignal) => Promise<LinkAnswer>;
  /**
   * The subtitles of the track in WebVTT or SRT, without downloading the video; TranscriptionError
   * when they do not come.
   */
  readonly subtitles: (request: {
    readonly json: string;
    readonly track: string;
    readonly automatic: boolean;
    readonly signal: AbortSignal;
  }) => Promise<string>;
  /**
   * Downloads only the audio track `format` into the data directory; for null, the best audio-only
   * track or else the best file with sound. TranscriptionError when it does not come.
   */
  readonly audio: (request: {
    readonly json: string;
    readonly format: string | null;
    readonly signal: AbortSignal;
  }) => Promise<DownloadedAudio>;
}
