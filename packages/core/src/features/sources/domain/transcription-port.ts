// The port of the transcription slice (spec #74): Inbox processing reads video and audio files
// through it.

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
  }) => Promise<{ readonly text: string } | { readonly failure: string }>;
}
