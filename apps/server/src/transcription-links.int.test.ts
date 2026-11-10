// Seam 1 of spec #74, ticket #76: links to videos in Inbox processing. A stub yt-dlp stands behind
// the port of the transcription slice and answers with yt-dlp's JSON and logs; the stub ffmpeg and
// the stub model hear its audio. The components come from a local HTTP server.
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import type { ModelId } from "./composition.ts";
import { addLink, processingEvents, readParts, startProcessing } from "./inbox-test-support.ts";
import { localPage } from "./material-test-support.ts";
import { appliedTarget } from "./setup-test-support.ts";
import { sources } from "./source-test-support.ts";
import { installed, stubTranscription, waitMark } from "./transcription-test-support.ts";
import { vtt } from "./video-link-test-support.ts";
import type { StubVideo } from "./video-link-test-support.ts";

/**
 * An active Target on a server with the stand-ins and its setup chat. `models` are downloaded with
 * yt-dlp by «Скачать»; an empty list downloads yt-dlp alone; null downloads nothing.
 */
async function targetWith(models: readonly ModelId[] | null) {
  const dataDirectory = await temporaryDirectory();
  const stub = await stubTranscription();
  const { server } = await startServer(dataDirectory, { transcription: stub.components });
  if (models !== null) {
    await installed(server, models);
  }
  const { target, events: setup } = await appliedTarget(server);
  return { ...stub, server, target, setup };
}

/** A Target with the stand-ins and its link to the video, which the stub yt-dlp knows. */
async function targetWithLink(models: readonly ModelId[], video: StubVideo) {
  const stub = await targetWith(models);
  stub.links.add(youtube, video);
  const link = await addLink(stub.setup, { title: "Собеседование [manual]", url: youtube });
  return { ...stub, link };
}

/** Starts the processing and reads the only part of the link once its agent waits. */
async function processedText(server: FastifyInstance, targetId: string, link: string) {
  await startProcessing(server, targetId);
  const { events } = await processingEvents(server, targetId);
  const [text] = await readParts(events, link, 1);
  return text;
}

/** The status and reason of each Source once none is «разбирается» or «транскрибируется». */
async function settled(server: FastifyInstance, targetId: string) {
  return vi.waitFor(
    async () => {
      const list = await sources(server, targetId);
      expect(list.every(({ status }) => status === "failed" || status === "ready")).toBe(true);
      return list.map(({ title, status, failure }) => ({ title, status, failure }));
    },
    { timeout: 10_000, interval: 20 },
  );
}

const youtube = "https://www.youtube.com/watch?v=interview1";

const russianTrack = {
  id: "251-1",
  language: "ru",
  preference: 10,
  note: "Russian original (default), medium",
};

/** A Russian video without subtitles, auto-dubbed into English; its speech waits at «[ждать]». */
const dubbedVideo = {
  language: "ru",
  audio: [
    { id: "251-0", language: "en-US", preference: 5, note: "English (US) (default), medium" },
    russianTrack,
    { id: "251-2", language: "en-US", preference: -1, note: "English (US), medium" },
  ],
  speech: `Расскажите про горутины.\n${waitMark}\nЧто такое канал?\nСпасибо.\n`,
};

/** The Target's first Source once it is «транскрибируется» at 25 %. */
async function transcribing(server: FastifyInstance, targetId: string) {
  return vi.waitFor(
    async () => {
      const [listed] = await sources(server, targetId);
      expect(listed).toMatchObject({ status: "transcribing", progress: 25 });
      return listed;
    },
    { timeout: 10_000, interval: 20 },
  );
}

const article = [
  "<html><body><nav>Меню сайта</nav><article><h1>Модель памяти Go</h1>",
  "<p>Горутины общаются через каналы. Канал синхронизирует отправителя и получателя.</p>",
  "</article></body></html>",
].join("");

describe("a link in Inbox processing", () => {
  it("a link yt-dlp does not recognize is processed as an article", async () => {
    const { server, target, setup, links } = await targetWith(["gigaam-v3"]);
    const url = await localPage(article);
    const link = await addLink(setup, { title: "Статья [manual]", url });

    const text = await processedText(server, target.id, link);

    expect(text).toMatch(/^Модель памяти Go\n\nГорутины общаются через каналы\./u);
    expect(links.calls.inspected).toStrictEqual([url]);
  });

  it("manual subtitles in the video's language give the text, and nothing is downloaded or recognized", async () => {
    const { server, target, setup, links, model } = await targetWith(["gigaam-v3"]);
    links.add(youtube, {
      language: "ru",
      subtitles: {
        en: vtt(["Tell me about yourself."]),
        ru: vtt(["Расскажите о себе.", "Что такое горутина?"]),
      },
      automatic: { "ru-orig": vtt(["расскажите о себе"]) },
      audio: [russianTrack],
      speech: "Звук не нужен.\n",
    });
    const link = await addLink(setup, { title: "Собеседование [manual]", url: youtube });

    const text = await processedText(server, target.id, link);

    expect(text).toBe("Расскажите о себе.\nЧто такое горутина?");
    expect(links.calls).toMatchObject({ subtitles: ["manual ru"], audio: [] });
    expect(model.heard).toStrictEqual([]);
  });

  it("a Russian video with only automatic subtitles is recognized by GigaAM when it is installed", async () => {
    const { server, target, setup, links, model } = await targetWith(["gigaam-v3"]);
    links.add(youtube, {
      language: "ru",
      subtitles: { en: vtt(["Tell me about yourself."]) },
      automatic: { "ru-orig": vtt(["расскажите о себе"]), en: vtt(["tell me about yourself"]) },
      audio: [russianTrack],
      speech: "Расскажите о себе.\n",
    });
    const link = await addLink(setup, { title: "Собеседование [manual]", url: youtube });

    const text = await processedText(server, target.id, link);

    expect(text).toBe("Расскажите о себе.");
    expect(model.heard).toStrictEqual(["gigaam-v3"]);
    expect(links.calls).toMatchObject({ subtitles: [], audio: ["251-1"] });
  });

  it("a Russian video with only automatic subtitles gives those subtitles without GigaAM", async () => {
    const { server, target, setup, links, model } = await targetWith(["parakeet-v3"]);
    links.add(youtube, {
      language: "ru",
      automatic: {
        ru: vtt(["переведённые субтитры"]),
        "ru-orig": vtt(["расскажите о себе", "что такое горутина"]),
      },
      audio: [russianTrack],
      speech: "Расскажите о себе.\n",
    });
    const link = await addLink(setup, { title: "Собеседование [manual]", url: youtube });

    const text = await processedText(server, target.id, link);

    expect(text).toBe("расскажите о себе\nчто такое горутина");
    expect(model.heard).toStrictEqual([]);
    expect(links.calls).toMatchObject({ subtitles: ["automatic ru-orig"], audio: [] });
  });

  it("a video without subtitles downloads only the original audio track of its auto-dubbing, is «транскрибируется» with the percent, and its audio is deleted", async () => {
    const { server, target, link, links, model } = await targetWithLink(["gigaam-v3"], dubbedVideo);

    await Promise.all([startProcessing(server, target.id), model.waiting()]);
    const during = await transcribing(server, target.id);
    model.continueSpeech();
    const { events } = await processingEvents(server, target.id);

    expect(during).toMatchObject({ title: "Собеседование [manual]", parts: null });
    await expect(readParts(events, link, 1)).resolves.toStrictEqual([
      "Расскажите про горутины. Что такое канал? Спасибо.",
    ]);
    expect(links.calls.audio).toStrictEqual(["251-1"]);
    await expect(links.audioLeft()).resolves.toBe(false);
    await expect(sources(server, target.id)).resolves.toMatchObject([
      { status: "processing", progress: null, parts: 1 },
    ]);
  });

  it("takes the video's language from yt-dlp: an English video of a Russian Target goes to Parakeet", async () => {
    const { server, target, setup, links, model } = await targetWith(["gigaam-v3", "parakeet-v3"]);
    links.add(youtube, {
      language: "en",
      subtitles: { ru: vtt(["Перевод."]) },
      audio: [{ id: "251", language: "en" }],
      speech: "What is a goroutine?\n",
    });
    const link = await addLink(setup, { title: "Interview [manual]", url: youtube });

    const text = await processedText(server, target.id, link);

    expect(text).toBe("What is a goroutine?");
    expect(model.heard).toStrictEqual(["parakeet-v3"]);
  });

  it("a private, deleted or login-only video gets «ошибка» with the reason, on any site", async () => {
    const { server, target, setup, links } = await targetWith(["gigaam-v3"]);
    const failures = [
      ["Закрытое", "https://vk.com/video-1_2", "ERROR: [vk] -1_2: This video is private"],
      [
        "Удалённое",
        "https://youtu.be/removed",
        "ERROR: [youtube] removed: Video unavailable. This video has been removed by the uploader",
      ],
      [
        "Со входом",
        "https://www.youtube.com/watch?v=adult",
        "ERROR: [youtube] adult: Sign in to confirm your age. This video may be inappropriate for some users.",
      ],
    ] as const;
    for (const [title, url, log] of failures) {
      links.fail(url, log);
      // oxlint-disable-next-line eslint/no-await-in-loop -- the materials keep their order
      await addLink(setup, { title, url });
    }

    await startProcessing(server, target.id);

    await expect(settled(server, target.id)).resolves.toStrictEqual([
      {
        title: "Закрытое",
        status: "failed",
        failure: "видео закрыто автором: приложите транскрипт",
      },
      {
        title: "Удалённое",
        status: "failed",
        failure: "видео удалено или недоступно: приложите транскрипт",
      },
      {
        title: "Со входом",
        status: "failed",
        failure: "видео открывается только после входа в аккаунт: приложите транскрипт",
      },
    ]);
  });
});

describe("a link before speech recognition is downloaded", () => {
  it("with yt-dlp alone, manual subtitles are read, and a video without them gets «ошибка» with what to do", async () => {
    const { server, target, setup, links } = await targetWith([]);
    const silent = "https://www.youtube.com/watch?v=silent";
    links.add(youtube, { language: "ru", subtitles: { ru: vtt(["Что такое канал?"]) } });
    links.add(silent, { language: "ru", audio: [russianTrack], speech: "Речь.\n" });
    const link = await addLink(setup, { title: "С субтитрами [manual]", url: youtube });
    await addLink(setup, { title: "Без субтитров", url: silent });

    const text = await processedText(server, target.id, link);

    expect(text).toBe("Что такое канал?");
    await expect(sources(server, target.id)).resolves.toMatchObject([
      { title: "С субтитрами [manual]", status: "processing" },
      {
        title: "Без субтитров",
        status: "failed",
        failure:
          "распознавание речи не установлено: скачайте модель в «Настройки» → «Распознавание речи» или приложите транскрипт с тем же именем файла",
      },
    ]);
    expect(links.calls.audio).toStrictEqual([]);
  });

  it("without yt-dlp, a link to a video hosting gets «ошибка» and another link is an article, and yt-dlp never runs", async () => {
    const { server, target, setup, links } = await targetWith(null);
    const url = await localPage(article);
    const page = await addLink(setup, { title: "Статья [manual]", url });
    await addLink(setup, { title: "Запись", url: youtube });

    const text = await processedText(server, target.id, page);

    expect(text).toMatch(/^Модель памяти Go/u);
    await expect(sources(server, target.id)).resolves.toMatchObject([
      { title: "Статья [manual]", status: "processing" },
      {
        title: "Запись",
        status: "failed",
        failure:
          "ссылки на видео читаются после загрузки компонентов: скачайте их в «Настройки» → «Распознавание речи» или приложите транскрипт",
      },
    ]);
    expect(links.calls.inspected).toStrictEqual([]);
  });
});
