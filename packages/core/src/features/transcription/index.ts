export { transcriptionModule } from "./module.ts";
export type { TranscriptionComponents } from "./module.ts";
export type {
  InstallOutcome,
  LinkOutcome,
  RemoveOutcome,
  Transcription,
  TranscriptionOutcome,
} from "./application/transcription.ts";
export { modelIds } from "./domain/components.ts";
export type { Component, ComponentCatalog, ModelId } from "./domain/components.ts";
export type {
  Audio,
  AudioExtractor,
  DownloadedAudio,
  SpeechRecognizer,
  VideoLinks,
} from "./domain/ports.ts";
export type { LinkAnswer } from "./domain/video-link.ts";
export { TranscriptionError } from "./domain/recognition.ts";
