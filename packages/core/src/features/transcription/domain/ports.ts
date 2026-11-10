import type { Component, ModelId } from "./components.ts";

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
  /** Deletes the component's files, so its disk space is free; nothing for a missing one. */
  readonly remove: (component: Component) => Promise<void>;
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
