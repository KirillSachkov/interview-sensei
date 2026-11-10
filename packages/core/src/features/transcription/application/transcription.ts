// Transcription of recordings (spec #74): the components download after the Candidate's consent,
// then each video or audio file goes through the extractor, Silero VAD and the chosen model. No
// agent takes part; the sources slice gets the text through its port.
import { modelIds } from "../domain/components.ts";
import type { ComponentCatalog, ModelId } from "../domain/components.ts";
import type { AudioExtractor, SpeechRecognizer } from "../domain/ports.ts";
import {
  modelFor,
  noModelReason,
  progressPercent,
  TranscriptionError,
} from "../domain/recognition.ts";
import { allComponents, install, status, stopDownload } from "./installation.ts";
import type { InstallationDependencies, InstallationState } from "./installation.ts";

export type { InstallOutcome } from "./installation.ts";

export interface TranscriptionDependencies extends InstallationDependencies {
  readonly extractor: AudioExtractor;
  readonly recognizer: SpeechRecognizer;
}

const notInstalled =
  "распознавание речи не установлено: скачайте модель в «Настройки» → «Распознавание речи» или приложите транскрипт с тем же именем файла";

/** The installed models, when the shared components every model needs are installed too. */
async function installedModels({
  catalog,
  store,
}: TranscriptionDependencies & { catalog: ComponentCatalog }): Promise<Set<ModelId>> {
  const installed = await store.installed(allComponents(catalog));
  const shared = catalog.shared.every((component) => installed.has(component.id));
  return new Set(shared ? modelIds.filter((id) => installed.has(id)) : []);
}

/**
 * The model for the language among the installed ones; TranscriptionError without one. A language
 * no model knows needs a transcript, whatever is installed.
 */
async function chosenModel(
  dependencies: TranscriptionDependencies,
  language: string,
): Promise<ModelId> {
  const { catalog } = dependencies;
  if (catalog === null) {
    throw new TranscriptionError(
      "распознавание речи не работает на этой платформе: приложите транскрипт",
    );
  }
  const models = await installedModels({ ...dependencies, catalog });
  if (models.size === 0 && modelFor(language, new Set(modelIds)) !== null) {
    throw new TranscriptionError(notInstalled);
  }
  const model = modelFor(language, models);
  if (model === null) {
    throw new TranscriptionError(noModelReason(language));
  }
  return model;
}

/** The running transcriptions of each model: «Удалить» waits until none uses the model. */
type ModelsInUse = Map<ModelId, number>;

/** Runs the work while the model counts as in use. */
async function whileInUse<Result>(
  inUse: ModelsInUse,
  model: ModelId,
  work: () => Promise<Result>,
): Promise<Result> {
  inUse.set(model, (inUse.get(model) ?? 0) + 1);
  try {
    return await work();
  } finally {
    inUse.set(model, (inUse.get(model) ?? 1) - 1);
  }
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
  { request, inUse }: { request: TranscriptionRequest; inUse: ModelsInUse },
): Promise<TranscriptionOutcome> {
  const signal = request.signal ?? new AbortController().signal;
  try {
    const model = await chosenModel(dependencies, request.language);
    const text = await whileInUse(inUse, model, async () =>
      recognized(dependencies, { ...request, model, signal }),
    );
    return { text };
  } catch (error) {
    if (error instanceof TranscriptionError) {
      return { failure: error.message };
    }
    throw error;
  }
}

/**
 * - `removed`: the model's files are deleted, or it was not installed.
 * - `running`: a download runs; the model stays.
 * - `in_use`: the model recognizes a recording now; the model stays.
 * - `unavailable`: the application does not recognize speech on this platform.
 */
export type RemoveOutcome = "removed" | "running" | "in_use" | "unavailable";

/** «Удалить» of a model in «Распознавание речи»: frees its disk space; the shared components stay. */
async function remove(
  { catalog, store }: TranscriptionDependencies,
  { state, inUse, model }: { state: InstallationState; inUse: ModelsInUse; model: ModelId },
): Promise<RemoveOutcome> {
  if (catalog === null) {
    return "unavailable";
  }
  if (state.installation !== null) {
    return "running";
  }
  if ((inUse.get(model) ?? 0) > 0) {
    return "in_use";
  }
  await store.remove(catalog.models[model]);
  return "removed";
}

export function createTranscription(dependencies: TranscriptionDependencies) {
  const state: InstallationState = { installation: null, failure: null };
  const inUse: ModelsInUse = new Map();
  return {
    status: async () => status(dependencies, state),
    install: async (models: readonly ModelId[]) => install(dependencies, state, models),
    remove: async (model: ModelId) => remove(dependencies, { state, inUse, model }),
    transcribe: async (request: TranscriptionRequest) =>
      transcribe(dependencies, { request, inUse }),
    /** Stops a running download and waits for it; the server calls it before it closes. */
    close: async () => stopDownload(state),
  };
}
export type Transcription = ReturnType<typeof createTranscription>;
