// A video or audio file in Inbox processing (spec #74): the server recognizes its speech before the
// agent reads it. The Source is «транскрибируется» with the percent meanwhile.
import { UnreadableSourceError } from "../domain/inbox.ts";
import type { Source } from "../domain/source.ts";
import { boundTranscript, textFormat } from "../domain/source-text.ts";
import type { InboxContext } from "./inbox-context.ts";

/**
 * Stores each new percent of the Source in order; `written` resolves once the last one is
 * stored.
 */
function progressWriter({ dependencies }: InboxContext, { targetId, id }: Source) {
  let shown = -1;
  let written = Promise.resolve();
  return {
    onProgress: (percent: number) => {
      if (percent !== shown) {
        shown = percent;
        written = (async () => {
          await written;
          await dependencies.repository.setProgress(targetId, id, percent);
        })();
      }
    },
    written: async () => written,
  };
}

/** How a run reads its texts: its cancel and the languages the card chose for recordings. */
export interface Reading {
  readonly signal: AbortSignal;
  /** The language of a video or audio file by Source id. */
  readonly languages: Readonly<Record<string, string>>;
  /** Every Source of the Target when the run started: a video takes its bound transcript. */
  readonly materials: readonly Source[];
}

/** The language of the recording: the card's choice, otherwise the Target's language. */
async function languageOf({ dependencies }: InboxContext, source: Source, reading: Reading) {
  const chosen = reading.languages[source.id];
  if (chosen !== undefined) {
    return chosen;
  }
  const target = await dependencies.targets.get(source.targetId);
  return target?.language ?? "ru";
}

/** The recognized text; UnreadableSourceError with the reason when there is none. */
function textOf(outcome: { readonly text: string } | { readonly failure: string }): string {
  if ("failure" in outcome) {
    throw new UnreadableSourceError(outcome.failure);
  }
  return outcome.text;
}

/**
 * The speech of the file as text: the Source is «транскрибируется» meanwhile and «разбирается»
 * again after it. Rejects with UnreadableSourceError and the reason when there is no text.
 */
async function transcribed(
  context: InboxContext,
  { source, file, reading }: { source: Source; file: string; reading: Reading },
) {
  const { repository, transcription } = context.dependencies;
  const { targetId, id } = source;
  await repository.setStatus(targetId, { ids: [id], status: "transcribing", from: "processing" });
  const progress = progressWriter(context, source);
  try {
    const language = await languageOf(context, source, reading);
    const outcome = await transcription.transcribe({
      file,
      language,
      onProgress: progress.onProgress,
      signal: reading.signal,
    });
    return textOf(outcome);
  } finally {
    await progress.written();
    await repository.setStatus(targetId, { ids: [id], status: "processing", from: "transcribing" });
  }
}

/**
 * The text of the Source: the text of a recording's bound transcript or its recognized speech, or
 * the text its format holds.
 */
export async function sourceText(
  context: InboxContext,
  source: Source,
  reading: Reading,
): Promise<string> {
  const { files, extractor } = context.dependencies;
  const transcript = boundTranscript(source, reading.materials);
  if (transcript?.file != null) {
    const path = files.absolute(transcript.file);
    return extractor.extract({ format: textFormat(transcript), path, url: null });
  }
  const format = textFormat(source);
  const path = source.file === null ? null : files.absolute(source.file);
  if (format === "video" && path !== null) {
    return transcribed(context, { source, file: path, reading });
  }
  return extractor.extract({ format, path, url: source.url });
}
