import { describe, expect, it } from "vitest";

import type { ModelId } from "./domain/components.ts";
import { linkCheck, linkFailure, linkMethod, originalAudio } from "./domain/video-link.ts";
import type { AudioTrack, LinkedVideo } from "./domain/video-link.ts";

function video(fields: Partial<LinkedVideo> = {}): LinkedVideo {
  return {
    language: "ru",
    live: false,
    subtitles: [],
    automaticSubtitles: [],
    audio: [{ id: "140", language: "ru", preference: null, original: false, bitrate: 129 }],
    ...fields,
  };
}

const none = new Set<ModelId>();
const gigaam = new Set<ModelId>(["gigaam-v3"]);
const parakeet = new Set<ModelId>(["parakeet-v3"]);

describe(linkMethod, () => {
  it("takes the manual subtitles in the video's language and downloads nothing else", () => {
    const manual = video({ subtitles: ["en", "ru"], automaticSubtitles: ["ru-orig", "ru"] });

    expect(linkMethod(manual, { fallbackLanguage: "en", models: gigaam })).toStrictEqual({
      subtitles: "ru",
      automatic: false,
    });
    expect(linkMethod(manual, { fallbackLanguage: "ru", models: none })).toStrictEqual({
      subtitles: "ru",
      automatic: false,
    });
  });

  it("recognizes a Russian video with only automatic subtitles when GigaAM is installed, and takes those subtitles without it", () => {
    const automatic = video({ subtitles: ["en"], automaticSubtitles: ["en", "ru-orig", "ru"] });

    expect(linkMethod(automatic, { fallbackLanguage: "ru", models: gigaam })).toStrictEqual({
      speech: "ru",
      audio: "140",
    });
    expect(linkMethod(automatic, { fallbackLanguage: "ru", models: parakeet })).toStrictEqual({
      subtitles: "ru-orig",
      automatic: true,
    });
    expect(linkMethod(automatic, { fallbackLanguage: "ru", models: none })).toStrictEqual({
      subtitles: "ru-orig",
      automatic: true,
    });
  });

  it("recognizes a video without subtitles in its language, and a non-Russian one with only automatic subtitles", () => {
    expect(linkMethod(video(), { fallbackLanguage: "ru", models: none })).toStrictEqual({
      speech: "ru",
      audio: "140",
    });
    const english = video({
      language: "en-US",
      automaticSubtitles: ["en-orig"],
      audio: [{ id: "251", language: "en", preference: null, original: false, bitrate: 120 }],
    });
    expect(linkMethod(english, { fallbackLanguage: "ru", models: parakeet })).toStrictEqual({
      speech: "en",
      audio: "251",
    });
  });

  it("takes the language from the video, then from its original automatic subtitles, then the Target's", () => {
    const unknown = { language: null, audio: [] };

    expect(
      linkMethod(video({ ...unknown, automaticSubtitles: ["de", "en-orig"] }), {
        fallbackLanguage: "ru",
        models: parakeet,
      }),
    ).toStrictEqual({ speech: "en", audio: null });
    expect(linkMethod(video(unknown), { fallbackLanguage: "ru", models: none })).toStrictEqual({
      speech: "ru",
      audio: null,
    });
  });

  it("refuses a live stream that has not ended", () => {
    expect(
      linkMethod(video({ live: true }), { fallbackLanguage: "ru", models: gigaam }),
    ).toStrictEqual({
      failure: "видео идёт в прямом эфире: дождитесь записи или приложите транскрипт",
    });
  });
});

const track = (fields: Partial<AudioTrack> & Pick<AudioTrack, "id">): AudioTrack => ({
  language: "ru",
  preference: null,
  original: false,
  bitrate: 129,
  ...fields,
});

describe(originalAudio, () => {
  it("takes the original track of an auto-dubbed video, the smallest one fit for speech", () => {
    const tracks = [
      track({ id: "139-0", language: "en-US", preference: -1, bitrate: 49 }),
      track({ id: "251-1", language: "en-US", preference: 5, bitrate: 120 }),
      track({ id: "139-1", preference: 10, original: true, bitrate: 49 }),
      track({ id: "140-3", preference: 10, original: true, bitrate: 129 }),
      track({ id: "249-2", preference: 10, original: true, bitrate: 31 }),
    ];

    expect(originalAudio(tracks, "ru")).toBe("139-1");
  });

  it("takes the track in the video's language without marks, the best one when all are small, and none without audio", () => {
    expect(
      originalAudio(
        [track({ id: "a", language: "de", bitrate: 64 }), track({ id: "b", bitrate: 31 })],
        "ru",
      ),
    ).toBe("b");
    expect(
      originalAudio([track({ id: "low", bitrate: 24 }), track({ id: "high", bitrate: 40 })], "ru"),
    ).toBe("high");
    expect(originalAudio([], "ru")).toBeNull();
  });
});

describe(linkCheck, () => {
  it("reads yt-dlp's JSON of a video: language, live, subtitles in a readable format and audio-only tracks", () => {
    const json = JSON.stringify({
      _type: "video",
      language: "ru",
      live_status: "not_live",
      subtitles: { ru: [{ ext: "json3" }, { ext: "vtt" }], de: [{ ext: "ttml" }], live_chat: [] },
      automatic_captions: { "ru-orig": [{ ext: "srt" }], en: [{ ext: "vtt" }] },
      formats: [
        { format_id: "233", vcodec: "none", protocol: "m3u8_native" },
        { format_id: "18", vcodec: "avc1", acodec: "mp4a.40.2", abr: 96 },
        {
          format_id: "139-1",
          vcodec: "none",
          acodec: "mp4a.40.5",
          abr: 49.1,
          language: "ru",
          language_preference: 10,
          format_note: "Russian original (default), low",
        },
      ],
    });

    expect(linkCheck({ json })).toStrictEqual({
      video: {
        language: "ru",
        live: false,
        subtitles: ["ru"],
        automaticSubtitles: ["ru-orig", "en"],
        audio: [{ id: "139-1", language: "ru", preference: 10, original: true, bitrate: 49.1 }],
      },
    });
  });

  it("knows a link yt-dlp does not recognize as not a video, and refuses a playlist", () => {
    expect(
      linkCheck({ error: "ERROR: No suitable extractor found for URL https://example.com/a" }),
    ).toStrictEqual({ notVideo: true });
    expect(linkCheck({ error: "ERROR: Unsupported URL: https://example.com/a" })).toStrictEqual({
      notVideo: true,
    });
    expect(linkCheck({ json: JSON.stringify({ _type: "playlist", entries: [] }) })).toStrictEqual({
      failure: "это плейлист, а не одно видео: прикрепите ссылку на видео",
    });
  });
});

describe(linkFailure, () => {
  it("names a private, deleted or login-only video, and keeps yt-dlp's reason for another failure", () => {
    expect(
      [
        "ERROR: [youtube] x: Private video. Sign in if you've been granted access to this video",
        "ERROR: [youtube] x: Video unavailable. This video has been removed by the uploader",
        "ERROR: [youtube] aaaaaaaaaaa: This video is unavailable",
        "ERROR: [youtube] x: Sign in to confirm your age. This video may be inappropriate for some users.",
        "ERROR: [youtube] x: Join this channel to get access to members-only content like this video",
        "ERROR: [youtube] x: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies for the authentication.",
        "ERROR: [youtube] x: The uploader has not made this video available in your country",
        "WARNING: slow\nERROR: [vimeo] 1: Unable to download webpage: <urlopen error timed out>",
      ].map((log) => linkFailure(log)),
    ).toStrictEqual([
      "видео закрыто автором: приложите транскрипт",
      "видео удалено или недоступно: приложите транскрипт",
      "видео удалено или недоступно: приложите транскрипт",
      "видео открывается только после входа в аккаунт: приложите транскрипт",
      "видео открывается только после входа в аккаунт: приложите транскрипт",
      "видео открывается только после входа в аккаунт: приложите транскрипт",
      "видео недоступно в вашей стране: приложите транскрипт",
      "видео не открылось: Unable to download webpage: <urlopen error timed out>",
    ]);
  });
});
