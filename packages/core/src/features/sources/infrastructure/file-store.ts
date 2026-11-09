import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { FilePlace, SourceFiles } from "../domain/ports.ts";

/** The bytes passed the limit; the partial file is removed. */
class FileTooLargeError extends Error {
  override name = "FileTooLargeError";
}

/** Passes the bytes on and fails once more than `limit` of them have passed. */
function limitTo(limit: number): Transform {
  let size = 0;
  return new Transform({
    transform: (chunk: Buffer, _encoding, done) => {
      size += chunk.byteLength;
      if (size > limit) {
        done(new FileTooLargeError(`The file is larger than ${limit} bytes`));
      } else {
        done(null, chunk);
      }
    },
  });
}

/**
 * The files of the Sources in `targets/<Target id>/sources/<Source id>/<name>` of the data
 * directory: each Target keeps its materials apart, and each file has a directory of its own.
 */
export function sourceFileStore(dataDirectory: string): SourceFiles {
  const absolute = (file: string) => {
    const resolved = path.resolve(dataDirectory, file);
    if (!resolved.startsWith(`${path.resolve(dataDirectory)}${path.sep}`)) {
      throw new Error(`The file ${file} is outside the data directory`);
    }
    return resolved;
  };
  const remove = async (file: string) => {
    await rm(path.dirname(absolute(file)), { recursive: true, force: true });
  };
  return {
    save: async ({ targetId, sourceId, name }: FilePlace, bytes, limit) => {
      const file = path.join("targets", targetId, "sources", sourceId, name);
      const target = absolute(file);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        await pipeline(bytes, limitTo(limit), createWriteStream(target, { flags: "wx" }));
      } catch (error) {
        await remove(file);
        if (error instanceof FileTooLargeError) {
          return null;
        }
        throw error;
      }
      return file;
    },
    remove,
    removeTarget: async (targetId) => {
      await rm(absolute(path.join("targets", targetId)), { recursive: true, force: true });
    },
    absolute,
    size: async (file) => {
      try {
        const info = await stat(absolute(file));
        return info.size;
      } catch {
        return null;
      }
    },
  };
}
