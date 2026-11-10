// The files of the Sources in the data directory: the port of the file store.

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
  /** Removes the files of every Source of the Target; `targetIds` lists the Targets with files. */
  readonly removeTarget: (targetId: string) => Promise<void>;
  readonly targetIds: () => Promise<readonly string[]>;
  /** The absolute path of a file that `save` wrote. */
  readonly absolute: (file: string) => string;
  /** The size of a file that `save` wrote, in bytes; null when it is gone. */
  readonly size: (file: string) => Promise<number | null>;
}
