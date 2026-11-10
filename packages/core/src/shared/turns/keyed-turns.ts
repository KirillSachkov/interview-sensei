// Work that runs one after another for each key, such as the starts of one Target's sessions:
// work for another key runs at the same time.

/** Settles after the previous work of the key; its failure belongs to its own caller. */
async function settled(previous: Promise<unknown>): Promise<void> {
  try {
    await previous;
  } catch {
    // The previous caller got this error.
  }
}

/**
 * Runs each work after the earlier work of its key has settled, and resolves or rejects as the
 * work does. A key holds no memory once its last work settles.
 */
export function keyedTurns() {
  const last = new Map<string, Promise<unknown>>();
  return async <Result>(key: string, work: () => Promise<Result>): Promise<Result> => {
    const previous = last.get(key) ?? Promise.resolve();
    const current = (async () => {
      await settled(previous);
      return work();
    })();
    last.set(key, current);
    try {
      return await current;
    } finally {
      if (last.get(key) === current) {
        last.delete(key);
      }
    }
  };
}
