import { describe, expect, it } from "vitest";

import { installPlan } from "./domain/components.ts";
import type { Component, ComponentCatalog, ModelId } from "./domain/components.ts";
import {
  modelFor,
  noModelReason,
  progressPercent,
  recognitionLanguages,
  transcriptText,
} from "./domain/recognition.ts";

function component(id: Component["id"]): Component {
  return { id, version: "1", files: [] };
}

const catalog: ComponentCatalog = {
  shared: [component("engine"), component("ffmpeg"), component("vad")],
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

describe(noModelReason, () => {
  it("asks for Parakeet for a language of Parakeet, naming the language in Russian", () => {
    expect(noModelReason("en")).toBe(
      "нет модели для языка «английский»: установите Parakeet TDT 0.6B v3 в «Настройки» → «Распознавание речи» или приложите транскрипт с тем же именем файла",
    );
  });

  it("asks only for a transcript for a language that no model knows", () => {
    expect(noModelReason("ja")).toBe(
      "распознавание речи не знает язык «ja»: приложите транскрипт с тем же именем файла",
    );
  });
});

describe("the languages of recognition", () => {
  it("are Russian first, then the other 24 languages of Parakeet, each with its Russian name", () => {
    expect(recognitionLanguages).toHaveLength(25);
    expect(recognitionLanguages.slice(0, 3)).toStrictEqual([
      { code: "ru", name: "русский" },
      { code: "en", name: "английский" },
      { code: "bg", name: "болгарский" },
    ]);
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
  it("downloads the missing shared components and the missing chosen models, each once", () => {
    const plan = installPlan(catalog, {
      models: ["parakeet-v3", "gigaam-v3", "parakeet-v3"],
      installed: new Set(["vad", "gigaam-v3"]),
    });
    expect(plan.map((planned) => planned.id)).toStrictEqual(["engine", "ffmpeg", "parakeet-v3"]);
  });
});
