// The server reads the text of a Source itself (#63): the agent of Inbox processing runs without
// shell, so it cannot convert a PDF or fetch a page through a command.
import { readFile } from "node:fs/promises";

import { unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";

import type { Timer } from "../../../shared/time/index.ts";
import { UnreadableSourceError } from "../domain/inbox.ts";
import type { TextExtractor } from "../domain/ports.ts";
import { htmlText, subtitleText, withoutEntities } from "../domain/source-text.ts";
import type { TextFormat } from "../domain/source-text.ts";
import { mainHtml } from "./page-text.ts";

/** How long the server waits for a web page. */
const pageTimeoutMs = 30_000;

/** The largest web page the server reads: 20 MB. */
const largestPage = 20 * 1024 * 1024;

const unsupported = "формат не поддерживается";

async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const document = await getDocumentProxy(bytes);
    const { text } = await extractText(document, { mergePages: false });
    return text.join("\n\n");
  } catch {
    throw new UnreadableSourceError("PDF не читается: файл повреждён или защищён");
  }
}

/** The paragraphs of `word/document.xml`: each `w:p` a paragraph, tabs and breaks kept. */
function documentXmlText(xml: string): string {
  const text = xml
    .replaceAll(/<w:tab\b[^>]*\/>/gu, "\t")
    .replaceAll(/<w:(?:br|cr)\b[^>]*\/>/gu, "\n")
    .replaceAll("</w:p>", "\n\n")
    .replaceAll(/<[^>]*>/gu, "");
  return withoutEntities(text);
}

/** The file `word/document.xml` of the DOCX archive; the filter skips the other files. */
function documentXml(bytes: Uint8Array): Uint8Array | undefined {
  try {
    // oxlint-disable-next-line node/no-sync -- fflate's async unzip only splits work across workers; one file of the archive inflates in one short pass
    const files = unzipSync(bytes, { filter: (file) => file.name === "word/document.xml" });
    return files["word/document.xml"];
  } catch (error) {
    throw new UnreadableSourceError("DOCX не читается: файл повреждён", { cause: error });
  }
}

function docxText(bytes: Uint8Array): string {
  const document = documentXml(bytes);
  if (document === undefined) {
    throw new UnreadableSourceError("DOCX не читается: в файле нет документа");
  }
  return documentXmlText(new TextDecoder().decode(document));
}
const pageText = (html: string) => htmlText(mainHtml(html));

/** The body of the response, up to `largestPage` bytes. */
async function limitedBody(page: Response): Promise<Uint8Array> {
  const declared = Number(page.headers.get("content-length") ?? "0");
  if (declared > largestPage) {
    throw new UnreadableSourceError("страница больше 20 МБ");
  }
  const bytes = new Uint8Array(await page.arrayBuffer());
  if (bytes.byteLength > largestPage) {
    throw new UnreadableSourceError("страница больше 20 МБ");
  }
  return bytes;
}

/** The response of the page; rejects with UnreadableSourceError for a failure or an error status. */
async function pageResponse(url: string, signal: AbortSignal): Promise<Response> {
  let answered: Response | null = null;
  try {
    answered = await fetch(url, { signal, redirect: "follow" });
  } catch (error) {
    throw new UnreadableSourceError("страница не открылась", { cause: error });
  }
  if (!answered.ok) {
    throw new UnreadableSourceError(`страница не открылась: HTTP ${answered.status}`);
  }
  return answered;
}

/** The page's content type and body; the injected timer stops a page that takes too long. */
async function fetchPage(url: string, timer: Timer) {
  const controller = new AbortController();
  const cancel = timer.after(pageTimeoutMs, () => {
    controller.abort();
  });
  try {
    const page = await pageResponse(url, controller.signal);
    const type = (page.headers.get("content-type") ?? "").toLowerCase();
    return { type, bytes: await limitedBody(page) };
  } finally {
    cancel();
  }
}

/** The text of a web page: HTML, plain text or a PDF by its content type. */
async function webText(url: string | null, timer: Timer): Promise<string> {
  if (url === null) {
    throw new UnreadableSourceError(unsupported);
  }
  const { type, bytes } = await fetchPage(url, timer);
  if (type.includes("html") || type === "") {
    return pageText(new TextDecoder().decode(bytes));
  }
  if (type.startsWith("text/")) {
    return new TextDecoder().decode(bytes);
  }
  if (type.includes("application/pdf")) {
    return pdfText(bytes);
  }
  throw new UnreadableSourceError(unsupported);
}

async function fileBytes(path: string | null): Promise<Uint8Array> {
  if (path === null) {
    throw new UnreadableSourceError("файл материала не найден");
  }
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    throw new UnreadableSourceError("файл материала не найден");
  }
}

type Source = Parameters<TextExtractor["extract"]>[0];

const decoded = async ({ path }: Source) => new TextDecoder().decode(await fileBytes(path));

/** How the server reads each format of text. */
function readers(timer: Timer): Record<TextFormat, (source: Source) => Promise<string>> {
  return {
    pdf: async ({ path }) => pdfText(await fileBytes(path)),
    docx: async ({ path }) => docxText(await fileBytes(path)),
    text: decoded,
    subtitles: async (source) => subtitleText(await decoded(source)),
    html: async (source) => pageText(await decoded(source)),
    web: async ({ url }) => webText(url, timer),
    unsupported: () => Promise.reject(new UnreadableSourceError(unsupported)),
  };
}

/** Reads PDF, DOCX, text, Markdown, subtitles, saved pages and links; `timer` limits a page's wait. */
export function textExtractor(timer: Timer): TextExtractor {
  const byFormat = readers(timer);
  return { extract: async (source) => byFormat[source.format](source) };
}
