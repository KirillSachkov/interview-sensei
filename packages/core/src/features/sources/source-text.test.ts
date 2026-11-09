import { describe, expect, it } from "vitest";

import { htmlText, subtitleText, textFormat, textParts } from "./domain/source-text.ts";

describe(textParts, () => {
  it("keeps a short text in one part without the blank lines around it", () => {
    expect(textParts("\n\n  Вакансия Go\r\n\r\n\r\nТребования  \n\n")).toStrictEqual([
      "Вакансия Go\n\nТребования",
    ]);
  });

  it("gives no parts for a text without words", () => {
    expect(textParts(" \n\t\n ")).toStrictEqual([]);
  });

  it("puts whole paragraphs into parts no longer than the limit, in order", () => {
    const paragraphs = ["а".repeat(40), "б".repeat(40), "в".repeat(40)];

    expect(textParts(paragraphs.join("\n\n"), 90)).toStrictEqual([
      `${"а".repeat(40)}\n\n${"б".repeat(40)}`,
      "в".repeat(40),
    ]);
  });

  it("cuts a paragraph longer than the limit at a space, losing no word", () => {
    const words = Array.from({ length: 30 }, (_item, index) => `слово${index}`);

    const parts = textParts(words.join(" "), 50);

    expect(parts.every((part) => part.length <= 50)).toBe(true);
    expect(parts.join(" ").split(" ")).toStrictEqual(words);
  });

  it("cuts a word longer than the limit where the limit falls", () => {
    expect(textParts("x".repeat(25), 10)).toStrictEqual([
      "x".repeat(10),
      "x".repeat(10),
      "x".repeat(5),
    ]);
  });
});

describe(subtitleText, () => {
  it("keeps the spoken lines of SRT without numbers and times", () => {
    const srt = [
      "1",
      "00:00:01,000 --> 00:00:03,000",
      "Расскажите о себе.",
      "",
      "2",
      "00:00:03,500 --> 00:00:06,000",
      "<i>Я пишу на Go</i>",
      "пять лет.",
      "",
    ].join("\r\n");

    expect(subtitleText(srt)).toBe("Расскажите о себе.\nЯ пишу на Go пять лет.");
  });

  it("drops the WebVTT header, notes, cue settings and repeated captions", () => {
    const vtt = [
      "WEBVTT",
      "Kind: captions",
      "",
      "NOTE запись созвона",
      "",
      "intro",
      "00:00.000 --> 00:02.000 align:start",
      "<v Интервьюер>Что такое горутина?",
      "",
      "00:02.000 --> 00:04.000",
      "<v Интервьюер>Что такое горутина?",
      "",
      "00:04.000 --> 00:06.000",
      "Лёгкий поток &amp; планировщик.",
    ].join("\n");

    expect(subtitleText(vtt)).toBe("Что такое горутина?\nЛёгкий поток & планировщик.");
  });
});

const file = (name: string) => ({ file: `targets/t/sources/s/${name}`, url: null });

describe(textFormat, () => {
  it("reads documents, texts and subtitles by the file's extension, in any case", () => {
    expect(
      ["cv.PDF", "cv.docx", "notes.txt", "notes.md", "notes.markdown", "talk.srt", "talk.vtt"].map(
        (name) => textFormat(file(name)),
      ),
    ).toStrictEqual(["pdf", "docx", "text", "text", "text", "subtitles", "subtitles"]);
  });

  it("reads a saved web page and a link as a web page", () => {
    expect(textFormat(file("page.html"))).toBe("html");
    expect(textFormat({ file: null, url: "https://example.com/vacancy" })).toBe("web");
  });

  it("knows a video file and a link to a video hosting as a video", () => {
    expect(
      ["talk.mp4", "talk.MOV", "talk.mkv", "talk.webm", "talk.avi", "talk.m4v"].map((name) =>
        textFormat(file(name)),
      ),
    ).toStrictEqual(Array.from({ length: 6 }, () => "video"));
    expect(
      [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://m.youtube.com/watch?v=1",
        "https://vimeo.com/76979871",
        "https://rutube.ru/video/abc/",
        "https://vkvideo.ru/video-1_2",
        "https://example.com/files/talk.mp4?download=1",
      ].map((url) => textFormat({ file: null, url })),
    ).toStrictEqual(Array.from({ length: 7 }, () => "video"));
    expect(textFormat({ file: null, url: "https://example.com/youtube.com" })).toBe("web");
  });

  it("has no way to read other files", () => {
    expect(
      ["archive.zip", "slides.pptx", "photo.png", "README"].map((name) => textFormat(file(name))),
    ).toStrictEqual(["unsupported", "unsupported", "unsupported", "unsupported"]);
  });
});

describe(htmlText, () => {
  it("keeps the text of blocks as paragraphs and drops scripts, styles and tags", () => {
    const html = [
      "<style>p { color: red }</style><script>alert(1)</script>",
      "<h1>Go-разработчик</h1><p>Мы ищем <b>middle</b>&nbsp;разработчика.</p>",
      "<ul><li>Горутины</li><li>Каналы &amp; select</li></ul>",
      "<div>Строка<br>вторая</div>",
    ].join("\n");

    expect(htmlText(html)).toBe(
      "Go-разработчик\n\nМы ищем middle разработчика.\n\nГорутины\n\nКаналы & select\n\nСтрока\nвторая",
    );
  });
});
