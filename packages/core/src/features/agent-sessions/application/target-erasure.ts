import type { SessionDirectories, SessionErasure } from "../domain/ports.ts";

/**
 * Erases the sessions of a Target when the Target is deleted for good: their rows in the shared
 * transaction, then their working directories once it commits. Files are not in the transaction,
 * so a server that stops between the two leaves the directories; `removeLeftovers` removes them at
 * the next start.
 */
export function targetErasure<Transaction>(
  repository: SessionErasure<Transaction> & {
    readonly list: () => Promise<readonly { readonly id: string }[]>;
  },
  directories: SessionDirectories,
) {
  // The ids of the erased sessions until their directories go: their rows are gone by then.
  // A rolled-back erasure leaves its entry, and the next erasure of the Target replaces it.
  const erased = new Map<string, readonly string[]>();
  return {
    eraseTarget: async (targetId: string, transaction: Transaction): Promise<void> => {
      erased.set(targetId, await repository.eraseTarget(targetId, transaction));
    },
    /** Removes the working directories of the Target's erased sessions. */
    eraseTargetFiles: async (targetId: string): Promise<void> => {
      const sessionIds = erased.get(targetId) ?? [];
      erased.delete(targetId);
      await directories.remove(sessionIds);
    },
    /** Removes the working directories of sessions that have no row; before any session starts. */
    removeLeftovers: async (): Promise<void> => {
      const sessions = await repository.list();
      const known = new Set(sessions.map((session) => session.id));
      const names = await directories.list();
      await directories.remove(names.filter((name) => !known.has(name)));
    },
  };
}
