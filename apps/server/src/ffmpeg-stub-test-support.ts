// The stub ffmpeg of the API tests of speech recognition (spec #74): a «video» file is text, one
// second of speech per line, and «[без звука]» makes a file without sound.
import { readFile } from "node:fs/promises";

import { TranscriptionError } from "./composition.ts";
import type { Audio, TranscriptionComponents } from "./composition.ts";

/** A stub recording with this line has no sound. */
const silentMark = "[без звука]";

/** The lines of a stub recording: the file is text, one second of speech per line. */
async function linesOf(file: string): Promise<string[]> {
  const text = await readFile(file, "utf8");
  return text.split("\n").filter(Boolean);
}

/**
 * Each line of the stub recording as samples of its UTF-8 bytes; no sound with «[без звука]». They
 * come after the duration, as ffmpeg logs it first, so the first second has its percent.
 */
async function* stubSamples(file: string, known: Promise<number>): AsyncGenerator<Float32Array> {
  await known;
  const lines = await linesOf(file);
  if (lines.includes(silentMark)) {
    throw new TranscriptionError("в файле нет звука");
  }
  for (const line of lines) {
    yield Float32Array.from(new TextEncoder().encode(line));
  }
}

/** A stub of ffmpeg: the recording's duration is its number of lines. */
export function stubExtractor(): NonNullable<TranscriptionComponents["extractor"]> {
  return {
    extract: (file): Audio => {
      const duration = (async () => {
        const lines = await linesOf(file);
        return lines.length;
      })();
      return { duration, samples: stubSamples(file, duration) };
    },
  };
}
