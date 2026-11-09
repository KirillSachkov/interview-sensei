import type { Source } from "./source.ts";

/** Stores the Sources of each Target in the order they were added. */
export interface SourceRepository {
  readonly add: (source: Source) => Promise<void>;
  readonly list: (targetId: string) => Promise<readonly Source[]>;
  /** The Source only when it belongs to the Target. */
  readonly get: (targetId: string, id: string) => Promise<Source | undefined>;
}

/** Where a Source's file lies: under its Target, in a directory of its own. */
export interface FilePlace {
  readonly targetId: string;
  readonly sourceId: string;
  /** A safe file name; see safeFileName. */
  readonly name: string;
}

/** The files of the Sources in the data directory. */
export interface SourceFiles {
  /**
   * Writes the bytes and resolves the file's path relative to the data directory. Resolves null
   * and keeps nothing once the bytes pass `limit`.
   */
  readonly save: (
    place: FilePlace,
    bytes: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
    limit: number,
  ) => Promise<string | null>;
  /** Removes the file that `save` wrote, with its directory. */
  readonly remove: (file: string) => Promise<void>;
  /** The absolute path of a file that `save` wrote. */
  readonly absolute: (file: string) => string;
}

/** The targets slice: a Source belongs to an existing Target. */
export interface SourceTargets {
  /** Resolves undefined for an unknown Target. */
  readonly get: (id: string) => Promise<object | undefined>;
}
