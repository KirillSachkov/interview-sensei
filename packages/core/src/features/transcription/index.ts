export { transcriptionModule } from "./module.ts";
export type { TranscriptionComponents } from "./module.ts";
export type {
  InstallOutcome,
  Transcription,
  TranscriptionOutcome,
} from "./application/transcription.ts";
export { modelIds } from "./domain/components.ts";
export type { Component, ComponentCatalog, ModelId } from "./domain/components.ts";
export type { Audio, AudioExtractor, SpeechRecognizer } from "./domain/ports.ts";
export { TranscriptionError } from "./domain/recognition.ts";
