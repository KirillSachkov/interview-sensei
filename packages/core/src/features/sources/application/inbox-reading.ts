// How an Inbox processing reads the texts of its Sources before the agent starts: one at a time,
// a recording through its bound transcript or speech recognition, and a cancel by «Остановить
// разбор» or the server's close.
import { UnreadableSourceError } from "../domain/inbox.ts";
import { UnreadableVideoError } from "../domain/unreadable-video.ts";
import type { InboxRun } from "../domain/inbox.ts";
import type { Source } from "../domain/source.ts";
import { boundTranscript, textFormat, textParts } from "../domain/source-text.ts";
import type { InboxContext } from "./inbox-context.ts";
import { sourceText } from "./inbox-transcription.ts";
import type { Reading } from "./inbox-transcription.ts";

/**
 * Whether the recording already has its transcript: a processing that stopped after the
 * transcription keeps the parts, so the speech is never recognized twice.
 */
async function transcribedBefore({ dependencies }: InboxContext, source: Source) {
  return (
    textFormat(source) === "video" &&
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
 * The run's transcripts bound to a video of the run: the video's text is theirs, so they become
 * «готов» at once, and the agent reads them as the video.
 */
async function settleBoundTranscripts(
  { dependencies }: InboxContext,
  { sources, reading }: { sources: readonly Source[]; reading: Reading },
): Promise<ReadonlySet<string>> {
  const ids = new Set(sources.map((source) => source.id));
  const bound = sources.flatMap((source) => {
    const transcript = boundTranscript(source, reading.materials);
    return transcript !== undefined && ids.has(transcript.id) ? [transcript.id] : [];
  });
  const [first] = sources;
  if (first !== undefined && bound.length > 0) {
    const change = { ids: bound, status: "ready", from: "processing" } as const;
    await dependencies.repository.setStatus(first.targetId, change);
  }
  return new Set(bound);
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
  const bound = await settleBoundTranscripts(context, { sources, reading });
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
