import { createTranscription } from "./application/transcription.ts";
import type { ComponentCatalog } from "./domain/components.ts";
import { pinnedCatalog } from "./domain/pinned-catalog.ts";
import type { AudioExtractor, SpeechRecognizer } from "./domain/ports.ts";
import { componentStore } from "./infrastructure/component-store.ts";
import { ffmpegExtractor } from "./infrastructure/ffmpeg-extractor.ts";
import { sherpaRecognizer } from "./infrastructure/sherpa-recognizer.ts";

/**
 * Stand-ins for the real components: API tests pass a catalog of small files on a local HTTP
 * server and stubs of ffmpeg and the model, so no test downloads or runs the real ones.
 */
export interface TranscriptionComponents {
  readonly catalog?: ComponentCatalog | null;
  readonly extractor?: AudioExtractor;
  readonly recognizer?: SpeechRecognizer;
}

/**
 * Transcription of video and audio files (spec #74): the pinned components of this platform in
 * `transcription/` of the data directory, ffmpeg-static, Silero VAD and the chosen model through
 * sherpa-onnx-node. Nothing is installed into the system, and no system ffmpeg is used.
 */
export function transcriptionModule({
  dataDirectory,
  onError,
  components = {},
}: {
  /** The data directory this server owns. */
  dataDirectory: string;
  /** Receives the unexpected failures of a download in the background. */
  onError: (error: unknown) => void;
  /** The real components by default. */
  components?: TranscriptionComponents | undefined;
}) {
  return createTranscription({
    catalog:
      components.catalog === undefined
        ? pinnedCatalog(`${process.platform}-${process.arch}`)
        : components.catalog,
    store: componentStore(dataDirectory),
    extractor: components.extractor ?? ffmpegExtractor(dataDirectory),
    recognizer: components.recognizer ?? sherpaRecognizer(dataDirectory),
    onError,
  });
}
