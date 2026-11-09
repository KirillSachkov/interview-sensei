import type { Transaction } from "@interview-sensei/core/storage";

import type { Features } from "./composition.ts";

/**
 * A slice that keeps data of Targets. `targetData` in composition.ts lists every such slice; a new
 * slice with Target data joins that list.
 */
interface TargetData {
  readonly eraseTarget: (targetId: string, transaction: Transaction) => Promise<unknown>;
  /** Removes the Target's files once the transaction has committed: files are not in it. */
  readonly eraseTargetFiles?: (targetId: string) => Promise<unknown>;
}

type Dependencies = Pick<Features, "targets" | "sessions" | "storage"> & {
  readonly targetData: readonly TargetData[];
};

/** Stops the agents of the Target's live sessions and marks the sessions as ended. */
async function endSessions(sessions: Features["sessions"], targetId: string) {
  const all = await sessions.list();
  const owned = all.filter((session) => session.targetId === targetId);
  // `stop` stops only a live session; the others ended before.
  await Promise.all(owned.map(async (session) => sessions.stop(session.id)));
}

/**
 * Erases the Target's data in every slice of `targetData` in one transaction, once the Target may
 * be deleted with the typed name. The agents of its live sessions stop first: their journals
 * write outside this transaction. The files of the Target go after the commit.
 */
export async function deleteTarget(
  { targets, sessions, storage, targetData }: Dependencies,
  id: string,
  name: string | undefined,
) {
  const allowed = await targets.deletion(id, name);
  if (allowed !== "deletable") {
    return allowed;
  }
  await endSessions(sessions, id);
  const erased = await storage.transaction(async (transaction) => {
    const checked = await targets.deletion(id, name, transaction);
    if (checked !== "deletable") {
      return checked;
    }
    // One slice after another: the transaction runs one query at a time.
    /* oxlint-disable eslint/no-await-in-loop -- sequential by design, see above */
    for (const slice of targetData) {
      await slice.eraseTarget(id, transaction);
    }
    /* oxlint-enable eslint/no-await-in-loop */
    return "deleted" as const;
  });
  if (erased === "deleted") {
    await Promise.all(targetData.map(async (slice) => slice.eraseTargetFiles?.(id)));
  }
  return erased;
}
