// The text of a Source: how the server reads each kind of material and cuts its text into numbered
// parts, which the Inbox processing agent reads one at a time.

/** The longest part of a Source's text, in characters: a part fits an agent's tool result. */
const partLength = 8000;

/**
 * How the server reads a Source's text. A `video` has no text the server can read: the Candidate
 * attaches its transcript as a material of its own (#36 decides on transcription).
 */
export type TextFormat =
  "pdf" | "docx" | "text" | "subtitles" | "html" | "web" | "video" | "unsupported";

const formatsByExtension: Readonly<Record<string, TextFormat>> = {
  pdf: "pdf",
  docx: "docx",
  txt: "text",
  text: "text",
  md: "text",
  markdown: "text",
  srt: "subtitles",
  vtt: "subtitles",
  html: "html",
  htm: "html",
  mp4: "video",
  mov: "video",
  mkv: "video",
  webm: "video",
  avi: "video",
  m4v: "video",
};

/** Video hostings: a link to one of them is a video, not a page with text. */
const videoHosts = ["youtube.com", "youtu.be", "vimeo.com", "rutube.ru", "vkvideo.ru"];

/** The lowercase extension of the last part of a path, or "" without one. */
function extensionOf(path: string): string {
  const name = path.split(/[/\\]/u).at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** A link to a video hosting or to a video file is a video; any other link is a web page. */
function linkFormat(url: string): TextFormat {
  const parsed = URL.parse(url);
  if (parsed === null) {
    return "web";
  }
  const host = parsed.hostname.toLowerCase();
  const hosting = videoHosts.some((video) => host === video || host.endsWith(`.${video}`));
  return hosting || formatsByExtension[extensionOf(parsed.pathname)] === "video" ? "video" : "web";
}

/** How to read the Source: a file by its extension, a link as a web page or a video. */
export function textFormat(source: {
  readonly file: string | null;
  readonly url: string | null;
}): TextFormat {
  if (source.file === null) {
    return source.url === null ? "unsupported" : linkFormat(source.url);
  }
  return formatsByExtension[extensionOf(source.file)] ?? "unsupported";
}

const namedEntities: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** The character of a numeric reference; nothing for a code point that does not exist. */
function character(code: number): string {
  return code > 0 && code <= 1_114_111 ? String.fromCodePoint(code) : "";
}

/** The text with XML and HTML character references replaced by their characters. */
export function withoutEntities(text: string): string {
  return text
    .replaceAll(/&(?<name>[a-z]+);/giu, (whole: string, name: string) =>
      Object.hasOwn(namedEntities, name.toLowerCase())
        ? (namedEntities[name.toLowerCase()] ?? whole)
        : whole,
    )
    .replaceAll(/&#x(?<code>[\dA-F]+);/giu, (_whole: string, code: string) =>
      character(Number.parseInt(code, 16)),
    )
    .replaceAll(/&#(?<code>\d+);/gu, (_whole: string, code: string) =>
      character(Math.trunc(Number(code))),
    );
}

/** The pieces of a paragraph, each at most `limit` long, cut at a space where one is. */
function cutParagraph(paragraph: string, limit: number): string[] {
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > limit) {
    const space = rest.lastIndexOf(" ", limit);
    const end = space > 0 ? space : limit;
    pieces.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }
  if (rest !== "") {
    pieces.push(rest);
  }
  return pieces;
}

/**
 * The text cut into parts of at most `limit` characters, in order. A part holds whole paragraphs;
 * a paragraph longer than the limit is cut at spaces. No part is lost: the whole text is read.
 */
export function textParts(text: string, limit = partLength): string[] {
  const paragraphs = text
    .replaceAll(/\r\n?/gu, "\n")
    .split(/\n[ \t]*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .flatMap((paragraph) => cutParagraph(paragraph, limit));
  return paragraphs.reduce<string[]>((parts, paragraph) => {
    const last = parts.at(-1);
    if (last !== undefined && last.length + 2 + paragraph.length <= limit) {
      parts[parts.length - 1] = `${last}\n\n${paragraph}`;
    } else {
      parts.push(paragraph);
    }
    return parts;
  }, []);
}

/** Whether the line is a cue's number, time, identifier or a WebVTT header line, not speech. */
function isCueLine(line: string, nextLine: string | undefined): boolean {
  return (
    line.includes("-->") ||
    /^\d+$/u.test(line) ||
    /^WEBVTT\b/u.test(line) ||
    // A WebVTT cue identifier stands right before its time line.
    (nextLine?.includes("-->") ?? false)
  );
}

/** Whether the block of subtitles is a header, a note or a style rather than a cue. */
function isHeaderBlock(first: string): boolean {
  return /^(?:WEBVTT|NOTE|STYLE|REGION)\b/u.test(first);
}

/** The spoken text of one cue: its lines without numbers, times, tags and references. */
function cueSpeech(lines: readonly string[]): string {
  return lines
    .filter((line, index) => line !== "" && !isCueLine(line, lines[index + 1]))
    .map((line) => withoutEntities(line.replaceAll(/<[^>]*>/gu, "")).trim())
    .filter((line) => line !== "")
    .join(" ");
}

/** The spoken text of each cue in SRT or WebVTT subtitles, one line per cue, repeats dropped. */
export function subtitleText(subtitles: string): string {
  const cues = subtitles
    .replaceAll(/\r\n?/gu, "\n")
    .split(/\n[ \t]*\n/u)
    .map((block) => block.split("\n").map((line) => line.trim()))
    .filter((lines) => !isHeaderBlock(lines[0] ?? ""))
    .map((lines) => cueSpeech(lines))
    .filter((speech) => speech !== "");
  return cues.filter((speech, index) => cues[index - 1] !== speech).join("\n");
}

/** The tags whose end ends a paragraph of the page's text. */
const blockTags =
  "p|div|section|article|header|footer|main|aside|h[1-6]|li|ul|ol|dl|dt|dd|tr|table|blockquote|pre|figure|figcaption";

/**
 * The text of an HTML fragment: each block a paragraph, `<br>` a new line, scripts and styles
 * dropped, character references replaced.
 */
export function htmlText(html: string): string {
  const text = html
    .replaceAll(/<(?<tag>script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\k<tag>\s*>/giu, "")
    .replaceAll(/<!--[\s\S]*?-->/gu, "")
    .replaceAll(/<br\s*\/?>/giu, "\n")
    .replaceAll(new RegExp(`</?(?:${blockTags})\\b[^>]*>`, "giu"), "\n\n")
    .replaceAll(/<[^>]*>/gu, "");
  return withoutEntities(text)
    .replaceAll(/[^\S\n]+/gu, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();
}
