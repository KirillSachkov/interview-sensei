import { describe, expect, it } from "vitest";

import { installPlan } from "./domain/components.ts";
import type { Component, ComponentCatalog, ModelId } from "./domain/components.ts";
import { modelFor, progressPercent, transcriptText } from "./domain/recognition.ts";

function component(id: Component["id"]): Component {
  return { id, version: "1", files: [] };
}

const catalog: ComponentCatalog = {
  shared: [component("engine"), component("ffmpeg"), component("vad")],
  ytDlp: component("yt-dlp"),
  models: { "gigaam-v3": component("gigaam-v3"), "parakeet-v3": component("parakeet-v3") },
};

describe(modelFor, () => {
  const both = new Set<ModelId>(["gigaam-v3", "parakeet-v3"]);

  it("gives Russian to GigaAM, and to Parakeet when only Parakeet is installed", () => {
    expect(modelFor("ru", both)).toBe("gigaam-v3");
    expect(modelFor("ru-RU", new Set(["parakeet-v3"]))).toBe("parakeet-v3");
  });

  it("gives the other languages of Parakeet to Parakeet only", () => {
    expect(modelFor("en", both)).toBe("parakeet-v3");
    expect(modelFor("de", new Set(["gigaam-v3"]))).toBeNull();
  });

  it("finds no model for a language outside the 25 languages of Parakeet or without models", () => {
    expect(modelFor("ja", both)).toBeNull();
    expect(modelFor("ru", new Set())).toBeNull();
  });
});

describe(progressPercent, () => {
  it("counts the recognized seconds of the duration and stays below 100 until the text is ready", () => {
    expect(progressPercent(30, 120)).toBe(25);
    expect(progressPercent(120, 120)).toBe(99);
    expect(progressPercent(10, null)).toBe(0);
  });
});

describe(transcriptText, () => {
  it("joins phrases with spaces and starts a paragraph after a pause of two seconds", () => {
    expect(
      transcriptText([
        { start: 0, end: 3, text: "Расскажите о себе." },
        { start: 3.5, end: 6, text: " Я бэкенд-разработчик. " },
        { start: 6.2, end: 7, text: "" },
        { start: 9, end: 11, text: "Что такое горутина?" },
      ]),
    ).toBe("Расскажите о себе. Я бэкенд-разработчик.\n\nЧто такое горутина?");
  });
});

describe(installPlan, () => {
  it("downloads the missing shared components, yt-dlp and the missing chosen models, each once", () => {
    const plan = installPlan(catalog, {
      models: ["parakeet-v3", "gigaam-v3", "parakeet-v3"],
      installed: new Set(["vad", "gigaam-v3"]),
    });
    expect(plan.map((planned) => planned.id)).toStrictEqual([
      "engine",
      "ffmpeg",
      "yt-dlp",
      "parakeet-v3",
    ]);
  });

  it("downloads only yt-dlp without a chosen model: links then give their subtitles", () => {
    const plan = installPlan(catalog, { models: [], installed: new Set() });
    expect(plan.map((planned) => planned.id)).toStrictEqual(["yt-dlp"]);
  });
});
