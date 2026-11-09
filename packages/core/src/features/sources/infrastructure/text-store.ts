import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SourceTexts } from "../domain/ports.ts";

/** The file name of a part: `0001.txt` for part 1, so the files sort in order. */
function partFile(part: number): string {
  return `${String(part).padStart(4, "0")}.txt`;
}

/**
 * The parts of each Source's text in `targets/<Target id>/texts/<Source id>/` of the data
 * directory, beside the Sources' own files: deleting the Target removes them with its directory.
 */
export function sourceTextStore(dataDirectory: string): SourceTexts {
  const directoryOf = (targetId: string, sourceId: string) =>
    path.join(dataDirectory, "targets", targetId, "texts", sourceId);
  return {
    write: async (targetId, sourceId, parts) => {
      const directory = directoryOf(targetId, sourceId);
      await rm(directory, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
      await Promise.all(
        parts.map(async (text, index) =>
          writeFile(path.join(directory, partFile(index + 1)), text),
        ),
      );
    },
    read: async (targetId, sourceId, part) => {
      if (!Number.isSafeInteger(part) || part < 1) {
        return null;
      }
      try {
        return await readFile(path.join(directoryOf(targetId, sourceId), partFile(part)), "utf8");
      } catch {
        return null;
      }
    },
  };
}
