// A video or audio file or a link in Inbox processing (spec #74): the server recognizes the speech
// of a recording, or takes a video's subtitles, before the agent reads it. The Source is
// «транскрибируется» with the percent while the speech is recognized.
import { UnreadableSourceError } from "../domain/inbox.ts";
import { UnreadableVideoError } from "../domain/unreadable-video.ts";
import type { Source } from "../domain/source.ts";
import { subtitleText, textFormat } from "../domain/source-text.ts";
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

/** The language of the Target: the language of its recordings until the card lets the Candidate choose. */
async function languageOf({ dependencies }: InboxContext, targetId: string): Promise<string> {
  const target = await dependencies.targets.get(targetId);
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
async function transcribed(context: InboxContext, source: Source, file: string) {
  const progress = progressWriter(context, source);
  progress.onProgress(0);
  try {
    const language = await languageOf(context, source.targetId);
    const outcome = await context.dependencies.transcription.transcribe({
      file,
      language,
      onProgress: progress.onProgress,
    });
    return textOf(outcome);
  } finally {
    await progress.finish();
  }
}

const noYtDlp =
  "ссылки на видео читаются после загрузки компонентов: скачайте их в карточке разбора или приложите транскрипт";

/** What the transcription slice gives for the link; «транскрибируется» while it recognizes speech. */
async function linkOutcome(context: InboxContext, source: Source, url: string) {
  const progress = progressWriter(context, source);
  try {
    const language = await languageOf(context, source.targetId);
    return await context.dependencies.transcription.transcribeLink({
      url,
      language,
      onProgress: progress.onProgress,
    });
  } finally {
    await progress.finish();
  }
}

/**
 * The text of a link: a video's subtitles or recognized speech, else the web page. A video without
 * text gets UnreadableVideoError; so does a link to a video hosting before yt-dlp is downloaded.
 */
async function linkText(context: InboxContext, source: Source, url: string): Promise<string> {
  const outcome = await linkOutcome(context, source, url);
  if ("text" in outcome) {
    return outcome.text;
  }
  if ("subtitles" in outcome) {
    return subtitleText(outcome.subtitles);
  }
  if ("failure" in outcome) {
    throw new UnreadableVideoError(outcome.failure);
  }
  if (outcome.skipped === "not_installed" && textFormat(source) === "video") {
    throw new UnreadableVideoError(noYtDlp);
  }
  return context.dependencies.extractor.extract({ format: "web", path: null, url });
}

/** The text of the Source: a recording's speech, a link's video or page, or the text its format holds. */
export async function sourceText(context: InboxContext, source: Source): Promise<string> {
  const { files, extractor } = context.dependencies;
  const format = textFormat(source);
  const path = source.file === null ? null : files.absolute(source.file);
  if (format === "video" && path !== null) {
    return transcribed(context, source, path);
  }
  if (source.file === null && source.url !== null) {
    return linkText(context, source, source.url);
  }
  return extractor.extract({ format, path, url: source.url });
}
