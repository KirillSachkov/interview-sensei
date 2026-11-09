import type { Transaction } from "@interview-sensei/core/storage";

import type { Features } from "./composition.ts";

/**
 * A slice that keeps data of Targets. `targetData` in composition.ts lists every such slice; a new
 * slice with Target data joins that list.
 */
interface TargetData {
  readonly eraseTarget: (targetId: string, transaction: Transaction) => Promise<void>;
}

type Dependencies = Pick<Features, "targets" | "sessions" | "storage"> & {
  readonly targetData: readonly TargetData[];
};

/**
 * Erases the Target's data in every slice of `targetData` in one transaction, once the Target may
 * be deleted with the typed name. The agents of its live sessions stop first: their journals
 * write outside this transaction.
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
  await sessions.endTarget(id);
  return storage.transaction(async (transaction) => {
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
}
