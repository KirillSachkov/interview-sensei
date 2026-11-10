// A video or audio file or a link in Inbox processing (spec #74): the server recognizes the speech
// of a recording, or takes a video's subtitles, before the agent reads it. The Source is
// «транскрибируется» with the percent while the speech is recognized.
import { UnreadableSourceError } from "../domain/inbox.ts";
import type { Source } from "../domain/source.ts";
import { boundTranscript, subtitleText, textFormat } from "../domain/source-text.ts";
import { UnreadableVideoError } from "../domain/unreadable-video.ts";
import type { InboxContext } from "./inbox-context.ts";

/**
 * Follows the recognition of the Source: the first percent makes it «транскрибируется», each new
 * percent is stored in order, and `finish` makes it «разбирается» again once recognition started.
 */
function progressWriter({ dependencies }: InboxContext, { targetId, id }: Source) {
  const { repository } = dependencies;
  let shown: number | null = null;
  let written = Promise.resolve();
  const write = (step: () => Promise<unknown>) => {
    written = (async () => {
      await written;
      await step();
    })();
  };
  return {
    onProgress: (percent: number) => {
      if (shown === null) {
        write(async () =>
          repository.setStatus(targetId, { ids: [id], status: "transcribing", from: "processing" }),
        );
      }
      if (percent !== shown) {
        shown = percent;
        write(async () => repository.setProgress(targetId, id, percent));
      }
    },
    finish: async () => {
      await written;
      if (shown !== null) {
        await repository.setStatus(targetId, {
          ids: [id],
          status: "processing",
          from: "transcribing",
        });
      }
    },
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
  const progress = progressWriter(context, source);
  progress.onProgress(0);
  try {
    const language = await languageOf(context, source, reading);
    const outcome = await context.dependencies.transcription.transcribe({
      file,
      language,
      onProgress: progress.onProgress,
      signal: reading.signal,
    });
    return textOf(outcome);
  } finally {
    await progress.finish();
  }
}

const noYtDlp =
  "ссылки на видео читаются после загрузки компонентов: скачайте их в «Настройки» → «Распознавание речи» или приложите транскрипт";

/** What the transcription slice gives for the link; «транскрибируется» while it recognizes speech. */
async function linkOutcome(
  context: InboxContext,
  { source, url, reading }: { source: Source; url: string; reading: Reading },
) {
  const progress = progressWriter(context, source);
  try {
    const language = await languageOf(context, source, reading);
    return await context.dependencies.transcription.transcribeLink({
      url,
      language,
      onProgress: progress.onProgress,
      signal: reading.signal,
    });
  } finally {
    await progress.finish();
  }
}

/**
 * The text of a link: a video's subtitles or recognized speech, else the web page. A video without
 * text gets UnreadableVideoError; so does a link to a video hosting before yt-dlp is downloaded.
 */
async function linkText(
  context: InboxContext,
  link: { source: Source; url: string; reading: Reading },
): Promise<string> {
  const outcome = await linkOutcome(context, link);
  if ("text" in outcome) {
    return outcome.text;
  }
  if ("subtitles" in outcome) {
    return subtitleText(outcome.subtitles);
  }
  if ("failure" in outcome) {
    throw new UnreadableVideoError(outcome.failure);
  }
  if (outcome.skipped === "not_installed" && textFormat(link.source) === "video") {
    throw new UnreadableVideoError(noYtDlp);
  }
  return context.dependencies.extractor.extract({ format: "web", path: null, url: link.url });
}

/** The text of the Source's own file or link: a recording's speech, a link's video or page, or its text. */
async function ownText(context: InboxContext, source: Source, reading: Reading): Promise<string> {
  const { files, extractor } = context.dependencies;
  const format = textFormat(source);
  const path = source.file === null ? null : files.absolute(source.file);
  if (format === "video" && path !== null) {
    return transcribed(context, { source, file: path, reading });
  }
  if (source.file === null && source.url !== null) {
    return linkText(context, { source, url: source.url, reading });
  }
  return extractor.extract({ format, path, url: source.url });
}

/**
 * The text of the Source: the text of a recording's bound transcript or its recognized speech, a
 * link's video or page, or the text its format holds.
 */
export async function sourceText(
  context: InboxContext,
  source: Source,
  reading: Reading,
): Promise<string> {
  const { files, extractor } = context.dependencies;
  const transcript = boundTranscript(source, reading.materials);
  if (transcript !== undefined && transcript.file !== null) {
    const path = files.absolute(transcript.file);
    return extractor.extract({ format: textFormat(transcript), path, url: null });
  }
  return ownText(context, source, reading);
}
