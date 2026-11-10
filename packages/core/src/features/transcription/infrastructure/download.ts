// One pinned file downloaded with fetch into a file of the data directory, its SHA-256 counted on
// the way, so a file changed on the way never reaches its place.
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";

import type { ComponentFile } from "../domain/components.ts";
import { TranscriptionError } from "../domain/recognition.ts";

/** The body of the file's URL; TranscriptionError for a network failure or an error status. */
async function body(file: ComponentFile, signal: AbortSignal): Promise<ReadableStream> {
  const answered = await fetch(file.url, { signal, redirect: "follow" }).catch((error: unknown) => {
    if (signal.aborted) {
      throw error;
    }
    throw new TranscriptionError(`загрузка не удалась: нет связи с ${new URL(file.url).host}`, {
      cause: error,
    });
  });
  if (!answered.ok || answered.body === null) {
    throw new TranscriptionError(`загрузка не удалась: HTTP ${answered.status} для ${file.path}`);
  }
  return answered.body;
}

/**
 * Downloads the file into `target`, telling `onBytes` each chunk's size; resolves with the SHA-256
 * and size of what came.
 */
export async function download(
  file: ComponentFile,
  target: string,
  { onBytes, signal }: { onBytes: (bytes: number) => void; signal: AbortSignal },
): Promise<{ sha256: string; size: number }> {
  const hash = createHash("sha256");
  let size = 0;
  const counter = new Transform({
    transform: (chunk: Buffer, _encoding, done) => {
      hash.update(chunk);
      size += chunk.length;
      onBytes(chunk.length);
      done(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(await body(file, signal)), counter, createWriteStream(target), {
    signal,
  });
  return { sha256: hash.digest("hex"), size };
}
