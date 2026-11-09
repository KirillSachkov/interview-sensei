// A Source: material that the Candidate attached to a Target, such as a vacancy or a resume.

/** What the material is. */
const sourceTypes = ["vacancy", "resume", "link", "file", "note", "transcript"] as const;
export type SourceType = (typeof sourceTypes)[number];

/**
 * Where the Source is in its processing. Every Source waits in the Inbox now; slice 2 adds the
 * statuses of its processing.
 */
export type SourceStatus = "inbox";

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
