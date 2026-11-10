import { request } from "./request";

/** What the material is. */
export type SourceType = "vacancy" | "resume" | "link" | "file" | "note" | "transcript";

/** A material of a Target: a file in the data directory or a link. */
export interface SourceView {
  readonly id: string;
  readonly type: SourceType;
  readonly title: string;
  readonly url: string | null;
  readonly path: string | null;
  /**
   * «в Inbox», «разбирается», «транскрибируется» with the percent in `progress`, «готов» or
   * «ошибка» with the reason in `failure`.
   */
  readonly status: "inbox" | "processing" | "transcribing" | "ready" | "failed";
  readonly failure: string | null;
  readonly progress: number | null;
  readonly createdAt: string;
}

/** The largest file the server takes: 100 MB. */
export const maxSourceFileBytes = 100 * 1024 * 1024;

function isSourceView(value: unknown): value is SourceView {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function sourcesUrl(targetId: string): string {
  return `/api/targets/${encodeURIComponent(targetId)}/sources`;
}

/** The server's own message for a refused request, such as a file larger than 100 MB. */
function messageOf(body: unknown, status: number): string {
  return typeof body === "object" && body !== null && "message" in body
    ? String(body.message)
    : `HTTP ${status}`;
}

/** The Target's materials in the order they were added. */
export async function fetchSources(targetId: string): Promise<SourceView[]> {
  const body = await request(sourcesUrl(targetId));
  const sources =
    typeof body === "object" && body !== null && "sources" in body ? body.sources : [];
  if (!Array.isArray(sources) || !sources.every((source: unknown) => isSourceView(source))) {
    throw new Error("неожиданный ответ");
  }
  return sources;
}

/** Saves the file in the Target's data directory; the server streams it to disk. */
export async function uploadSource(targetId: string, file: File): Promise<SourceView> {
  const response = await fetch(
    `${sourcesUrl(targetId)}?${new URLSearchParams({ name: file.name })}`,
    {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: file,
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(messageOf(body, response.status));
  }
  if (!isSourceView(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}
