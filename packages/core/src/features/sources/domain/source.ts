// A Source: material that the Candidate attached to a Target, such as a vacancy or a resume.

/** What the material is. */
const sourceTypes = ["vacancy", "resume", "link", "file", "note", "transcript"] as const;
export type SourceType = (typeof sourceTypes)[number];

/**
 * Where the Source is in its Inbox processing:
 * - `inbox`: «в Inbox», it waits for processing;
 * - `processing`: «разбирается», an Inbox processing reads it now;
 * - `transcribing`: «транскрибируется», the server recognizes the speech of a video or audio file
 *   before the processing agent reads it; `progress` has the percent;
 * - `ready`: «готов», an Inbox processing read it;
 * - `failed`: «ошибка», the server or the agent could not read it, for the reason in `failure`.
 */
export type SourceStatus = "inbox" | "processing" | "transcribing" | "ready" | "failed";

/** A Source as the slice stores it: a file in the data directory or a URL. */
export interface Source {
  readonly id: string;
  readonly targetId: string;
  readonly type: SourceType;
  readonly title: string;
  /** The file's path relative to the data directory; null for a link. */
  readonly file: string | null;
  /** The address of a link; null for a file. */
  readonly url: string | null;
  readonly status: SourceStatus;
  /** Why the Source has the status `failed`, in Russian; null otherwise. */
  readonly failure: string | null;
  /** How many numbered parts the server cut the Source's text into; null before it read it. */
  readonly parts: number | null;
  /** The percent of a running transcription, from 0 to 99; null in any other status. */
  readonly progress: number | null;
  readonly createdAt: string;
}

/** The largest file the Candidate can attach: 100 MB (Q19). */
export const maxFileBytes = 100 * 1024 * 1024;

const longestName = 120;

/** The text without control characters, such as NUL, which Postgres refuses in text. */
export function withoutControlCharacters(text: string): string {
  return text.replaceAll(/\p{Cc}/gu, "").trim();
}

/**
 * A file name that stays inside its directory: the last part of the name the browser gave,
 * without control characters, at most 120 characters with its extension kept.
 */
export function safeFileName(name: string): string {
  const last = name.split(/[/\\]/u).at(-1) ?? "";
  const clean = withoutControlCharacters(last);
  if (clean === "" || /^\.+$/u.test(clean)) {
    return "файл";
  }
  if (clean.length <= longestName) {
    return clean;
  }
  const dot = clean.lastIndexOf(".");
  const extension = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : "";
  return clean.slice(0, longestName - extension.length) + extension;
}
