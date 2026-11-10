// An archived Target refuses a new agent session: its setup session and its Mock interview. The
// archive of a Target and the start of its agent session run one after another, so a session never
// starts on a Target that went to the archive meanwhile, and the archive sees the started session.
import { keyedTurns } from "@interview-sensei/core/turns";

import type { Features } from "./composition.ts";

type Target = NonNullable<Awaited<ReturnType<Features["targets"]["get"]>>>;

export function archiveGuard(targets: Pick<Features["targets"], "get">) {
  /** Runs the work after the earlier archive or start of the Target has finished. */
  const inTurn = keyedTurns();
  return {
    /**
     * Starts the Target's agent session with the Target, undefined for an unknown one; resolves
     * with `target_archived` instead for an archived Target.
     */
    startSession: async <Result>(
      targetId: string,
      start: (target: Target | undefined) => Promise<Result>,
    ) =>
      inTurn(targetId, async () => {
        const target = await targets.get(targetId);
        return target?.status === "archived" ? ("target_archived" as const) : start(target);
      }),
    /** Moves the Target to the archive once no start of its agent session is under way. */
    archive: inTurn,
  };
}

export type ArchiveGuard = ReturnType<typeof archiveGuard>;
