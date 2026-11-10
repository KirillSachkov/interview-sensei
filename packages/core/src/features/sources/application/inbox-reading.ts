// How an Inbox processing reads the texts of its Sources before the agent starts: one at a time,
// a recording through its bound transcript or speech recognition, and a cancel by «Остановить
// разбор» or the server's close.
import { UnreadableSourceError } from "../domain/inbox.ts";
import { UnreadableVideoError } from "../domain/unreadable-video.ts";
import type { InboxRun } from "../domain/inbox.ts";
import type { Source } from "../domain/source.ts";
import { boundInRun, textFormat, textParts } from "../domain/source-text.ts";
import type { InboxContext } from "./inbox-context.ts";
import { sourceText } from "./inbox-transcription.ts";
import type { Reading } from "./inbox-transcription.ts";

/**
 * Whether the recording or the link already has its text: a processing that stopped after the
 * transcription keeps the parts, so the speech is never recognized twice. Any link counts: yt-dlp,
 * not the address, tells a video from a page, so a video on any site keeps its transcript.
 */
async function transcribedBefore({ dependencies }: InboxContext, source: Source) {
  const recording = textFormat(source) === "video" || (source.file === null && source.url !== null);
  return (
    recording &&
    source.parts !== null &&
    (await dependencies.texts.read(source.targetId, source.id, 1)) !== null
  );
}

/**
 * Reads the Source's text and stores its numbered parts; rejects when there is no text. A
 * recording keeps the transcript of an earlier processing.
 */
async function storeParts(context: InboxContext, source: Source, reading: Reading): Promise<void> {
  const { repository, texts } = context.dependencies;
  if (await transcribedBefore(context, source)) {
    return;
  }
  const text = await sourceText(context, source, reading);
  const parts = textParts(text);
  if (parts.length === 0) {
    throw new UnreadableSourceError("в материале нет текста");
  }
  await texts.write(source.targetId, source.id, parts);
  await repository.setParts(source.targetId, source.id, parts.length);
}

/** Gives the Source the server could not read «ошибка» with the reason. */
async function markUnreadable({ dependencies }: InboxContext, source: Source, error: unknown) {
  const failure =
    error instanceof UnreadableSourceError ? error.message : "материал не удалось прочитать";
  const change = { ids: [source.id], status: "failed", failure, from: "processing" } as const;
  await dependencies.repository.setStatus(source.targetId, change);
}

/**
 * After a failed reading: a web page stays for the agent, any other Source gets «ошибка», a link to
 * a video without text too; an unexpected failure goes to onError. Whether the agent can still process the Source.
 */
async function unread(context: InboxContext, source: Source, error: unknown): Promise<boolean> {
  if (!(error instanceof UnreadableSourceError)) {
    context.dependencies.onError(error);
  }
  if (source.url !== null && source.file === null && !(error instanceof UnreadableVideoError)) {
    return true;
  }
  await markUnreadable(context, source, error);
  return false;
}

/**
 * Reads the Source's text into parts; a Source the server cannot read gets «ошибка». A web page the
 * server could not read stays «разбирается» without parts: the agent opens it on the web. A
 * cancelled reading changes nothing: the run's end has moved the Source already.
 */
async function readText(context: InboxContext, source: Source, reading: Reading) {
  try {
    await storeParts(context, source, reading);
    return true;
  } catch (error) {
    return reading.signal.aborted ? false : unread(context, source, error);
  }
}

/**
 * Reads the texts one at a time: a large file never waits beside another one in memory. Counts the
 * materials the agent can process; a cancel stops the reading.
 */
async function readTexts(
  context: InboxContext,
  sources: readonly Source[],
  reading: Reading,
): Promise<number> {
  // A bound transcript is its video's text: it follows the video and is not read on its own.
  const bound = boundInRun(
    sources.map((source) => source.id),
    reading.materials,
  );
  let readable = 0;
  for (const source of sources.filter((candidate) => !bound.has(candidate.id))) {
    if (reading.signal.aborted) {
      break;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- one large file at a time
    if (await readText(context, source, reading)) {
      readable += 1;
    }
  }
  return readable;
}

/** The languages the card chose for recordings, by Source id. */
export type Languages = Readonly<Record<string, string>>;

/** Reads the run's texts while `reading` of the context holds the cancel of the run. */
export async function readRun(
  context: InboxContext,
  { run, sources, languages }: { run: InboxRun; sources: readonly Source[]; languages: Languages },
) {
  const controller = new AbortController();
  context.reading.set(run.id, controller);
  try {
    const materials = await context.dependencies.repository.list(run.targetId);
    const reading = { signal: controller.signal, languages, materials };
    const readable = await readTexts(context, sources, reading);
    return { readable, cancelled: controller.signal.aborted };
  } finally {
    context.reading.delete(run.id);
  }
}
