// A link in Inbox processing (spec #74, ticket #76): yt-dlp tells whether it is a video, then the
// text comes from the manual subtitles, the automatic ones or the speech of the original audio.
import { runnableModels } from "../domain/components.ts";
import type { ComponentCatalog, ModelId } from "../domain/components.ts";
import type { ComponentStore, VideoLinks } from "../domain/ports.ts";
import { orFailure } from "../domain/recognition.ts";
import { linkCheck, linkMethod } from "../domain/video-link.ts";
import type { LinkMethod } from "../domain/video-link.ts";
import { allComponents } from "./installation.ts";

/**
 * What a link gives:
 * - `text`: the recognized speech of the video;
 * - `subtitles`: the video's subtitles in WebVTT or SRT;
 * - `failure`: why the video has no text, in Russian;
 * - `skipped`: yt-dlp did not check the link; `not_video` when it does not know the link, so it is
 *   a web page, `not_installed` before yt-dlp is downloaded.
 */
export type LinkOutcome =
  | { readonly text: string }
  | { readonly subtitles: string }
  | { readonly failure: string }
  | { readonly skipped: "not_video" | "not_installed" };

export interface LinkRequest {
  readonly url: string;
  /** The Target's language: the video's language when the site does not tell it. */
  readonly language: string;
  /** The percent heard so far; the first call means recognition started. */
  readonly onProgress: (percent: number) => void;
  readonly signal?: AbortSignal | undefined;
}

export interface LinkDependencies {
  readonly catalog: ComponentCatalog | null;
  readonly store: ComponentStore;
  readonly links: VideoLinks;
  /** The installed model for the language; TranscriptionError without one. */
  readonly modelFor: (language: string) => Promise<ModelId>;
  /** The recognized speech of a downloaded file. */
  readonly recognize: (request: {
    readonly file: string;
    readonly model: ModelId;
    readonly onProgress: (percent: number) => void;
    readonly signal: AbortSignal;
  }) => Promise<string>;
}

/** The installed components; empty where the application does not read links. */
async function installedComponents({ catalog, store }: LinkDependencies) {
  return catalog === null ? new Set<string>() : store.installed(allComponents(catalog));
}

/** Downloads the audio track and recognizes it; the audio is deleted afterwards. */
async function speech(
  dependencies: LinkDependencies,
  {
    request,
    json,
    language,
    audio,
    signal,
  }: {
    request: LinkRequest;
    json: string;
    language: string;
    audio: string | null;
    signal: AbortSignal;
  },
): Promise<string> {
  const model = await dependencies.modelFor(language);
  request.onProgress(0);
  const downloaded = await dependencies.links.audio({ json, format: audio, signal });
  try {
    return await dependencies.recognize({
      file: downloaded.file,
      model,
      onProgress: request.onProgress,
      signal,
    });
  } finally {
    await downloaded.remove();
  }
}

interface LinkState {
  readonly catalog: ComponentCatalog;
  readonly installed: ReadonlySet<string>;
  readonly request: LinkRequest;
  readonly signal: AbortSignal;
}

/** How the text of the link comes, with yt-dlp's JSON of its video; an outcome when it has none. */
async function methodOf(
  { links }: LinkDependencies,
  { catalog, installed, request, signal }: LinkState,
): Promise<{ method: LinkMethod; json: string } | LinkOutcome> {
  const answer = await links.inspect(request.url, signal);
  const check = linkCheck(answer);
  if ("notVideo" in check) {
    return { skipped: "not_video" };
  }
  if ("failure" in check) {
    return check;
  }
  const method = linkMethod(check.video, {
    fallbackLanguage: request.language,
    models: runnableModels(catalog, installed),
  });
  return { method, json: "json" in answer ? answer.json : "" };
}

/** The text by the method: the subtitles or the recognized speech. */
async function textBy(
  dependencies: LinkDependencies,
  { request, signal }: LinkState,
  { method, json }: { method: LinkMethod; json: string },
): Promise<LinkOutcome> {
  if ("failure" in method) {
    return method;
  }
  if ("subtitles" in method) {
    const { subtitles: track, automatic } = method;
    return { subtitles: await dependencies.links.subtitles({ json, track, automatic, signal }) };
  }
  const { speech: language, audio } = method;
  return { text: await speech(dependencies, { request, json, language, audio, signal }) };
}

/** The text of the video behind the link. */
async function videoText(dependencies: LinkDependencies, state: LinkState): Promise<LinkOutcome> {
  const chosen = await methodOf(dependencies, state);
  return "method" in chosen ? textBy(dependencies, state, chosen) : chosen;
}

/**
 * The text of a link: nothing without yt-dlp, and nothing for a link yt-dlp does not know. A video
 * gives its manual subtitles, the automatic ones of a Russian video without GigaAM, or the speech
 * of its original audio track recognized by the installed model.
 */
export async function transcribeLink(
  dependencies: LinkDependencies,
  request: LinkRequest,
): Promise<LinkOutcome> {
  const { catalog } = dependencies;
  const installed = await installedComponents(dependencies);
  if (catalog === null || !installed.has(catalog.ytDlp.id)) {
    return { skipped: "not_installed" };
  }
  const signal = request.signal ?? new AbortController().signal;
  return orFailure(async () => videoText(dependencies, { catalog, installed, request, signal }));
}
