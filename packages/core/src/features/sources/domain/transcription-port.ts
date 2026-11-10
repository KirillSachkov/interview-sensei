// The port of the transcription slice (spec #74): Inbox processing reads video and audio files and
// links through it.

/**
 * The transcription slice: the text of a video or audio file, recognized on this device in the
 * language with an installed model, or why it has none, in Russian.
 */
export interface SourceTranscription {
  readonly transcribe: (request: {
    /** The absolute path of the file. */
    readonly file: string;
    /** The Target's language, such as `ru`. */
    readonly language: string;
    /** The percent heard so far, from 0 to 99. */
    readonly onProgress: (percent: number) => void;
    /** «Остановить разбор» and the server's close cancel the transcription. */
    readonly signal: AbortSignal;
  }) => Promise<{ readonly text: string } | { readonly failure: string }>;
  /**
   * The text of a link: the recognized speech of the video, its subtitles in WebVTT or SRT, or why
   * it has none, in Russian. `skipped` when yt-dlp did not check the link: `not_video` for a link
   * it does not know, a web page then; `not_installed` before yt-dlp is downloaded. The first
   * `onProgress` means recognition started.
   */
  readonly transcribeLink: (request: {
    readonly url: string;
    /** The Target's language: the video's language when the site does not tell it. */
    readonly language: string;
    readonly onProgress: (percent: number) => void;
    /** «Остановить разбор» and the server's close cancel the reading. */
    readonly signal: AbortSignal;
  }) => Promise<
    | { readonly text: string }
    | { readonly subtitles: string }
    | { readonly failure: string }
    | { readonly skipped: "not_video" | "not_installed" }
  >;
}
