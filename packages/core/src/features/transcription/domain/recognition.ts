// The rules of recognition: which model hears which language, the percent of a running
// transcription and how the recognized phrases become a text.
import type { ModelId } from "./components.ts";

/**
 * The 25 European languages of Parakeet TDT 0.6B v3 by ISO 639-1 code, with their Russian names:
 * Russian and English first, as the card lists them.
 */
const parakeetLanguageNames: Readonly<Record<string, string>> = {
  ru: "русский",
  en: "английский",
  bg: "болгарский",
  cs: "чешский",
  da: "датский",
  de: "немецкий",
  el: "греческий",
  es: "испанский",
  et: "эстонский",
  fi: "финский",
  fr: "французский",
  hr: "хорватский",
  hu: "венгерский",
  it: "итальянский",
  lt: "литовский",
  lv: "латышский",
  mt: "мальтийский",
  nl: "нидерландский",
  pl: "польский",
  pt: "португальский",
  ro: "румынский",
  sk: "словацкий",
  sl: "словенский",
  sv: "шведский",
  uk: "украинский",
};

const parakeetLanguages = new Set(Object.keys(parakeetLanguageNames));

/** The languages a model can recognize, in the order the card lists them. */
export const recognitionLanguages: readonly { readonly code: string; readonly name: string }[] =
  Object.entries(parakeetLanguageNames).map(([code, name]) => ({ code, name }));

/** The language code of a tag such as `ru`, `ru-RU` or `RU`. */
export function languageCode(language: string): string {
  return language.trim().toLowerCase().split(/[-_]/u)[0] ?? "";
}

/**
 * The installed model that recognizes the language: Russian goes to GigaAM when it is installed,
 * otherwise to Parakeet; the other languages of Parakeet go to Parakeet. Null without such a model.
 */
export function modelFor(language: string, installed: ReadonlySet<ModelId>): ModelId | null {
  const code = languageCode(language);
  if (code === "ru" && installed.has("gigaam-v3")) {
    return "gigaam-v3";
  }
  return parakeetLanguages.has(code) && installed.has("parakeet-v3") ? "parakeet-v3" : null;
}

/** Where to point the Candidate for the text of a recording without a model. */
const transcriptHint = "приложите транскрипт с тем же именем файла";

/**
 * Why a recording in the language has no model, in Russian: Parakeet hears the languages of
 * Parakeet, and no model hears the others, so only a transcript helps.
 */
export function noModelReason(language: string): string {
  const name = parakeetLanguageNames[languageCode(language)];
  return name === undefined
    ? `распознавание речи не знает язык «${language}»: ${transcriptHint}`
    : `нет модели для языка «${name}»: установите Parakeet TDT 0.6B v3 в «Настройки» → «Распознавание речи» или ${transcriptHint}`;
}

/**
 * The percent of a running transcription: the recognized seconds of the recording's duration. It
 * stays below 100 until the text is ready, and at 0 while the duration is unknown.
 */
export function progressPercent(seconds: number, duration: number | null): number {
  if (duration === null || duration <= 0) {
    return 0;
  }
  return Math.min(99, Math.max(0, Math.floor((seconds / duration) * 100)));
}

/** A recognized phrase: its start in seconds and its text. */
export interface Phrase {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** A pause this long between phrases starts a new paragraph. */
const paragraphPause = 2;

/**
 * The text of the phrases in order: phrases with the model's punctuation joined by spaces, a new
 * paragraph after a pause of two seconds or more; empty phrases dropped.
 */
export function transcriptText(phrases: readonly Phrase[]): string {
  const spoken = phrases
    .map((phrase) => ({ ...phrase, text: phrase.text.trim() }))
    .filter((phrase) => phrase.text !== "");
  return spoken
    .map((phrase, index) => {
      const previous = spoken[index - 1];
      if (previous === undefined) {
        return phrase.text;
      }
      return `${phrase.start - previous.end >= paragraphPause ? "\n\n" : " "}${phrase.text}`;
    })
    .join("");
}

/** Why a recording has no text, in Russian: the Source gets «ошибка» with it. */
export class TranscriptionError extends Error {
  override name = "TranscriptionError";
}

/** The work's result, or its TranscriptionError as the reason a recording has no text. */
export async function orFailure<Result>(
  work: () => Promise<Result>,
): Promise<Result | { readonly failure: string }> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof TranscriptionError) {
      return { failure: error.message };
    }
    throw error;
  }
}
