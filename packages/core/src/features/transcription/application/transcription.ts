// Transcription of recordings (spec #74): the components download after the Candidate's consent,
// then each video or audio file goes through the extractor, Silero VAD and the chosen model. No
// agent takes part; the sources slice gets the text through its port.
import { modelIds } from "../domain/components.ts";
import type { ModelId } from "../domain/components.ts";
import type { AudioExtractor, SpeechRecognizer } from "../domain/ports.ts";
import { modelFor, progressPercent, TranscriptionError } from "../domain/recognition.ts";
import { allComponents, install, status, stopDownload } from "./installation.ts";
import type { InstallationDependencies, InstallationState } from "./installation.ts";

export type { InstallOutcome } from "./installation.ts";

export interface TranscriptionDependencies extends InstallationDependencies {
  readonly extractor: AudioExtractor;
  readonly recognizer: SpeechRecognizer;
}

const notInstalled =
  "распознавание речи не установлено: скачайте модель в карточке разбора или приложите транскрипт";

/** The model for the language among the installed ones; TranscriptionError without one. */
async function chosenModel(
  { catalog, store }: TranscriptionDependencies,
  language: string,
): Promise<ModelId> {
  if (catalog === null) {
    throw new TranscriptionError(
      "распознавание речи не работает на этой платформе: приложите транскрипт",
    );
  }
  const installed = await store.installed(allComponents(catalog));
  const models = new Set(modelIds.filter((id) => installed.has(id)));
  if (models.size === 0 || !catalog.shared.every((component) => installed.has(component.id))) {
    throw new TranscriptionError(notInstalled);
  }
  const model = modelFor(language, models);
  if (model === null) {
    throw new TranscriptionError(
      `нет модели для языка «${language}»: установите Parakeet TDT 0.6B v3 или приложите транскрипт`,
    );
  }
  return model;
}

/** What a transcription gives: the recording's text, or why it has none, in Russian. */
export type TranscriptionOutcome = { readonly text: string } | { readonly failure: string };

interface TranscriptionRequest {
  readonly file: string;
  readonly language: string;
  /** The percent of the recording heard so far, from 0 up to 99. */
  readonly onProgress: (percent: number) => void;
  readonly signal?: AbortSignal | undefined;
}

/** The recording's text from the model; the percent follows the seconds heard. */
async function recognized(
  { extractor, recognizer }: TranscriptionDependencies,
  request: TranscriptionRequest & { readonly model: ModelId; readonly signal: AbortSignal },
): Promise<string> {
  const audio = extractor.extract(request.file, request.signal);
  const known: { duration: number | null } = { duration: null };
  const durationRead = (async () => {
    known.duration = await audio.duration;
  })();
  const text = await recognizer.recognize({
    model: request.model,
    samples: audio.samples,
    onSeconds: (seconds) => {
      request.onProgress(progressPercent(seconds, known.duration));
    },
    signal: request.signal,
  });
  await durationRead;
  return text;
}

/** Recognizes the speech of a video or audio file in the language with the installed model. */
async function transcribe(
  dependencies: TranscriptionDependencies,
  request: TranscriptionRequest,
): Promise<TranscriptionOutcome> {
  const signal = request.signal ?? new AbortController().signal;
  try {
    const model = await chosenModel(dependencies, request.language);
    return { text: await recognized(dependencies, { ...request, model, signal }) };
  } catch (error) {
    if (error instanceof TranscriptionError) {
      return { failure: error.message };
    }
    throw error;
  }
}

export function createTranscription(dependencies: TranscriptionDependencies) {
  const state: InstallationState = { installation: null, failure: null };
  return {
    status: async () => status(dependencies, state),
    install: async (models: readonly ModelId[]) => install(dependencies, state, models),
    transcribe: async (request: TranscriptionRequest) => transcribe(dependencies, request),
    /** Stops a running download and waits for it; the server calls it before it closes. */
    close: async () => stopDownload(state),
  };
}
export type Transcription = ReturnType<typeof createTranscription>;
